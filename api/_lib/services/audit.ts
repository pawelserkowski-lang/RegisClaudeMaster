/**
 * Audit trail module for tracking sensitive operations
 * Provides structured audit logging with filtering and statistics
 */

import { generateRequestId } from '../utils/logger';

/**
 * Types of auditable actions in the system
 */
export type AuditAction =
  | 'prompt_execute'
  | 'model_change'
  | 'provider_switch'
  | 'cache_clear'
  | 'rate_limit_exceeded'
  | 'auth_attempt'
  | 'auth_success'
  | 'auth_failure'
  | 'api_key_rotation'
  | 'settings_change'
  | 'circuit_breaker_open'
  | 'circuit_breaker_close'
  | 'provider_fallback'
  | 'api_error';

/**
 * Single audit log entry
 */
export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  userId?: string;
  ip: string;
  userAgent?: string;
  details: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
  requestId?: string;
  correlationId?: string;
}

/**
 * Filter options for querying audit logs
 */
export interface AuditFilters {
  action?: AuditAction;
  userId?: string;
  ip?: string;
  startDate?: string;
  endDate?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Statistics about audit log entries
 */
export interface AuditStats {
  totalEntries: number;
  lastHour: {
    total: number;
    failures: number;
    successRate: number;
  };
  lastDay: {
    total: number;
    failures: number;
    successRate: number;
    byAction: Record<string, number>;
  };
  topIps: Array<{ ip: string; count: number }>;
  topActions: Array<{ action: string; count: number }>;
}

// In-memory audit log storage
// In production, this would be persisted to a database or log aggregation service
const auditLog: AuditEntry[] = [];
const MAX_AUDIT_ENTRIES = 1000;

/**
 * Record an audit entry for a sensitive operation
 *
 * @param action - The type of action being audited
 * @param ip - Client IP address
 * @param details - Additional details about the action
 * @param success - Whether the action succeeded
 * @param userId - Optional user identifier
 * @param errorMessage - Optional error message if action failed
 * @param requestId - Optional request ID for correlation
 * @param correlationId - Optional correlation ID for distributed tracing
 * @returns The created audit entry
 */
export function recordAudit(
  action: AuditAction,
  ip: string,
  details: Record<string, unknown>,
  success: boolean = true,
  userId?: string,
  errorMessage?: string,
  requestId?: string,
  correlationId?: string
): AuditEntry {
  const entry: AuditEntry = {
    id: generateRequestId().replace('req_', 'aud_'),
    timestamp: new Date().toISOString(),
    action,
    userId,
    ip,
    details: sanitizeDetails(details),
    success,
    errorMessage,
    requestId,
    correlationId,
  };

  // Add to the front for most recent first
  auditLog.unshift(entry);

  // Maintain max size
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.pop();
  }

  // Output to console for Vercel Logs aggregation
  const logOutput = {
    type: 'AUDIT',
    ...entry,
  };
  console.log(JSON.stringify(logOutput));

  return entry;
}

/**
 * Sanitize sensitive data from audit details
 */
function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...details };

  // List of sensitive keys to redact
  const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'authorization'];

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  // Truncate very long values
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = value.slice(0, 500) + '...[truncated]';
    }
  }

  return sanitized;
}

/**
 * Query audit log with filters
 *
 * @param filters - Filter options for the query
 * @returns Filtered audit entries
 */
export function getAuditLog(filters?: AuditFilters): AuditEntry[] {
  let filtered = [...auditLog];

  if (filters?.action) {
    filtered = filtered.filter((e) => e.action === filters.action);
  }

  if (filters?.userId) {
    filtered = filtered.filter((e) => e.userId === filters.userId);
  }

  if (filters?.ip) {
    filtered = filtered.filter((e) => e.ip === filters.ip);
  }

  if (filters?.startDate) {
    filtered = filtered.filter((e) => e.timestamp >= filters.startDate!);
  }

  if (filters?.endDate) {
    filtered = filtered.filter((e) => e.timestamp <= filters.endDate!);
  }

  if (filters?.success !== undefined) {
    filtered = filtered.filter((e) => e.success === filters.success);
  }

  // Apply offset and limit
  const offset = filters?.offset || 0;
  const limit = filters?.limit || 100;

  return filtered.slice(offset, offset + limit);
}

/**
 * Get statistics about audit log entries
 *
 * @returns Computed statistics from the audit log
 */
export function getAuditStats(): AuditStats {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const lastHourEntries = auditLog.filter(
    (e) => new Date(e.timestamp) >= hourAgo
  );
  const lastDayEntries = auditLog.filter(
    (e) => new Date(e.timestamp) >= dayAgo
  );

  // Count by action
  const actionCounts: Record<string, number> = {};
  for (const entry of lastDayEntries) {
    actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1;
  }

  // Count by IP
  const ipCounts: Record<string, number> = {};
  for (const entry of lastDayEntries) {
    ipCounts[entry.ip] = (ipCounts[entry.ip] || 0) + 1;
  }

  // Sort and get top IPs
  const topIps = Object.entries(ipCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([ip, count]) => ({ ip, count }));

  // Sort and get top actions
  const topActions = Object.entries(actionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([action, count]) => ({ action, count }));

  const lastHourFailures = lastHourEntries.filter((e) => !e.success).length;
  const lastDayFailures = lastDayEntries.filter((e) => !e.success).length;

  return {
    totalEntries: auditLog.length,
    lastHour: {
      total: lastHourEntries.length,
      failures: lastHourFailures,
      successRate:
        lastHourEntries.length > 0
          ? ((lastHourEntries.length - lastHourFailures) /
              lastHourEntries.length) *
            100
          : 100,
    },
    lastDay: {
      total: lastDayEntries.length,
      failures: lastDayFailures,
      successRate:
        lastDayEntries.length > 0
          ? ((lastDayEntries.length - lastDayFailures) /
              lastDayEntries.length) *
            100
          : 100,
      byAction: actionCounts,
    },
    topIps,
    topActions,
  };
}

/**
 * Clear audit log (for testing purposes)
 * In production, this would require elevated permissions
 */
export function clearAuditLog(): void {
  auditLog.length = 0;
}

/**
 * Get a specific audit entry by ID
 *
 * @param id - The audit entry ID
 * @returns The audit entry or undefined if not found
 */
export function getAuditEntry(id: string): AuditEntry | undefined {
  return auditLog.find((e) => e.id === id);
}

/**
 * Helper to create audit context for prompt execution
 */
export function createPromptAuditContext(
  model: string,
  provider: string,
  tokens: number,
  latency: number,
  cached: boolean
): Record<string, unknown> {
  return {
    model,
    provider,
    tokens,
    latency,
    latencyMs: `${latency}ms`,
    cached,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper to create audit context for provider switch
 */
export function createProviderSwitchContext(
  fromProvider: string,
  toProvider: string,
  reason: string
): Record<string, unknown> {
  return {
    fromProvider,
    toProvider,
    reason,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper to create audit context for rate limit events
 */
export function createRateLimitAuditContext(
  limitType: string,
  limit: number,
  remaining: number,
  resetAt: number
): Record<string, unknown> {
  return {
    limitType,
    limit,
    remaining,
    resetAt,
    resetAtIso: new Date(resetAt).toISOString(),
    timestamp: new Date().toISOString(),
  };
}
