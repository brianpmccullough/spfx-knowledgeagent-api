import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@microsoft/microsoft-graph-client';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Markitdown from 'markitdown-js';
import {
  MetadataExtractionRequest,
  MetadataExtractionResponse,
  MetadataFieldResult,
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

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);
  private readonly markitdown = new Markitdown();

  constructor(private readonly oboGraphService: OboGraphService) {}

  /**
   * Extract metadata from a document based on the provided field definitions.
   */
  async extractMetadata(
    request: MetadataExtractionRequest,
    user: AuthenticatedUser,
  ): Promise<MetadataExtractionResponse> {
    const docLocation = isPathLocation(request.document)
      ? `path: ${request.document.path}`
      : `driveId: ${request.document.driveId}, driveItemId: ${request.document.driveItemId}`;

    this.logger.log(
      `Extracting metadata for document (${docLocation}) - ${request.fields.length} fields requested`,
    );

    // TODO: Implement LLM-based metadata extraction using extractText
    // const textResult = await this.extractText({ document: request.document }, 'markdown', user);
    // const extractedMetadata = await this.extractWithLlm(textResult.content, request.fields);

    // Stub response - returns placeholder results for each requested field
    const results: MetadataFieldResult[] = request.fields.map((field) => ({
      fieldName: field.title,
      confidence: 'red' as const,
      value: null,
    }));

    return {
      document: request.document,
      results,
    };
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
      tempFilePath = path.join(tempDir, `${tempFileName}.${extension}`);

      // Download file content
      const content = await graphClient
        .api(downloadUrl)
        .responseType('arraybuffer' as any)
        .get();

      // Convert response to Buffer
      const buffer = this.toBuffer(content);
      if (!buffer) {
        throw new Error('Failed to download document content');
      }

      // Write to temp file
      fs.writeFileSync(tempFilePath, buffer);

      // Convert using markitdown-js
      const result = await this.markitdown.convert(tempFilePath);

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

      // Handle server-relative paths (e.g., /sites/MySite/Shared Documents/doc.docx)
      // Convert to Graph API format
      const downloadUrl = await this.resolvePathToDownloadUrl(document.path, graphClient);

      return { downloadUrl, extension };
    }

    throw new Error('Invalid document location: must specify path or driveId/driveItemId');
  }

  /**
   * Resolve a SharePoint path to a Graph API download URL.
   */
  private async resolvePathToDownloadUrl(
    documentPath: string,
    graphClient: Client,
  ): Promise<string> {
    // Handle full URLs
    if (documentPath.startsWith('http://') || documentPath.startsWith('https://')) {
      const url = new URL(documentPath);
      const hostname = url.hostname;
      const pathname = url.pathname;

      // Use SharePoint sites API with path
      return `/sites/${hostname}:${pathname}:/content`;
    }

    // Handle server-relative paths (e.g., /sites/MySite/Shared Documents/doc.docx)
    // We need to figure out the site from the path
    const pathParts = documentPath.split('/').filter(Boolean);
    const sitesIndex = pathParts.indexOf('sites');

    if (sitesIndex !== -1 && pathParts.length > sitesIndex + 1) {
      const siteName = pathParts[sitesIndex + 1];
      const remainingPath = '/' + pathParts.slice(sitesIndex + 2).join('/');

      // Get the site to find the hostname
      // This assumes default tenant - may need configuration
      const sites = await graphClient
        .api('/sites')
        .filter(`displayName eq '${siteName}'`)
        .select('id,webUrl')
        .top(1)
        .get();

      if (sites.value && sites.value.length > 0) {
        const siteId = sites.value[0].id;
        return `/sites/${siteId}/drive/root:${remainingPath}:/content`;
      }
    }

    throw new Error(`Unable to resolve path: ${documentPath}. Use full URL or driveId/driveItemId.`);
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
