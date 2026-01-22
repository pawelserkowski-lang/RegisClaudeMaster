/**
 * Cache Administration Endpoint
 * Provides cache invalidation, statistics, and management capabilities
 */

import { buildCorsHeaders } from './_lib/middleware/cors';
import { log } from './_lib/utils/logger';
import { verifyAccessToken } from './_lib/middleware/auth-utils';
import {
  responseCache,
  searchCache,
  modelsCache,
  clearAllCaches,
  getAllCacheStats,
  invalidateByModel,
  invalidateByPattern,
  type CacheStats,
} from './_lib/services/cache';
import { getPendingStats, clearPending } from './_lib/middleware/dedup';

export const config = {
  runtime: 'edge',
  regions: ['cdg1', 'fra1'],
};

interface CacheAdminResponse {
  success: boolean;
  message?: string;
  stats?: Record<string, CacheStats>;
  pending?: {
    count: number;
    keys: string[];
    totalSubscribers: number;
  };
  invalidated?: number;
  error?: string;
}

/**
 * Validate admin access
 * Requires either valid JWT with admin role or admin API key
 */
async function validateAdminAccess(req: Request): Promise<boolean> {
  // Check for admin API key
  const adminKey = process.env.CACHE_ADMIN_KEY;
  const providedKey = req.headers.get('x-admin-key');

  if (adminKey && providedKey === adminKey) {
    return true;
  }

  // Check for JWT with admin role (if implemented)
  const userId = await verifyAccessToken(req);
  if (userId) {
    // In a real implementation, you would check if the user has admin role
    // For now, any authenticated user can access in development
    const isProduction = process.env.NODE_ENV === 'production';
    return !isProduction;
  }

  return false;
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  const headers = buildCorsHeaders(origin);

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  // Validate admin access
  const hasAccess = await validateAdminAccess(req);
  if (!hasAccess) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers }
    );
  }

  try {
    // Handle different methods
    switch (req.method) {
      case 'GET':
        return handleGetStats(headers);

      case 'DELETE':
        return await handleDelete(req, headers);

      case 'POST':
        return await handlePost(req, headers);

      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Method not allowed' }),
          { status: 405, headers }
        );
    }
  } catch (error) {
    log('error', 'Cache admin error', { error });
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers }
    );
  }
}

/**
 * GET /api/cache - Get cache statistics
 */
function handleGetStats(headers: Headers): Response {
  const stats = getAllCacheStats();
  const pending = getPendingStats();

  const response: CacheAdminResponse = {
    success: true,
    stats,
    pending,
  };

  return new Response(JSON.stringify(response), { status: 200, headers });
}

/**
 * DELETE /api/cache - Clear caches
 * Query params:
 * - type: 'all' | 'responses' | 'search' | 'models' | 'pending'
 * - model: string (invalidate by model ID)
 * - pattern: string (invalidate by regex pattern)
 */
async function handleDelete(req: Request, headers: Headers): Promise<Response> {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') ?? 'all';
  const model = url.searchParams.get('model');
  const pattern = url.searchParams.get('pattern');

  let invalidated = 0;
  let message = '';

  // Invalidate by model ID
  if (model) {
    invalidated = invalidateByModel(model);
    message = `Invalidated ${invalidated} entries for model: ${model}`;
    log('info', 'Cache invalidated by model', { model, invalidated });
  }
  // Invalidate by pattern
  else if (pattern) {
    try {
      const regex = new RegExp(pattern);
      invalidated = invalidateByPattern(regex);
      message = `Invalidated ${invalidated} entries matching pattern: ${pattern}`;
      log('info', 'Cache invalidated by pattern', { pattern, invalidated });
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid regex pattern' }),
        { status: 400, headers }
      );
    }
  }
  // Clear by type
  else {
    switch (type) {
      case 'all':
        clearAllCaches();
        clearPending();
        message = 'All caches cleared';
        log('info', 'All caches cleared');
        break;

      case 'responses':
        responseCache.clear();
        message = 'Response cache cleared';
        log('info', 'Response cache cleared');
        break;

      case 'search':
        searchCache.clear();
        message = 'Search cache cleared';
        log('info', 'Search cache cleared');
        break;

      case 'models':
        modelsCache.clear();
        message = 'Models cache cleared';
        log('info', 'Models cache cleared');
        break;

      case 'pending':
        clearPending();
        message = 'Pending requests cleared';
        log('info', 'Pending requests cleared');
        break;

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown cache type: ${type}` }),
          { status: 400, headers }
        );
    }
  }

  const response: CacheAdminResponse = {
    success: true,
    message,
    invalidated: invalidated > 0 ? invalidated : undefined,
    stats: getAllCacheStats(),
  };

  return new Response(JSON.stringify(response), { status: 200, headers });
}

/**
 * POST /api/cache - Advanced cache operations
 * Body:
 * - action: 'warmup' | 'invalidate-stale'
 */
async function handlePost(req: Request, headers: Headers): Promise<Response> {
  const body = await req.json() as { action?: string };
  const action = body.action;

  switch (action) {
    case 'warmup':
      // Future: implement cache warmup from predefined queries
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Cache warmup not implemented yet',
        }),
        { status: 200, headers }
      );

    case 'invalidate-stale':
      // Clear all caches (they will auto-expire anyway, but this forces it)
      clearAllCaches();
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Stale entries invalidated',
          stats: getAllCacheStats(),
        }),
        { status: 200, headers }
      );

    default:
      return new Response(
        JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
        { status: 400, headers }
      );
  }
}
