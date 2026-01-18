import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../config/configuration.module';
import { AppGraphService } from '../shared-services/app-graph.service';
import { KnowledgeIndexerService } from './knowledge-indexer.service';
import { KnowledgeSchedulerService } from './knowledge-scheduler.service';
import { KnowledgeIndexerController } from './knowledge-indexer.controller';

@Module({
  imports: [ConfigurationModule],
  controllers: [KnowledgeIndexerController],
  providers: [AppGraphService, KnowledgeIndexerService, KnowledgeSchedulerService],
  exports: [AppGraphService, KnowledgeIndexerService, KnowledgeSchedulerService],
})
export class KnowledgeIndexerModule {}
