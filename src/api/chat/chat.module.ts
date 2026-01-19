import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { MeModule } from '../me/me.module';
import { ConfigurationModule } from '../config/configuration.module';
import { EmbeddingService } from '../knowledge-indexer/embedding.service';
import { VectorStoreService } from '../knowledge-indexer/vector-store.service';

@Module({
  imports: [ConfigurationModule, MeModule],
  controllers: [ChatController],
  providers: [ChatService, EmbeddingService, VectorStoreService],
})
export class ChatModule {}
