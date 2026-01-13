export interface HealthModelStatus {
  model: string;
  status: 'ok' | 'degraded' | 'down';
  tokens: number;
  cost: number;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
  providers: HealthModelStatus[];
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health', { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Failed to load health');
  }
  return (await response.json()) as HealthResponse;
}
