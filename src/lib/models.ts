// Re-export from new store for backwards compatibility
export type { ModelInfo } from './models-store';
export { useModelsStore, useInitializeModels, hasProviderModels, getAvailableProviders } from './models-store';

/**
 * @deprecated Use useModelsStore().fetchModels() instead
 * Kept for backwards compatibility with useQuery
 */
export async function fetchModels(): Promise<import('./models-store').ModelInfo[]> {
  const response = await fetch('/api/models', { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Failed to load models');
  }
  const data = (await response.json()) as { models: import('./models-store').ModelInfo[] };
  return data.models;
}
