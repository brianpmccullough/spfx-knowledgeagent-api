import { Tool } from '@langchain/core/tools';
import { Client } from '@microsoft/microsoft-graph-client';
import { Logger } from '@nestjs/common';
import { EmbeddingService } from '../../knowledge-indexer/embedding.service';
import {
  VectorStoreService,
  VectorSearchResult,
} from '../../knowledge-indexer/vector-store.service';

export interface KnowledgeSearchResult {
  documentTitle: string;
  webUrl: string;
  siteUrl: string;
  siteName: string;
  chunkText: string;
  score: number;
}

export interface KnowledgeSearchToolOptions {
  /** Maximum number of chunks to return. Default: 5 */
  topK?: number;
  /** Minimum similarity score (0-1). Default: 0.6 */
  minScore?: number;
  /** Filter to specific site URL */
  siteUrl?: string;
  /** Use hybrid search (vector + keyword). Default: true */
  useHybridSearch?: boolean;
}

/**
 * RAG Knowledge Search Tool
 *
 * Searches the vector index for relevant knowledge content based on semantic similarity.
 * Verifies the user has permission to access each document before returning results.
 */
export class KnowledgeSearchTool extends Tool {
  name = 'knowledge_search';
  description = `Search the knowledge base for information about company policies, procedures, benefits, and other HR/organizational content.
Use this tool FIRST when answering questions about policies, benefits, time off, procedures, or other organizational knowledge.
IMPORTANT: Pass the user's EXACT question as the input. Do NOT modify, reformulate, or add context like department/location/role. The vector search handles semantic matching automatically.
Returns relevant excerpts from knowledge documents that the user has permission to access.`;

  private readonly logger = new Logger(KnowledgeSearchTool.name);
  private permissionCache = new Map<string, boolean>();

  constructor(
    private readonly graphClient: Client,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStoreService: VectorStoreService,
    private readonly options: KnowledgeSearchToolOptions = {},
  ) {
    super();
  }

  async _call(query: string): Promise<string> {
    const { topK = 5, minScore = 0.6, siteUrl, useHybridSearch = false } = this.options;

    try {
      this.logger.debug(`Knowledge search query: "${query}"`);

      // Generate embedding for the query
      const { embedding } = await this.embeddingService.generateEmbedding(query);

      // Search the vector index
      let searchResults: VectorSearchResult[];

      if (useHybridSearch) {
        this.logger.log('searchHybrid');
        searchResults = await this.vectorStoreService.searchHybrid(
          query,
          embedding,
          { topK: topK * 2, siteUrl, minScore }, // Fetch extra to account for permission filtering
        );
      } else {
        this.logger.log('searchSimilar');
        searchResults = await this.vectorStoreService.searchSimilar(embedding, {
          topK: topK * 2,
          siteUrl,
          minScore,
        });
      }

      if (searchResults.length === 0) {
        this.logger.debug('No results found in knowledge base');
        return 'No relevant information found in the knowledge base for this query.';
      }

      this.logger.debug(`Found ${searchResults.length} potential results, checking permissions...`);

      // Filter results by user permissions
      const accessibleResults = await this.filterByPermissions(searchResults);

      if (accessibleResults.length === 0) {
        this.logger.debug('No accessible results after permission check');
        return 'No relevant information found that you have access to view.';
      }

      // Deduplicate by document (keep highest scoring chunk per document)
      const deduplicatedResults = this.deduplicateByDocument(accessibleResults);

      // Take top K results
      const finalResults = deduplicatedResults.slice(0, topK);

      // Format results for the LLM
      return this.formatResults(finalResults);
    } catch (error) {
      this.logger.error('Knowledge search failed', error);
      return `Error searching knowledge base: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Filter search results to only include documents the user can access.
   */
  private async filterByPermissions(results: VectorSearchResult[]): Promise<VectorSearchResult[]> {
    const accessibleResults: VectorSearchResult[] = [];

    // Group chunks by document to minimize permission checks
    const documentIds = [...new Set(results.map((r) => r.chunk.documentId))];

    // Check permissions for each unique document
    const permissionResults = await Promise.all(
      documentIds.map(async (docId) => {
        const hasAccess = await this.checkDocumentPermission(
          results.find((r) => r.chunk.documentId === docId)!.chunk,
        );
        return { docId, hasAccess };
      }),
    );

    // Build a map of accessible document IDs
    const accessibleDocs = new Set(
      permissionResults.filter((p) => p.hasAccess).map((p) => p.docId),
    );

    // Filter results to only accessible documents
    for (const result of results) {
      if (accessibleDocs.has(result.chunk.documentId)) {
        accessibleResults.push(result);
      }
    }

    this.logger.debug(
      `Permission check: ${accessibleDocs.size}/${documentIds.length} documents accessible`,
    );

    return accessibleResults;
  }

  /**
   * Check if the user has permission to access a document.
   * Uses the user's delegated Graph token to verify access.
   */
  private async checkDocumentPermission(chunk: {
    documentId: string;
    driveId?: string;
    webUrl: string;
  }): Promise<boolean> {
    // Check cache first
    const cacheKey = chunk.documentId;
    if (this.permissionCache.has(cacheKey)) {
      return this.permissionCache.get(cacheKey)!;
    }

    try {
      // Try to access the document metadata using the user's token
      // If successful, user has at least read access
      if (chunk.driveId) {
        await this.graphClient
          .api(`/drives/${chunk.driveId}/items/${chunk.documentId}`)
          .select('id,name')
          .get();
      } else {
        // Fallback: try to resolve by webUrl
        const url = new URL(chunk.webUrl);
        await this.graphClient
          .api(`/sites/${url.hostname}:${url.pathname}`)
          .select('id,name')
          .get();
      }

      this.permissionCache.set(cacheKey, true);
      return true;
    } catch (error: any) {
      // 403 = no permission, 404 = document deleted/moved
      if (error.statusCode === 403 || error.statusCode === 404) {
        this.logger.debug(`User lacks access to document: ${chunk.webUrl} (${error.statusCode})`);
        this.permissionCache.set(cacheKey, false);
        return false;
      }

      // Other errors - log but assume no access for safety
      this.logger.warn(`Error checking permission for ${chunk.webUrl}: ${error.message}`);
      this.permissionCache.set(cacheKey, false);
      return false;
    }
  }

  /**
   * Deduplicate results by document, keeping the highest scoring chunk for each.
   */
  private deduplicateByDocument(results: VectorSearchResult[]): VectorSearchResult[] {
    const byDocument = new Map<string, VectorSearchResult>();

    for (const result of results) {
      const docId = result.chunk.documentId;
      const existing = byDocument.get(docId);

      if (!existing || result.score > existing.score) {
        byDocument.set(docId, result);
      }
    }

    return Array.from(byDocument.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * Format results for the LLM context.
   */
  private formatResults(results: VectorSearchResult[]): string {
    if (results.length === 0) {
      return 'No relevant information found.';
    }

    const formatted = results.map((result, index) => {
      const { chunk, score } = result;
      return `
### Source ${index + 1}: ${chunk.documentTitle}
**URL:** ${chunk.webUrl}
**Site:** ${chunk.siteName}
**driveId:** ${chunk.driveId}
**itemId:** ${chunk.documentId}
**Relevance:** ${(score * 100).toFixed(1)}%

**Content:**
${chunk.chunkText}
`;
    });

    return `Found ${results.length} relevant knowledge sources:\n${formatted.join('\n---\n')}`;
  }
}
