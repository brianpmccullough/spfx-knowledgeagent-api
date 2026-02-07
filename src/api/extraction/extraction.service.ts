import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Client } from '@microsoft/microsoft-graph-client';
import { AzureChatOpenAI } from '@langchain/openai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Markitdown, { DocumentConverter } from 'markitdown-js';
import DocumentIntelligence, {
  getLongRunningPoller,
  isUnexpected,
} from '@azure-rest/ai-document-intelligence';
import { AzureKeyCredential } from '@azure/core-auth';
import {
  MetadataExtractionRequest,
  MetadataExtractionResponse,
  MetadataFieldResult,
  MetadataFieldDefinition,
  ConfidenceLevel,
  TextExtractionRequest,
  TextExtractionResponse,
  TextOutputFormat,
  DocumentPathLocation,
  DocumentDriveLocation,
  isPathLocation,
  isDriveLocation,
} from './models';
import { AuthenticatedUser } from '../../auth/authenticateduser';
import { OboGraphService } from '../shared-services/obo-graph.service';
import { ConfigurationService } from '../config/configuration.service';

const DOCINTEL_EXTENSIONS = [
  '.pdf', '.docx', '.xlsx', '.pptx', '.html',
  '.jpeg', '.jpg', '.png', '.bmp', '.tiff', '.heif',
];

const OFFICE_EXTENSIONS = ['.xlsx', '.pptx', '.html', '.docx'];

/**
 * Custom Document Intelligence converter that uses AzureKeyCredential
 * instead of DefaultAzureCredential (which the built-in one hardcodes).
 */
class DocIntelKeyConverter extends DocumentConverter {
  private client: ReturnType<typeof DocumentIntelligence>;

  constructor(client: ReturnType<typeof DocumentIntelligence>) {
    super();
    this.client = client;
  }

  async convert(localPath: string, options: any) {
    const extension: string = options.fileExtension || '';
    if (!DOCINTEL_EXTENSIONS.includes(extension.toLowerCase())) {
      return null;
    }

    const base64Source = fs.readFileSync(localPath, { encoding: 'base64' });
    const analysisFeatures = OFFICE_EXTENSIONS.includes(extension.toLowerCase())
      ? []
      : ['formulas', 'ocrHighResolution', 'styleFont'];

    const initialResponse = await this.client
      .path('/documentModels/{modelId}:analyze', 'prebuilt-layout')
      .post({
        contentType: 'application/json',
        body: { base64Source },
        queryParameters: {
          outputContentFormat: 'markdown',
          ...(analysisFeatures.length ? { features: analysisFeatures } : {}),
        },
      });

    if (isUnexpected(initialResponse)) {
      throw (initialResponse as any).body.error;
    }

    const poller = getLongRunningPoller(this.client, initialResponse);
    const result = (await poller.pollUntilDone()).body;
    const markdownText =
      (result as any).analyzeResult?.content ||
      `\n## Document Data:\nError. Could not generate data because api ended with status ${(result as any).status}.`;

    return { title: null, textContent: markdownText };
  }
}

interface ExtractedField {
  fieldName: string;
  value: string | number | boolean | null;
  confidence: 'green' | 'yellow' | 'red';
  reasoning: string;
}

interface ExtractedMetadata {
  fields: ExtractedField[];
}

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);
  private readonly markitdown: Markitdown;
  private readonly llm: AzureChatOpenAI;

  constructor(
    private readonly oboGraphService: OboGraphService,
    private readonly configurationService: ConfigurationService,
  ) {
    const { configuration, secrets } = this.configurationService;

    // Use Azure Document Intelligence for higher-quality extraction when enabled
    this.markitdown = new Markitdown();

    if (configuration.AZURE_DOCINTEL_ENABLED && configuration.AZURE_DOCINTEL_ENDPOINT) {
      if (configuration.AZURE_DOCINTEL_AUTH === 'identity') {
        // Use DefaultAzureCredential (az login / managed identity)
        this.markitdown = new Markitdown({
          docintelEndpoint: configuration.AZURE_DOCINTEL_ENDPOINT,
        });
      } else {
        // Use API key — register a custom converter since the built-in one hardcodes DefaultAzureCredential
        const apiKey = secrets.AZURE_DOCINTEL_KEY;
        if (!apiKey) {
          this.logger.warn(
            'AZURE_DOCINTEL_ENABLED is true with auth=key but AZURE_DOCINTEL_KEY is not set — falling back to default extraction',
          );
        } else {
          const client = DocumentIntelligence(
            configuration.AZURE_DOCINTEL_ENDPOINT,
            new AzureKeyCredential(apiKey),
          );
          const converter = new DocIntelKeyConverter(client);
          this.markitdown.registerConverter(converter);
        }
      }
    }

    this.logger.log(
      `Markitdown initialized ${configuration.AZURE_DOCINTEL_ENABLED ? 'with' : 'without'} Azure Document Intelligence (auth: ${configuration.AZURE_DOCINTEL_AUTH})`,
    );
    this.llm = new AzureChatOpenAI({
      azureOpenAIEndpoint: configuration.AZURE_OPENAI_ENDPOINT,
      azureOpenAIApiKey: secrets.AZURE_OPENAI_API_KEY,
      azureOpenAIApiDeploymentName: configuration.AZURE_OPENAI_DEPLOYMENT,
      azureOpenAIApiVersion: configuration.AZURE_OPENAI_API_VERSION,
      temperature: 0, // Low temperature for consistent extraction
    });
  }

  /**
   * Extract metadata from a document based on the provided field definitions.
   */
  async extractMetadata(
    request: MetadataExtractionRequest,
    user: AuthenticatedUser,
  ): Promise<MetadataExtractionResponse> {
    if (!request.fields || !Array.isArray(request.fields)) {
      throw new BadRequestException('Missing required "fields" array in request body');
    }

    const docLocation = isPathLocation(request.document)
      ? `path: ${request.document.path}`
      : `driveId: ${request.document.driveId}, driveItemId: ${request.document.driveItemId}`;

    this.logger.log(
      `Extracting metadata for document (${docLocation}) - ${request.fields.length} fields requested`,
    );

    // First extract text from the document
    const textResult = await this.extractText({ document: request.document }, 'markdown', user);

    if (!textResult.content || textResult.content.trim().length === 0) {
      // Return red confidence for all fields if no content
      return {
        document: request.document,
        results: request.fields.map((field) => ({
          fieldName: field.title,
          confidence: 'red' as ConfidenceLevel,
          value: null,
        })),
      };
    }

    // Extract metadata using LLM
    const extractedMetadata = await this.extractWithLlm(textResult.content, request.fields);

    // Map LLM results to response format, ensuring type conversion
    const results: MetadataFieldResult[] = request.fields.map((field) => {
      const extracted = extractedMetadata.fields.find((f) => f.fieldName === field.title);

      if (!extracted) {
        return {
          fieldName: field.title,
          confidence: 'red' as ConfidenceLevel,
          value: null,
        };
      }

      // Convert value to expected data type
      const convertedValue = this.convertValue(extracted.value, field.dataType);

      return {
        fieldName: field.title,
        confidence: extracted.confidence as ConfidenceLevel,
        value: convertedValue,
      };
    });

    return {
      document: request.document,
      results,
    };
  }

  /**
   * Use LLM to extract metadata fields from document content.
   */
  private async extractWithLlm(
    documentContent: string,
    fields: MetadataFieldDefinition[],
  ): Promise<ExtractedMetadata> {
    // Build field descriptions for the prompt
    const fieldDescriptions = fields
      .map(
        (f) =>
          `- **${f.title}** (${f.dataType}): ${f.description}`,
      )
      .join('\n');

    const systemPrompt = `You are a document metadata extraction assistant. Your task is to extract specific metadata fields from document content.

For each requested field:
1. Search the document content carefully for relevant information
2. Extract the value if found, converting to the requested data type
3. Assess your confidence:
   - **green**: Value is clearly and explicitly stated in the document
   - **yellow**: Value is inferred, partially found, or requires interpretation
   - **red**: Value is not found, or you would be guessing
4. Provide brief reasoning for your extraction

Be precise and avoid making assumptions. If information is not clearly present, mark confidence as red and set value to null.

You MUST return a JSON object with this exact structure:
{
  "fields": [
    {
      "fieldName": "FieldTitle",
      "value": "extracted value or null",
      "confidence": "green|yellow|red",
      "reasoning": "brief explanation"
    }
  ]
}`;

    const userPrompt = `## Document Content

${documentContent}

## Fields to Extract

${fieldDescriptions}

Extract the requested fields from the document content above. Return a JSON object with the extracted values.`;

    try {
      // Use JSON mode for structured output
      const jsonLlm = this.llm.bind({
        response_format: { type: 'json_object' },
      });

      const response = await jsonLlm.invoke([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      // Parse JSON from response
      const content = typeof response.content === 'string' ? response.content : '';
      const parsed = JSON.parse(content);

      this.logger.debug(`LLM extraction result: ${JSON.stringify(parsed)}`);

      // Handle case where LLM returns fields as object keys instead of array
      if (!parsed.fields || !Array.isArray(parsed.fields)) {
        // Transform object format to expected array format
        const transformedFields: ExtractedField[] = Object.entries(parsed).map(
          ([key, val]: [string, any]) => ({
            fieldName: key,
            value: val?.value ?? null,
            confidence: val?.confidence ?? 'red',
            reasoning: val?.reasoning ?? '',
          }),
        );
        return { fields: transformedFields };
      }

      return parsed as ExtractedMetadata;
    } catch (error) {
      this.logger.error('LLM extraction failed', error);

      // Return empty results on error
      return {
        fields: fields.map((f) => ({
          fieldName: f.title,
          value: null,
          confidence: 'red' as const,
          reasoning: 'Extraction failed due to an error',
        })),
      };
    }
  }

  /**
   * Convert extracted value to the expected data type.
   */
  private convertValue(
    value: string | number | boolean | null,
    dataType: string,
  ): string | number | boolean | null {
    if (value === null) return null;

    switch (dataType) {
      case 'string':
        return String(value);

      case 'number':
        if (typeof value === 'number') return value;
        const parsed = parseFloat(String(value));
        return isNaN(parsed) ? null : parsed;

      case 'boolean':
        if (typeof value === 'boolean') return value;
        const strValue = String(value).toLowerCase();
        if (['true', 'yes', '1'].includes(strValue)) return true;
        if (['false', 'no', '0'].includes(strValue)) return false;
        return null;

      default:
        return value;
    }
  }

  /**
   * Extract text content from a document.
   */
  async extractText(
    request: TextExtractionRequest,
    format: TextOutputFormat,
    user: AuthenticatedUser,
  ): Promise<TextExtractionResponse> {
    const docLocation = isPathLocation(request.document)
      ? `path: ${request.document.path}`
      : `driveId: ${request.document.driveId}, driveItemId: ${request.document.driveItemId}`;

    this.logger.log(`Extracting text for document (${docLocation}) - format: ${format}`);

    const graphClient = await this.oboGraphService.getGraphClient(user.token);

    // Download document and convert to markdown
    const content = await this.extractDocumentContent(request.document, graphClient);

    // If plain text requested, strip markdown formatting
    const finalContent = format === 'text' ? this.stripMarkdown(content) : content;

    return {
      document: request.document,
      format,
      content: finalContent,
    };
  }

  /**
   * Download document from SharePoint and convert to markdown using markitdown-js.
   */
  private async extractDocumentContent(
    document: DocumentPathLocation | DocumentDriveLocation,
    graphClient: Client,
  ): Promise<string> {
    const tempDir = os.tmpdir();
    const tempFileName = `extract_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    let tempFilePath: string | null = null;

    try {
      // Determine file extension and download URL
      const { downloadUrl, extension } = await this.getDownloadInfo(document, graphClient);
      this.logger.debug(`Download URL: ${downloadUrl}`);
      tempFilePath = path.join(tempDir, `${tempFileName}.${extension}`);

      // Download file content
      let content: ArrayBuffer;
      try {
        content = await graphClient
          .api(downloadUrl)
          .responseType('arraybuffer' as any)
          .get();
      } catch (downloadError: any) {
        // Extract detailed error info from Graph API response
        const errorDetails = {
          message: downloadError.message,
          code: downloadError.code,
          statusCode: downloadError.statusCode,
          body: downloadError.body,
          requestId: downloadError.requestId,
        };
        this.logger.error(`Graph API download failed: ${JSON.stringify(errorDetails, null, 2)}`);
        throw new Error(
          `Failed to download document: ${downloadError.code || downloadError.message || 'Unknown error'}`,
        );
      }

      // Convert response to Buffer
      const buffer = this.toBuffer(content);
      if (!buffer) {
        throw new Error('Failed to download document content');
      }

      // Write to temp file
      fs.writeFileSync(tempFilePath, buffer);

      // Convert using markitdown-js
      const result = await this.markitdown.convert(tempFilePath);

      this.logger.debug(`Markitdown result - title: ${result.title}, content length: ${result.textContent?.length || 0}`);
      this.logger.debug(`First 500 chars: ${result.textContent?.substring(0, 500)}`);

      return result.textContent || '';
    } catch (error) {
      this.logger.error(`Failed to extract document content`, error);
      throw error;
    } finally {
      // Clean up temp file
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch {
          this.logger.warn(`Failed to clean up temp file: ${tempFilePath}`);
        }
      }
    }
  }

  /**
   * Get download URL and file extension for a document.
   */
  private async getDownloadInfo(
    document: DocumentPathLocation | DocumentDriveLocation,
    graphClient: Client,
  ): Promise<{ downloadUrl: string; extension: string }> {
    if (isDriveLocation(document)) {
      // Get file metadata to determine extension
      const driveItem = await graphClient
        .api(`/drives/${document.driveId}/items/${document.driveItemId}`)
        .select('name')
        .get();

      const extension = this.getExtension(driveItem.name);
      const downloadUrl = `/drives/${document.driveId}/items/${document.driveItemId}/content`;

      return { downloadUrl, extension };
    }

    if (isPathLocation(document)) {
      // Parse the SharePoint path
      const extension = this.getExtension(document.path);

      // Use Graph search to find driveId and driveItemId
      const { driveId, driveItemId } = await this.resolvePathToDriveInfo(
        document.path,
        graphClient,
      );

      const downloadUrl = `/drives/${driveId}/items/${driveItemId}/content`;

      return { downloadUrl, extension };
    }

    throw new Error('Invalid document location: must specify path or driveId/driveItemId');
  }

  /**
   * Resolve a SharePoint path to driveId and driveItemId using Graph search.
   */
  private async resolvePathToDriveInfo(
    documentPath: string,
    graphClient: Client,
  ): Promise<{ driveId: string; driveItemId: string }> {
    // Extract filename from path for search
    const filename = documentPath.split('/').pop() || '';

    this.logger.debug(`Searching for file: ${filename}`);

    // Use Graph search to find the file by path
    const searchRequest = {
      requests: [
        {
          entityTypes: ['driveItem'],
          query: {
            queryString: `path:"${documentPath}" OR filename:"${filename}"`,
          },
          from: 0,
          size: 10,
          fields: ['id', 'name', 'webUrl', 'parentReference'],
        },
      ],
    };

    try {
      const response = await graphClient.api('/search/query').post(searchRequest);

      const hits = response.value?.[0]?.hitsContainers?.[0]?.hits || [];

      this.logger.debug(`Search returned ${hits.length} results`);

      // Find the matching file by comparing URLs
      for (const hit of hits) {
        const resource = hit.resource;
        const webUrl = resource.webUrl || '';

        this.logger.debug(`Checking: ${webUrl}`);

        // Compare URLs (normalize for comparison)
        const normalizedPath = decodeURIComponent(documentPath).toLowerCase();
        const normalizedWebUrl = decodeURIComponent(webUrl).toLowerCase();

        if (normalizedWebUrl === normalizedPath || normalizedWebUrl.includes(normalizedPath)) {
          const driveId = resource.parentReference?.driveId;
          const driveItemId = resource.id;

          if (driveId && driveItemId) {
            this.logger.debug(`Found file - driveId: ${driveId}, driveItemId: ${driveItemId}`);
            return { driveId, driveItemId };
          }
        }
      }

      // If exact match not found but we have results, use the first one with matching filename
      for (const hit of hits) {
        const resource = hit.resource;
        if (resource.name === filename) {
          const driveId = resource.parentReference?.driveId;
          const driveItemId = resource.id;

          if (driveId && driveItemId) {
            this.logger.debug(`Found by filename - driveId: ${driveId}, driveItemId: ${driveItemId}`);
            return { driveId, driveItemId };
          }
        }
      }

      throw new Error(`File not found in search results: ${documentPath}`);
    } catch (error: any) {
      this.logger.error(`Graph search failed: ${error.message || error}`);
      throw new Error(`Unable to find file: ${documentPath}`);
    }
  }

  /**
   * Extract file extension from filename or path.
   */
  private getExtension(filename: string): string {
    const match = filename.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : 'bin';
  }

  /**
   * Convert various response types to Buffer.
   */
  private toBuffer(response: any): Buffer | null {
    if (response instanceof ArrayBuffer) {
      return Buffer.from(response);
    }
    if (Buffer.isBuffer(response)) {
      return response;
    }
    if (typeof response === 'string') {
      return Buffer.from(response);
    }
    return null;
  }

  /**
   * Strip markdown formatting to return plain text.
   */
  private stripMarkdown(markdown: string): string {
    return (
      markdown
        // Remove headers
        .replace(/^#{1,6}\s+/gm, '')
        // Remove bold/italic
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // Remove links, keep text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove images
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        // Remove code blocks
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        // Remove blockquotes
        .replace(/^>\s+/gm, '')
        // Remove horizontal rules
        .replace(/^[-*_]{3,}$/gm, '')
        // Remove list markers
        .replace(/^[\s]*[-*+]\s+/gm, '')
        .replace(/^[\s]*\d+\.\s+/gm, '')
        // Clean up extra whitespace
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
  }
}
