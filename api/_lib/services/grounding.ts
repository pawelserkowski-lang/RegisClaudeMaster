/**
 * Enhanced Grounding System
 * Provides web search capabilities with multiple providers, fallback support,
 * relevance scoring, and quality metrics.
 */

export interface GroundingSource {
  title: string;
  link: string;
  snippet?: string;
  relevanceScore?: number;
  domain?: string;
  timestamp?: string;
}

export interface GroundingResult {
  sources: GroundingSource[];
  groundingPerformed: boolean;
  searchQuery?: string;
  searchProvider?: string;
  fallbackUsed?: boolean;
  qualityScore?: number;
}

export interface GroundingConfig {
  enabled: boolean;
  minRelevanceScore: number;
  maxSources: number;
  preferredDomains: string[];
  blockedDomains: string[];
  fallbackEnabled: boolean;
}

const DEFAULT_CONFIG: GroundingConfig = {
  enabled: true,
  minRelevanceScore: 0.5,
  maxSources: 5,
  preferredDomains: ['docs.', 'developer.', 'github.com', 'stackoverflow.com'],
  blockedDomains: ['pinterest.com', 'facebook.com'],
  fallbackEnabled: true,
};

// Search providers with fallback chain
interface SearchProvider {
  name: string;
  endpoint: string;
  requiresApiKey: boolean;
  envKey?: string;
}

const SEARCH_PROVIDERS: SearchProvider[] = [
  {
    name: 'google',
    endpoint: 'https://www.googleapis.com/customsearch/v1',
    requiresApiKey: true,
    envKey: 'GOOGLE_API_KEY',
  },
  {
    name: 'brave',
    endpoint: 'https://api.search.brave.com/res/v1/web/search',
    requiresApiKey: true,
    envKey: 'BRAVE_API_KEY',
  },
  {
    name: 'serper',
    endpoint: 'https://google.serper.dev/search',
    requiresApiKey: true,
    envKey: 'SERPER_API_KEY',
  },
  {
    name: 'duckduckgo',
    endpoint: 'https://api.duckduckgo.com/',
    requiresApiKey: false,
  },
];

/**
 * Determines if a prompt should trigger web grounding based on keywords
 */
export function shouldGround(prompt: string): boolean {
  // Keywords that suggest grounding is needed
  const groundingKeywords = [
    'current',
    'latest',
    'recent',
    'today',
    'now',
    '2024',
    '2025',
    '2026',
    'news',
    'update',
    'price',
    'stock',
    'weather',
    'score',
    'who is',
    'what is',
    'where is',
    'when did',
    'how to',
  ];

  const lowerPrompt = prompt.toLowerCase();
  return groundingKeywords.some((kw) => lowerPrompt.includes(kw));
}

/**
 * Extracts and cleans the search query from a user prompt
 */
export function extractSearchQuery(prompt: string): string {
  // Clean up prompt for search
  let query = prompt
    .replace(/please|can you|could you|tell me|explain/gi, '')
    .replace(/[?!.,]/g, '')
    .trim();

  // Limit to reasonable length
  if (query.length > 100) {
    query = query.slice(0, 100);
  }

  return query;
}

/**
 * Main grounding function - performs web search with fallback providers
 */
export async function performGrounding(
  prompt: string,
  config: Partial<GroundingConfig> = {}
): Promise<GroundingResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    return { sources: [], groundingPerformed: false };
  }

  const searchQuery = extractSearchQuery(prompt);
  let sources: GroundingSource[] = [];
  let usedProvider = '';
  let fallbackUsed = false;

  // Try search providers in order
  for (const provider of SEARCH_PROVIDERS) {
    try {
      sources = await searchWithProvider(provider, searchQuery, finalConfig);
      usedProvider = provider.name;
      if (sources.length > 0) {
        break;
      }
    } catch (error) {
      console.warn(`Search provider ${provider.name} failed:`, error);
      if (finalConfig.fallbackEnabled) {
        fallbackUsed = true;
        continue;
      }
      break;
    }
  }

  // Filter and score sources
  sources = filterAndScoreSources(sources, finalConfig);

  // Calculate quality score
  const qualityScore = calculateQualityScore(sources, finalConfig);

  return {
    sources: sources.slice(0, finalConfig.maxSources),
    groundingPerformed: true,
    searchQuery,
    searchProvider: usedProvider,
    fallbackUsed,
    qualityScore,
  };
}

/**
 * Performs search using a specific provider
 */
async function searchWithProvider(
  provider: SearchProvider,
  query: string,
  config: GroundingConfig
): Promise<GroundingSource[]> {
  const apiKey = provider.envKey ? process.env[provider.envKey] : undefined;

  if (provider.requiresApiKey && !apiKey) {
    throw new Error(`No API key for ${provider.name}`);
  }

  switch (provider.name) {
    case 'google':
      return await searchGoogle(query, apiKey!, config);
    case 'brave':
      return await searchBrave(query, apiKey!, config);
    case 'serper':
      return await searchSerper(query, apiKey!, config);
    case 'duckduckgo':
      return await searchDuckDuckGo(query, config);
    default:
      return [];
  }
}

/**
 * Google Custom Search implementation
 */
async function searchGoogle(
  query: string,
  apiKey: string,
  config: GroundingConfig
): Promise<GroundingSource[]> {
  const searchCx = process.env.GOOGLE_SEARCH_CX;

  if (!searchCx) {
    throw new Error('GOOGLE_SEARCH_CX not configured');
  }

  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchCx}&q=${encodeURIComponent(query)}&num=${config.maxSources}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Google Search failed: ${response.status}`);
  }

  const data = await response.json();

  return (data.items || []).map(
    (item: { title: string; link: string; snippet?: string }) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet || '',
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * Brave Search implementation
 */
async function searchBrave(
  query: string,
  apiKey: string,
  config: GroundingConfig
): Promise<GroundingSource[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${config.maxSources}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Brave Search failed: ${response.status}`);
  }

  const data = await response.json();

  return (data.web?.results || []).map(
    (item: { title: string; url: string; description?: string }) => ({
      title: item.title,
      link: item.url,
      snippet: item.description || '',
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * Serper (Google) Search implementation
 */
async function searchSerper(
  query: string,
  apiKey: string,
  config: GroundingConfig
): Promise<GroundingSource[]> {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({
      q: query,
      num: config.maxSources,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Serper Search failed: ${response.status}`);
  }

  const data = await response.json();

  return (data.organic || []).map(
    (item: { title: string; link: string; snippet?: string }) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet || '',
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * DuckDuckGo Instant Answer API (limited, free fallback)
 */
async function searchDuckDuckGo(
  query: string,
  _config: GroundingConfig
): Promise<GroundingSource[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo Search failed: ${response.status}`);
  }

  const data = await response.json();
  const results: GroundingSource[] = [];

  // DuckDuckGo returns different result types
  if (data.AbstractURL && data.AbstractText) {
    results.push({
      title: data.Heading || 'DuckDuckGo Result',
      link: data.AbstractURL,
      snippet: data.AbstractText,
      timestamp: new Date().toISOString(),
    });
  }

  // Related topics
  if (data.RelatedTopics) {
    for (const topic of data.RelatedTopics.slice(0, 4)) {
      if (topic.FirstURL && topic.Text) {
        results.push({
          title: topic.Text.slice(0, 100),
          link: topic.FirstURL,
          snippet: topic.Text,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return results;
}

/**
 * Filters sources and calculates relevance scores
 */
function filterAndScoreSources(
  sources: GroundingSource[],
  config: GroundingConfig
): GroundingSource[] {
  return sources
    .filter((source) => {
      // Filter blocked domains
      try {
        const domain = new URL(source.link).hostname;
        if (config.blockedDomains.some((bd) => domain.includes(bd))) {
          return false;
        }
      } catch {
        // Invalid URL, skip
        return false;
      }
      return true;
    })
    .map((source) => {
      // Score sources
      let domain: string;
      try {
        domain = new URL(source.link).hostname;
      } catch {
        domain = 'unknown';
      }

      let score = 0.5; // Base score

      // Boost preferred domains
      if (config.preferredDomains.some((pd) => domain.includes(pd))) {
        score += 0.3;
      }

      // Boost if has snippet
      if (source.snippet && source.snippet.length > 50) {
        score += 0.1;
      }

      // Boost authoritative sources
      if (
        domain.includes('wikipedia') ||
        domain.includes('mdn') ||
        domain.includes('w3')
      ) {
        score += 0.1;
      }

      return { ...source, relevanceScore: Math.min(1, score), domain };
    })
    .filter((source) => (source.relevanceScore || 0) >= config.minRelevanceScore)
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
}

/**
 * Calculates overall quality score for grounding results
 */
function calculateQualityScore(
  sources: GroundingSource[],
  config: GroundingConfig
): number {
  if (sources.length === 0) return 0;

  const avgRelevance =
    sources.reduce((sum, s) => sum + (s.relevanceScore || 0), 0) / sources.length;
  const countScore = Math.min(1, sources.length / config.maxSources);
  const diversityScore =
    new Set(sources.map((s) => s.domain)).size / sources.length;

  return avgRelevance * 0.5 + countScore * 0.3 + diversityScore * 0.2;
}

// ============================================================================
// User Preference Storage (per-session)
// ============================================================================

const userGroundingPrefs = new Map<string, boolean>();

/**
 * Set user's grounding preference
 */
export function setUserGroundingPref(userId: string, enabled: boolean): void {
  userGroundingPrefs.set(userId, enabled);
}

/**
 * Get user's grounding preference (default: enabled)
 */
export function getUserGroundingPref(userId: string): boolean {
  return userGroundingPrefs.get(userId) ?? true;
}

/**
 * Clear user's grounding preference
 */
export function clearUserGroundingPref(userId: string): void {
  userGroundingPrefs.delete(userId);
}

// ============================================================================
// Smart Grounding Decision
// ============================================================================

export interface SmartGroundingDecision {
  shouldPerform: boolean;
  reason: string;
  confidence: number;
}

/**
 * Makes an intelligent decision about whether to perform grounding
 */
export function makeSmartGroundingDecision(
  prompt: string,
  userPref: boolean
): SmartGroundingDecision {
  // If user disabled grounding, respect that
  if (!userPref) {
    return {
      shouldPerform: false,
      reason: 'user_disabled',
      confidence: 1.0,
    };
  }

  // Check if prompt needs grounding
  const needsGrounding = shouldGround(prompt);

  if (needsGrounding) {
    return {
      shouldPerform: true,
      reason: 'keywords_detected',
      confidence: 0.8,
    };
  }

  // For general prompts, still perform grounding but with lower confidence
  // This provides context even for non-time-sensitive queries
  return {
    shouldPerform: true,
    reason: 'general_context',
    confidence: 0.5,
  };
}
