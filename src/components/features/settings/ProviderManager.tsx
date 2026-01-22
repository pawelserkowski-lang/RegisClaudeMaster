import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Provider configuration interface matching the API schema
 */
interface ProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  models: string[];
  costPer1kTokens: number;
  maxTokens: number;
  supportsStreaming: boolean;
  abTestGroup?: 'A' | 'B' | 'control';
  rateLimitPerMinute: number;
}

/**
 * Provider health/status information from health endpoint
 */
interface ProviderStatus {
  id: string;
  provider: string;
  model: string;
  configured: boolean;
  status: 'ok' | 'degraded' | 'down' | 'not_configured';
  circuit: {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failures: number;
    successes: number;
    timeUntilRetry: number | null;
  };
  health: {
    latency: number;
    successRate: number;
    healthScore: number;
    requestCount: number;
    errorCount: number;
    lastChecked: number | null;
  };
  usage: {
    tokens: number;
    cost: number;
  };
}

interface ProviderManagerProps {
  className?: string;
  onProviderChange?: (providers: ProviderConfig[]) => void;
}

/**
 * ProviderManager Component
 *
 * Displays and manages AI provider configurations with:
 * - Enable/disable toggle
 * - Priority reordering (drag or buttons)
 * - Health status display
 * - Cost information
 */
export function ProviderManager({
  className = '',
  onProviderChange,
}: ProviderManagerProps) {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  /**
   * Fetch provider configurations from the API
   */
  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/provider-admin');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { providers: ProviderConfig[] };
      setProviders(data.providers);
      setError(null);
      onProviderChange?.(data.providers);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(t('providers.loadError', 'Failed to load providers: {{message}}', { message }));
    } finally {
      setLoading(false);
    }
  }, [t, onProviderChange]);

  /**
   * Fetch provider health statuses from the health endpoint
   */
  const fetchStatuses = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) return;

      const data = (await res.json()) as { providers?: ProviderStatus[] };
      if (data.providers) {
        const statusMap: Record<string, ProviderStatus> = {};
        for (const p of data.providers) {
          statusMap[p.provider] = p;
        }
        setStatuses(statusMap);
      }
    } catch (err) {
      console.error('Failed to fetch statuses:', err);
    }
  }, []);

  useEffect(() => {
    void fetchProviders();
    void fetchStatuses();

    // Refresh statuses every 30 seconds
    const interval = setInterval(() => {
      void fetchStatuses();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchProviders, fetchStatuses]);

  /**
   * Toggle provider enabled state
   */
  async function toggleProvider(id: string, enabled: boolean) {
    setUpdating(id);
    try {
      const res = await fetch('/api/provider-admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      await fetchProviders();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(t('providers.updateError', 'Failed to update provider: {{message}}', { message }));
    } finally {
      setUpdating(null);
    }
  }

  /**
   * Move provider priority up or down
   */
  async function movePriority(id: string, direction: 'up' | 'down') {
    const provider = providers.find((p) => p.id === id);
    if (!provider) return;

    const newPriority =
      direction === 'up'
        ? Math.max(1, provider.priority - 1)
        : Math.min(providers.length, provider.priority + 1);

    if (newPriority === provider.priority) return;

    setUpdating(id);
    try {
      const res = await fetch('/api/provider-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorder', id, priority: newPriority }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      await fetchProviders();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(t('providers.reorderError', 'Failed to reorder: {{message}}', { message }));
    } finally {
      setUpdating(null);
    }
  }

  /**
   * Reset all providers to default configuration
   */
  async function resetToDefaults() {
    if (!confirm(t('providers.resetConfirm', 'Reset all providers to defaults?'))) {
      return;
    }

    setUpdating('reset');
    try {
      const res = await fetch('/api/provider-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      await fetchProviders();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(t('providers.resetError', 'Failed to reset: {{message}}', { message }));
    } finally {
      setUpdating(null);
    }
  }

  /**
   * Get circuit state display color
   */
  function getCircuitStateClass(state?: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): string {
    switch (state) {
      case 'CLOSED':
        return 'bg-green-500/20 text-green-400';
      case 'OPEN':
        return 'bg-red-500/20 text-red-400';
      case 'HALF_OPEN':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  }

  /**
   * Format cost for display
   */
  function formatCost(cost: number): string {
    if (cost === 0) return t('cost.free', 'Free');
    if (cost < 0.001) return `$${cost.toFixed(6)}`;
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(3)}`;
  }

  if (loading) {
    return (
      <div className={`animate-pulse p-4 ${className}`}>
        <div className="h-6 bg-green-500/20 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-green-500/10 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-black/30 backdrop-blur-sm rounded-lg p-4 border border-green-500/20 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-green-400">
          {t('providers.title', 'AI Providers')}
        </h3>
        <button
          onClick={() => void resetToDefaults()}
          disabled={updating === 'reset'}
          className="text-xs text-green-500/50 hover:text-green-400 disabled:opacity-50 transition-colors"
        >
          {updating === 'reset'
            ? t('common.resetting', 'Resetting...')
            : t('providers.resetDefaults', 'Reset to defaults')}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="text-red-400 text-sm mb-4 p-2 bg-red-500/10 rounded border border-red-500/20">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-300 hover:text-red-200"
          >
            [x]
          </button>
        </div>
      )}

      {/* Provider list */}
      <div className="space-y-3">
        {providers.map((provider) => {
          const status = statuses[provider.id];
          const isUpdating = updating === provider.id;

          return (
            <div
              key={provider.id}
              className={`
                flex items-center gap-4 p-3 rounded-lg border transition-all
                ${
                  provider.enabled
                    ? 'border-green-500/30 bg-green-500/5'
                    : 'border-gray-500/30 bg-gray-500/5 opacity-60'
                }
                ${isUpdating ? 'opacity-70' : ''}
              `}
            >
              {/* Priority controls */}
              <div className="flex flex-col gap-1 items-center min-w-[2rem]">
                <button
                  onClick={() => void movePriority(provider.id, 'up')}
                  disabled={provider.priority === 1 || isUpdating}
                  className="text-green-500/50 hover:text-green-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  aria-label={t('providers.moveUp', 'Move up')}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                </button>
                <span className="text-xs text-green-500/50 font-mono">
                  {provider.priority}
                </span>
                <button
                  onClick={() => void movePriority(provider.id, 'down')}
                  disabled={provider.priority === providers.length || isUpdating}
                  className="text-green-500/50 hover:text-green-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  aria-label={t('providers.moveDown', 'Move down')}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>

              {/* Provider info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-green-300 truncate">
                    {provider.name}
                  </span>
                  {status?.circuit && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${getCircuitStateClass(
                        status.circuit.state
                      )}`}
                    >
                      {status.circuit.state}
                    </span>
                  )}
                  {provider.abTestGroup && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                      A/B: {provider.abTestGroup}
                    </span>
                  )}
                </div>
                <div className="text-xs text-green-500/50 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <span>
                    {provider.models.length}{' '}
                    {t('providers.models', 'models')}
                  </span>
                  <span>
                    {formatCost(provider.costPer1kTokens)}/1k{' '}
                    {t('providers.tokens', 'tokens')}
                  </span>
                  {status?.health && (
                    <>
                      <span>{status.health.latency.toFixed(0)}ms avg</span>
                      <span>
                        {(status.health.successRate * 100).toFixed(0)}%{' '}
                        {t('providers.success', 'success')}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Toggle switch */}
              <button
                onClick={() => void toggleProvider(provider.id, !provider.enabled)}
                disabled={isUpdating}
                className={`
                  relative w-12 h-6 rounded-full transition-colors flex-shrink-0
                  ${provider.enabled ? 'bg-green-600' : 'bg-gray-600'}
                  ${isUpdating ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
                `}
                role="switch"
                aria-checked={provider.enabled}
                aria-label={
                  provider.enabled
                    ? t('providers.disable', 'Disable {{name}}', {
                        name: provider.name,
                      })
                    : t('providers.enable', 'Enable {{name}}', {
                        name: provider.name,
                      })
                }
              >
                <span
                  className={`
                    absolute top-1 w-4 h-4 rounded-full bg-white transition-transform
                    ${provider.enabled ? 'left-7' : 'left-1'}
                  `}
                />
              </button>
            </div>
          );
        })}
      </div>

      {/* Summary footer */}
      <div className="mt-4 pt-4 border-t border-green-500/20 flex flex-wrap justify-between gap-2 text-sm text-green-400/70">
        <span>
          {t('providers.activeCount', '{{count}} providers active', {
            count: providers.filter((p) => p.enabled).length,
          })}
        </span>
        <span>
          {t('providers.totalModels', '{{count}} models available', {
            count: providers
              .filter((p) => p.enabled)
              .reduce((sum, p) => sum + p.models.length, 0),
          })}
        </span>
      </div>
    </div>
  );
}

export default ProviderManager;
