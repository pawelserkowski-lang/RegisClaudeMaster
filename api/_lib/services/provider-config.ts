/**
 * Provider Configuration Management
 *
 * This module manages AI provider configurations including:
 * - Provider enable/disable state
 * - Priority ordering for fallback
 * - Cost tracking
 * - A/B testing group assignment
 * - Rate limiting configuration
 */

export interface ProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  priority: number; // Lower is higher priority
  models: string[];
  costPer1kTokens: number;
  maxTokens: number;
  supportsStreaming: boolean;
  abTestGroup?: 'A' | 'B' | 'control';
  customSystemPrompt?: string;
  rateLimitPerMinute: number;
}

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    enabled: true,
    priority: 1,
    models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
    costPer1kTokens: 0.015,
    maxTokens: 200000,
    supportsStreaming: true,
    rateLimitPerMinute: 60,
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    enabled: true,
    priority: 2,
    models: ['gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    costPer1kTokens: 0.01,
    maxTokens: 128000,
    supportsStreaming: true,
    rateLimitPerMinute: 60,
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    enabled: true,
    priority: 3,
    models: ['gemini-pro', 'gemini-ultra'],
    costPer1kTokens: 0.0005,
    maxTokens: 32000,
    supportsStreaming: true,
    rateLimitPerMinute: 60,
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    enabled: true,
    priority: 4,
    models: ['mistral-large', 'mistral-medium', 'mistral-small'],
    costPer1kTokens: 0.004,
    maxTokens: 32000,
    supportsStreaming: true,
    rateLimitPerMinute: 60,
  },
  {
    id: 'groq',
    name: 'Groq',
    enabled: true,
    priority: 5,
    models: ['llama-3-70b', 'mixtral-8x7b'],
    costPer1kTokens: 0.0007,
    maxTokens: 32000,
    supportsStreaming: true,
    rateLimitPerMinute: 30,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    enabled: true,
    priority: 6,
    models: ['llama3.2', 'qwen2.5-coder', 'phi3'],
    costPer1kTokens: 0,
    maxTokens: 8000,
    supportsStreaming: true,
    rateLimitPerMinute: 999,
  },
];

// In-memory config store (in production, use database)
let providerConfigs = [...DEFAULT_PROVIDERS];

/**
 * Get all provider configurations sorted by priority
 */
export function getProviderConfigs(): ProviderConfig[] {
  return [...providerConfigs].sort((a, b) => a.priority - b.priority);
}

/**
 * Get only enabled provider configurations sorted by priority
 */
export function getEnabledProviders(): ProviderConfig[] {
  return getProviderConfigs().filter((p) => p.enabled);
}

/**
 * Get a single provider configuration by ID
 */
export function getProviderConfig(id: string): ProviderConfig | undefined {
  return providerConfigs.find((p) => p.id === id);
}

/**
 * Update a provider configuration
 */
export function updateProviderConfig(
  id: string,
  updates: Partial<ProviderConfig>
): ProviderConfig | null {
  const index = providerConfigs.findIndex((p) => p.id === id);
  if (index === -1) return null;

  // Prevent changing the ID
  const { id: _ignoredId, ...safeUpdates } = updates;
  void _ignoredId;

  providerConfigs[index] = { ...providerConfigs[index], ...safeUpdates };
  return providerConfigs[index];
}

/**
 * Set the priority of a provider and reorder all priorities accordingly
 */
export function setProviderPriority(id: string, newPriority: number): void {
  const configs = [...providerConfigs];
  const index = configs.findIndex((p) => p.id === id);
  if (index === -1) return;

  const [provider] = configs.splice(index, 1);
  provider.priority = newPriority;

  // Reorder all priorities
  configs.splice(newPriority - 1, 0, provider);
  providerConfigs = configs.map((p, i) => ({ ...p, priority: i + 1 }));
}

/**
 * Reset all configurations to defaults
 */
export function resetToDefaults(): void {
  providerConfigs = [...DEFAULT_PROVIDERS];
}

/**
 * Add a new provider configuration
 */
export function addProvider(config: ProviderConfig): ProviderConfig {
  // Check if provider already exists
  if (providerConfigs.some((p) => p.id === config.id)) {
    throw new Error(`Provider with ID '${config.id}' already exists`);
  }

  // Set priority to last if not specified
  if (!config.priority) {
    config.priority = providerConfigs.length + 1;
  }

  providerConfigs.push(config);
  return config;
}

/**
 * Remove a provider configuration
 */
export function removeProvider(id: string): boolean {
  const index = providerConfigs.findIndex((p) => p.id === id);
  if (index === -1) return false;

  providerConfigs.splice(index, 1);

  // Reorder priorities
  providerConfigs = providerConfigs.map((p, i) => ({ ...p, priority: i + 1 }));
  return true;
}

// A/B testing helpers

/**
 * Get provider assigned for A/B testing based on user ID
 * Uses simple hash-based assignment for consistent results
 */
export function getAbTestProvider(userId: string): ProviderConfig | undefined {
  const enabled = getEnabledProviders();
  const testProviders = enabled.filter((p) => p.abTestGroup);

  if (testProviders.length === 0) return undefined;

  // Simple hash-based assignment
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const group = hash % 2 === 0 ? 'A' : 'B';

  return testProviders.find((p) => p.abTestGroup === group);
}

/**
 * Set A/B test group for a provider
 */
export function setAbTestGroup(
  id: string,
  group: 'A' | 'B' | 'control' | undefined
): ProviderConfig | null {
  return updateProviderConfig(id, { abTestGroup: group });
}

// Cost estimation helpers

/**
 * Get estimated cost for a request to a specific provider
 */
export function getCostEstimate(provider: string, estimatedTokens: number): number {
  const config = providerConfigs.find((p) => p.id === provider);
  if (!config) return 0;
  return (estimatedTokens / 1000) * config.costPer1kTokens;
}

/**
 * Get total estimated cost across multiple providers
 */
export function getTotalCostEstimate(
  requests: Array<{ provider: string; tokens: number }>
): number {
  return requests.reduce((total, req) => {
    return total + getCostEstimate(req.provider, req.tokens);
  }, 0);
}

/**
 * Get the cheapest enabled provider
 */
export function getCheapestProvider(): ProviderConfig | undefined {
  const enabled = getEnabledProviders();
  if (enabled.length === 0) return undefined;

  return enabled.reduce((cheapest, current) => {
    return current.costPer1kTokens < cheapest.costPer1kTokens ? current : cheapest;
  });
}

/**
 * Get providers sorted by cost (cheapest first)
 */
export function getProvidersByCost(): ProviderConfig[] {
  return getEnabledProviders().sort((a, b) => a.costPer1kTokens - b.costPer1kTokens);
}

// Rate limiting helpers

/**
 * Check if a provider's rate limit allows a request
 * This is a simple check - actual rate limiting is handled by rate-limit.ts
 */
export function getProviderRateLimit(id: string): number {
  const config = providerConfigs.find((p) => p.id === id);
  return config?.rateLimitPerMinute ?? 60;
}

/**
 * Update rate limit for a provider
 */
export function setProviderRateLimit(id: string, limit: number): ProviderConfig | null {
  return updateProviderConfig(id, { rateLimitPerMinute: limit });
}
