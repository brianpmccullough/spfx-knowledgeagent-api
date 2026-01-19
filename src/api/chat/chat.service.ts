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
import { EmbeddingService } from '../knowledge-indexer/embedding.service';
import { VectorStoreService } from '../knowledge-indexer/vector-store.service';
import { StructuredTool } from '@langchain/core/tools';
import { KnowledgeSearchTool } from './tools/knowledge-search.tool';

export type SearchMode = 'rag' | 'kql';

@Injectable()
export class ChatService {
  private llm: AzureChatOpenAI;

  constructor(
    private readonly configurationService: ConfigurationService,
    private oboGraphService: OboGraphService,
    private meService: MeService,
    private embeddingService: EmbeddingService,
    private vectorStoreService: VectorStoreService,
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

    // Determine search mode from context, default to configured value
    const searchMode: SearchMode =
      context.searchMode ??
      (this.configurationService.configuration.DEFAULT_SEARCH_MODE as SearchMode) ??
      'kql';

    // Build tools based on search mode
    const tools = this.buildTools(graphClient, context, searchMode);

    // Build prompt based on search mode
    const prompt = this.buildPrompt(user, searchMode);

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
    console.log(`[${searchMode.toUpperCase()}] ${lastMessage}`);

    const result = await executor.invoke({
      input: lastMessage,
      chat_history: chatHistory,
    });

    return [...messages, { role: 'assistant', content: result.output }];
  }

  /**
   * Build the tools array based on search mode.
   */
  private buildTools(
    graphClient: any,
    context: ChatContext,
    searchMode: SearchMode,
  ): StructuredTool[] {
    // Common tools available in both modes
    const commonTools = [
      new GraphSiteTool(graphClient, context.siteUrl),
      new GraphMeTool(graphClient, this.meService),
    ];

    if (searchMode === 'rag') {
      // RAG mode: Knowledge search + file reader for deep dives
      return [
        new KnowledgeSearchTool(graphClient, this.embeddingService, this.vectorStoreService, {
          topK: 5,
          minScore: 0.6,
          siteUrl: context.siteUrl,
          useHybridSearch: false,
        }),
        new GraphFileReaderTool(graphClient), // For reading full documents if needed
        ...commonTools,
      ];
    } else {
      // KQL mode: Original SharePoint search approach
      return [
        new GraphSearchTool(graphClient, context.siteUrl),
        new GraphFileReaderTool(graphClient),
        ...commonTools,
      ];
    }
  }

  /**
   * Build the system prompt based on search mode.
   */
  private buildPrompt(user: AuthenticatedUser, searchMode: SearchMode): ChatPromptTemplate {
    const baseContext = `You are a helpful assistant that answers questions about SharePoint (Online) content for employees.
You are speaking with ${user.name} (${user.email}).
The current date and time (UTC) is: ${new Date().toISOString()}`;

    const ragInstructions = `
You have access to these tools:
- knowledge_search: Search the pre-indexed knowledge base for policies, procedures, benefits, and organizational information. **Use this as your primary search tool.**
- read_file_content: Read the full content of a document or page (use when you need more detail from a knowledge_search result)
- get_current_site: Get the current SharePoint site information including name, description, and id.
- get_current_user: Get the current user's profile including company, country, department, and manager

## Tool Usage Strategy

1. **FIRST** use knowledge_search - the input MUST be the user's message copied verbatim, character-for-character.
   - User says "whats my vacation days?" → search input: "whats my vacation days?"
   - User says "how do I submit expenses" → search input: "how do I submit expenses"
   - NEVER add department, location, role, company name, or ANY other words
2. If knowledge_search returns good results, use that information to answer
3. If more detail is needed, use read_file_content with the webUrl from the search results
4. AFTER getting search results, use get_current_user to personalize the answer if it varies by country or company

## CRITICAL: Knowledge Search Input Rules
- Copy the user's question EXACTLY - do not add or change ANY words
- The vector search is semantic - it will find relevant results without query modification
- Adding context like "for IT department" will BREAK the search
- Results are automatically filtered to documents you have permission to access`;

    const kqlInstructions = `
You have access to these tools:
- sharepoint_search: Search for documents and pages in SharePoint about a particular topic.
- read_file_content: Read the full content of a document or page
- get_current_site: Get the current SharePoint site information including name, description, and id.
- get_current_user: Get the current user's profile including job title, department, country, and manager

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

When information varies by country or company make sure to specify which applies to this user.`;

    const commonInstructions = `

## Dates and Times
When answering, attempt to provide relative date/time information relative to the latest date/time provided in the chat history and context window.
For example:  "Last Monday in May" and context indicates 2025, use May 26.

## Citations and Evidence
When providing information:
- Do NOT use absolute or official-sounding terminology
- Use phrases like "it appears that" or "based on the policy documents"
- ALWAYS provide exact quotes from source documents that are used in determining conclusion
- ALWAYS cite your sources by including the webUrl at the end of your response

Example citation format:
"Based on the Global Time Off Policy, it appears that employees in the United States receive 15 vacation days per year."
Source: [Global Time Off Policy](https://company.sharepoint.com/sites/hr/Documents/TimeOffPolicy.pdf)
`;

    const systemMessage =
      baseContext + (searchMode === 'rag' ? ragInstructions : kqlInstructions) + commonInstructions;

    return ChatPromptTemplate.fromMessages([
      ['system', systemMessage],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);
  }
}
