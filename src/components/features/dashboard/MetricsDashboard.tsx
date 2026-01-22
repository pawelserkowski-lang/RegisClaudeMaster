/**
 * Metrics Dashboard Component
 * Displays real-time metrics, alerts, and provider statistics
 *
 * Refactored: Sub-components extracted to ./metrics/
 */

import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  AlertCircle,
  DollarSign,
  Clock,
  Server,
  RefreshCw,
  CheckCircle,
  XCircle,
  Download,
} from 'lucide-react';

// Types
import type { DashboardData } from '../../../types/metrics';

// Utilities
import { formatNumber, formatCurrency, formatLatency } from '../../../lib/format';

// Sub-components
import { AlertBadge, StatCard, ProviderCard, ErrorRow, Sparkline } from './metrics';

// API base URL
const API_BASE = '/api';

/**
 * Main Dashboard Component
 */
export function MetricsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/metrics-dashboard`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json() as DashboardData;
      setData(result);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      void fetchDashboardData();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchDashboardData]);

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const response = await fetch(`${API_BASE}/metrics-dashboard?action=export&format=${format}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `metrics-export.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  // Loading state
  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 text-emerald-300 animate-spin" />
        <span className="ml-2 text-emerald-300">Loading metrics...</span>
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-red-200">{error}</p>
        <button
          type="button"
          onClick={() => void fetchDashboardData()}
          className="mt-4 px-4 py-2 bg-emerald-500/20 text-emerald-200 rounded-lg hover:bg-emerald-500/30 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return <></>;

  const { aggregated, latencyPercentiles, providerLatency, recentErrors, alerts } = data;

  // Build provider latency map for quick lookup
  const latencyByProvider = new Map(providerLatency.map((p) => [p.provider, p]));

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-emerald-300" />
          <h2 className="text-xl font-semibold text-emerald-100">Metrics Dashboard</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-emerald-300/50">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
          <label className="flex items-center gap-2 text-sm text-emerald-300/70 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-emerald-400/30 bg-emerald-950/60"
            />
            Auto-refresh
          </label>
          <button
            type="button"
            onClick={() => void fetchDashboardData()}
            disabled={isLoading}
            className="p-2 rounded-lg border border-emerald-400/20 bg-emerald-950/60 hover:bg-emerald-900/70 disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-300 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => void handleExport('json')}
            className="p-2 rounded-lg border border-emerald-400/20 bg-emerald-950/60 hover:bg-emerald-900/70 transition-colors"
            title="Export JSON"
          >
            <Download className="w-4 h-4 text-emerald-300" />
          </button>
        </div>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-emerald-300/70 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Active Alerts ({alerts.length})
          </h3>
          <AnimatePresence>
            {alerts.map((alert) => (
              <AlertBadge key={alert.id} alert={alert} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Activity}
          label="Total Requests"
          value={formatNumber(aggregated.totalRequests)}
          subValue={`${data.metricsCount} tracked`}
        />
        <StatCard
          icon={DollarSign}
          label="Total Cost"
          value={formatCurrency(aggregated.totalCost)}
          colorClass="text-amber-300"
        />
        <StatCard
          icon={CheckCircle}
          label="Success Rate"
          value={`${aggregated.successRate.toFixed(1)}%`}
          colorClass={aggregated.successRate >= 95 ? 'text-emerald-300' : 'text-amber-300'}
        />
        <StatCard
          icon={Clock}
          label="Avg Latency"
          value={formatLatency(aggregated.avgLatency)}
          subValue={`P95: ${formatLatency(latencyPercentiles.p95)}`}
        />
      </div>

      {/* Requests per Minute Sparkline */}
      <div className="bg-emerald-950/60 border border-emerald-400/20 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-emerald-300/70">Requests per Minute (last 60 min)</h3>
          <span className="text-xs text-emerald-300/50">
            Total: {formatNumber(aggregated.requestsPerMinute.reduce((a, b) => a + b, 0))}
          </span>
        </div>
        <Sparkline data={aggregated.requestsPerMinute} height={50} />
      </div>

      {/* Two Column Layout */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Providers */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-emerald-300/70 flex items-center gap-2">
            <Server className="w-4 h-4" />
            Providers ({Object.keys(aggregated.requestsByProvider).length})
          </h3>
          <div className="space-y-2">
            {Object.entries(aggregated.requestsByProvider)
              .sort(([, a], [, b]) => b - a)
              .map(([provider, requests]) => (
                <ProviderCard
                  key={provider}
                  provider={provider}
                  requests={requests}
                  cost={aggregated.costByProvider[provider] ?? 0}
                  latency={latencyByProvider.get(provider)}
                />
              ))}
            {Object.keys(aggregated.requestsByProvider).length === 0 && (
              <p className="text-emerald-300/50 text-sm text-center py-4">No provider data yet</p>
            )}
          </div>
        </div>

        {/* Recent Errors */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-emerald-300/70 flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            Recent Errors ({recentErrors.length})
          </h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {recentErrors.length > 0 ? (
              recentErrors.map((error) => <ErrorRow key={error.id} error={error} />)
            ) : (
              <div className="flex items-center justify-center py-8 text-emerald-300/50">
                <CheckCircle className="w-5 h-5 mr-2" />
                No recent errors
              </div>
            )}
          </div>

          {/* Error Types Breakdown */}
          {Object.keys(aggregated.errorsByType).length > 0 && (
            <div className="mt-4 pt-4 border-t border-emerald-400/10">
              <h4 className="text-xs font-medium text-emerald-300/50 mb-2">Errors by Type</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(aggregated.errorsByType).map(([type, count]) => (
                  <span
                    key={type}
                    className="px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-200"
                  >
                    {type}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Latency Percentiles */}
      <div className="bg-emerald-950/60 border border-emerald-400/20 rounded-xl p-4">
        <h3 className="text-sm font-medium text-emerald-300/70 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Latency Percentiles
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-semibold text-emerald-100">{formatLatency(latencyPercentiles.p50)}</p>
            <p className="text-xs text-emerald-300/50">P50 (Median)</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-emerald-100">{formatLatency(latencyPercentiles.p95)}</p>
            <p className="text-xs text-emerald-300/50">P95</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-emerald-100">{formatLatency(latencyPercentiles.p99)}</p>
            <p className="text-xs text-emerald-300/50">P99</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-emerald-300/40 pt-4">
        Metrics data retained for 24 hours | {formatNumber(data.metricsCount)} total records
      </div>
    </section>
  );
}

export default MetricsDashboard;
