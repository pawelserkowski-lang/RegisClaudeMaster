/* eslint-disable no-constant-condition */
// Note: while(true) loops are standard pattern for streaming readers

import {
  executeWithCircuitBreaker,
  getCircuitBreaker,
  CircuitState,
  CircuitBreakerOpenError,
} from '../middleware/circuit-breaker';
import {
  updateProviderHealth,
  startRequestTimer,
  isProviderAvailable,
  getProviderHealth,
  ProviderHealth,
} from './provider-health';
import { log } from '../utils/logger';

interface ProviderCallInput {
  prompt: string;
  context: string;
  model: string;
}

export interface StreamingProviderCallInput {
  prompt: string;
  context: string;
  model: string;
  onChunk: (chunk: string) => void;
}

export interface ProviderCallResult {
  response: string;
  latency: number;
}

export interface ProviderDefinition {
  id: string;
  label: string;
  provider: string;
  costPer1kTokens: number;
  isConfigured: () => boolean;
  call: (input: ProviderCallInput) => Promise<string>;
  /** Call with circuit breaker protection and health tracking */
  safeCall: (input: ProviderCallInput) => Promise<ProviderCallResult>;
  /** Check if provider is available (circuit not open) */
  isAvailable: () => boolean;
  /** Get current circuit state */
  getCircuitState: () => CircuitState;
  /** Get health information */
  getHealth: () => ProviderHealth;
}

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]);
}

function getModelsFromEnv(envKey: string, fallback: string[]): string[] {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export const providerModels = {
  anthropic: () => getModelsFromEnv('ANTHROPIC_MODELS', ['claude-3-5-sonnet-20240620']),
  openai: () => getModelsFromEnv('OPENAI_MODELS', ['gpt-4o-mini']),
  google: () => getModelsFromEnv('GOOGLE_MODELS', ['gemini-2.0-flash']),
  mistral: () => getModelsFromEnv('MISTRAL_MODELS', ['mistral-small-latest']),
  groq: () => getModelsFromEnv('GROQ_MODELS', ['llama-3.1-70b-versatile']),
  ollama: () => getModelsFromEnv('OLLAMA_MODELS', ['qwen2.5-coder:7b']),
};

/**
 * Create a safe call wrapper with circuit breaker and health tracking
 */
function createSafeCall(
  providerId: string,
  call: ProviderDefinition['call']
): ProviderDefinition['safeCall'] {
  return async (input: ProviderCallInput): Promise<ProviderCallResult> => {
    const timer = startRequestTimer();

    try {
      const response = await executeWithCircuitBreaker(providerId, async () => {
        return call(input);
      });

      const latency = timer();
      updateProviderHealth(providerId, true, latency);

      log('debug', `Provider ${providerId} call succeeded`, { latency });

      return { response, latency };
    } catch (error) {
      const latency = timer();

      // Don't update health metrics for circuit breaker errors
      // (circuit is already tracking this)
      if (!(error instanceof CircuitBreakerOpenError)) {
        updateProviderHealth(providerId, false, latency);
      }

      log('warn', `Provider ${providerId} call failed`, {
        latency,
        error: error instanceof Error ? error.message : 'Unknown error',
        circuitOpen: error instanceof CircuitBreakerOpenError,
      });

      throw error;
    }
  };
}

function buildProviderModels(
  provider: ProviderDefinition['provider'],
  models: string[],
  labelPrefix: string,
  costPer1kTokens: number,
  isConfigured: () => boolean,
  call: ProviderDefinition['call']
): ProviderDefinition[] {
  return models.map((model) => {
    const providerId = `${provider}:${model}`;

    return {
      id: model,
      label: `${labelPrefix} (${model})`,
      provider,
      costPer1kTokens,
      isConfigured,
      call,
      safeCall: createSafeCall(providerId, call),
      isAvailable: () => isProviderAvailable(providerId),
      getCircuitState: () => getCircuitBreaker(providerId).getState(),
      getHealth: () => getProviderHealth(providerId),
    };
  });
}

export function listAvailableModels(): ProviderDefinition[] {
  return [
    ...buildProviderModels(
      'anthropic',
      providerModels.anthropic(),
      'Claude',
      0.003,
      () => hasEnv('ANTHROPIC_API_KEY'),
      callAnthropic
    ),
    ...buildProviderModels(
      'openai',
      providerModels.openai(),
      'OpenAI',
      0.00015,
      () => hasEnv('OPENAI_API_KEY'),
      callOpenAI
    ),
    ...buildProviderModels(
      'google',
      providerModels.google(),
      'Gemini',
      0.0001,
      () => hasEnv('GOOGLE_API_KEY'),
      callGoogle
    ),
    ...buildProviderModels(
      'mistral',
      providerModels.mistral(),
      'Mistral',
      0.0002,
      () => hasEnv('MISTRAL_API_KEY'),
      callMistral
    ),
    ...buildProviderModels(
      'groq',
      providerModels.groq(),
      'Groq',
      0.0002,
      () => hasEnv('GROQ_API_KEY'),
      callGroq
    ),
    ...buildProviderModels(
      'ollama',
      providerModels.ollama(),
      'Ollama',
      0,
      () => hasEnv('CLOUDFLARE_TUNNEL_URL'),
      callOllama
    ),
  ];
}

async function callAnthropic({ prompt, context, model }: ProviderCallInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: context ? `Context:\n${context}\n\nUser:\n${prompt}` : prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data?.content?.[0]?.text || 'No response generated';
}

async function callOpenAI({ prompt, context, model }: ProviderCallInput): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: context ? `Context:\n${context}\n\nUser:\n${prompt}` : prompt,
        },
      ],
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || 'No response generated';
}

async function callGoogle({ prompt, context, model }: ProviderCallInput): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not configured');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: context
                  ? `Context from web search:\n${context}\n\nUser request:\n${prompt}`
                  : prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
      signal: AbortSignal.timeout(60000),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
}

async function callMistral({ prompt, context, model }: ProviderCallInput): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY not configured');
  }

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: context ? `Context:\n${context}\n\nUser:\n${prompt}` : prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || 'No response generated';
}

async function callGroq({ prompt, context, model }: ProviderCallInput): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: context ? `Context:\n${context}\n\nUser:\n${prompt}` : prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || 'No response generated';
}

async function callOllama({ prompt, context, model }: ProviderCallInput): Promise<string> {
  const tunnelUrl = process.env.CLOUDFLARE_TUNNEL_URL;
  if (!tunnelUrl) {
    throw new Error('CLOUDFLARE_TUNNEL_URL not configured');
  }

  const response = await fetch(`${tunnelUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: context ? `Context:\n${context}\n\nTask:\n${prompt}` : prompt,
      stream: false,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();
  return data.response || '';
}

// ============================================================================
// STREAMING PROVIDER FUNCTIONS
// ============================================================================

interface AnthropicStreamEvent {
  type: string;
  delta?: {
    type: string;
    text?: string;
  };
}

interface OpenAIStreamChoice {
  delta?: {
    content?: string;
  };
}

interface OpenAIStreamChunk {
  choices?: OpenAIStreamChoice[];
}

interface GoogleStreamCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
  };
}

interface GoogleStreamChunk {
  candidates?: GoogleStreamCandidate[];
}

interface OllamaStreamChunk {
  response?: string;
  done?: boolean;
}

async function callAnthropicStreaming({ prompt, context, model, onChunk }: StreamingProviderCallInput): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      stream: true,
      messages: [
        {
          role: 'user',
          content: context ? `Context:\n${context}\n\nUser:\n${prompt}` : prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const event = JSON.parse(data) as AnthropicStreamEvent;
          if (event.type === 'content_block_delta' && event.delta?.text) {
            onChunk(event.delta.text);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

async function callOpenAIStreaming({ prompt, context, model, onChunk }: StreamingProviderCallInput): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        {
          role: 'user',
          content: context ? `Context:\n${context}\n\nUser:\n${prompt}` : prompt,
        },
      ],
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data) as OpenAIStreamChunk;
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

async function callGoogleStreaming({ prompt, context, model, onChunk }: StreamingProviderCallInput): Promise<void> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not configured');
  }

  // Google uses streamGenerateContent endpoint for streaming
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: context
                  ? `Context from web search:\n${context}\n\nUser request:\n${prompt}`
                  : prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
      signal: AbortSignal.timeout(60000),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API error: ${response.status} - ${error}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (!data) continue;
        try {
          const chunk = JSON.parse(data) as GoogleStreamChunk;
          const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            onChunk(text);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

async function callMistralStreaming({ prompt, context, model, onChunk }: StreamingProviderCallInput): Promise<void> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY not configured');
  }

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        {
          role: 'user',
          content: context ? `Context:\n${context}\n\nUser:\n${prompt}` : prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral API error: ${response.status} - ${error}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data) as OpenAIStreamChunk;
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

async function callGroqStreaming({ prompt, context, model, onChunk }: StreamingProviderCallInput): Promise<void> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        {
          role: 'user',
          content: context ? `Context:\n${context}\n\nUser:\n${prompt}` : prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data) as OpenAIStreamChunk;
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

async function callOllamaStreaming({ prompt, context, model, onChunk }: StreamingProviderCallInput): Promise<void> {
  const tunnelUrl = process.env.CLOUDFLARE_TUNNEL_URL;
  if (!tunnelUrl) {
    throw new Error('CLOUDFLARE_TUNNEL_URL not configured');
  }

  const response = await fetch(`${tunnelUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: context ? `Context:\n${context}\n\nTask:\n${prompt}` : prompt,
      stream: true,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line) as OllamaStreamChunk;
        if (chunk.response) {
          onChunk(chunk.response);
        }
      } catch {
        // Skip invalid JSON
      }
    }
  }
}

// Simulated streaming for providers that don't support native streaming
// Chunks the response into smaller pieces for progressive display
// Kept for future use with providers that might not support streaming
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _simulateStreaming(
  input: ProviderCallInput,
  callFn: (input: ProviderCallInput) => Promise<string>,
  onChunk: (chunk: string) => void,
  chunkSize = 30
): Promise<void> {
  const response = await callFn(input);

  // Send response in chunks for progressive display
  for (let i = 0; i < response.length; i += chunkSize) {
    const chunk = response.slice(i, i + chunkSize);
    onChunk(chunk);
    // Small delay to simulate streaming effect
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// Main streaming dispatcher
export async function callProviderStreaming(
  provider: string,
  input: StreamingProviderCallInput
): Promise<void> {
  switch (provider) {
    case 'anthropic':
      return callAnthropicStreaming(input);
    case 'openai':
      return callOpenAIStreaming(input);
    case 'google':
      return callGoogleStreaming(input);
    case 'mistral':
      return callMistralStreaming(input);
    case 'groq':
      return callGroqStreaming(input);
    case 'ollama':
      return callOllamaStreaming(input);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ============================================================================
// ADAPTIVE FALLBACK & HEALTH-BASED PROVIDER SELECTION
// ============================================================================

/**
 * Get available models sorted by health score (best first)
 * Skips providers with OPEN circuits, prioritizes CLOSED over HALF_OPEN
 */
export function getAvailableModelsSortedByHealth(): ProviderDefinition[] {
  const models = listAvailableModels();

  return models
    .filter((model) => model.isConfigured())
    .map((model) => ({
      model,
      health: model.getHealth(),
    }))
    .filter(({ health }) => health.circuitState !== CircuitState.OPEN)
    .sort((a, b) => {
      // First, prioritize CLOSED over HALF_OPEN
      if (
        a.health.circuitState === CircuitState.CLOSED &&
        b.health.circuitState === CircuitState.HALF_OPEN
      ) {
        return -1;
      }
      if (
        a.health.circuitState === CircuitState.HALF_OPEN &&
        b.health.circuitState === CircuitState.CLOSED
      ) {
        return 1;
      }
      // Then sort by health score
      return b.health.healthScore - a.health.healthScore;
    })
    .map(({ model }) => model);
}

/**
 * Get the best available provider for a given fallback order
 * Returns providers sorted by health within each provider type
 */
export function getProvidersWithFallback(
  fallbackOrder: string[] = ['anthropic', 'openai', 'google', 'mistral', 'groq', 'ollama']
): ProviderDefinition[] {
  const allModels = listAvailableModels();
  const result: ProviderDefinition[] = [];

  for (const providerType of fallbackOrder) {
    const providerModels = allModels
      .filter((m) => m.provider === providerType && m.isConfigured())
      .filter((m) => m.getCircuitState() !== CircuitState.OPEN)
      .sort((a, b) => b.getHealth().healthScore - a.getHealth().healthScore);

    result.push(...providerModels);
  }

  return result;
}

/**
 * Execute a call with automatic fallback to healthy providers
 */
export async function executeWithHealthyFallback(
  input: ProviderCallInput,
  preferredModel?: string,
  fallbackOrder?: string[]
): Promise<{ response: string; modelUsed: string; latency: number }> {
  const providers = getProvidersWithFallback(fallbackOrder);

  // If a specific model is preferred, try it first (if available)
  if (preferredModel) {
    const preferred = providers.find((p) => p.id === preferredModel);
    if (preferred && preferred.isAvailable()) {
      try {
        const result = await preferred.safeCall(input);
        return {
          response: result.response,
          modelUsed: preferred.id,
          latency: result.latency,
        };
      } catch (error) {
        log('warn', `Preferred model ${preferredModel} failed, trying fallbacks`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  // Try providers in health-sorted order
  for (const provider of providers) {
    if (preferredModel && provider.id === preferredModel) {
      // Already tried this one
      continue;
    }

    if (!provider.isAvailable()) {
      log('debug', `Skipping unavailable provider ${provider.id}`);
      continue;
    }

    try {
      const result = await provider.safeCall(input);
      return {
        response: result.response,
        modelUsed: provider.id,
        latency: result.latency,
      };
    } catch (error) {
      log('warn', `Provider ${provider.id} failed, trying next`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  throw new Error('All providers failed or are unavailable');
}

// Re-export circuit breaker types for convenience
export { CircuitState, CircuitBreakerOpenError } from '../middleware/circuit-breaker';
export type { ProviderHealth } from './provider-health';
