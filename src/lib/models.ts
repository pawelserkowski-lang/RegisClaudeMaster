export interface ModelInfo {
  id: string;
  label: string;
  provider: string;
}

export async function fetchModels(): Promise<ModelInfo[]> {
  const response = await fetch('/api/models', { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Failed to load models');
  }
  const data = (await response.json()) as { models: ModelInfo[] };
  return data.models;
}
