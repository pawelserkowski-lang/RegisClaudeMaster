/**
 * AI Providers Store
 * Manages API keys and provider configuration with persistence
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AIProviderSettings, ProviderConfig } from './ai-providers';

interface AIProvidersState {
  // Provider settings
  settings: AIProviderSettings;

  // Actions
  setProviderConfig: (provider: keyof AIProviderSettings, config: Partial<ProviderConfig>) => void;
  setApiKey: (provider: keyof AIProviderSettings, apiKey: string) => void;
  toggleProvider: (provider: keyof AIProviderSettings, enabled: boolean) => void;
  getEnabledProviders: () => (keyof AIProviderSettings)[];
  hasAnyProvider: () => boolean;
  reset: () => void;
}

const DEFAULT_SETTINGS: AIProviderSettings = {
  openai: {
    enabled: false,
    apiKey: undefined,
  },
  anthropic: {
    enabled: false,
    apiKey: undefined,
  },
  gemini: {
    enabled: false,
    apiKey: undefined,
  },
  ollama: {
    enabled: true, // Ollama enabled by default (local, no API key needed)
    baseUrl: 'http://127.0.0.1:11434',
  },
};

export const useAIProvidersStore = create<AIProvidersState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,

      /**
       * Set provider configuration
       */
      setProviderConfig: (provider, config) => {
        set((state) => ({
          settings: {
            ...state.settings,
            [provider]: {
              ...state.settings[provider],
              ...config,
            },
          },
        }));
      },

      /**
       * Set API key for a provider
       */
      setApiKey: (provider, apiKey) => {
        set((state) => ({
          settings: {
            ...state.settings,
            [provider]: {
              ...state.settings[provider],
              apiKey,
              enabled: apiKey.length > 0, // Auto-enable when key is set
            },
          },
        }));
      },

      /**
       * Toggle provider enabled/disabled
       */
      toggleProvider: (provider, enabled) => {
        set((state) => ({
          settings: {
            ...state.settings,
            [provider]: {
              ...state.settings[provider],
              enabled,
            },
          },
        }));
      },

      /**
       * Get list of enabled providers
       */
      getEnabledProviders: () => {
        const { settings } = get();
        const providers: (keyof AIProviderSettings)[] = [];

        if (settings.openai?.enabled && settings.openai.apiKey) providers.push('openai');
        if (settings.anthropic?.enabled && settings.anthropic.apiKey) providers.push('anthropic');
        if (settings.gemini?.enabled && settings.gemini.apiKey) providers.push('gemini');
        if (settings.ollama?.enabled) providers.push('ollama');

        return providers;
      },

      /**
       * Check if any provider is configured
       */
      hasAnyProvider: () => {
        return get().getEnabledProviders().length > 0;
      },

      /**
       * Reset to default settings
       */
      reset: () => {
        set({ settings: DEFAULT_SETTINGS });
      },
    }),
    {
      name: 'regis-ai-providers',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: state.settings,
      }),
    }
  )
);

/**
 * Get current provider settings (for use outside React)
 */
export function getProviderSettings(): AIProviderSettings {
  return useAIProvidersStore.getState().settings;
}

/**
 * Check if Ollama is available
 */
export async function checkOllamaHealth(): Promise<boolean> {
  const settings = getProviderSettings();
  const baseUrl = settings.ollama?.baseUrl ?? 'http://127.0.0.1:11434';

  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
