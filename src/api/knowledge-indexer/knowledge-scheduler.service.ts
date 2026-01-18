import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigurationService } from '../config/configuration.service';
import { KnowledgeIndexerService, IndexerOptions } from './knowledge-indexer.service';

@Injectable()
export class KnowledgeSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeSchedulerService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly configurationService: ConfigurationService,
    private readonly indexerService: KnowledgeIndexerService,
  ) {}

  async onModuleInit() {
    const { configuration } = this.configurationService;

    // Check if indexer is enabled
    if (!configuration.KNOWLEDGE_INDEXER_ENABLED) {
      this.logger.log('Knowledge indexer is disabled');
      return;
    }

    // Get interval from configuration (default: 1 hour in ms)
    const intervalMs = configuration.KNOWLEDGE_INDEXER_INTERVAL_MS || 3600000;

    this.logger.log(
      `Starting knowledge indexer scheduler with interval: ${intervalMs}ms (${intervalMs / 60000} minutes)`,
    );

    // Build default options from configuration
    const defaultOptions: IndexerOptions = {
      siteUrl: undefined,
      modifiedWithinDays: 2,
    };

    // Run immediately on startup, then on interval
    await this.runIndexer(defaultOptions);

    this.intervalHandle = setInterval(() => {
      this.runIndexer(defaultOptions);
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.log('Knowledge indexer scheduler stopped');
    }
  }

  /**
   * Execute the indexer with concurrency protection.
   */
  async runIndexer(options: IndexerOptions = {}): Promise<{
    success: boolean;
    message: string;
    documentCount?: number;
  }> {
    if (this.isRunning) {
      this.logger.warn('Indexer already running, skipping this cycle');
      return { success: false, message: 'Indexer is already running' };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.logger.log('Starting knowledge indexing run...', options);

      const documents = await this.indexerService.searchKnowledgeDocuments(options);

      const duration = Date.now() - startTime;
      this.logger.log(
        `Indexing run completed: ${documents.length} documents found in ${duration}ms`,
      );

      // Log document summary
      if (documents.length > 0) {
        const byType = documents.reduce(
          (acc, doc) => {
            acc[doc.fileType] = (acc[doc.fileType] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        const bySite = documents.reduce(
          (acc, doc) => {
            const site = doc.siteUrl || 'unknown';
            acc[site] = (acc[site] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        this.logger.log(`Documents by type: ${JSON.stringify(byType)}`);
        this.logger.log(`Documents by site: ${JSON.stringify(bySite)}`);
      }

      // TODO: Next phase - generate embeddings and store

      return {
        success: true,
        message: `Indexing completed in ${duration}ms`,
        documentCount: documents.length,
      };
    } catch (error) {
      this.logger.error('Knowledge indexing run failed', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manually trigger an indexing run with optional overrides.
   */
  async triggerManualRun(options?: IndexerOptions): Promise<{
    success: boolean;
    message: string;
    documentCount?: number;
  }> {
    // Merge provided options with defaults
    const mergedOptions: IndexerOptions = {
      siteUrl: options?.siteUrl,
      modifiedWithinDays: options?.modifiedWithinDays ?? 2,
    };

    return this.runIndexer(mergedOptions);
  }
}
