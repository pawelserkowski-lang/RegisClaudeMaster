import { create } from 'zustand';
import { executePrompt, type SearchResult } from './api-client';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
  modelUsed?: string;
  timestamp: Date;
}

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  isResearching: boolean;
  error: string | null;
  sendMessage: (prompt: string) => Promise<void>;
  clearMessages: () => void;
  clearError: () => void;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const useChat = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  isResearching: false,
  error: null,

  sendMessage: async (prompt: string) => {
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
      isResearching: true,
      error: null,
    }));

    try {
      // Simulate research phase (grounding takes time)
      await new Promise((resolve) => setTimeout(resolve, 1000));
      set({ isResearching: false });

      const response = await executePrompt(prompt);

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: response.response,
        sources: response.sources,
        modelUsed: response.model_used,
        timestamp: new Date(),
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isLoading: false,
      }));
    } catch (error) {
      set({
        isLoading: false,
        isResearching: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }
  },

  clearMessages: () => set({ messages: [], error: null }),

  clearError: () => set({ error: null }),
}));
