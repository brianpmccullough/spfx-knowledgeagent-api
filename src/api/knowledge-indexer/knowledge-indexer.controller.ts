import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { KnowledgeSchedulerService } from './knowledge-scheduler.service';
import {
  KnowledgeIndexerService,
  IndexerOptions,
  IndexerResult,
} from './knowledge-indexer.service';
import { AzureADGuard } from 'src/auth/azure-ad.guard';

/**
 * Admin controller for knowledge indexer operations.
 */
@Controller('api/admin/knowledge-indexer')
@UseGuards(AzureADGuard)
export class KnowledgeIndexerController {
  constructor(
    private readonly schedulerService: KnowledgeSchedulerService,
    private readonly indexerService: KnowledgeIndexerService,
  ) {}

  /**
   * Trigger a full indexing run (search, extract, chunk, embed, store).
   * POST /api/admin/knowledge-indexer/run
   *
   * Query params:
   * - siteUrl: Limit to specific SharePoint site (optional)
   * - days: Number of days back to search (default: 2)
   */
  @Post('run')
  async triggerRun(
    @Query('siteUrl') siteUrl?: string,
    @Query('days') days?: string,
  ): Promise<IndexerResult> {
    const options: IndexerOptions = {};

    if (siteUrl) {
      options.siteUrl = siteUrl;
    }

    if (days) {
      const parsedDays = parseInt(days, 10);
      if (!isNaN(parsedDays) && parsedDays > 0) {
        options.modifiedWithinDays = parsedDays;
      }
    }

    return this.schedulerService.triggerManualRun(options);
  }

  /**
   * Search for documents without processing (for testing search query).
   * GET /api/admin/knowledge-indexer/preview
   *
   * Query params:
   * - siteUrl: Limit to specific SharePoint site (optional)
   * - days: Number of days back to search (default: 2)
   * - limit: Max results to return in preview (default: 20)
   */
  @Get('preview')
  async previewSearch(
    @Query('siteUrl') siteUrl?: string,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    const options: IndexerOptions = {};

    if (siteUrl) {
      options.siteUrl = siteUrl;
    }

    if (days) {
      const parsedDays = parseInt(days, 10);
      if (!isNaN(parsedDays) && parsedDays > 0) {
        options.modifiedWithinDays = parsedDays;
      }
    }

    const maxResults = limit ? parseInt(limit, 10) : 20;

    const documents = await this.indexerService.searchKnowledgeDocuments(options);

    return {
      total: documents.length,
      showing: Math.min(documents.length, maxResults),
      options: {
        siteUrl: options.siteUrl || '(all sites)',
        modifiedWithinDays: options.modifiedWithinDays || 2,
      },
      documents: documents.slice(0, maxResults),
    };
  }

  /**
   * Test indexing without storing embeddings (for testing content extraction).
   * POST /api/admin/knowledge-indexer/test
   *
   * Query params:
   * - siteUrl: Limit to specific SharePoint site (optional)
   * - days: Number of days back to search (default: 2)
   */
  @Post('test')
  async testIndexing(
    @Query('siteUrl') siteUrl?: string,
    @Query('days') days?: string,
  ): Promise<IndexerResult> {
    const options: IndexerOptions = {
      skipEmbeddings: true,
    };

    if (siteUrl) {
      options.siteUrl = siteUrl;
    }

    if (days) {
      const parsedDays = parseInt(days, 10);
      if (!isNaN(parsedDays) && parsedDays > 0) {
        options.modifiedWithinDays = parsedDays;
      }
    }

    return this.schedulerService.triggerManualRun(options);
  }

  /**
   * Get index statistics.
   * GET /api/admin/knowledge-indexer/stats
   */
  @Get('stats')
  async getStats() {
    return this.schedulerService.getIndexStats();
  }
}
