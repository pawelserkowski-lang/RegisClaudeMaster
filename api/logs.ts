/**
 * Log viewing API endpoint (admin only)
 * Provides access to audit logs with filtering and statistics
 */

import { buildCorsHeaders } from './_lib/middleware/cors';
import {
  getAuditLog,
  getAuditStats,
  getAuditEntry,
  type AuditAction,
  type AuditFilters,
} from './_lib/services/audit';
import {
  createLogger,
  extractRequestContext,
  addTrackingHeaders,
} from './_lib/utils/logger';

export const config = {
  runtime: 'edge',
  regions: ['cdg1', 'fra1'],
};

/**
 * Validate admin access
 * In production, this should check for admin JWT tokens or API keys
 */
function validateAdminAccess(req: Request): boolean {
  const adminKey = process.env.ADMIN_API_KEY;
  const isProduction = process.env.NODE_ENV === 'production';

  // In production, admin key is REQUIRED
  if (!adminKey) {
    if (isProduction) {
      return false;
    }
    // Allow in development for easier testing
    return true;
  }

  const providedKey = req.headers.get('x-admin-key');
  return providedKey === adminKey;
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  const ctx = extractRequestContext(req);
  const logger = createLogger(ctx.requestId, ctx.correlationId);

  // Build CORS headers
  const headers = buildCorsHeaders(origin);
  addTrackingHeaders(headers, ctx.requestId, ctx.correlationId);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return new Response(null, { status: 204, headers });
  }

  // Only allow GET
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers }
    );
  }

  // Validate admin access
  if (!validateAdminAccess(req)) {
    logger.warn('Unauthorized admin access attempt', {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return new Response(
      JSON.stringify({ error: 'Unauthorized - Admin access required' }),
      { status: 401, headers }
    );
  }

  logger.info('Admin logs request', { ip: ctx.ip });

  try {
    const url = new URL(req.url);
    const params = url.searchParams;

    // Check if requesting stats
    if (params.get('stats') === 'true') {
      const stats = getAuditStats();
      return new Response(JSON.stringify(stats), {
        status: 200,
        headers,
      });
    }

    // Check if requesting a specific entry
    const entryId = params.get('id');
    if (entryId) {
      const entry = getAuditEntry(entryId);
      if (!entry) {
        return new Response(
          JSON.stringify({ error: 'Audit entry not found' }),
          { status: 404, headers }
        );
      }
      return new Response(JSON.stringify(entry), {
        status: 200,
        headers,
      });
    }

    // Build filters from query params
    const filters: AuditFilters = {};

    const action = params.get('action');
    if (action) {
      filters.action = action as AuditAction;
    }

    const userId = params.get('userId');
    if (userId) {
      filters.userId = userId;
    }

    const ip = params.get('ip');
    if (ip) {
      filters.ip = ip;
    }

    const startDate = params.get('startDate');
    if (startDate) {
      filters.startDate = startDate;
    }

    const endDate = params.get('endDate');
    if (endDate) {
      filters.endDate = endDate;
    }

    const success = params.get('success');
    if (success !== null) {
      filters.success = success === 'true';
    }

    const limit = params.get('limit');
    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        filters.limit = Math.min(parsedLimit, 500); // Cap at 500
      }
    }

    const offset = params.get('offset');
    if (offset) {
      const parsedOffset = parseInt(offset, 10);
      if (!isNaN(parsedOffset) && parsedOffset >= 0) {
        filters.offset = parsedOffset;
      }
    }

    // Get filtered logs
    const logs = getAuditLog(filters);

    return new Response(
      JSON.stringify({
        count: logs.length,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        logs,
      }),
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    logger.error('Error fetching logs', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers }
    );
  }
}
