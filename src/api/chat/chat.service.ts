import { Injectable } from '@nestjs/common';
import { AzureChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { ChatContext, ChatMessage } from './models';
import { ConfigurationService } from '../config/configuration.service';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { AuthenticatedUser } from 'src/auth/authenticateduser';
import { OboGraphService } from '../shared-services/obo-graph.service';
import { GraphSearchTool } from './tools/spo-graph-search.tool';
import { GraphFileReaderTool } from './tools/spo-graph-file-reader.tool';
import { MeService } from '../me/me.service';
import { GraphMeTool } from './tools/graph-me.tool';

@Injectable()
export class ChatService {
  private llm: AzureChatOpenAI;
  private systemPrompt =
    'You are a helpful assistant that answers questions about SharePoint content.';

  constructor(
    private readonly configurationService: ConfigurationService,
    private oboGraphService: OboGraphService,
    private meService: MeService,
  ) {
    const { configuration, secrets } = this.configurationService;
    this.llm = new AzureChatOpenAI({
      azureOpenAIEndpoint: configuration.AZURE_OPENAI_ENDPOINT,
      azureOpenAIApiKey: secrets.AZURE_OPENAI_API_KEY,
      azureOpenAIApiDeploymentName: configuration.AZURE_OPENAI_DEPLOYMENT,
      azureOpenAIApiVersion: configuration.AZURE_OPENAI_API_VERSION,
    });
  }

  async chat(
    messages: ChatMessage[],
    user: AuthenticatedUser,
    context: ChatContext,
  ): Promise<ChatMessage[]> {
    const graphClient = await this.oboGraphService.getGraphClient(user.token);

    const tools = [
      new GraphSearchTool(graphClient, context.siteUrl),
      new GraphFileReaderTool(graphClient),
      new GraphMeTool(graphClient, this.meService),
    ];

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are a helpful assistant that answers questions about SharePoint content for employees.
You are speaking with ${user.name} (${user.email}).
The current date and time (UTC) is: ${new Date().toISOString()}

You have access to these tools:
- sharepoint_search: Search for documents and pages in SharePoint
- read_file_content: Read the full content of a document or page
- get_current_user: Get the current user's profile including job title, department, location, and manager

IMPORTANT: When answering questions that are personal or location-specific (like vacation time, benefits, policies that vary by location, etc.):
1. FIRST use get_current_user to get the user's location, department, and other relevant details
2. THEN use sharepoint_search to find relevant documents
3. THEN use read_file_content to read the document content
4. FINALLY provide an answer that is specific to the user's situation based on their profile

Examples of questions requiring this multi-step approach:
- "What is my vacation time?" - Get user location, search for vacation policy, read it, answer based on their location
- "What benefits do I have?" - Get user details, search for benefits docs, read them, personalize the answer
- "Who should I contact about payroll?" - Get user department/location, search for HR contacts, provide relevant contact

Always cite your sources by including the webUrl when referencing documents.
When information varies by location, department, or role, make sure to specify which applies to this user.
When providing information, do NOT use absolute or official sounding terminology.  Use terminology that indicates you feel confident, but that user should double check.
For example, instead of "you currently qualify for" use "it appears that you qualify for".`,
      ],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    const agent = await createOpenAIToolsAgent({
      llm: this.llm,
      tools,
      prompt,
    });

    const executor = new AgentExecutor({
      agent,
      tools,
    });

    const chatHistory: BaseMessage[] = messages.slice(0, -1).map((msg) => {
      if (msg.role === 'user') return new HumanMessage(msg.content);
      return new AIMessage(msg.content);
    });

    const lastMessage = messages[messages.length - 1].content;
    console.log(lastMessage);
    const result = await executor.invoke({
      input: lastMessage,
      chat_history: chatHistory,
    });

    return [...messages, { role: 'assistant', content: result.output }];
  }
}
