import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { KnowledgeSchedulerService } from './knowledge-scheduler.service';
import { KnowledgeIndexerService } from './knowledge-indexer.service';
import { AzureADGuard } from 'src/auth/azure-ad.guard';

/**
 * Admin controller for knowledge indexer operations.
 * Consider adding authentication/authorization for production.
 */
@Controller('api/admin/knowledge-indexer')
@UseGuards(AzureADGuard) // Uncomment to require auth
export class KnowledgeIndexerController {
  constructor(
    private readonly schedulerService: KnowledgeSchedulerService,
    private readonly indexerService: KnowledgeIndexerService,
  ) {}

  /**
   * Trigger a manual indexing run.
   * POST /api/admin/knowledge-indexer/run
   */
  @Post('run')
  async triggerRun(): Promise<{ success: boolean; message: string }> {
    return this.schedulerService.triggerManualRun();
  }

  /**
   * Search and return results without persisting (for testing).
   * GET /api/admin/knowledge-indexer/preview
   */
  @Get('preview')
  async previewSearch() {
    const documents = await this.indexerService.searchKnowledgeDocuments();
    return {
      count: documents.length,
      documents: documents,
    };
  }
}
