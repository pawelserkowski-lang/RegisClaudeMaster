/**
 * Multi-Provider AI Client
 * Supports: OpenAI, Anthropic Claude, Google Gemini, Ollama
 * Features: Auto model listing, best model selection, fallback chain
 *
 * Sources:
 * - OpenAI: https://platform.openai.com/docs/api-reference/models/list
 * - Anthropic: https://docs.anthropic.com/en/api/models-list
 * - Gemini: https://ai.google.dev/api/models
 */

export interface AIModel {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'gemini' | 'ollama';
  contextWindow: number;
  maxOutput: number;
  costPer1kInput: number;  // USD
  costPer1kOutput: number; // USD
  score: number;           // Quality score 1-100
  available: boolean;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface AIProviderSettings {
  openai?: ProviderConfig;
  anthropic?: ProviderConfig;
  gemini?: ProviderConfig;
  ollama?: ProviderConfig;
}

// Model quality rankings (higher = better)
const MODEL_RANKINGS: Record<string, number> = {
  // OpenAI
  'gpt-4o': 95,
  'gpt-4-turbo': 90,
  'gpt-4': 88,
  'gpt-3.5-turbo': 70,

  // Anthropic Claude
  'claude-opus-4-20250514': 98,
  'claude-sonnet-4-20250514': 92,
  'claude-3-5-sonnet-20241022': 91,
  'claude-3-5-haiku-20241022': 80,
  'claude-3-opus-20240229': 90,
  'claude-3-sonnet-20240229': 85,
  'claude-3-haiku-20240307': 75,

  // Google Gemini
  'gemini-2.0-flash': 88,
  'gemini-1.5-pro': 92,
  'gemini-1.5-flash': 85,
  'gemini-1.0-pro': 78,

  // Ollama (local)
  'llama3.2:70b': 85,
  'llama3.2:8b': 75,
  'llama3.2:3b': 65,
  'llama3.2:1b': 55,
  'qwen2.5-coder:7b': 80,
  'qwen2.5-coder:1.5b': 60,
  'phi3:mini': 58,
};

// Cost per 1K tokens (USD) - input/output
const MODEL_COSTS: Record<string, [number, number]> = {
  // OpenAI
  'gpt-4o': [0.005, 0.015],
  'gpt-4-turbo': [0.01, 0.03],
  'gpt-4': [0.03, 0.06],
  'gpt-3.5-turbo': [0.0005, 0.0015],

  // Anthropic Claude
  'claude-opus-4-20250514': [0.015, 0.075],
  'claude-sonnet-4-20250514': [0.003, 0.015],
  'claude-3-5-sonnet-20241022': [0.003, 0.015],
  'claude-3-5-haiku-20241022': [0.0008, 0.004],
  'claude-3-opus-20240229': [0.015, 0.075],
  'claude-3-sonnet-20240229': [0.003, 0.015],
  'claude-3-haiku-20240307': [0.00025, 0.00125],

  // Google Gemini
  'gemini-2.0-flash': [0.0001, 0.0004],
  'gemini-1.5-pro': [0.00125, 0.005],
  'gemini-1.5-flash': [0.000075, 0.0003],

  // Ollama (local = free)
  'llama3.2:70b': [0, 0],
  'llama3.2:8b': [0, 0],
  'llama3.2:3b': [0, 0],
  'llama3.2:1b': [0, 0],
};

/**
 * Fetch available models from OpenAI
 */
async function fetchOpenAIModels(apiKey: string): Promise<AIModel[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!response.ok) return [];

    const data = await response.json();
    const chatModels = data.data?.filter((m: { id: string }) =>
      m.id.includes('gpt-4') || m.id.includes('gpt-3.5')
    ) || [];

    return chatModels.map((m: { id: string }) => ({
      id: m.id,
      name: m.id,
      provider: 'openai' as const,
      contextWindow: m.id.includes('gpt-4') ? 128000 : 16385,
      maxOutput: 4096,
      costPer1kInput: MODEL_COSTS[m.id]?.[0] ?? 0.01,
      costPer1kOutput: MODEL_COSTS[m.id]?.[1] ?? 0.03,
      score: MODEL_RANKINGS[m.id] ?? 70,
      available: true,
    }));
  } catch {
    console.warn('[ai-providers] OpenAI fetch failed');
    return [];
  }
}

/**
 * Fetch available models from Anthropic Claude
 */
async function fetchAnthropicModels(apiKey: string): Promise<AIModel[]> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    });

    if (!response.ok) return [];

    const data = await response.json();

    return (data.data || []).map((m: { id: string; display_name?: string }) => ({
      id: m.id,
      name: m.display_name || m.id,
      provider: 'anthropic' as const,
      contextWindow: m.id.includes('opus') ? 200000 : 200000,
      maxOutput: 8192,
      costPer1kInput: MODEL_COSTS[m.id]?.[0] ?? 0.003,
      costPer1kOutput: MODEL_COSTS[m.id]?.[1] ?? 0.015,
      score: MODEL_RANKINGS[m.id] ?? 85,
      available: true,
    }));
  } catch {
    console.warn('[ai-providers] Anthropic fetch failed');
    return [];
  }
}

/**
 * Fetch available models from Google Gemini
 */
async function fetchGeminiModels(apiKey: string): Promise<AIModel[]> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!response.ok) return [];

    const data = await response.json();
    const chatModels = data.models?.filter((m: { supportedGenerationMethods?: string[] }) =>
      m.supportedGenerationMethods?.includes('generateContent')
    ) || [];

    return chatModels.map((m: { name: string; displayName?: string; inputTokenLimit?: number; outputTokenLimit?: number }) => {
      const id = m.name.replace('models/', '');
      return {
        id,
        name: m.displayName || id,
        provider: 'gemini' as const,
        contextWindow: m.inputTokenLimit || 32000,
        maxOutput: m.outputTokenLimit || 8192,
        costPer1kInput: MODEL_COSTS[id]?.[0] ?? 0.0001,
        costPer1kOutput: MODEL_COSTS[id]?.[1] ?? 0.0004,
        score: MODEL_RANKINGS[id] ?? 80,
        available: true,
      };
    });
  } catch {
    console.warn('[ai-providers] Gemini fetch failed');
    return [];
  }
}

/**
 * Fetch available models from Ollama (local)
 */
async function fetchOllamaModels(baseUrl = 'http://127.0.0.1:11434'): Promise<AIModel[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`);

    if (!response.ok) return [];

    const data = await response.json();

    return (data.models || []).map((m: { name: string; details?: { parameter_size?: string } }) => ({
      id: m.name,
      name: m.name,
      provider: 'ollama' as const,
      contextWindow: 8192,
      maxOutput: 4096,
      costPer1kInput: 0,
      costPer1kOutput: 0,
      score: MODEL_RANKINGS[m.name] ?? 50,
      available: true,
    }));
  } catch {
    console.warn('[ai-providers] Ollama fetch failed');
    return [];
  }
}

/**
 * Fetch all available models from configured providers
 */
export async function fetchAllModels(settings: AIProviderSettings): Promise<AIModel[]> {
  const promises: Promise<AIModel[]>[] = [];

  if (settings.openai?.enabled && settings.openai.apiKey) {
    promises.push(fetchOpenAIModels(settings.openai.apiKey));
  }

  if (settings.anthropic?.enabled && settings.anthropic.apiKey) {
    promises.push(fetchAnthropicModels(settings.anthropic.apiKey));
  }

  if (settings.gemini?.enabled && settings.gemini.apiKey) {
    promises.push(fetchGeminiModels(settings.gemini.apiKey));
  }

  if (settings.ollama?.enabled) {
    promises.push(fetchOllamaModels(settings.ollama.baseUrl));
  }

  const results = await Promise.all(promises);
  const allModels = results.flat();

  // Sort by score (best first)
  return allModels.sort((a, b) => b.score - a.score);
}

/**
 * Get the best available model
 */
export function getBestModel(models: AIModel[]): AIModel | null {
  const available = models.filter(m => m.available);
  if (available.length === 0) return null;
  return available[0]; // Already sorted by score
}

/**
 * Get fallback chain (sorted by quality)
 */
export function getFallbackChain(models: AIModel[]): AIModel[] {
  return models.filter(m => m.available).sort((a, b) => b.score - a.score);
}

/**
 * Execute prompt with auto-fallback
 */
export async function executeWithFallback(
  prompt: string,
  models: AIModel[],
  settings: AIProviderSettings,
  onModelChange?: (model: AIModel) => void
): Promise<{ response: string; model: AIModel }> {
  const chain = getFallbackChain(models);

  if (chain.length === 0) {
    throw new Error('No AI models available');
  }

  let lastError: Error | null = null;

  for (const model of chain) {
    try {
      onModelChange?.(model);
      console.log(`[ai-providers] Trying ${model.provider}/${model.id}`);

      const response = await executePromptForProvider(prompt, model, settings);

      return { response, model };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`[ai-providers] ${model.provider}/${model.id} failed:`, lastError.message);
      continue; // Try next model
    }
  }

  throw lastError ?? new Error('All models failed');
}

/**
 * Execute prompt for a specific provider
 */
async function executePromptForProvider(
  prompt: string,
  model: AIModel,
  settings: AIProviderSettings
): Promise<string> {
  switch (model.provider) {
    case 'openai':
      return executeOpenAI(prompt, model.id, settings.openai!.apiKey!);
    case 'anthropic':
      return executeAnthropic(prompt, model.id, settings.anthropic!.apiKey!);
    case 'gemini':
      return executeGemini(prompt, model.id, settings.gemini!.apiKey!);
    case 'ollama':
      return executeOllama(prompt, model.id, settings.ollama?.baseUrl);
    default:
      throw new Error(`Unknown provider: ${model.provider}`);
  }
}

async function executeOpenAI(prompt: string, model: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function executeAnthropic(prompt: string, model: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic error: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function executeGemini(prompt: string, model: string, apiKey: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

async function executeOllama(prompt: string, model: string, baseUrl = 'http://127.0.0.1:11434'): Promise<string> {
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();
  return data.response;
}

/**
 * Log for debugging
 */
export function logProviders(action: string): void {
  if (import.meta.env?.DEV) {
    console.info(`[ai-providers] ${action}`);
  }
}
