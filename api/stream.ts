import { listAvailableModels, callProviderStreaming, type StreamingProviderCallInput } from './_lib/services/providers';
import { log } from './_lib/utils/logger';
import { recordUsage } from './_lib/services/metrics';
import { verifyAccessToken } from './_lib/middleware/auth-utils';
import { buildCorsHeaders } from './_lib/middleware/cors';

interface InputPayload {
  prompt: string;
  model?: string;
}

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface GoogleSearchItem {
  title: string;
  link: string;
  snippet?: string;
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
}

interface SSEChunkEvent {
  chunk: string;
  done: false;
}

interface SSEDoneEvent {
  done: true;
  model_used: string;
  sources: SearchResult[];
  grounding_performed: boolean;
}

type SSEEvent = SSEChunkEvent | SSEDoneEvent;

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

// Validate API key (requires INTERNAL_AUTH_KEY in production)
function validateApiKey(req: Request): boolean {
  const expectedKey = process.env.INTERNAL_AUTH_KEY;
  const isProduction = process.env.NODE_ENV === 'production';

  // In production, API key is REQUIRED if no JWT auth
  if (!expectedKey) {
    if (isProduction) {
      log('warn', 'INTERNAL_AUTH_KEY not configured in production');
      return false;
    }
    return true;
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

function formatSSEEvent(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export const config = {
  runtime: 'edge',
  regions: ['cdg1', 'fra1'],
};

export default async function handler(req: Request): Promise<Response> {
  const headers = buildCorsHeaders(req.headers.get('origin'));
  headers.set('Content-Type', 'text/event-stream');
  headers.set('Cache-Control', 'no-cache');
  headers.set('Connection', 'keep-alive');

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

  let input: InputPayload;
  try {
    input = (await req.json()) as InputPayload;

    if (!input?.prompt) {
      return new Response(JSON.stringify({ error: 'Missing prompt' }), { status: 400, headers });
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
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

  // Find a configured provider
  const definition = candidates.find((d) => d.isConfigured());
  if (!definition) {
    return new Response(
      JSON.stringify({ error: 'No AI provider configured' }),
      { status: 503, headers }
    );
  }

  const encoder = new TextEncoder();
  let totalTokens = 0;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const streamingInput: StreamingProviderCallInput = {
          prompt: input.prompt,
          context,
          model: definition.id,
          onChunk: (chunk: string) => {
            controller.enqueue(encoder.encode(formatSSEEvent({ chunk, done: false })));
            // Rough token estimation (1 token ~ 4 chars)
            totalTokens += Math.ceil(chunk.length / 4);
          },
        };

        await callProviderStreaming(definition.provider, streamingInput);

        // Send done event
        const doneEvent: SSEDoneEvent = {
          done: true,
          model_used: definition.id,
          sources,
          grounding_performed: sources.length > 0,
        };
        controller.enqueue(encoder.encode(formatSSEEvent(doneEvent)));

        // Record usage
        const cost = (totalTokens / 1000) * definition.costPer1kTokens;
        recordUsage(definition.id, totalTokens, cost);

        controller.close();
      } catch (error) {
        log('error', 'Streaming error', { error });
        const errorMessage = error instanceof Error ? error.message : 'Streaming failed';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMessage })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, { status: 200, headers });
}
