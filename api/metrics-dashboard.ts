/**
 * Metrics Dashboard API Endpoint
 * Provides aggregated metrics, time series data, and export functionality
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  metricsStore,
  type AggregatedMetrics,
  type RequestMetric,
  type LatencyPercentiles,
  type ProviderLatencyBreakdown,
  type TimeSeriesPoint,
} from './_lib/services/metrics';
import { checkAlerts, getActiveAlerts, type Alert } from './_lib/services/alerts';

// Dashboard response interface
export interface DashboardResponse {
  aggregated: AggregatedMetrics;
  latencyPercentiles: LatencyPercentiles;
  providerLatency: ProviderLatencyBreakdown[];
  timeSeries: TimeSeriesPoint[];
  recentErrors: RequestMetric[];
  rollingErrorRate: number;
  alerts: Alert[];
  metricsCount: number;
  timestamp: string;
}

// Export response interface
export interface ExportResponse {
  format: 'json' | 'csv';
  data: string;
  filename: string;
  timestamp: string;
}

/**
 * Simple admin check - in production, use proper auth
 */
function isAdmin(req: VercelRequest): boolean {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return false;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return false;

  return authHeader.slice(7) === adminKey;
}

/**
 * Handle CORS
 */
function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * GET /api/metrics/dashboard - Get dashboard data
 * Query params:
 *   - since: timestamp to filter metrics from (optional)
 *   - hours: number of hours for time series (default: 24)
 */
function handleDashboard(req: VercelRequest, res: VercelResponse): void {
  const sinceParam = req.query.since;
  const hoursParam = req.query.hours;

  const since = typeof sinceParam === 'string' ? parseInt(sinceParam, 10) : undefined;
  const hours = typeof hoursParam === 'string' ? parseInt(hoursParam, 10) : 24;

  // Check for alerts
  checkAlerts();

  const response: DashboardResponse = {
    aggregated: metricsStore.getAggregated(since),
    latencyPercentiles: metricsStore.getLatencyPercentiles(since),
    providerLatency: metricsStore.getProviderLatencyBreakdown(since),
    timeSeries: metricsStore.getTimeSeries(hours),
    recentErrors: metricsStore.getRecent(20).filter((m) => !m.success),
    rollingErrorRate: metricsStore.getRollingErrorRate(100),
    alerts: getActiveAlerts(),
    metricsCount: metricsStore.getCount(),
    timestamp: new Date().toISOString(),
  };

  res.status(200).json(response);
}

/**
 * GET /api/metrics/export - Export metrics data
 * Query params:
 *   - format: 'json' | 'csv' (default: 'json')
 */
function handleExport(req: VercelRequest, res: VercelResponse): void {
  const formatParam = req.query.format;
  const format = formatParam === 'csv' ? 'csv' : 'json';

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `metrics-export-${timestamp}.${format}`;

  let data: string;
  let contentType: string;

  if (format === 'csv') {
    data = metricsStore.exportToCSV();
    contentType = 'text/csv';
  } else {
    data = metricsStore.exportToJSON();
    contentType = 'application/json';
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(data);
}

/**
 * DELETE /api/metrics/clear - Clear all metrics (admin only)
 */
function handleClear(req: VercelRequest, res: VercelResponse): void {
  if (!isAdmin(req)) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Admin API key required',
    });
    return;
  }

  const countBefore = metricsStore.getCount();
  metricsStore.clear();

  res.status(200).json({
    success: true,
    message: 'All metrics cleared',
    clearedCount: countBefore,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/metrics/recent - Get recent metrics
 * Query params:
 *   - count: number of metrics to return (default: 50, max: 500)
 */
function handleRecent(req: VercelRequest, res: VercelResponse): void {
  const countParam = req.query.count;
  let count = typeof countParam === 'string' ? parseInt(countParam, 10) : 50;
  count = Math.min(Math.max(1, count), 500);

  const recent = metricsStore.getRecent(count);

  res.status(200).json({
    metrics: recent,
    count: recent.length,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/metrics/summary - Get quick summary
 */
function handleSummary(req: VercelRequest, res: VercelResponse): void {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const dayAgo = now - 24 * 60 * 60 * 1000;

  const hourlyAggregated = metricsStore.getAggregated(hourAgo);
  const dailyAggregated = metricsStore.getAggregated(dayAgo);

  res.status(200).json({
    lastHour: {
      requests: hourlyAggregated.totalRequests,
      cost: hourlyAggregated.totalCost,
      successRate: hourlyAggregated.successRate,
      avgLatency: hourlyAggregated.avgLatency,
    },
    last24Hours: {
      requests: dailyAggregated.totalRequests,
      cost: dailyAggregated.totalCost,
      successRate: dailyAggregated.successRate,
      avgLatency: dailyAggregated.avgLatency,
    },
    alerts: getActiveAlerts().length,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Main handler
 */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  setCorsHeaders(res);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Parse path
  const url = new URL(req.url ?? '', `http://${req.headers.host}`);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const action = pathParts[pathParts.length - 1];

  try {
    switch (req.method) {
      case 'GET':
        switch (action) {
          case 'dashboard':
          case 'metrics-dashboard':
            handleDashboard(req, res);
            break;
          case 'export':
            handleExport(req, res);
            break;
          case 'recent':
            handleRecent(req, res);
            break;
          case 'summary':
            handleSummary(req, res);
            break;
          default:
            // Default to dashboard
            handleDashboard(req, res);
        }
        break;

      case 'DELETE':
        if (action === 'clear') {
          handleClear(req, res);
        } else {
          res.status(404).json({ error: 'Not found' });
        }
        break;

      default:
        res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Metrics dashboard error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
