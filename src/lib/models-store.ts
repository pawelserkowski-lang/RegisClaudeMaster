import { create } from 'zustand';

export interface ModelInfo {
  id: string;
  label: string;
  provider: string;
}

interface ModelsState {
  // State
  models: ModelInfo[];
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  lastFetched: number | null;

  // Actions
  fetchModels: () => Promise<void>;
  refreshModels: () => Promise<void>;
  getModelsByProvider: (provider: string) => ModelInfo[];
  reset: () => void;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache
const API_ENDPOINT = '/api/models';

export const useModelsStore = create<ModelsState>((set, get) => ({
  // Initial state
  models: [],
  isLoading: false,
  isInitialized: false,
  error: null,
  lastFetched: null,

  /**
   * Fetch models from API with caching
   * Uses lazy loading - only fetches if cache expired or not initialized
   */
  fetchModels: async () => {
    const state = get();

    // Return cached data if still valid
    if (state.lastFetched && Date.now() - state.lastFetched < CACHE_TTL) {
      return;
    }

    // Prevent concurrent fetches
    if (state.isLoading) {
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(API_ENDPOINT, {
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = (await response.json()) as { models: ModelInfo[] };

      set({
        models: data.models,
        isLoading: false,
        isInitialized: true,
        lastFetched: Date.now(),
        error: null,
      });

      console.info(`[models] Loaded ${data.models.length} models from API`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.warn('[models] Failed to fetch models:', message);

      set({
        isLoading: false,
        isInitialized: true,
        error: message,
      });
    }
  },

  /**
   * Force refresh models (ignores cache)
   */
  refreshModels: async () => {
    set({ lastFetched: null });
    await get().fetchModels();
  },

  /**
   * Get models filtered by provider
   */
  getModelsByProvider: (provider: string) => {
    return get().models.filter((model) => model.provider === provider);
  },

  /**
   * Reset store to initial state
   */
  reset: () => {
    set({
      models: [],
      isLoading: false,
      isInitialized: false,
      error: null,
      lastFetched: null,
    });
  },
}));

/**
 * Hook to initialize models on app start (lazy loading)
 * Call this once in your App component
 */
export function useInitializeModels(): void {
  const { isInitialized, fetchModels } = useModelsStore();

  // Trigger fetch only once on mount
  if (!isInitialized) {
    void fetchModels();
  }
}

/**
 * Utility to check if a specific provider has models available
 */
export function hasProviderModels(provider: string): boolean {
  const { models } = useModelsStore.getState();
  return models.some((model) => model.provider === provider);
}

/**
 * Get all available providers from loaded models
 */
export function getAvailableProviders(): string[] {
  const { models } = useModelsStore.getState();
  return [...new Set(models.map((model) => model.provider))];
}
