import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  SearchClient,
  SearchIndexClient,
  AzureKeyCredential,
  SearchIndex,
} from '@azure/search-documents';
import { ConfigurationService } from '../config/configuration.service';

export interface DocumentChunk {
  id: string;
  documentId: string;
  driveId?: string;
  webUrl: string;
  siteUrl?: string;
  siteName?: string;
  documentTitle: string;
  fileType: string;
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
  documentModifiedAt?: Date;
  indexedAt: Date;
}

export interface VectorSearchResult {
  chunk: DocumentChunk;
  score: number;
}

@Injectable()
export class VectorStoreService implements OnModuleInit {
  private readonly logger = new Logger(VectorStoreService.name);
  private searchClient: SearchClient<DocumentChunk>;
  private indexClient: SearchIndexClient;
  private indexName: string;

  constructor(private readonly configurationService: ConfigurationService) {}

  async onModuleInit() {
    const { configuration, secrets } = this.configurationService;

    this.indexName = configuration.AZURE_SEARCH_INDEX_NAME;

    const credential = new AzureKeyCredential(secrets.AZURE_SEARCH_ADMIN_KEY);

    this.indexClient = new SearchIndexClient(configuration.AZURE_SEARCH_ENDPOINT, credential);

    this.searchClient = new SearchClient<DocumentChunk>(
      configuration.AZURE_SEARCH_ENDPOINT,
      this.indexName,
      credential,
    );

    // Ensure index exists
    await this.ensureIndexExists();

    this.logger.log(`Vector store initialized with index: ${this.indexName}`);
  }

  /**
   * Create the search index if it doesn't exist.
   */
  private async ensureIndexExists(): Promise<void> {
    try {
      await this.indexClient.getIndex(this.indexName);
      this.logger.log(`Index '${this.indexName}' already exists`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        this.logger.log(`Creating index '${this.indexName}'...`);
        await this.createIndex();
      } else {
        throw error;
      }
    }
  }

  /**
   * Create the search index with vector search configuration.
   */
  private async createIndex(): Promise<void> {
    const index: SearchIndex = {
      name: this.indexName,
      fields: [
        { name: 'id', type: 'Edm.String', key: true, filterable: true },
        {
          name: 'documentId',
          type: 'Edm.String',
          filterable: true,
          sortable: true,
        },
        { name: 'driveId', type: 'Edm.String', filterable: true },
        { name: 'webUrl', type: 'Edm.String', filterable: true },
        { name: 'siteUrl', type: 'Edm.String', filterable: true, facetable: true },
        {
          name: 'siteName',
          type: 'Edm.String',
          filterable: true,
          facetable: true,
        },
        {
          name: 'documentTitle',
          type: 'Edm.String',
          searchable: true,
          filterable: true,
        },
        {
          name: 'fileType',
          type: 'Edm.String',
          filterable: true,
          facetable: true,
        },
        { name: 'chunkIndex', type: 'Edm.Int32', sortable: true },
        { name: 'chunkText', type: 'Edm.String', searchable: true },
        {
          name: 'embedding',
          type: 'Collection(Edm.Single)',
          searchable: true,
          vectorSearchDimensions: 1536,
          vectorSearchProfileName: 'vector-profile',
        },
        {
          name: 'documentModifiedAt',
          type: 'Edm.DateTimeOffset',
          filterable: true,
          sortable: true,
        },
        {
          name: 'indexedAt',
          type: 'Edm.DateTimeOffset',
          filterable: true,
          sortable: true,
        },
      ],
      vectorSearch: {
        algorithms: [
          {
            name: 'hnsw-algorithm',
            kind: 'hnsw',
            parameters: {
              m: 4,
              efConstruction: 400,
              efSearch: 500,
              metric: 'cosine',
            },
          },
        ],
        profiles: [
          {
            name: 'vector-profile',
            algorithmConfigurationName: 'hnsw-algorithm',
          },
        ],
      },
    };

    await this.indexClient.createIndex(index);
    this.logger.log(`Index '${this.indexName}' created successfully`);
  }

  /**
   * Upload document chunks to the index.
   * Uses merge-or-upload to handle both new and updated documents.
   */
  async upsertChunks(chunks: DocumentChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    // Azure AI Search batch limit is 1000 documents
    const batchSize = 1000;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      try {
        const result = await this.searchClient.mergeOrUploadDocuments(batch);
        const succeeded = result.results.filter((r) => r.succeeded).length;
        const failed = result.results.filter((r) => !r.succeeded).length;

        if (failed > 0) {
          const errors = result.results
            .filter((r) => !r.succeeded)
            .map((r) => r.errorMessage)
            .slice(0, 5);
          this.logger.warn(
            `Batch upload: ${succeeded} succeeded, ${failed} failed. Errors: ${errors.join('; ')}`,
          );
        } else {
          this.logger.debug(`Uploaded batch of ${succeeded} chunks`);
        }
      } catch (error) {
        this.logger.error(`Failed to upload batch starting at index ${i}`, error);
        throw error;
      }
    }

    this.logger.log(`Upserted ${chunks.length} chunks to index`);
  }

  /**
   * Delete all chunks for a specific document.
   */
  async deleteDocumentChunks(documentId: string): Promise<void> {
    try {
      // Find all chunks for this document
      const searchResults = await this.searchClient.search('*', {
        filter: `documentId eq '${documentId}'`,
        select: ['id'],
        top: 1000,
      });

      const idsToDelete: string[] = [];
      for await (const result of searchResults.results) {
        idsToDelete.push(result.document.id);
      }

      if (idsToDelete.length > 0) {
        await this.searchClient.deleteDocuments('id', idsToDelete);
        this.logger.log(`Deleted ${idsToDelete.length} chunks for document ${documentId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to delete chunks for document ${documentId}`, error);
      throw error;
    }
  }

  /**
   * Search for similar chunks using vector similarity.
   */
  async searchSimilar(
    queryEmbedding: number[],
    options: {
      topK?: number;
      siteUrl?: string;
      fileTypes?: string[];
      minScore?: number;
    } = {},
  ): Promise<VectorSearchResult[]> {
    const { topK = 10, siteUrl, fileTypes, minScore = 0.6 } = options;

    // Build filter
    const filters: string[] = [];
    if (siteUrl) {
      filters.push(`siteUrl eq '${siteUrl}'`);
    }
    if (fileTypes && fileTypes.length > 0) {
      const typeFilters = fileTypes.map((t) => `fileType eq '${t}'`).join(' or ');
      filters.push(`(${typeFilters})`);
    }

    const filterString = filters.length > 0 ? filters.join(' and ') : undefined;

    try {
      const searchResults = await this.searchClient.search('*', {
        vectorSearchOptions: {
          queries: [
            {
              kind: 'vector',
              vector: queryEmbedding,
              kNearestNeighborsCount: topK,
              fields: ['embedding'],
            },
          ],
        },
        filter: filterString,
        select: [
          'id',
          'documentId',
          'driveId',
          'webUrl',
          'siteUrl',
          'siteName',
          'documentTitle',
          'fileType',
          'chunkIndex',
          'chunkText',
          'documentModifiedAt',
          'indexedAt',
        ],
        top: topK,
      });

      const results: VectorSearchResult[] = [];
      let totalResults = 0;
      for await (const result of searchResults.results) {
        totalResults++;
        const score = result.score ?? 0;
        this.logger.debug(
          `Result ${totalResults}: score=${score}, title="${result.document.documentTitle}"`,
        );
        if (score >= minScore) {
          results.push({
            chunk: result.document as DocumentChunk,
            score,
          });
        }
      }

      this.logger.debug(
        `Vector search returned ${results.length}/${totalResults} results above threshold ${minScore}`,
      );

      return results;
    } catch (error) {
      this.logger.error('Vector search failed', error);
      throw error;
    }
  }

  /**
   * Hybrid search combining vector similarity and keyword search.
   */
  async searchHybrid(
    query: string,
    queryEmbedding: number[],
    options: {
      topK?: number;
      siteUrl?: string;
      fileTypes?: string[];
      minScore?: number;
    } = {},
  ): Promise<VectorSearchResult[]> {
    const { topK = 10, siteUrl, fileTypes, minScore = 0.5 } = options;

    const filters: string[] = [];
    if (siteUrl) {
      filters.push(`siteUrl eq '${siteUrl}'`);
    }
    if (fileTypes && fileTypes.length > 0) {
      const typeFilters = fileTypes.map((t) => `fileType eq '${t}'`).join(' or ');
      filters.push(`(${typeFilters})`);
    }

    const filterString = filters.length > 0 ? filters.join(' and ') : undefined;

    try {
      this.logger.verbose(query);
      this.logger.verbose(filterString);
      // Use '*' for the text query to rely primarily on vector similarity
      // The text query with 'simple' queryType requires exact keyword matches
      const searchResults = await this.searchClient.search('*', {
        vectorSearchOptions: {
          queries: [
            {
              kind: 'vector',
              vector: queryEmbedding,
              kNearestNeighborsCount: topK,
              fields: ['embedding'],
            },
          ],
        },
        filter: filterString,
        select: [
          'id',
          'documentId',
          'driveId',
          'webUrl',
          'siteUrl',
          'siteName',
          'documentTitle',
          'fileType',
          'chunkIndex',
          'chunkText',
          'documentModifiedAt',
          'indexedAt',
        ],
        top: topK,
      });

      this.logger.verbose(searchResults.results);
      const results: VectorSearchResult[] = [];
      for await (const result of searchResults.results) {
        const score = result.score ?? 0;
        if (score >= minScore) {
          results.push({
            chunk: result.document as DocumentChunk,
            score,
          });
        }
      }

      this.logger.debug(
        `Hybrid search returned ${results.length} results above threshold ${minScore}`,
      );

      return results;
    } catch (error) {
      this.logger.error('Hybrid search failed', error);
      throw error;
    }
  }

  /**
   * Get index statistics.
   */
  async getIndexStats(): Promise<{ documentCount: number; storageSize: number }> {
    try {
      const stats = await this.indexClient.getIndexStatistics(this.indexName);
      return {
        documentCount: stats.documentCount ?? 0,
        storageSize: stats.storageSize ?? 0,
      };
    } catch (error) {
      this.logger.error('Failed to get index stats', error);
      throw error;
    }
  }
}
