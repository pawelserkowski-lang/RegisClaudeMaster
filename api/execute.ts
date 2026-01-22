import {
  listAvailableModels,
  getProvidersWithFallback,
  CircuitState,
} from './_lib/services/providers';
import {
  log,
  createLogger,
  extractRequestContext,
  addTrackingHeaders,
  type Logger,
} from './_lib/utils/logger';
import {
  recordAudit,
  createPromptAuditContext,
  createRateLimitAuditContext,
} from './_lib/services/audit';
import { metricsStore } from './_lib/services/metrics';
import { verifyAccessToken } from './_lib/middleware/auth-utils';
import { buildCorsHeaders, build429Headers } from './_lib/middleware/cors';
import {
  responseCache,
  searchCache,
  generateCacheKey,
  generateSearchKey,
  type ApiResponse,
  type SearchResult,
} from './_lib/services/cache';
import { dedup, generateRequestKey } from './_lib/middleware/dedup';
import {
  checkAllLimiters,
  consumeProviderLimit,
  buildRateLimitHeaders,
  extractClientIp,
  getNextApiKey,
  reportKeyUsage,
  initializeApiKeyPools,
} from './_lib/middleware/rate-limit';
import { updateProviderHealth, startRequestTimer } from './_lib/services/provider-health';
import { getCircuitBreaker } from './_lib/middleware/circuit-breaker';
import {
  ErrorCode,
  AppError,
  createApiError,
  createRateLimitError,
  createErrorResponse,
  toAppError,
  type ApiError as StructuredApiError,
} from './_lib/utils/errors';
import {
  performGrounding as performEnhancedGrounding,
  shouldGround as checkShouldGround,
  getUserGroundingPref,
  setUserGroundingPref,
  makeSmartGroundingDecision,
  type GroundingSource,
  type GroundingResult,
} from './_lib/services/grounding';

interface InputPayload {
  prompt: string;
  model?: string;
  stream?: boolean;
  skipCache?: boolean;
  groundingEnabled?: boolean;
}

interface OutputPayload extends ApiResponse {
  cached?: boolean;
  rate_limit?: {
    remaining: number;
    resetAt: number;
    limit: number;
  };
  grounding_metadata?: {
    search_query?: string;
    search_provider?: string;
    fallback_used?: boolean;
    quality_score?: number;
  };
}

interface GoogleSearchItem {
  title: string;
  link: string;
  snippet?: string;
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
}

// Initialize API key pools on module load
initializeApiKeyPools();

// Perform web grounding via Google Custom Search (with caching)
async function performGrounding(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const searchCx = process.env.GOOGLE_SEARCH_CX;

  if (!apiKey || !searchCx) {
    log('info', 'Google Search not configured, skipping grounding');
    return [];
  }

  // Check search cache first
  const searchKey = generateSearchKey(query);
  const cachedResults = searchCache.get(searchKey);
  if (cachedResults) {
    log('info', 'Search cache hit', { query: query.slice(0, 50) });
    return cachedResults;
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

    const results = (data.items || []).map((item) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet || '',
    }));

    // Cache the search results
    if (results.length > 0) {
      searchCache.set(searchKey, results);
      log('info', 'Search results cached', { query: query.slice(0, 50), count: results.length });
    }

    return results;
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
      return false; // Deny access in production without auth key
    }
    // Allow in development for easier testing
    return true;
  }

  const providedKey = req.headers.get('x-api-key');
  return providedKey === expectedKey;
}

// getClientIp is now imported from rate-limit module as extractClientIp

export const config = {
  runtime: 'edge',
  regions: ['cdg1', 'fra1'],
};

export default async function handler(req: Request): Promise<Response> {
  const startTime = Date.now();
  const origin = req.headers.get('origin');

  // Extract request context for logging
  const ctx = extractRequestContext(req);
  const logger = createLogger(ctx.requestId, ctx.correlationId);

  // Preflight - no rate limiting needed
  if (req.method === 'OPTIONS') {
    const headers = buildCorsHeaders(origin);
    addTrackingHeaders(headers, ctx.requestId, ctx.correlationId);
    return new Response(null, { status: 200, headers });
  }

  // Only POST
  if (req.method !== 'POST') {
    const headers = buildCorsHeaders(origin);
    addTrackingHeaders(headers, ctx.requestId, ctx.correlationId);
    logger.requestEnd(405, Date.now() - startTime, { error: 'Method not allowed' });
    const methodError = createApiError(ErrorCode.BAD_REQUEST, {
      method: req.method,
      allowed: ['POST'],
    }, 'Method not allowed');
    return new Response(JSON.stringify(methodError), { status: 405, headers });
  }

  // Log request start
  logger.requestStart(req, { endpoint: '/api/execute' });

  // Extract client IP and verify authentication first
  const clientIp = extractClientIp(req);
  const userId = await verifyAccessToken(req);

  // Check if user is authenticated or has valid API key
  if (!userId && !validateApiKey(req)) {
    const headers = buildCorsHeaders(origin);
    addTrackingHeaders(headers, ctx.requestId, ctx.correlationId);

    // Record auth failure audit
    recordAudit(
      'auth_failure',
      clientIp,
      { reason: 'Invalid API key', endpoint: '/api/execute' },
      false,
      undefined,
      'Authentication failed',
      ctx.requestId,
      ctx.correlationId
    );

    logger.requestEnd(401, Date.now() - startTime, { error: 'Invalid API key' });
    const authError = createApiError(ErrorCode.UNAUTHORIZED, {
      reason: 'Invalid API key',
      endpoint: '/api/execute',
    });
    return new Response(JSON.stringify(authError), { status: 401, headers });
  }

  // Check rate limits using the new sliding window rate limiter
  // This checks IP limiter (for anonymous), user limiter (for authenticated), and provider limiter
  const rateLimitCheck = checkAllLimiters({
    ip: clientIp,
    userId,
  });

  if (!rateLimitCheck.allowed) {
    const rateLimitHeaders = buildRateLimitHeaders(rateLimitCheck.result, rateLimitCheck.limit);
    const headers = build429Headers(origin, rateLimitHeaders);
    addTrackingHeaders(headers, ctx.requestId, ctx.correlationId);

    // Use structured logger for rate limit
    logger.rateLimit(
      rateLimitCheck.limitType,
      clientIp,
      userId ?? undefined,
      rateLimitCheck.result.retryAfter
    );

    // Record rate limit audit
    recordAudit(
      'rate_limit_exceeded',
      clientIp,
      createRateLimitAuditContext(
        rateLimitCheck.limitType,
        rateLimitCheck.limit,
        rateLimitCheck.result.remaining,
        rateLimitCheck.result.resetAt
      ),
      false,
      userId ?? undefined,
      'Rate limit exceeded',
      ctx.requestId,
      ctx.correlationId
    );

    logger.requestEnd(429, Date.now() - startTime);

    const rateLimitError = createRateLimitError(rateLimitCheck.result.retryAfter, {
      limitType: rateLimitCheck.limitType,
      remaining: rateLimitCheck.result.remaining,
      resetAt: rateLimitCheck.result.resetAt,
    });
    return new Response(JSON.stringify(rateLimitError), { status: 429, headers });
  }

  // Build headers with rate limit info for successful requests
  const rateLimitHeaders = buildRateLimitHeaders(rateLimitCheck.result, rateLimitCheck.limit);
  const headers = buildCorsHeaders(origin, { rateLimitHeaders });
  addTrackingHeaders(headers, ctx.requestId, ctx.correlationId);

  try {
    const input = (await req.json()) as InputPayload;

    if (!input?.prompt) {
      const promptError = createApiError(ErrorCode.INVALID_PROMPT, {
        provided: typeof input?.prompt,
      });
      return new Response(JSON.stringify(promptError), { status: 400, headers });
    }

    // Generate cache key based on prompt, model, and grounding settings
    const cacheKey = await generateCacheKey(
      input.prompt,
      input.model ?? 'default',
      true // grounding enabled by default
    );

    // Check cache first (unless skipCache is set)
    if (!input.skipCache) {
      const cachedResponse = responseCache.get(cacheKey);
      if (cachedResponse) {
        logger.cacheHit('response', cacheKey);

        const output: OutputPayload = {
          ...cachedResponse,
          cached: true,
          rate_limit: {
            remaining: rateLimitCheck.result.remaining,
            resetAt: rateLimitCheck.result.resetAt,
            limit: rateLimitCheck.limit,
          },
        };

        // Record audit for cached response
        recordAudit(
          'prompt_execute',
          clientIp,
          createPromptAuditContext(
            cachedResponse.model_used || 'cached',
            'cache',
            0,
            Date.now() - startTime,
            true
          ),
          true,
          userId ?? undefined,
          undefined,
          ctx.requestId,
          ctx.correlationId
        );

        const responseHeaders = new Headers(headers);
        responseHeaders.set('X-Cache', 'HIT');
        responseHeaders.set('X-Cache-Key', cacheKey.slice(0, 16));

        logger.requestEnd(200, Date.now() - startTime, { cached: true });

        return new Response(JSON.stringify(output), {
          status: 200,
          headers: responseHeaders,
        });
      } else {
        logger.cacheMiss('response', cacheKey);
      }
    }

    // Determine if grounding should be performed using smart decision
    const userGroundingPref = input.groundingEnabled ?? getUserGroundingPref(userId ?? 'anonymous');
    const groundingDecision = makeSmartGroundingDecision(input.prompt, userGroundingPref);

    // Generate dedup key for concurrent request handling
    const dedupKey = generateRequestKey(input.prompt, input.model, groundingDecision.shouldPerform);

    // Execute with deduplication (prevents identical concurrent requests)
    const result = await dedup(dedupKey, async () => {
      // Step 1: Smart Grounding with fallback providers
      let groundingResult: GroundingResult = { sources: [], groundingPerformed: false };
      let context = '';

      if (groundingDecision.shouldPerform) {
        try {
          // Use enhanced grounding with multiple providers and fallback
          groundingResult = await performEnhancedGrounding(input.prompt, {
            enabled: true,
            maxSources: 5,
            minRelevanceScore: 0.4,
            fallbackEnabled: true,
          });

          // Build context from grounding sources
          context = groundingResult.sources
            .map((s) => `- ${s.title}: ${s.snippet || ''}`)
            .join('\n');

          logger.info('Smart grounding completed', {
            sourcesCount: groundingResult.sources.length,
            provider: groundingResult.searchProvider,
            fallbackUsed: groundingResult.fallbackUsed,
            qualityScore: groundingResult.qualityScore,
            decision: groundingDecision.reason,
          });
        } catch (groundingError) {
          // Grounding failed, but we can still proceed without it
          logger.warn('Enhanced grounding failed, trying legacy', {
            error: groundingError instanceof Error ? groundingError.message : 'Unknown error',
            decision: groundingDecision.reason,
          });

          // Fallback to legacy grounding if enhanced fails
          try {
            const legacySources = await performGrounding(input.prompt);
            groundingResult = {
              sources: legacySources.map((s) => ({
                title: s.title,
                link: s.link,
                snippet: s.snippet,
              })),
              groundingPerformed: legacySources.length > 0,
              fallbackUsed: true,
            };
            context = legacySources
              .map((s) => `- ${s.title}: ${s.snippet}`)
              .join('\n');
          } catch {
            // Complete grounding failure, proceed without context
            logger.warn('Legacy grounding also failed, proceeding without context');
          }
        }
      } else {
        logger.debug('Grounding skipped', {
          reason: groundingDecision.reason,
          confidence: groundingDecision.confidence,
        });
      }

      // Convert grounding sources to SearchResult format for compatibility
      const sources: SearchResult[] = groundingResult.sources.map((s) => ({
        title: s.title,
        link: s.link,
        snippet: s.snippet || '',
      }));

      // Use health-sorted providers with circuit breaker protection
      const fallbackOrder = ['anthropic', 'openai', 'google', 'mistral', 'groq', 'ollama'];

      // Get providers sorted by health within fallback order
      // This respects the fallback priority while considering health
      const candidates = input.model
        ? listAvailableModels().filter((m) => m.id === input.model)
        : getProvidersWithFallback(fallbackOrder);

      let response = '';
      let modelUsed = '';
      let latency = 0;

      for (const definition of candidates) {
        if (!definition.isConfigured()) {
          continue;
        }

        // Check circuit breaker state first
        const providerId = `${definition.provider}:${definition.id}`;
        const circuit = getCircuitBreaker(providerId);
        const circuitState = circuit.getState();

        if (circuitState === CircuitState.OPEN) {
          const retryAfter = circuit.getTimeUntilRetry();
          logger.debug('Skipping provider due to OPEN circuit', {
            provider: definition.provider,
            model: definition.id,
            retryAfter,
          });
          continue; // Skip providers with open circuit
        }

        // Log HALF_OPEN state for visibility
        if (circuitState === CircuitState.HALF_OPEN) {
          logger.info('Testing provider in HALF_OPEN state', {
            provider: definition.provider,
            model: definition.id,
          });
        }

        // Check provider-specific rate limit before calling
        const providerLimit = consumeProviderLimit(definition.provider);
        if (!providerLimit.allowed) {
          logger.warn('Provider rate limit exceeded', {
            provider: definition.provider,
            retryAfter: providerLimit.retryAfter,
          });
          continue; // Try next provider
        }

        // Get API key from pool (with rotation) if available
        const apiKey = getNextApiKey(definition.provider);

        // Start timing for health tracking
        const timer = startRequestTimer();

        // Log provider call start
        logger.providerCall(definition.provider, definition.id, {
          hasContext: !!context,
        });

        try {
          response = await definition.call({
            prompt: input.prompt,
            context,
            model: definition.id,
          });

          // Record successful call
          latency = timer();
          modelUsed = definition.id;
          const tokens = Math.ceil(response.length / 4);
          const cost = (tokens / 1000) * definition.costPer1kTokens;

          // Log provider success
          logger.providerSuccess(definition.provider, definition.id, latency, {
            tokens,
            cost,
          });

          // Record to enhanced metrics store
          metricsStore.record({
            provider: definition.provider,
            model: definition.id,
            tokens,
            cost,
            latency,
            success: true,
            userId: userId ?? undefined,
          });

          // Update circuit breaker and health metrics
          circuit.recordSuccess();
          updateProviderHealth(providerId, true, latency);

          // Report successful API key usage
          if (apiKey) {
            reportKeyUsage(definition.provider, apiKey, true);
          }

          // Log circuit state change if it transitioned
          const newState = circuit.getState();
          if (circuitState !== newState) {
            logger.circuitStateChange(
              definition.provider,
              definition.id,
              String(circuitState),
              String(newState)
            );
          }

          break;
        } catch (error) {
          // Record failure
          const failLatency = timer();
          circuit.recordFailure();
          updateProviderHealth(providerId, false, failLatency);

          // Classify error type for metrics
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          let errorType = 'provider_error';
          if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')) {
            errorType = 'timeout';
          } else if (errorMessage.includes('401') || errorMessage.includes('auth') || errorMessage.includes('AUTH')) {
            errorType = 'auth';
          } else if (errorMessage.includes('429') || errorMessage.includes('rate') || errorMessage.includes('Rate')) {
            errorType = 'rate_limit';
          }

          // Record failure to enhanced metrics store
          metricsStore.record({
            provider: definition.provider,
            model: definition.id,
            tokens: 0,
            cost: 0,
            latency: failLatency,
            success: false,
            errorType,
            userId: userId ?? undefined,
          });

          // Use structured provider error logging
          logger.providerError(
            definition.provider,
            error instanceof Error ? error : new Error(errorMessage),
            {
              model: definition.id,
              errorType,
              latency: failLatency,
              circuitState: circuit.getState(),
            }
          );

          // Report failed API key usage
          if (apiKey) {
            reportKeyUsage(definition.provider, apiKey, false);
          }

          // Log if circuit opened
          const newCircuitState = circuit.getState();
          if (newCircuitState === CircuitState.OPEN && circuitState !== CircuitState.OPEN) {
            logger.circuitStateChange(
              definition.provider,
              definition.id,
              String(circuitState),
              String(newCircuitState)
            );

            // Record circuit breaker open as audit event
            recordAudit(
              'circuit_breaker_open',
              clientIp,
              {
                provider: definition.provider,
                model: definition.id,
                retryAfter: circuit.getTimeUntilRetry(),
              },
              true,
              userId ?? undefined,
              undefined,
              ctx.requestId,
              ctx.correlationId
            );
          }
        }
      }

      if (!response) {
        throw new AppError(ErrorCode.ALL_PROVIDERS_FAILED, {
          candidatesCount: candidates.length,
          configuredCount: candidates.filter((c) => c.isConfigured()).length,
        });
      }

      return {
        success: true,
        response,
        sources,
        model_used: modelUsed,
        grounding_performed: sources.length > 0,
      } satisfies ApiResponse;
    });

    // Cache the successful response
    responseCache.set(cacheKey, result);
    logger.info('Response cached', { cacheKey: cacheKey.slice(0, 16) });

    // Extract tokens for audit (estimate if not available)
    const estimatedTokens = Math.ceil((result.response?.length || 0) / 4);

    // Record successful prompt execution audit
    recordAudit(
      'prompt_execute',
      clientIp,
      createPromptAuditContext(
        result.model_used || 'unknown',
        'provider',
        estimatedTokens,
        Date.now() - startTime,
        false
      ),
      true,
      userId ?? undefined,
      undefined,
      ctx.requestId,
      ctx.correlationId
    );

    const output: OutputPayload = {
      ...result,
      cached: false,
      rate_limit: {
        remaining: rateLimitCheck.result.remaining,
        resetAt: rateLimitCheck.result.resetAt,
        limit: rateLimitCheck.limit,
      },
    };

    const responseHeaders = new Headers(headers);
    responseHeaders.set('X-Cache', 'MISS');
    responseHeaders.set('X-Cache-Key', cacheKey.slice(0, 16));

    logger.requestEnd(200, Date.now() - startTime, {
      model: result.model_used,
      cached: false,
      grounded: result.grounding_performed,
    });

    return new Response(JSON.stringify(output), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    logger.error('Handler error', { error });

    // Convert to AppError for structured response
    const appError = toAppError(error);
    const structuredError = appError.toJSON();

    // Record error audit
    recordAudit(
      'api_error',
      clientIp,
      {
        errorCode: structuredError.code,
        httpStatus: structuredError.httpStatus,
        retryable: structuredError.retryable,
      },
      false,
      userId ?? undefined,
      structuredError.message,
      ctx.requestId,
      ctx.correlationId
    );

    logger.requestEnd(structuredError.httpStatus, Date.now() - startTime, {
      errorCode: structuredError.code,
    });

    return new Response(JSON.stringify(structuredError), {
      status: structuredError.httpStatus,
      headers,
    });
  }
}
