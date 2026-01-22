/**
 * Provider Admin API Endpoint
 *
 * Handles CRUD operations for AI provider configurations.
 * Supports:
 * - GET: List all providers
 * - PUT: Update a provider
 * - POST: Reorder priorities or reset to defaults
 */

import { buildCorsHeaders } from './_lib/middleware/cors';
import {
  getProviderConfigs,
  getProviderConfig,
  updateProviderConfig,
  setProviderPriority,
  resetToDefaults,
  setAbTestGroup,
  setProviderRateLimit,
  getCostEstimate,
  getCheapestProvider,
  type ProviderConfig,
} from './provider-config';

export const config = {
  runtime: 'edge',
  regions: ['cdg1', 'fra1'],
};

interface UpdateProviderRequest {
  id: string;
  enabled?: boolean;
  priority?: number;
  models?: string[];
  costPer1kTokens?: number;
  maxTokens?: number;
  supportsStreaming?: boolean;
  abTestGroup?: 'A' | 'B' | 'control';
  customSystemPrompt?: string;
  rateLimitPerMinute?: number;
}

interface ReorderRequest {
  action: 'reorder';
  id: string;
  priority: number;
}

interface ResetRequest {
  action: 'reset';
}

interface SetAbTestRequest {
  action: 'set-ab-test';
  id: string;
  group: 'A' | 'B' | 'control' | undefined;
}

interface SetRateLimitRequest {
  action: 'set-rate-limit';
  id: string;
  limit: number;
}

interface CostEstimateRequest {
  action: 'cost-estimate';
  provider: string;
  tokens: number;
}

type PostRequest =
  | ReorderRequest
  | ResetRequest
  | SetAbTestRequest
  | SetRateLimitRequest
  | CostEstimateRequest;

interface ProviderListResponse {
  providers: ProviderConfig[];
  cheapestProvider?: ProviderConfig;
}

interface ErrorResponse {
  error: string;
}

interface CostEstimateResponse {
  provider: string;
  tokens: number;
  estimatedCost: number;
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  const headers = buildCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // GET - list providers
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const providerId = url.searchParams.get('id');

    // Get single provider if ID is specified
    if (providerId) {
      const provider = getProviderConfig(providerId);
      if (!provider) {
        const errorResponse: ErrorResponse = { error: 'Provider not found' };
        return new Response(JSON.stringify(errorResponse), {
          status: 404,
          headers,
        });
      }
      return new Response(JSON.stringify({ provider }), {
        status: 200,
        headers,
      });
    }

    // Get all providers
    const response: ProviderListResponse = {
      providers: getProviderConfigs(),
      cheapestProvider: getCheapestProvider(),
    };

    headers.set('Cache-Control', 's-maxage=5, stale-while-revalidate=30');
    return new Response(JSON.stringify(response), { status: 200, headers });
  }

  // PUT - update provider
  if (req.method === 'PUT') {
    try {
      const body = (await req.json()) as UpdateProviderRequest;
      const { id, ...updates } = body;

      if (!id) {
        const errorResponse: ErrorResponse = { error: 'Provider ID required' };
        return new Response(JSON.stringify(errorResponse), {
          status: 400,
          headers,
        });
      }

      const updated = updateProviderConfig(id, updates);
      if (!updated) {
        const errorResponse: ErrorResponse = { error: 'Provider not found' };
        return new Response(JSON.stringify(errorResponse), {
          status: 404,
          headers,
        });
      }

      return new Response(
        JSON.stringify({
          provider: updated,
          providers: getProviderConfigs(),
        }),
        { status: 200, headers }
      );
    } catch (error) {
      const errorResponse: ErrorResponse = {
        error: error instanceof Error ? error.message : 'Invalid request body',
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers,
      });
    }
  }

  // POST - actions (reorder, reset, set-ab-test, set-rate-limit, cost-estimate)
  if (req.method === 'POST') {
    try {
      const body = (await req.json()) as PostRequest;

      switch (body.action) {
        case 'reorder': {
          const { id, priority } = body;
          if (!id || typeof priority !== 'number') {
            const errorResponse: ErrorResponse = {
              error: 'Invalid reorder request: id and priority required',
            };
            return new Response(JSON.stringify(errorResponse), {
              status: 400,
              headers,
            });
          }

          setProviderPriority(id, priority);
          return new Response(
            JSON.stringify({ providers: getProviderConfigs() }),
            { status: 200, headers }
          );
        }

        case 'reset': {
          resetToDefaults();
          return new Response(
            JSON.stringify({ providers: getProviderConfigs() }),
            { status: 200, headers }
          );
        }

        case 'set-ab-test': {
          const { id, group } = body;
          if (!id) {
            const errorResponse: ErrorResponse = {
              error: 'Provider ID required for A/B test assignment',
            };
            return new Response(JSON.stringify(errorResponse), {
              status: 400,
              headers,
            });
          }

          const updated = setAbTestGroup(id, group);
          if (!updated) {
            const errorResponse: ErrorResponse = { error: 'Provider not found' };
            return new Response(JSON.stringify(errorResponse), {
              status: 404,
              headers,
            });
          }

          return new Response(
            JSON.stringify({
              provider: updated,
              providers: getProviderConfigs(),
            }),
            { status: 200, headers }
          );
        }

        case 'set-rate-limit': {
          const { id, limit } = body;
          if (!id || typeof limit !== 'number') {
            const errorResponse: ErrorResponse = {
              error: 'Invalid rate limit request: id and limit required',
            };
            return new Response(JSON.stringify(errorResponse), {
              status: 400,
              headers,
            });
          }

          const updated = setProviderRateLimit(id, limit);
          if (!updated) {
            const errorResponse: ErrorResponse = { error: 'Provider not found' };
            return new Response(JSON.stringify(errorResponse), {
              status: 404,
              headers,
            });
          }

          return new Response(
            JSON.stringify({
              provider: updated,
              providers: getProviderConfigs(),
            }),
            { status: 200, headers }
          );
        }

        case 'cost-estimate': {
          const { provider, tokens } = body;
          if (!provider || typeof tokens !== 'number') {
            const errorResponse: ErrorResponse = {
              error: 'Invalid cost estimate request: provider and tokens required',
            };
            return new Response(JSON.stringify(errorResponse), {
              status: 400,
              headers,
            });
          }

          const estimatedCost = getCostEstimate(provider, tokens);
          const response: CostEstimateResponse = {
            provider,
            tokens,
            estimatedCost,
          };

          return new Response(JSON.stringify(response), {
            status: 200,
            headers,
          });
        }

        default: {
          const errorResponse: ErrorResponse = { error: 'Invalid action' };
          return new Response(JSON.stringify(errorResponse), {
            status: 400,
            headers,
          });
        }
      }
    } catch (error) {
      const errorResponse: ErrorResponse = {
        error: error instanceof Error ? error.message : 'Invalid request body',
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers,
      });
    }
  }

  // Method not allowed
  const errorResponse: ErrorResponse = { error: 'Method not allowed' };
  return new Response(JSON.stringify(errorResponse), {
    status: 405,
    headers,
  });
}
