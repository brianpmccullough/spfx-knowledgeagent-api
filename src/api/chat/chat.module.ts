import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConfigurationModule } from '../config/configuration.module';

@Module({
  controllers: [ChatController],
  imports: [ConfigurationModule],
  providers: [ChatService],
})
export class ChatModule {}
