import { create } from 'zustand';
import { fetchAllModels, type AIModel } from './ai-providers';
import { getProviderSettings } from './ai-providers-store';

export interface ModelInfo {
  id: string;
  label: string;
  provider: string;
  score?: number;
  contextWindow?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
}

interface ModelsState {
  // State
  models: ModelInfo[];
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  lastFetched: number | null;
  isPrefetching: boolean;

  // Actions
  fetchModels: () => Promise<void>;
  refreshModels: () => Promise<void>;
  prefetchModels: () => void;
  getModelsByProvider: (provider: string) => ModelInfo[];
  getBestModel: () => ModelInfo | null;
  reset: () => void;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache
const BACKGROUND_REFRESH_INTERVAL = 4 * 60 * 1000; // 4 minutes (before TTL expires)
const API_ENDPOINT = '/api/models';

/**
 * Convert AIModel to ModelInfo
 */
function aiModelToModelInfo(model: AIModel): ModelInfo {
  return {
    id: model.id,
    label: model.name,
    provider: model.provider,
    score: model.score,
    contextWindow: model.contextWindow,
    costPer1kInput: model.costPer1kInput,
    costPer1kOutput: model.costPer1kOutput,
  };
}

// Deduplication map for concurrent fetches
const pendingFetches = new Map<string, Promise<ModelInfo[]>>();

/**
 * Deduplicated fetch helper
 * Prevents multiple concurrent requests for the same resource
 */
async function dedupFetch(key: string, fetchFn: () => Promise<ModelInfo[]>): Promise<ModelInfo[]> {
  const existing = pendingFetches.get(key);
  if (existing) {
    return existing;
  }

  const promise = fetchFn().finally(() => {
    pendingFetches.delete(key);
  });

  pendingFetches.set(key, promise);
  return promise;
}

// Background refresh interval ID
let backgroundRefreshInterval: ReturnType<typeof setInterval> | null = null;

export const useModelsStore = create<ModelsState>((set, get) => ({
  // Initial state
  models: [],
  isLoading: false,
  isInitialized: false,
  error: null,
  lastFetched: null,
  isPrefetching: false,

  /**
   * Fetch models from all configured AI providers
   * Uses lazy loading - only fetches if cache expired or not initialized
   * Falls back to API endpoint if no providers configured
   */
  fetchModels: async () => {
    const state = get();

    // Return cached data if still valid
    if (state.lastFetched && Date.now() - state.lastFetched < CACHE_TTL) {
      return;
    }

    // Prevent concurrent fetches using state flag
    if (state.isLoading) {
      return;
    }

    set({ isLoading: true, error: null });

    try {
      // Use dedupFetch to prevent duplicate network requests
      const models = await dedupFetch('models', async () => {
        const providerSettings = getProviderSettings();

        // Try to fetch from all configured providers
        const aiModels = await fetchAllModels(providerSettings);

        if (aiModels.length > 0) {
          console.info(`[models] Fetched ${aiModels.length} models from providers`);
          return aiModels.map(aiModelToModelInfo);
        }

        // Fallback to API endpoint if no provider models found
        console.info('[models] No provider models, falling back to API');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(API_ENDPOINT, {
          credentials: 'include',
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Failed to fetch models: ${response.status}`);
        }

        const data = (await response.json()) as { models: ModelInfo[] };
        return data.models;
      });

      set({
        models,
        isLoading: false,
        isInitialized: true,
        lastFetched: Date.now(),
        error: null,
      });

      console.info(`[models] Loaded ${models.length} models total`);
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
   * Prefetch models on app load with background refresh
   * Sets up automatic refresh before cache expires
   */
  prefetchModels: () => {
    const state = get();

    // Skip if already prefetching or loading
    if (state.isPrefetching || state.isLoading) {
      return;
    }

    set({ isPrefetching: true });

    // Initial fetch
    void get().fetchModels().finally(() => {
      set({ isPrefetching: false });
    });

    // Set up background refresh (if not already running)
    if (!backgroundRefreshInterval) {
      backgroundRefreshInterval = setInterval(() => {
        const currentState = get();

        // Only refresh if app is active and cache is about to expire
        if (
          currentState.lastFetched &&
          Date.now() - currentState.lastFetched > BACKGROUND_REFRESH_INTERVAL
        ) {
          console.info('[models] Background refresh triggered');
          void get().refreshModels();
        }
      }, BACKGROUND_REFRESH_INTERVAL);

      // Clean up on page unload
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
          if (backgroundRefreshInterval) {
            clearInterval(backgroundRefreshInterval);
            backgroundRefreshInterval = null;
          }
        });

        // Also refresh when page becomes visible again
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            const currentState = get();
            if (
              currentState.lastFetched &&
              Date.now() - currentState.lastFetched > CACHE_TTL
            ) {
              console.info('[models] Refreshing stale cache after visibility change');
              void get().refreshModels();
            }
          }
        });
      }
    }
  },

  /**
   * Get models filtered by provider
   */
  getModelsByProvider: (provider: string) => {
    return get().models.filter((model) => model.provider === provider);
  },

  /**
   * Get the best available model (highest score)
   */
  getBestModel: () => {
    const { models } = get();
    if (models.length === 0) return null;

    // Models are already sorted by score (descending)
    return models[0];
  },

  /**
   * Reset store to initial state
   */
  reset: () => {
    // Clear background refresh
    if (backgroundRefreshInterval) {
      clearInterval(backgroundRefreshInterval);
      backgroundRefreshInterval = null;
    }

    set({
      models: [],
      isLoading: false,
      isInitialized: false,
      error: null,
      lastFetched: null,
      isPrefetching: false,
    });
  },
}));

/**
 * Hook to initialize models on app start with prefetching
 * Call this once in your App component
 * Uses prefetchModels for background refresh capability
 */
export function useInitializeModels(): void {
  const { isInitialized, prefetchModels } = useModelsStore();

  // Trigger prefetch only once on mount
  if (!isInitialized) {
    prefetchModels();
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

/**
 * Prefetch models immediately (for use outside of React components)
 * Useful for service workers or initialization scripts
 */
export function prefetchModelsNow(): void {
  const store = useModelsStore.getState();
  store.prefetchModels();
}

/**
 * Get cached models synchronously (may be empty if not loaded)
 */
export function getCachedModels(): ModelInfo[] {
  return useModelsStore.getState().models;
}

/**
 * Check if models cache is valid
 */
export function isModelsCacheValid(): boolean {
  const { lastFetched } = useModelsStore.getState();
  return lastFetched !== null && Date.now() - lastFetched < CACHE_TTL;
}

/**
 * Get cache status for debugging
 */
export function getModelsCacheStatus(): {
  isValid: boolean;
  age: number | null;
  ttl: number;
  modelCount: number;
} {
  const { lastFetched, models } = useModelsStore.getState();
  const age = lastFetched ? Date.now() - lastFetched : null;

  return {
    isValid: lastFetched !== null && age !== null && age < CACHE_TTL,
    age,
    ttl: CACHE_TTL,
    modelCount: models.length,
  };
}
