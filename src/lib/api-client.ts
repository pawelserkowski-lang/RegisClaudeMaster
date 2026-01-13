import type { SearchResult } from './types';

export interface ApiResponse {
  success: boolean;
  response: string;
  sources: SearchResult[];
  model_used: string;
  grounding_performed: boolean;
}

export interface ApiError {
  error: string;
}

const API_ENDPOINT = '/api/execute';
const MAX_RETRIES = 3;

const retryableStatuses = new Set([429, 504]);

async function refreshSession(): Promise<boolean> {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  return response.ok;
}

async function requestWithRetry(input: RequestInfo, init: RequestInit): Promise<Response> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < MAX_RETRIES) {
    try {
      const response = await fetch(input, init);
      if (response.ok || !retryableStatuses.has(response.status)) {
        return response;
      }
      lastError = new Error(`Retryable status: ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
    }

    attempt += 1;
    const delay = Math.min(1000 * 2 ** attempt, 3000) + Math.random() * 200;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw lastError ?? new Error('Unknown retry error');
}

/**
 * Execute a prompt against the Edge backend
 */
export async function executePrompt(prompt: string, model?: string, signal?: AbortSignal): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout

  try {
    const mergedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const response = await requestWithRetry(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, model, stream: true }),
      signal: mergedSignal,
      credentials: 'include',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Handle specific status codes
      if (response.status === 401) {
        const refreshed = await refreshSession();
        if (refreshed) {
          return executePrompt(prompt, model, signal);
        }
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
        throw new Error('AUTH_ERROR');
      }
      if (response.status === 504) {
        throw new Error('TIMEOUT');
      }
      if (response.status === 429) {
        throw new Error('RATE_LIMIT');
      }

      const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data: ApiResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('TIMEOUT');
      }
      throw error;
    }
    throw new Error('UNKNOWN');
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Health check for the API
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch('/api/health', {
      method: 'GET',
      credentials: 'include',
    });
    return response.ok;
  } catch {
    return false;
  }
}
