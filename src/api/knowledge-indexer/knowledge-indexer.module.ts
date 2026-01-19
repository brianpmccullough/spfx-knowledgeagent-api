import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../config/configuration.module';
import { SharedServicesModule } from '../shared-services/shared-services.module';
import { KnowledgeIndexerService } from './knowledge-indexer.service';
import { KnowledgeSchedulerService } from './knowledge-scheduler.service';
import { KnowledgeIndexerController } from './knowledge-indexer.controller';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService } from './vector-store.service';
import { DocumentContentService } from './document-content.service';

@Module({
  imports: [ConfigurationModule, SharedServicesModule],
  controllers: [KnowledgeIndexerController],
  providers: [
    KnowledgeIndexerService,
    KnowledgeSchedulerService,
    ChunkingService,
    EmbeddingService,
    VectorStoreService,
    DocumentContentService,
  ],
  exports: [
    KnowledgeIndexerService,
    KnowledgeSchedulerService,
    VectorStoreService,
    EmbeddingService,
  ],
})
export class KnowledgeIndexerModule {}
