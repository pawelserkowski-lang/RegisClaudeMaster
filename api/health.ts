import { listAvailableModels } from './_lib/services/providers';
import { getUsage } from './_lib/services/metrics';
import { buildCorsHeaders } from './_lib/middleware/cors';
import {
  getHealthSummary,
  type ProviderHealth,
} from './_lib/services/provider-health';
import { getAllCircuitStats, CircuitState } from './_lib/middleware/circuit-breaker';

export const config = {
  runtime: 'edge',
  regions: ['cdg1', 'fra1'],
};

interface ProviderHealthResponse {
  model: string;
  provider: string;
  configured: boolean;
  /** Overall status: ok, degraded, down, or not_configured */
  status: 'ok' | 'degraded' | 'down' | 'not_configured';
  /** Circuit breaker state */
  circuit: {
    state: CircuitState;
    failures: number;
    successes: number;
    timeUntilRetry: number | null;
  };
  /** Health metrics */
  health: {
    latency: number;
    successRate: number;
    healthScore: number;
    requestCount: number;
    errorCount: number;
    lastChecked: number | null;
  };
  /** Usage metrics */
  usage: {
    tokens: number;
    cost: number;
  };
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  version: string;
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
    notConfigured: number;
    averageLatency: number;
    overallSuccessRate: number;
  };
  providers: ProviderHealthResponse[];
}

/**
 * Map provider health status to response status
 */
function mapStatus(
  configured: boolean,
  healthStatus: ProviderHealth['status']
): ProviderHealthResponse['status'] {
  if (!configured) return 'not_configured';
  switch (healthStatus) {
    case 'healthy':
      return 'ok';
    case 'degraded':
      return 'degraded';
    case 'down':
      return 'down';
    default:
      return 'ok';
  }
}

/**
 * Determine overall system status based on provider health
 */
function determineOverallStatus(summary: ReturnType<typeof getHealthSummary>): 'ok' | 'degraded' | 'down' {
  if (summary.healthy > 0) {
    // At least one provider is healthy
    if (summary.down > 0 || summary.degraded > 0) {
      return 'degraded'; // Some providers have issues
    }
    return 'ok';
  }

  if (summary.degraded > 0) {
    return 'degraded'; // No healthy providers, but some degraded
  }

  return 'down'; // All providers are down
}

export default function handler(req: Request): Response {
  const headers = buildCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  const models = listAvailableModels();
  const circuitStats = getAllCircuitStats();
  const healthSummary = getHealthSummary();

  // Build detailed provider status
  const providers: ProviderHealthResponse[] = models.map((model) => {
    const usage = getUsage(model.id);
    const providerId = `${model.provider}:${model.id}`;
    const configured = model.isConfigured();

    // Get health data for this provider
    const health = model.getHealth();
    const circuitStat = circuitStats[providerId];

    // Get circuit breaker info
    let circuit: ProviderHealthResponse['circuit'];
    if (circuitStat) {
      const timeUntilRetry =
        circuitStat.state === CircuitState.OPEN && circuitStat.lastFailureTime
          ? Math.max(0, 30000 - (Date.now() - circuitStat.lastFailureTime))
          : null;

      circuit = {
        state: circuitStat.state,
        failures: circuitStat.failures,
        successes: circuitStat.successes,
        timeUntilRetry,
      };
    } else {
      circuit = {
        state: CircuitState.CLOSED,
        failures: 0,
        successes: 0,
        timeUntilRetry: null,
      };
    }

    return {
      model: model.id,
      provider: model.provider,
      configured,
      status: mapStatus(configured, health.status),
      circuit,
      health: {
        latency: health.latency,
        successRate: health.successRate,
        healthScore: health.healthScore,
        requestCount: health.requestCount,
        errorCount: health.errorCount,
        lastChecked: health.lastChecked > 0 ? health.lastChecked : null,
      },
      usage: {
        tokens: usage.tokens,
        cost: usage.cost,
      },
    };
  });

  // Calculate summary including not_configured count
  const notConfigured = providers.filter((p) => !p.configured).length;
  const overallStatus = determineOverallStatus(healthSummary);

  const response: HealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: '1.2.0', // Bumped version for circuit breaker feature
    summary: {
      total: healthSummary.total,
      healthy: healthSummary.healthy,
      degraded: healthSummary.degraded,
      down: healthSummary.down,
      notConfigured,
      averageLatency: healthSummary.averageLatency,
      overallSuccessRate: healthSummary.overallSuccessRate,
    },
    providers,
  };

  // Shorter cache for health endpoint since it contains real-time data
  headers.set('Cache-Control', 's-maxage=10, stale-while-revalidate=30');

  return new Response(JSON.stringify(response), { status: 200, headers });
}
