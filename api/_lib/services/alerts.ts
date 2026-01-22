/**
 * Alert System for Metrics Monitoring
 * Monitors cost, error rates, latency, and provider health
 */

import { metricsStore } from './metrics';

// Types
export type AlertType = 'cost' | 'error_rate' | 'latency' | 'provider_down';
export type AlertSeverity = 'warning' | 'critical';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  timestamp: number;
  value: number;
  threshold: number;
  provider?: string;
}

export interface AlertConfig {
  costThreshold: number;        // Cost per hour (e.g., $10)
  costCriticalMultiplier: number; // Multiplier for critical (e.g., 2x = $20)
  errorRateThreshold: number;   // Error rate percentage (e.g., 10%)
  errorRateCriticalThreshold: number; // Critical error rate (e.g., 25%)
  latencyThreshold: number;     // Latency in ms (e.g., 5000ms)
  latencyCriticalThreshold: number; // Critical latency (e.g., 10000ms)
  providerDownThreshold: number; // Consecutive failures to mark provider down
  alertCooldownMs: number;      // Cooldown before re-alerting (e.g., 5 minutes)
}

// Default configuration
const DEFAULT_CONFIG: AlertConfig = {
  costThreshold: 10,              // $10 per hour warning
  costCriticalMultiplier: 2,      // $20 per hour critical
  errorRateThreshold: 10,         // 10% error rate warning
  errorRateCriticalThreshold: 25, // 25% error rate critical
  latencyThreshold: 5000,         // 5s latency warning
  latencyCriticalThreshold: 10000, // 10s latency critical
  providerDownThreshold: 5,       // 5 consecutive failures
  alertCooldownMs: 5 * 60 * 1000, // 5 minutes cooldown
};

// Alert state
let config: AlertConfig = { ...DEFAULT_CONFIG };
const activeAlerts: Map<string, Alert> = new Map();
const alertCooldowns: Map<string, number> = new Map();

/**
 * Generate unique alert ID
 */
function generateAlertId(type: AlertType, provider?: string): string {
  const suffix = provider ? `-${provider}` : '';
  return `${type}${suffix}`;
}

/**
 * Check if alert is in cooldown
 */
function isInCooldown(alertId: string): boolean {
  const cooldownUntil = alertCooldowns.get(alertId);
  if (!cooldownUntil) return false;
  return Date.now() < cooldownUntil;
}

/**
 * Set alert cooldown
 */
function setCooldown(alertId: string): void {
  alertCooldowns.set(alertId, Date.now() + config.alertCooldownMs);
}

/**
 * Create or update an alert
 */
function createAlert(
  type: AlertType,
  severity: AlertSeverity,
  message: string,
  value: number,
  threshold: number,
  provider?: string
): Alert | null {
  const alertId = generateAlertId(type, provider);

  // Check cooldown
  if (isInCooldown(alertId)) {
    // Update existing alert value if it exists
    const existing = activeAlerts.get(alertId);
    if (existing) {
      existing.value = value;
      existing.timestamp = Date.now();
      return existing;
    }
    return null;
  }

  const alert: Alert = {
    id: alertId,
    type,
    severity,
    message,
    timestamp: Date.now(),
    value,
    threshold,
    provider,
  };

  activeAlerts.set(alertId, alert);
  setCooldown(alertId);

  return alert;
}

/**
 * Remove an alert
 */
function removeAlert(alertId: string): void {
  activeAlerts.delete(alertId);
}

/**
 * Check cost alerts
 */
function checkCostAlerts(): Alert[] {
  const alerts: Alert[] = [];
  const hourlyCost = metricsStore.getHourlyCostRate();

  const criticalThreshold = config.costThreshold * config.costCriticalMultiplier;

  if (hourlyCost >= criticalThreshold) {
    const alert = createAlert(
      'cost',
      'critical',
      `Critical: Hourly cost rate ($${hourlyCost.toFixed(2)}) exceeds critical threshold ($${criticalThreshold.toFixed(2)})`,
      hourlyCost,
      criticalThreshold
    );
    if (alert) alerts.push(alert);
  } else if (hourlyCost >= config.costThreshold) {
    const alert = createAlert(
      'cost',
      'warning',
      `Warning: Hourly cost rate ($${hourlyCost.toFixed(2)}) exceeds threshold ($${config.costThreshold.toFixed(2)})`,
      hourlyCost,
      config.costThreshold
    );
    if (alert) alerts.push(alert);
  } else {
    removeAlert(generateAlertId('cost'));
  }

  return alerts;
}

/**
 * Check error rate alerts
 */
function checkErrorRateAlerts(): Alert[] {
  const alerts: Alert[] = [];
  const errorRate = metricsStore.getRollingErrorRate(100);

  if (errorRate >= config.errorRateCriticalThreshold) {
    const alert = createAlert(
      'error_rate',
      'critical',
      `Critical: Error rate (${errorRate.toFixed(1)}%) exceeds critical threshold (${config.errorRateCriticalThreshold}%)`,
      errorRate,
      config.errorRateCriticalThreshold
    );
    if (alert) alerts.push(alert);
  } else if (errorRate >= config.errorRateThreshold) {
    const alert = createAlert(
      'error_rate',
      'warning',
      `Warning: Error rate (${errorRate.toFixed(1)}%) exceeds threshold (${config.errorRateThreshold}%)`,
      errorRate,
      config.errorRateThreshold
    );
    if (alert) alerts.push(alert);
  } else {
    removeAlert(generateAlertId('error_rate'));
  }

  return alerts;
}

/**
 * Check latency alerts
 */
function checkLatencyAlerts(): Alert[] {
  const alerts: Alert[] = [];
  const percentiles = metricsStore.getLatencyPercentiles(Date.now() - 60 * 60 * 1000);

  // Check P95 latency
  if (percentiles.p95 >= config.latencyCriticalThreshold) {
    const alert = createAlert(
      'latency',
      'critical',
      `Critical: P95 latency (${percentiles.p95}ms) exceeds critical threshold (${config.latencyCriticalThreshold}ms)`,
      percentiles.p95,
      config.latencyCriticalThreshold
    );
    if (alert) alerts.push(alert);
  } else if (percentiles.p95 >= config.latencyThreshold) {
    const alert = createAlert(
      'latency',
      'warning',
      `Warning: P95 latency (${percentiles.p95}ms) exceeds threshold (${config.latencyThreshold}ms)`,
      percentiles.p95,
      config.latencyThreshold
    );
    if (alert) alerts.push(alert);
  } else {
    removeAlert(generateAlertId('latency'));
  }

  return alerts;
}

/**
 * Check provider health alerts
 */
function checkProviderAlerts(): Alert[] {
  const alerts: Alert[] = [];
  const recentMetrics = metricsStore.getRecent(100);

  // Group by provider
  const providerErrors: Map<string, number> = new Map();
  const providerTotal: Map<string, number> = new Map();

  for (const metric of recentMetrics) {
    const current = providerTotal.get(metric.provider) ?? 0;
    providerTotal.set(metric.provider, current + 1);

    if (!metric.success) {
      const errors = providerErrors.get(metric.provider) ?? 0;
      providerErrors.set(metric.provider, errors + 1);
    }
  }

  // Check each provider
  for (const [provider, total] of providerTotal) {
    const errors = providerErrors.get(provider) ?? 0;

    // Check for consecutive failures (provider down)
    const recentProviderMetrics = recentMetrics
      .filter((m) => m.provider === provider)
      .slice(-config.providerDownThreshold);

    const allFailed = recentProviderMetrics.length >= config.providerDownThreshold &&
      recentProviderMetrics.every((m) => !m.success);

    if (allFailed) {
      const alert = createAlert(
        'provider_down',
        'critical',
        `Critical: Provider "${provider}" appears to be down (${config.providerDownThreshold} consecutive failures)`,
        config.providerDownThreshold,
        config.providerDownThreshold,
        provider
      );
      if (alert) alerts.push(alert);
    } else {
      removeAlert(generateAlertId('provider_down', provider));

      // Check provider-specific error rate
      const providerErrorRate = total > 0 ? (errors / total) * 100 : 0;
      if (providerErrorRate >= config.errorRateCriticalThreshold && total >= 10) {
        const alertId = `provider_error_${provider}`;
        if (!isInCooldown(alertId)) {
          const alert: Alert = {
            id: alertId,
            type: 'error_rate',
            severity: 'warning',
            message: `Warning: Provider "${provider}" has high error rate (${providerErrorRate.toFixed(1)}%)`,
            timestamp: Date.now(),
            value: providerErrorRate,
            threshold: config.errorRateCriticalThreshold,
            provider,
          };
          activeAlerts.set(alertId, alert);
          setCooldown(alertId);
          alerts.push(alert);
        }
      }
    }
  }

  return alerts;
}

/**
 * Check all alerts and return new alerts
 */
export function checkAlerts(): Alert[] {
  const newAlerts: Alert[] = [];

  newAlerts.push(...checkCostAlerts());
  newAlerts.push(...checkErrorRateAlerts());
  newAlerts.push(...checkLatencyAlerts());
  newAlerts.push(...checkProviderAlerts());

  return newAlerts.filter((a) => a !== null);
}

/**
 * Get all active alerts
 */
export function getActiveAlerts(): Alert[] {
  // Clean up resolved alerts
  const now = Date.now();
  const alertsToRemove: string[] = [];

  for (const [id, alert] of activeAlerts) {
    // Remove alerts older than 1 hour that aren't being re-triggered
    if (now - alert.timestamp > 60 * 60 * 1000) {
      alertsToRemove.push(id);
    }
  }

  for (const id of alertsToRemove) {
    activeAlerts.delete(id);
  }

  return Array.from(activeAlerts.values()).sort((a, b) => {
    // Sort by severity (critical first) then by timestamp (newest first)
    if (a.severity !== b.severity) {
      return a.severity === 'critical' ? -1 : 1;
    }
    return b.timestamp - a.timestamp;
  });
}

/**
 * Get alert configuration
 */
export function getAlertConfig(): AlertConfig {
  return { ...config };
}

/**
 * Update alert configuration
 */
export function setAlertConfig(newConfig: Partial<AlertConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Reset alert configuration to defaults
 */
export function resetAlertConfig(): void {
  config = { ...DEFAULT_CONFIG };
}

/**
 * Clear all alerts
 */
export function clearAlerts(): void {
  activeAlerts.clear();
  alertCooldowns.clear();
}

/**
 * Get alert count by severity
 */
export function getAlertCountBySeverity(): { warning: number; critical: number } {
  let warning = 0;
  let critical = 0;

  for (const alert of activeAlerts.values()) {
    if (alert.severity === 'warning') {
      warning++;
    } else {
      critical++;
    }
  }

  return { warning, critical };
}

/**
 * Acknowledge an alert (clears it and sets cooldown)
 */
export function acknowledgeAlert(alertId: string): boolean {
  if (activeAlerts.has(alertId)) {
    activeAlerts.delete(alertId);
    setCooldown(alertId);
    return true;
  }
  return false;
}

/**
 * Get alerts for a specific provider
 */
export function getProviderAlerts(provider: string): Alert[] {
  return Array.from(activeAlerts.values()).filter(
    (alert) => alert.provider === provider
  );
}

/**
 * Check if there are any critical alerts
 */
export function hasCriticalAlerts(): boolean {
  for (const alert of activeAlerts.values()) {
    if (alert.severity === 'critical') {
      return true;
    }
  }
  return false;
}
