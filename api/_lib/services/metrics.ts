/**
 * Persistent Metrics Store
 * In-memory storage with periodic file backup support
 */

// Types
export interface RequestMetric {
  id: string;
  timestamp: number;
  provider: string;
  model: string;
  tokens: number;
  cost: number;
  latency: number;
  success: boolean;
  errorType?: string;
  userId?: string;
}

export interface AggregatedMetrics {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  avgLatency: number;
  successRate: number;
  errorsByType: Record<string, number>;
  requestsByProvider: Record<string, number>;
  costByProvider: Record<string, number>;
  requestsPerMinute: number[]; // last 60 minutes
}

export interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
}

export interface ProviderLatencyBreakdown {
  provider: string;
  avgLatency: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

export interface TimeSeriesPoint {
  timestamp: number;
  requests: number;
  tokens: number;
  cost: number;
  errors: number;
}

// Constants
const MAX_METRICS_SIZE = 10000; // Maximum metrics to keep in memory
const METRICS_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours retention

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, index)] ?? 0;
}

/**
 * MetricsStore class - singleton for managing metrics
 */
class MetricsStore {
  private metrics: RequestMetric[] = [];
  private lastCleanup: number = Date.now();

  constructor() {
    // Initialize empty
  }

  /**
   * Record a new metric
   */
  record(metric: Omit<RequestMetric, 'id' | 'timestamp'>): void {
    const newMetric: RequestMetric = {
      ...metric,
      id: generateId(),
      timestamp: Date.now(),
    };

    this.metrics.push(newMetric);

    // Periodic cleanup
    if (Date.now() - this.lastCleanup > 60000) {
      this.cleanup();
    }
  }

  /**
   * Clean up old metrics and enforce size limit
   */
  private cleanup(): void {
    const cutoff = Date.now() - METRICS_RETENTION_MS;

    // Remove old metrics
    this.metrics = this.metrics.filter((m) => m.timestamp > cutoff);

    // Enforce size limit (keep most recent)
    if (this.metrics.length > MAX_METRICS_SIZE) {
      this.metrics = this.metrics.slice(-MAX_METRICS_SIZE);
    }

    this.lastCleanup = Date.now();
  }

  /**
   * Get aggregated metrics
   */
  getAggregated(since?: number): AggregatedMetrics {
    const cutoff = since ?? 0;
    const filtered = this.metrics.filter((m) => m.timestamp > cutoff);

    if (filtered.length === 0) {
      return {
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        avgLatency: 0,
        successRate: 100,
        errorsByType: {},
        requestsByProvider: {},
        costByProvider: {},
        requestsPerMinute: new Array(60).fill(0),
      };
    }

    const errorsByType: Record<string, number> = {};
    const requestsByProvider: Record<string, number> = {};
    const costByProvider: Record<string, number> = {};
    let totalLatency = 0;
    let successCount = 0;

    for (const metric of filtered) {
      totalLatency += metric.latency;

      if (metric.success) {
        successCount++;
      } else if (metric.errorType) {
        errorsByType[metric.errorType] = (errorsByType[metric.errorType] ?? 0) + 1;
      }

      requestsByProvider[metric.provider] = (requestsByProvider[metric.provider] ?? 0) + 1;
      costByProvider[metric.provider] = (costByProvider[metric.provider] ?? 0) + metric.cost;
    }

    // Calculate requests per minute for last 60 minutes
    const requestsPerMinute = this.calculateRequestsPerMinute();

    return {
      totalRequests: filtered.length,
      totalTokens: filtered.reduce((sum, m) => sum + m.tokens, 0),
      totalCost: filtered.reduce((sum, m) => sum + m.cost, 0),
      avgLatency: filtered.length > 0 ? totalLatency / filtered.length : 0,
      successRate: filtered.length > 0 ? (successCount / filtered.length) * 100 : 100,
      errorsByType,
      requestsByProvider,
      costByProvider,
      requestsPerMinute,
    };
  }

  /**
   * Calculate requests per minute for the last 60 minutes
   */
  private calculateRequestsPerMinute(): number[] {
    const now = Date.now();
    const minuteMs = 60 * 1000;
    const result: number[] = new Array(60).fill(0);

    for (const metric of this.metrics) {
      const minutesAgo = Math.floor((now - metric.timestamp) / minuteMs);
      if (minutesAgo >= 0 && minutesAgo < 60) {
        result[59 - minutesAgo]++;
      }
    }

    return result;
  }

  /**
   * Get recent metrics
   */
  getRecent(count: number): RequestMetric[] {
    return this.metrics.slice(-count);
  }

  /**
   * Get all metrics (for export)
   */
  getAll(): RequestMetric[] {
    return [...this.metrics];
  }

  /**
   * Get latency percentiles
   */
  getLatencyPercentiles(since?: number): LatencyPercentiles {
    const cutoff = since ?? 0;
    const latencies = this.metrics
      .filter((m) => m.timestamp > cutoff && m.success)
      .map((m) => m.latency)
      .sort((a, b) => a - b);

    return {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    };
  }

  /**
   * Get latency breakdown by provider
   */
  getProviderLatencyBreakdown(since?: number): ProviderLatencyBreakdown[] {
    const cutoff = since ?? 0;
    const filtered = this.metrics.filter((m) => m.timestamp > cutoff && m.success);

    const byProvider = new Map<string, number[]>();

    for (const metric of filtered) {
      const existing = byProvider.get(metric.provider) ?? [];
      existing.push(metric.latency);
      byProvider.set(metric.provider, existing);
    }

    const result: ProviderLatencyBreakdown[] = [];

    for (const [provider, latencies] of byProvider) {
      const sorted = latencies.sort((a, b) => a - b);
      const avg = sorted.reduce((sum, l) => sum + l, 0) / sorted.length;

      result.push({
        provider,
        avgLatency: avg,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        count: sorted.length,
      });
    }

    return result;
  }

  /**
   * Get time series data for the last 24 hours (hourly buckets)
   */
  getTimeSeries(hours: number = 24): TimeSeriesPoint[] {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    const result: TimeSeriesPoint[] = [];

    for (let i = hours - 1; i >= 0; i--) {
      const bucketStart = now - (i + 1) * hourMs;
      const bucketEnd = now - i * hourMs;

      const bucketMetrics = this.metrics.filter(
        (m) => m.timestamp >= bucketStart && m.timestamp < bucketEnd
      );

      result.push({
        timestamp: bucketEnd,
        requests: bucketMetrics.length,
        tokens: bucketMetrics.reduce((sum, m) => sum + m.tokens, 0),
        cost: bucketMetrics.reduce((sum, m) => sum + m.cost, 0),
        errors: bucketMetrics.filter((m) => !m.success).length,
      });
    }

    return result;
  }

  /**
   * Get rolling error rate (last N requests)
   */
  getRollingErrorRate(lastN: number = 100): number {
    const recent = this.metrics.slice(-lastN);
    if (recent.length === 0) return 0;

    const errors = recent.filter((m) => !m.success).length;
    return (errors / recent.length) * 100;
  }

  /**
   * Get errors by type for recent requests
   */
  getRecentErrorsByType(lastN: number = 100): Record<string, number> {
    const recent = this.metrics.slice(-lastN);
    const errorsByType: Record<string, number> = {};

    for (const metric of recent) {
      if (!metric.success && metric.errorType) {
        errorsByType[metric.errorType] = (errorsByType[metric.errorType] ?? 0) + 1;
      }
    }

    return errorsByType;
  }

  /**
   * Export metrics to JSON string
   */
  exportToJSON(): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      metrics: this.metrics,
    }, null, 2);
  }

  /**
   * Import metrics from JSON string
   */
  importFromJSON(data: string): void {
    try {
      const parsed = JSON.parse(data) as { metrics: RequestMetric[] };
      if (Array.isArray(parsed.metrics)) {
        this.metrics = parsed.metrics;
        this.cleanup();
      }
    } catch {
      throw new Error('Invalid JSON format for metrics import');
    }
  }

  /**
   * Export metrics to CSV format
   */
  exportToCSV(): string {
    const headers = [
      'id',
      'timestamp',
      'provider',
      'model',
      'tokens',
      'cost',
      'latency',
      'success',
      'errorType',
      'userId',
    ];

    const rows = this.metrics.map((m) => [
      m.id,
      new Date(m.timestamp).toISOString(),
      m.provider,
      m.model,
      m.tokens.toString(),
      m.cost.toFixed(6),
      m.latency.toString(),
      m.success.toString(),
      m.errorType ?? '',
      m.userId ?? '',
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Get count of metrics
   */
  getCount(): number {
    return this.metrics.length;
  }

  /**
   * Get cost for a time period
   */
  getCostForPeriod(periodMs: number): number {
    const cutoff = Date.now() - periodMs;
    return this.metrics
      .filter((m) => m.timestamp > cutoff)
      .reduce((sum, m) => sum + m.cost, 0);
  }

  /**
   * Get hourly cost rate
   */
  getHourlyCostRate(): number {
    return this.getCostForPeriod(60 * 60 * 1000);
  }
}

// Singleton instance
export const metricsStore = new MetricsStore();

// Legacy compatibility exports
export function recordUsage(model: string, tokens: number, cost: number): void {
  metricsStore.record({
    provider: 'unknown',
    model,
    tokens,
    cost,
    latency: 0,
    success: true,
  });
}

export function getUsage(model: string): { tokens: number; cost: number } {
  const metrics = metricsStore.getAll().filter((m) => m.model === model);
  return {
    tokens: metrics.reduce((sum, m) => sum + m.tokens, 0),
    cost: metrics.reduce((sum, m) => sum + m.cost, 0),
  };
}
