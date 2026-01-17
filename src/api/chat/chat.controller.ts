import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { AzureADGuard } from '../../auth/azure-ad.guard';
import { CurrentUser } from '../../auth/user.decorator';
import { AuthenticatedUser } from '../../auth/authenticateduser';
import { ChatRequest, ChatResponse } from './models';

@Controller('api/chat')
@UseGuards(AzureADGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(
    @Body() request: ChatRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChatResponse> {
    const messages = await this.chatService.chat(
      request.messages,
      user,
      request.context,
    );
    return {
      response: messages[messages.length - 1].content,
      messages,
    };
  }
}
