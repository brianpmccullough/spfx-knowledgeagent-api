import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { MeModule } from '../me/me.module';
import { ConfigurationModule } from '../config/configuration.module';

@Module({
  imports: [ConfigurationModule, MeModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
