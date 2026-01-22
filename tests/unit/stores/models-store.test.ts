import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useModelsStore, hasProviderModels, getAvailableProviders } from '../../../src/lib/models-store';

// Mock ai-providers module
vi.mock('../../../src/lib/ai-providers', () => ({
  fetchAllModels: vi.fn(),
}));

// Mock ai-providers-store module
vi.mock('../../../src/lib/ai-providers-store', () => ({
  getProviderSettings: vi.fn(() => ({
    openai: { enabled: false },
    anthropic: { enabled: false },
    gemini: { enabled: false },
    ollama: { enabled: false },
  })),
}));

import { fetchAllModels } from '../../../src/lib/ai-providers';

describe('models-store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset store to initial state
    useModelsStore.getState().reset();
    vi.clearAllMocks();
    // Reset fetchAllModels mock to return empty array by default
    vi.mocked(fetchAllModels).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('has empty models array', () => {
      const { models } = useModelsStore.getState();
      expect(models).toEqual([]);
    });

    it('is not loading initially', () => {
      const { isLoading } = useModelsStore.getState();
      expect(isLoading).toBe(false);
    });

    it('is not initialized initially', () => {
      const { isInitialized } = useModelsStore.getState();
      expect(isInitialized).toBe(false);
    });

    it('has no error initially', () => {
      const { error } = useModelsStore.getState();
      expect(error).toBeNull();
    });

    it('has no lastFetched timestamp initially', () => {
      const { lastFetched } = useModelsStore.getState();
      expect(lastFetched).toBeNull();
    });
  });

  describe('fetchModels', () => {
    it('fetches models from providers successfully', async () => {
      const mockAIModels = [
        { id: 'claude-3', name: 'Claude 3', provider: 'anthropic', score: 90, contextWindow: 100000, maxOutput: 4096, costPer1kInput: 0.003, costPer1kOutput: 0.015, available: true },
        { id: 'gpt-4', name: 'GPT-4', provider: 'openai', score: 88, contextWindow: 128000, maxOutput: 4096, costPer1kInput: 0.03, costPer1kOutput: 0.06, available: true },
      ];

      vi.mocked(fetchAllModels).mockResolvedValueOnce(mockAIModels);

      await useModelsStore.getState().fetchModels();

      const state = useModelsStore.getState();
      expect(state.models).toHaveLength(2);
      expect(state.models[0].id).toBe('claude-3');
      expect(state.models[0].label).toBe('Claude 3');
      expect(state.models[0].provider).toBe('anthropic');
      expect(state.models[0].score).toBe(90);
      expect(state.isLoading).toBe(false);
      expect(state.isInitialized).toBe(true);
      expect(state.error).toBeNull();
      expect(state.lastFetched).toBeTruthy();
    });

    it('falls back to API when no provider models', async () => {
      const mockModels = [
        { id: 'claude-3', label: 'Claude 3', provider: 'anthropic' },
        { id: 'gpt-4', label: 'GPT-4', provider: 'openai' },
      ];

      vi.mocked(fetchAllModels).mockResolvedValueOnce([]);
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: mockModels }),
      } as Response);

      await useModelsStore.getState().fetchModels();

      const state = useModelsStore.getState();
      expect(state.models).toEqual(mockModels);
      expect(state.isLoading).toBe(false);
      expect(state.isInitialized).toBe(true);
    });

    it('sets loading state while fetching', async () => {
      let resolvePromise: (value: unknown[]) => void;
      const fetchPromise = new Promise<unknown[]>((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(fetchAllModels).mockReturnValueOnce(fetchPromise as Promise<never>);

      const fetchPromiseResult = useModelsStore.getState().fetchModels();

      expect(useModelsStore.getState().isLoading).toBe(true);

      resolvePromise!([]);

      await fetchPromiseResult;

      expect(useModelsStore.getState().isLoading).toBe(false);
    });

    it('prevents concurrent fetches', async () => {
      let resolvePromise: (value: unknown[]) => void;
      const fetchPromise = new Promise<unknown[]>((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(fetchAllModels).mockReturnValue(fetchPromise as Promise<never>);

      // Start first fetch
      const firstFetch = useModelsStore.getState().fetchModels();

      // Try second fetch while first is in progress
      const secondFetch = useModelsStore.getState().fetchModels();

      // Should only have one fetch call
      expect(fetchAllModels).toHaveBeenCalledTimes(1);

      resolvePromise!([]);

      await Promise.all([firstFetch, secondFetch]);
    });

    it('uses cache if not expired', async () => {
      vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));

      // First fetch
      vi.mocked(fetchAllModels).mockResolvedValueOnce([
        { id: 'test', name: 'Test', provider: 'ollama', score: 50, contextWindow: 8192, maxOutput: 4096, costPer1kInput: 0, costPer1kOutput: 0, available: true },
      ]);

      await useModelsStore.getState().fetchModels();

      // Advance time but stay within cache TTL (5 minutes)
      vi.setSystemTime(new Date('2024-01-01T12:04:00Z'));

      // Second fetch should use cache
      await useModelsStore.getState().fetchModels();

      expect(fetchAllModels).toHaveBeenCalledTimes(1);
    });

    it('refetches after cache expires', async () => {
      vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));

      // First fetch
      vi.mocked(fetchAllModels).mockResolvedValueOnce([
        { id: 'test', name: 'Test', provider: 'ollama', score: 50, contextWindow: 8192, maxOutput: 4096, costPer1kInput: 0, costPer1kOutput: 0, available: true },
      ]);

      await useModelsStore.getState().fetchModels();

      // Advance time past cache TTL (5 minutes)
      vi.setSystemTime(new Date('2024-01-01T12:06:00Z'));

      // Second fetch should make new request
      vi.mocked(fetchAllModels).mockResolvedValueOnce([
        { id: 'test2', name: 'Test 2', provider: 'ollama', score: 50, contextWindow: 8192, maxOutput: 4096, costPer1kInput: 0, costPer1kOutput: 0, available: true },
      ]);

      await useModelsStore.getState().fetchModels();

      expect(fetchAllModels).toHaveBeenCalledTimes(2);
    });

    it('handles fetch error from API fallback', async () => {
      vi.mocked(fetchAllModels).mockResolvedValueOnce([]);
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await useModelsStore.getState().fetchModels();

      const state = useModelsStore.getState();
      expect(state.models).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.isInitialized).toBe(true);
      expect(state.error).toContain('500');
    });

    it('handles network error', async () => {
      vi.mocked(fetchAllModels).mockRejectedValueOnce(new Error('Network error'));

      await useModelsStore.getState().fetchModels();

      const state = useModelsStore.getState();
      expect(state.error).toBe('Network error');
      expect(state.isInitialized).toBe(true);
    });
  });

  describe('refreshModels', () => {
    it('clears cache and refetches', async () => {
      // Initial fetch
      vi.mocked(fetchAllModels).mockResolvedValueOnce([
        { id: 'old', name: 'Old', provider: 'ollama', score: 50, contextWindow: 8192, maxOutput: 4096, costPer1kInput: 0, costPer1kOutput: 0, available: true },
      ]);

      await useModelsStore.getState().fetchModels();

      // Refresh should bypass cache
      vi.mocked(fetchAllModels).mockResolvedValueOnce([
        { id: 'new', name: 'New', provider: 'ollama', score: 50, contextWindow: 8192, maxOutput: 4096, costPer1kInput: 0, costPer1kOutput: 0, available: true },
      ]);

      await useModelsStore.getState().refreshModels();

      expect(fetchAllModels).toHaveBeenCalledTimes(2);
      expect(useModelsStore.getState().models[0].id).toBe('new');
    });
  });

  describe('getModelsByProvider', () => {
    it('filters models by provider', async () => {
      useModelsStore.setState({
        models: [
          { id: 'claude-3', label: 'Claude 3', provider: 'anthropic' },
          { id: 'gpt-4', label: 'GPT-4', provider: 'openai' },
          { id: 'claude-2', label: 'Claude 2', provider: 'anthropic' },
        ],
        isInitialized: true,
      });

      const anthropicModels = useModelsStore.getState().getModelsByProvider('anthropic');

      expect(anthropicModels).toHaveLength(2);
      expect(anthropicModels.every((m) => m.provider === 'anthropic')).toBe(true);
    });

    it('returns empty array for unknown provider', () => {
      useModelsStore.setState({
        models: [{ id: 'test', label: 'Test', provider: 'test' }],
        isInitialized: true,
      });

      const models = useModelsStore.getState().getModelsByProvider('unknown');
      expect(models).toEqual([]);
    });
  });

  describe('getBestModel', () => {
    it('returns the highest scored model', () => {
      useModelsStore.setState({
        models: [
          { id: 'claude-3', label: 'Claude 3', provider: 'anthropic', score: 95 },
          { id: 'gpt-4', label: 'GPT-4', provider: 'openai', score: 88 },
          { id: 'llama', label: 'Llama', provider: 'ollama', score: 50 },
        ],
        isInitialized: true,
      });

      const best = useModelsStore.getState().getBestModel();

      expect(best).not.toBeNull();
      expect(best!.id).toBe('claude-3');
      expect(best!.score).toBe(95);
    });

    it('returns null when no models', () => {
      useModelsStore.setState({ models: [], isInitialized: true });

      const best = useModelsStore.getState().getBestModel();
      expect(best).toBeNull();
    });
  });

  describe('reset', () => {
    it('resets store to initial state', async () => {
      // Set some state
      useModelsStore.setState({
        models: [{ id: 'test', label: 'Test', provider: 'test' }],
        isLoading: false,
        isInitialized: true,
        error: 'Some error',
        lastFetched: Date.now(),
      });

      useModelsStore.getState().reset();

      const state = useModelsStore.getState();
      expect(state.models).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.isInitialized).toBe(false);
      expect(state.error).toBeNull();
      expect(state.lastFetched).toBeNull();
    });
  });

  describe('utility functions', () => {
    describe('hasProviderModels', () => {
      it('returns true if provider has models', () => {
        useModelsStore.setState({
          models: [{ id: 'test', label: 'Test', provider: 'anthropic' }],
        });

        expect(hasProviderModels('anthropic')).toBe(true);
      });

      it('returns false if provider has no models', () => {
        useModelsStore.setState({
          models: [{ id: 'test', label: 'Test', provider: 'anthropic' }],
        });

        expect(hasProviderModels('openai')).toBe(false);
      });
    });

    describe('getAvailableProviders', () => {
      it('returns unique providers', () => {
        useModelsStore.setState({
          models: [
            { id: 'claude-3', label: 'Claude 3', provider: 'anthropic' },
            { id: 'gpt-4', label: 'GPT-4', provider: 'openai' },
            { id: 'claude-2', label: 'Claude 2', provider: 'anthropic' },
          ],
        });

        const providers = getAvailableProviders();

        expect(providers).toHaveLength(2);
        expect(providers).toContain('anthropic');
        expect(providers).toContain('openai');
      });

      it('returns empty array when no models', () => {
        useModelsStore.setState({ models: [] });

        expect(getAvailableProviders()).toEqual([]);
      });
    });
  });
});
