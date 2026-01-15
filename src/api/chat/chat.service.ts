import { Injectable } from '@nestjs/common';
import { AzureChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { ChatMessage } from './models';
import { ConfigurationService } from '../config/configuration.service';

@Injectable()
export class ChatService {
  private llm: AzureChatOpenAI;
  private systemPrompt =
    'You are a helpful assistant that answers questions about SharePoint content.';

  constructor(private readonly configurationService: ConfigurationService) {
    const { configuration, secrets } = this.configurationService;
    this.llm = new AzureChatOpenAI({
      azureOpenAIEndpoint: configuration.AZURE_OPENAI_ENDPOINT,
      azureOpenAIApiKey: secrets.AZURE_OPENAI_API_KEY,
      azureOpenAIApiDeploymentName: configuration.AZURE_OPENAI_DEPLOYMENT,
      azureOpenAIApiVersion: configuration.AZURE_OPENAI_API_VERSION,
    });
  }

  async chat(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const langchainMessages: BaseMessage[] = [
      new SystemMessage(this.systemPrompt),
      ...messages.map((msg) => {
        if (msg.role === 'user') return new HumanMessage(msg.content);
        if (msg.role === 'assistant') return new AIMessage(msg.content);
        return new SystemMessage(msg.content);
      }),
    ];

    const response = await this.llm.invoke(langchainMessages);

    return [
      ...messages,
      { role: 'assistant', content: response.content as string },
    ];
  }
}
