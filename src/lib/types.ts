export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
  modelUsed?: string;
  timestamp: Date;
}
