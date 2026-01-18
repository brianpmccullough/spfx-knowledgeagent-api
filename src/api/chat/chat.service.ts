import { Injectable } from '@nestjs/common';
import { AzureChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { ChatContext, ChatMessage } from './models';
import { ConfigurationService } from '../config/configuration.service';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AuthenticatedUser } from 'src/auth/authenticateduser';
import { OboGraphService } from '../shared-services/obo-graph.service';
import { GraphSearchTool } from './tools/spo-graph-search.tool';
import { GraphFileReaderTool } from './tools/spo-graph-file-reader.tool';
import { MeService } from '../me/me.service';
import { GraphMeTool } from './tools/graph-me.tool';
import { GraphSiteTool } from './tools/spo-site-graph.tool';

@Injectable()
export class ChatService {
  private llm: AzureChatOpenAI;

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
      new GraphSiteTool(graphClient, context.siteUrl),
      new GraphMeTool(graphClient, this.meService),
      new GraphSearchTool(graphClient, context.siteUrl),
      new GraphFileReaderTool(graphClient),
    ];

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are a helpful assistant that answers questions about SharePoint (Online) content for employees.
You are speaking with ${user.name} (${user.email}).
The current date and time (UTC) is: ${new Date().toISOString()}

You have access to these tools:
- get_current_site: Get the current SharePoint site information including name, description, and id.
- sharepoint_search: Search for documents and pages in SharePoint about a particular topic.
- read_file_content: Read the full content of a document or page
- get_current_user: Get the current user's profile including job title, department, location, and manager

## SharePoint Search Rules
When using sharepoint_search, use ONLY 1-3 simple topic keywords.
NEVER include in search queries: company names, locations, departments, employee names, or any user-specific context.
The search is automatically scoped to the current site.

Examples:
- "What's my vacation policy?" → search: "vacation policy"
- "What benefits do I qualify for?" → search: "benefits" or "employee benefits"  

## Answering Personal or Location-Specific Questions
For questions about policies, benefits, or procedures that may vary by location/company/department:
1. FIRST use sharepoint_search with simple topic keywords (1-3 words)
2. THEN use read_file_content to read the document content using the exact **webUrl** from the sharepoint_search results
3. THEN use get_current_user to get the user's location, company, department, and other relevant details
4. FINALLY provide an answer that is specific to the user's situation based on their profile

When information varies by location, department, or role, make sure to specify which applies to this user.

## Citations and Evidence
When providing information, do NOT use absolute or official sounding terminology. Use terminology that indicates confidence but that the user should verify, since this is AI.
For example, instead of "you qualify for" use "it appears that you qualify for".
Provide exact text used from source document in the response.

ALWAYS, at the end, cite your sources by including the webUrl when referencing documents.
`,
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
