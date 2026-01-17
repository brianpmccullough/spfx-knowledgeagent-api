export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatContext {
  siteUrl: string;
}

export interface ChatRequest {
  context: ChatContext;
  messages: ChatMessage[];
}

export interface ChatResponse {
  response: string;
  messages: ChatMessage[];
}
