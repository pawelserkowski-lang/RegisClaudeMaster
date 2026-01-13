export interface ApiResponse {
  success: boolean;
  response: string;
  sources: SearchResult[];
  model_used: string;
  grounding_performed: boolean;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export interface ApiError {
  error: string;
}

const API_ENDPOINT = '/api/execute';
const API_KEY = import.meta.env.VITE_API_KEY || '';

/**
 * Execute a prompt against the Rust backend
 */
export async function executePrompt(prompt: string): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY && { 'x-api-key': API_KEY }),
      },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Handle specific status codes
      if (response.status === 401) {
        throw new Error('Authentication failed. Check your API key.');
      }
      if (response.status === 504) {
        throw new Error('Request timed out. The server is taking too long to respond.');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      }

      const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data: ApiResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timed out after 2 minutes. Please try a simpler query.');
      }
      throw error;
    }
    throw new Error('An unexpected error occurred');
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
      headers: {
        ...(API_KEY && { 'x-api-key': API_KEY }),
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
