import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MeModule } from './api/me/me.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './api/chat/chat.module';
import { SharedServicesModule } from './api/shared-services/shared-services.module';
import { KnowledgeIndexerModule } from './api/knowledge-indexer/knowledge-indexer.module';
import { ExtractionModule } from './api/extraction/extraction.module';
import { TranslationModule } from './api/translation/translation.module';

@Module({
  imports: [
    AuthModule,
    ChatModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    KnowledgeIndexerModule,
    MeModule,
    ExtractionModule,
    TranslationModule,
    SharedServicesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
