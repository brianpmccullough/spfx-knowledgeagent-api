import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@microsoft/microsoft-graph-client';
import { ConfigurationService } from '../config/configuration.service';
import { AppGraphService } from '../shared-services/app-graph.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService, DocumentChunk } from './vector-store.service';
import { DocumentContentService } from './document-content.service';

export interface KnowledgeDocument {
  id: string;
  title: string;
  webUrl: string;
  fileType: string;
  lastModified: string;
  siteUrl: string;
  siteName: string;
  driveId?: string;
  driveItemId?: string;
}

export interface SearchHit {
  hitId: string;
  resource: {
    '@odata.type': string;
    id: string;
    name: string;
    webUrl: string;
    lastModifiedDateTime: string;
    fileExtension?: string;
    parentReference?: {
      siteId?: string;
      driveId?: string;
    };
    sharepointIds?: {
      siteUrl?: string;
    };
    listItem?: {
      id: string;
      fields: Record<string, unknown>;
    };
  };
}

export interface SearchResponse {
  value: Array<{
    hitsContainers: Array<{
      hits: SearchHit[];
      total: number;
      moreResultsAvailable: boolean;
    }>;
  }>;
}

export interface IndexerOptions {
  /** Limit search to a specific site URL. If not provided, searches all sites. */
  siteUrl?: string;
  /** Number of days back to search for modified documents. Defaults to 2. */
  modifiedWithinDays?: number;
  /** Skip embedding generation (for testing search only). */
  skipEmbeddings?: boolean;
}

export interface IndexerResult {
  documentsFound: number;
  documentsProcessed: number;
  chunksCreated: number;
  errors: string[];
  durationMs: number;
}

@Injectable()
export class KnowledgeIndexerService {
  private readonly logger = new Logger(KnowledgeIndexerService.name);
  private graphClient: Client;

  constructor(
    private readonly appGraphService: AppGraphService,
    private readonly configurationService: ConfigurationService,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStoreService: VectorStoreService,
    private readonly documentContentService: DocumentContentService,
  ) {}

  /**
   * Run the full indexing pipeline:
   * 1. Search SharePoint for knowledge documents
   * 2. Extract content from each document
   * 3. Chunk the content
   * 4. Generate embeddings
   * 5. Store in vector index
   */
  async runIndexingPipeline(options: IndexerOptions = {}): Promise<IndexerResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let documentsProcessed = 0;
    let totalChunks = 0;

    // Step 1: Search for knowledge documents
    const documents = await this.searchKnowledgeDocuments(options);
    this.logger.log(`Found ${documents.length} knowledge documents to process`);

    if (documents.length === 0) {
      return {
        documentsFound: 0,
        documentsProcessed: 0,
        chunksCreated: 0,
        errors: [],
        durationMs: Date.now() - startTime,
      };
    }

    // Step 2-5: Process each document
    for (const document of documents) {
      try {
        const chunksCreated = await this.processDocument(document, options);
        if (chunksCreated > 0) {
          documentsProcessed++;
          totalChunks += chunksCreated;
          this.logger.log(`Processed ${document.title}: ${chunksCreated} chunks`);
        } else {
          this.logger.warn(`No content extracted from ${document.title}`);
        }
      } catch (error) {
        const errorMessage = `Failed to process ${document.title}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        this.logger.error(errorMessage);
        errors.push(errorMessage);
      }
    }

    const result: IndexerResult = {
      documentsFound: documents.length,
      documentsProcessed,
      chunksCreated: totalChunks,
      errors,
      durationMs: Date.now() - startTime,
    };

    this.logger.log(
      `Indexing complete: ${documentsProcessed}/${documents.length} documents, ${totalChunks} chunks in ${result.durationMs}ms`,
    );

    return result;
  }

  /**
   * Process a single document through the pipeline.
   */
  private async processDocument(
    document: KnowledgeDocument,
    options: IndexerOptions,
  ): Promise<number> {
    //this.logger.debug(document);
    // Extract content
    const content = await this.documentContentService.extractContent(document);
    //this.logger.debug(`extracted content: `, content);
    if (!content || content.length < 50) {
      this.logger.debug(`Skipping ${document.title}: insufficient content`);
      return 0;
    }

    // Chunk the content
    const textChunks = this.chunkingService.chunkText(content);
    if (textChunks.length === 0) {
      return 0;
    }

    this.logger.debug(`${document.title}: ${content.length} chars -> ${textChunks.length} chunks`);

    if (options.skipEmbeddings) {
      this.logger.debug('Skipping embeddings (test mode)');
      return textChunks.length;
    }

    // Generate embeddings for all chunks
    const chunkTexts = textChunks.map((c) => c.text);
    const embeddings = await this.embeddingService.generateEmbeddings(chunkTexts);

    // Build document chunks for storage
    const documentChunks: DocumentChunk[] = textChunks.map((chunk, index) => ({
      id: this.generateChunkId(document.id, chunk.index),
      documentId: document.id,
      driveId: document.driveId,
      webUrl: document.webUrl,
      siteUrl: document.siteUrl,
      siteName: document.siteName,
      documentTitle: document.title,
      fileType: document.fileType,
      chunkIndex: chunk.index,
      chunkText: chunk.text,
      embedding: embeddings[index].embedding,
      documentModifiedAt: new Date(document.lastModified),
      indexedAt: new Date(),
    }));

    // Delete existing chunks for this document (to handle updates)
    await this.vectorStoreService.deleteDocumentChunks(document.id);

    // Store new chunks
    await this.vectorStoreService.upsertChunks(documentChunks);

    return documentChunks.length;
  }

  /**
   * Generate a unique chunk ID.
   */
  private generateChunkId(documentId: string, chunkIndex: number): string {
    // Azure AI Search requires ID to be URL-safe
    const safeDocId = documentId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${safeDocId}_chunk_${chunkIndex}`;
  }

  /**
   * Search SharePoint for documents marked as knowledge content.
   * Uses app-only permissions and specifies the geo region.
   */
  async searchKnowledgeDocuments(options: IndexerOptions = {}): Promise<KnowledgeDocument[]> {
    this.graphClient = this.appGraphService.getClient();
    const { configuration } = this.configurationService;

    const { siteUrl, modifiedWithinDays = 2 } = options;

    // Build KQL query
    const kqlParts: string[] = [
      'IsKnowledgeOWSBOOL:1',
      '(FileType:aspx OR FileType:doc OR FileType:docx OR FileType:pdf)',
    ];

    // Add site filter if provided
    if (siteUrl) {
      kqlParts.push(`path:"${siteUrl}"`);
    }

    // Add date range filter
    const dateRange = this.buildDateRangeFilter(modifiedWithinDays);
    if (dateRange) {
      kqlParts.push(dateRange);
    }

    const kqlQuery = kqlParts.join(' ');

    const searchRequest = {
      requests: [
        {
          entityTypes: ['driveItem', 'listItem'],
          query: {
            queryString: kqlQuery,
          },
          from: 0,
          size: 500,
          region: configuration.SHAREPOINT_GEO,
          fields: [
            'id',
            'name',
            'webUrl',
            'lastModifiedDateTime',
            'parentReference',
            'listItem',
            'sharepointIds',
            'fileExtension',
            'SPSiteUrl',
            'SiteTitle',
          ],
        },
      ],
    };

    this.logger.log(`Executing knowledge search with query: ${kqlQuery}`);

    try {
      const response: SearchResponse = await this.graphClient
        .api('/search/query')
        .post(searchRequest);

      const documents = this.parseSearchResults(response);
      this.logger.log(`Found ${documents.length} knowledge documents`);

      return documents;
    } catch (error) {
      this.logger.error('Failed to search for knowledge documents', error);
      throw error;
    }
  }

  /**
   * Build a KQL date range filter for LastModifiedTime.
   */
  private buildDateRangeFilter(daysBack: number): string {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysBack);

    // Format as YYYY-MM-DD for KQL
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    return `LastModifiedTime>=${formatDate(startDate)} LastModifiedTime<=${formatDate(now)}`;
  }

  /**
   * Parse search results into a normalized document structure.
   */
  private parseSearchResults(response: SearchResponse): KnowledgeDocument[] {
    const documents: KnowledgeDocument[] = [];

    for (const result of response.value || []) {
      for (const container of result.hitsContainers || []) {
        for (const hit of container.hits || []) {
          const resource = hit.resource;

          documents.push({
            id: hit.hitId,
            title: resource.name,
            webUrl: resource.webUrl,
            fileType: resource.fileExtension || this.inferFileType(resource.name),
            lastModified: resource.lastModifiedDateTime,
            siteUrl: (resource.listItem?.fields?.spSiteUrl as string) ?? '',
            siteName: (resource.listItem?.fields?.siteTitle as string) ?? '',
            driveId: resource.parentReference?.driveId,
            driveItemId: resource.id,
          });
        }
      }
    }

    return documents;
  }

  /**
   * Fallback to infer file type from name if fileExtension not returned.
   */
  private inferFileType(filename: string): string {
    const match = filename.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : 'unknown';
  }
}
