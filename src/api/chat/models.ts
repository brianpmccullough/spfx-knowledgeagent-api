export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type SearchMode = 'rag' | 'kql';

export interface ChatContext {
  siteUrl: string;
  /**
   * Search mode to use for this conversation.
   * - 'rag': Use vector search over pre-indexed knowledge base
   * - 'kql': Use SharePoint KQL search with document reading
   * Default: Uses DEFAULT_SEARCH_MODE from configuration, or 'kql' if not set
   */
  searchMode?: SearchMode;
}

export interface ChatRequest {
  messages: ChatMessage[];
  context: ChatContext;
}

export interface ChatResponse {
  response: string;
  messages: ChatMessage[];
  searchMode: SearchMode;
}
