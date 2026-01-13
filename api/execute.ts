import { listAvailableModels } from './providers';
import { log } from './logger';
import { recordUsage } from './metrics';
import { verifyAccessToken } from './auth-utils';
import { buildCorsHeaders } from './cors';

interface InputPayload {
  prompt: string;
  model?: string;
  stream?: boolean;
}

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface OutputPayload {
  success: boolean;
  response: string;
  sources: SearchResult[];
  model_used: string;
  grounding_performed: boolean;
}

interface GoogleSearchItem {
  title: string;
  link: string;
  snippet?: string;
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
}

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 20;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Perform web grounding via Google Custom Search
async function performGrounding(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const searchCx = process.env.GOOGLE_SEARCH_CX;

  if (!apiKey || !searchCx) {
    log('info', 'Google Search not configured, skipping grounding');
    return [];
  }

  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchCx}&q=${encodeURIComponent(query)}&num=5`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      log('warn', 'Google Search failed', { status: response.status });
      return [];
    }

    const data: GoogleSearchResponse = await response.json();

    return (data.items || []).map((item) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet || '',
    }));
  } catch (error) {
    log('error', 'Grounding error', { error });
    return [];
  }
}

// Validate API key
function validateApiKey(req: Request): boolean {
  const expectedKey = process.env.INTERNAL_AUTH_KEY;

  if (!expectedKey) {
    return true; // No auth configured
  }

  const providedKey = req.headers.get('x-api-key');
  return providedKey === expectedKey;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() ?? 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return true;
  }
  entry.count += 1;
  return false;
}

export const config = {
  runtime: 'edge',
  regions: ['cdg1', 'fra1'],
};

export default async function handler(req: Request): Promise<Response> {
  const headers = buildCorsHeaders(req.headers.get('origin'));

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  // Only POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  // Rate limit
  if (isRateLimited(getClientIp(req))) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });
  }

  const userId = await verifyAccessToken(req);
  if (!userId && !validateApiKey(req)) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), { status: 401, headers });
  }

  try {
    const input = (await req.json()) as InputPayload;

    if (!input?.prompt) {
      return new Response(JSON.stringify({ error: 'Missing prompt' }), { status: 400, headers });
    }

    // Step 1: Grounding
    const sources = await performGrounding(input.prompt);
    const context = sources
      .map((s) => `- ${s.title}: ${s.snippet}`)
      .join('\n');

    const availableModels = listAvailableModels();
    const fallbackOrder = ['anthropic', 'openai', 'google', 'mistral', 'groq', 'ollama'];

    const selectedDefinition = input.model
      ? availableModels.find((definition) => definition.id === input.model)
      : undefined;

    const candidates = selectedDefinition
      ? [selectedDefinition]
      : fallbackOrder
          .map((provider) => availableModels.find((definition) => definition.provider === provider))
          .filter((definition): definition is NonNullable<typeof definition> => Boolean(definition));

    let response = '';
    let modelUsed = '';
    let cost = 0;

    for (const definition of candidates) {
      if (!definition.isConfigured()) {
        continue;
      }
      try {
        response = await definition.call({
          prompt: input.prompt,
          context,
          model: definition.id,
        });
        modelUsed = definition.id;
        const tokens = Math.ceil(response.length / 4);
        cost = (tokens / 1000) * definition.costPer1kTokens;
        recordUsage(definition.id, tokens, cost);
        break;
      } catch (error) {
        log('warn', 'Provider call failed', { provider: definition.provider, error });
      }
    }

    if (!response) {
      throw new Error('All providers failed');
    }

    const output: OutputPayload = {
      success: true,
      response,
      sources,
      model_used: modelUsed,
      grounding_performed: sources.length > 0,
    };

    return new Response(JSON.stringify(output), { status: 200, headers });
  } catch (error) {
    log('error', 'Handler error', { error });
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers }
    );
  }
}
