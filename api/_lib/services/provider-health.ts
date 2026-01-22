/**
 * Provider Health Tracking System
 *
 * Monitors the health of AI providers with metrics like:
 * - Latency (response time)
 * - Success rate
 * - Circuit breaker state
 *
 * Think of it as a healer's journal tracking which potions work
 * and which ones cause... unfortunate side effects.
 */

import {
  CircuitState,
  getCircuitBreaker,
  providerCircuits,
} from '../middleware/circuit-breaker';
import { log } from '../utils/logger';

export type ProviderStatus = 'healthy' | 'degraded' | 'down';

export interface ProviderHealth {
  provider: string;
  status: ProviderStatus;
  latency: number; // average latency in ms
  successRate: number; // 0-1 (percentage as decimal)
  lastChecked: number; // timestamp
  circuitState: CircuitState;
  requestCount: number;
  errorCount: number;
  healthScore: number; // calculated score for sorting
}

interface ProviderMetrics {
  latencies: number[]; // rolling window of latencies
  successes: number;
  failures: number;
  lastUpdated: number;
}

// Rolling window size for latency calculation
const LATENCY_WINDOW_SIZE = 20;

// Threshold constants for health status determination
const SUCCESS_RATE_HEALTHY_THRESHOLD = 0.9; // 90%+ success rate = healthy
const SUCCESS_RATE_DEGRADED_THRESHOLD = 0.5; // 50-90% success rate = degraded
const LATENCY_HEALTHY_THRESHOLD = 2000; // < 2s = healthy
const LATENCY_DEGRADED_THRESHOLD = 5000; // < 5s = degraded

// In-memory storage for provider metrics
const providerMetrics = new Map<string, ProviderMetrics>();

/**
 * Initialize metrics for a provider if not exists
 */
function ensureMetrics(provider: string): ProviderMetrics {
  let metrics = providerMetrics.get(provider);
  if (!metrics) {
    metrics = {
      latencies: [],
      successes: 0,
      failures: 0,
      lastUpdated: Date.now(),
    };
    providerMetrics.set(provider, metrics);
  }
  return metrics;
}

/**
 * Update provider health after a request
 */
export function updateProviderHealth(
  provider: string,
  success: boolean,
  latency: number
): void {
  const metrics = ensureMetrics(provider);
  const circuit = getCircuitBreaker(provider);

  // Update latency window (only for successful requests)
  if (success) {
    metrics.latencies.push(latency);
    if (metrics.latencies.length > LATENCY_WINDOW_SIZE) {
      metrics.latencies.shift();
    }
    metrics.successes++;
    circuit.recordSuccess();
  } else {
    metrics.failures++;
    circuit.recordFailure();
  }

  metrics.lastUpdated = Date.now();

  // Log significant health changes
  const health = getProviderHealth(provider);
  if (health.status === 'down') {
    log('warn', `Provider ${provider} is DOWN`, {
      successRate: health.successRate,
      circuitState: health.circuitState,
    });
  } else if (health.status === 'degraded') {
    log('info', `Provider ${provider} is DEGRADED`, {
      successRate: health.successRate,
      latency: health.latency,
    });
  }
}

/**
 * Record request start (for latency tracking)
 */
export function startRequestTimer(): () => number {
  const startTime = performance.now();
  return () => Math.round(performance.now() - startTime);
}

/**
 * Calculate average latency from rolling window
 */
function calculateAverageLatency(latencies: number[]): number {
  if (latencies.length === 0) return 0;
  const sum = latencies.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / latencies.length);
}

/**
 * Calculate success rate from metrics
 */
function calculateSuccessRate(metrics: ProviderMetrics): number {
  const total = metrics.successes + metrics.failures;
  if (total === 0) return 1; // No data = assume healthy
  return metrics.successes / total;
}

/**
 * Determine provider status based on metrics and circuit state
 */
function determineStatus(
  successRate: number,
  latency: number,
  circuitState: CircuitState
): ProviderStatus {
  // Circuit breaker takes precedence
  if (circuitState === CircuitState.OPEN) {
    return 'down';
  }

  if (circuitState === CircuitState.HALF_OPEN) {
    return 'degraded';
  }

  // Check success rate
  if (successRate < SUCCESS_RATE_DEGRADED_THRESHOLD) {
    return 'down';
  }

  if (successRate < SUCCESS_RATE_HEALTHY_THRESHOLD) {
    return 'degraded';
  }

  // Check latency
  if (latency > LATENCY_DEGRADED_THRESHOLD) {
    return 'degraded';
  }

  if (latency > LATENCY_HEALTHY_THRESHOLD) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Calculate health score for provider sorting
 * Higher score = healthier provider
 * Formula: successRate * (1 / normalizedLatency)
 */
function calculateHealthScore(
  successRate: number,
  latency: number,
  circuitState: CircuitState
): number {
  // Penalize based on circuit state
  let statePenalty = 1;
  if (circuitState === CircuitState.OPEN) {
    statePenalty = 0; // Completely unavailable
  } else if (circuitState === CircuitState.HALF_OPEN) {
    statePenalty = 0.5; // Reduced priority
  }

  // Normalize latency (1000ms = 1.0 baseline)
  const normalizedLatency = Math.max(latency, 100) / 1000;

  // Calculate score
  const score = (successRate * (1 / normalizedLatency)) * statePenalty;

  // Return rounded to 4 decimal places
  return Math.round(score * 10000) / 10000;
}

/**
 * Get health information for a specific provider
 */
export function getProviderHealth(provider: string): ProviderHealth {
  const metrics = ensureMetrics(provider);
  const circuit = getCircuitBreaker(provider);
  const circuitState = circuit.getState();

  const latency = calculateAverageLatency(metrics.latencies);
  const successRate = calculateSuccessRate(metrics);
  const status = determineStatus(successRate, latency, circuitState);
  const healthScore = calculateHealthScore(successRate, latency, circuitState);

  return {
    provider,
    status,
    latency,
    successRate: Math.round(successRate * 100) / 100, // Round to 2 decimal places
    lastChecked: metrics.lastUpdated,
    circuitState,
    requestCount: metrics.successes + metrics.failures,
    errorCount: metrics.failures,
    healthScore,
  };
}

/**
 * Get health information for all known providers
 */
export function getAllProviderHealth(): ProviderHealth[] {
  const healthList: ProviderHealth[] = [];

  // Include all providers with metrics
  for (const provider of providerMetrics.keys()) {
    healthList.push(getProviderHealth(provider));
  }

  // Include providers with circuit breakers but no metrics yet
  for (const provider of providerCircuits.keys()) {
    if (!providerMetrics.has(provider)) {
      healthList.push(getProviderHealth(provider));
    }
  }

  // Sort by health score (highest first)
  return healthList.sort((a, b) => b.healthScore - a.healthScore);
}

/**
 * Get providers sorted by health score (for adaptive fallback)
 * Returns provider IDs in order of preference
 */
export function getProvidersByHealth(): string[] {
  return getAllProviderHealth()
    .filter((health) => health.circuitState !== CircuitState.OPEN)
    .map((health) => health.provider);
}

/**
 * Check if a provider is available for requests
 */
export function isProviderAvailable(provider: string): boolean {
  const circuit = getCircuitBreaker(provider);
  return circuit.canExecute();
}

/**
 * Get summary statistics for all providers
 */
export function getHealthSummary(): {
  total: number;
  healthy: number;
  degraded: number;
  down: number;
  averageLatency: number;
  overallSuccessRate: number;
} {
  const allHealth = getAllProviderHealth();

  const summary = {
    total: allHealth.length,
    healthy: 0,
    degraded: 0,
    down: 0,
    averageLatency: 0,
    overallSuccessRate: 0,
  };

  if (allHealth.length === 0) {
    return summary;
  }

  let totalLatency = 0;
  let totalRequests = 0;
  let totalSuccesses = 0;

  for (const health of allHealth) {
    switch (health.status) {
      case 'healthy':
        summary.healthy++;
        break;
      case 'degraded':
        summary.degraded++;
        break;
      case 'down':
        summary.down++;
        break;
    }

    totalLatency += health.latency;
    totalRequests += health.requestCount;
    totalSuccesses += health.requestCount - health.errorCount;
  }

  summary.averageLatency = Math.round(totalLatency / allHealth.length);
  summary.overallSuccessRate =
    totalRequests > 0
      ? Math.round((totalSuccesses / totalRequests) * 100) / 100
      : 1;

  return summary;
}

/**
 * Reset all provider health metrics (for testing or recovery)
 */
export function resetAllHealth(): void {
  providerMetrics.clear();
  for (const [, circuit] of providerCircuits) {
    circuit.reset();
  }
  log('info', 'All provider health metrics have been reset');
}

/**
 * Reset health metrics for a specific provider
 */
export function resetProviderHealth(provider: string): void {
  providerMetrics.delete(provider);
  const circuit = providerCircuits.get(provider);
  if (circuit) {
    circuit.reset();
  }
  log('info', `Provider ${provider} health metrics have been reset`);
}
