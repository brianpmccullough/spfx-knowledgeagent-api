import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigurationService } from '../config/configuration.service';
import {
  KnowledgeIndexerService,
  IndexerOptions,
  IndexerResult,
} from './knowledge-indexer.service';
import { VectorStoreService } from './vector-store.service';

@Injectable()
export class KnowledgeSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeSchedulerService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly configurationService: ConfigurationService,
    private readonly indexerService: KnowledgeIndexerService,
    private readonly vectorStoreService: VectorStoreService,
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
  async runIndexer(options: IndexerOptions = {}): Promise<IndexerResult> {
    if (this.isRunning) {
      this.logger.warn('Indexer already running, skipping this cycle');
      return {
        documentsFound: 0,
        documentsProcessed: 0,
        chunksCreated: 0,
        errors: ['Indexer already running'],
        durationMs: 0,
      };
    }

    this.isRunning = true;

    try {
      this.logger.log('Starting knowledge indexing run...', { options });
      const result = await this.indexerService.runIndexingPipeline(options);

      // Log summary
      this.logger.log(
        `Indexing complete: ${result.documentsProcessed}/${result.documentsFound} documents, ` +
          `${result.chunksCreated} chunks, ${result.errors.length} errors, ${result.durationMs}ms`,
      );

      if (result.errors.length > 0) {
        this.logger.warn(`Indexing errors: ${result.errors.join('; ')}`);
      }

      return result;
    } catch (error) {
      this.logger.error('Knowledge indexing run failed', error);
      return {
        documentsFound: 0,
        documentsProcessed: 0,
        chunksCreated: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        durationMs: 0,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manually trigger an indexing run with optional overrides.
   */
  async triggerManualRun(options?: IndexerOptions): Promise<IndexerResult> {
    // Merge provided options with defaults
    const mergedOptions: IndexerOptions = {
      siteUrl: options?.siteUrl,
      modifiedWithinDays: options?.modifiedWithinDays ?? 2,
      skipEmbeddings: options?.skipEmbeddings ?? true,
    };

    return this.runIndexer(mergedOptions);
  }

  /**
   * Get current index statistics.
   */
  async getIndexStats(): Promise<{
    documentCount: number;
    storageSize: number;
    storageSizeFormatted: string;
  }> {
    const stats = await this.vectorStoreService.getIndexStats();
    return {
      ...stats,
      storageSizeFormatted: this.formatBytes(stats.storageSize),
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
