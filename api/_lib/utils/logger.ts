/**
 * Structured logging utility for Vercel Edge Functions
 * Provides request correlation, audit logging, and comprehensive log entries
 */

export interface LogEntry {
  timestamp: string;
  requestId: string;
  correlationId?: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
  duration?: number;
  provider?: string;
  model?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export type LogLevel = LogEntry['level'];

const isProd = process.env.NODE_ENV === 'production';

/**
 * Generate a unique request ID
 * Format: req_<timestamp_base36>_<random_base36>
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generate a correlation ID for tracking requests across services
 * Format: cor_<timestamp_base36>_<random_base36>
 */
export function generateCorrelationId(): string {
  return `cor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Simple log function for backward compatibility
 */
export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const payload = {
    level,
    message,
    meta,
    timestamp: new Date().toISOString(),
  };
  if (isProd) {
    console.log(JSON.stringify(payload));
  } else {
    console.log(`[${level}]`, message, meta ?? '');
  }
}

/**
 * Create a logger instance bound to a specific request
 *
 * @param requestId - Unique identifier for the request
 * @param correlationId - Optional correlation ID for distributed tracing
 * @returns Logger instance with bound request context
 */
export function createLogger(requestId: string, correlationId?: string) {
  const baseContext = {
    requestId,
    correlationId,
  };

  const logEntry = (
    level: LogEntry['level'],
    message: string,
    context?: Record<string, unknown>
  ): LogEntry => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      requestId,
      correlationId,
      level,
      message,
      context: context ? { ...context } : undefined,
    };

    // Output as structured JSON for log aggregators
    const output = JSON.stringify(entry);

    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else if (level === 'debug' && !isProd) {
      // Only log debug in development
      console.log(output);
    } else if (level !== 'debug') {
      console.log(output);
    }

    return entry;
  };

  return {
    /**
     * Log debug message (only in development)
     */
    debug: (message: string, context?: Record<string, unknown>) =>
      logEntry('debug', message, context),

    /**
     * Log info message
     */
    info: (message: string, context?: Record<string, unknown>) =>
      logEntry('info', message, context),

    /**
     * Log warning message
     */
    warn: (message: string, context?: Record<string, unknown>) =>
      logEntry('warn', message, context),

    /**
     * Log error message
     */
    error: (message: string, context?: Record<string, unknown>) =>
      logEntry('error', message, context),

    /**
     * Log request start with common request metadata
     */
    requestStart: (
      req: Request,
      context?: Record<string, unknown>
    ): LogEntry => {
      const ip = extractIpFromRequest(req);
      const userAgent = req.headers.get('user-agent') || 'unknown';
      const url = new URL(req.url);

      return logEntry('info', 'Request started', {
        method: req.method,
        path: url.pathname,
        query: url.search || undefined,
        ip,
        userAgent: userAgent.slice(0, 200), // Truncate long user agents
        ...context,
      });
    },

    /**
     * Log request completion with timing and status
     */
    requestEnd: (
      statusCode: number,
      duration: number,
      context?: Record<string, unknown>
    ): LogEntry => {
      const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
      return logEntry(level, 'Request completed', {
        statusCode,
        duration,
        durationMs: `${duration}ms`,
        ...context,
      });
    },

    /**
     * Log provider API call
     */
    providerCall: (
      provider: string,
      model: string,
      context?: Record<string, unknown>
    ): LogEntry => {
      return logEntry('info', 'Provider call initiated', {
        provider,
        model,
        ...context,
      });
    },

    /**
     * Log provider API success
     */
    providerSuccess: (
      provider: string,
      model: string,
      latency: number,
      context?: Record<string, unknown>
    ): LogEntry => {
      return logEntry('info', 'Provider call succeeded', {
        provider,
        model,
        latency,
        latencyMs: `${latency}ms`,
        ...context,
      });
    },

    /**
     * Log provider API error
     */
    providerError: (
      provider: string,
      error: Error,
      context?: Record<string, unknown>
    ): LogEntry => {
      return logEntry('error', 'Provider call failed', {
        provider,
        error: {
          name: error.name,
          message: error.message,
          stack: isProd ? undefined : error.stack,
        },
        ...context,
      });
    },

    /**
     * Log cache hit
     */
    cacheHit: (cacheType: 'response' | 'search', key: string): LogEntry => {
      return logEntry('info', 'Cache hit', {
        cacheType,
        cacheKey: key.slice(0, 16),
      });
    },

    /**
     * Log cache miss
     */
    cacheMiss: (cacheType: 'response' | 'search', key: string): LogEntry => {
      return logEntry('debug', 'Cache miss', {
        cacheType,
        cacheKey: key.slice(0, 16),
      });
    },

    /**
     * Log rate limit event
     */
    rateLimit: (
      limitType: string,
      ip: string,
      userId?: string,
      retryAfter?: number
    ): LogEntry => {
      return logEntry('warn', 'Rate limit exceeded', {
        limitType,
        ip,
        userId: userId || 'anonymous',
        retryAfter,
      });
    },

    /**
     * Log audit event for sensitive operations
     */
    auditLog: (
      action: string,
      userId: string,
      details: Record<string, unknown>
    ): LogEntry => {
      return logEntry('info', `AUDIT: ${action}`, {
        userId,
        audit: true,
        ...details,
      });
    },

    /**
     * Log circuit breaker state change
     */
    circuitStateChange: (
      provider: string,
      model: string,
      fromState: string,
      toState: string
    ): LogEntry => {
      const level = toState === 'OPEN' ? 'warn' : 'info';
      return logEntry(level, 'Circuit breaker state changed', {
        provider,
        model,
        fromState,
        toState,
      });
    },

    /**
     * Get base context for this logger
     */
    getContext: () => ({ ...baseContext }),
  };
}

export type Logger = ReturnType<typeof createLogger>;

/**
 * Extract client IP from request headers
 */
function extractIpFromRequest(req: Request): string {
  // Vercel sets x-forwarded-for header
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  // Fallback headers
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

/**
 * Request context information extracted from request headers
 */
export interface RequestContext {
  ip: string;
  userAgent: string;
  referer?: string;
  correlationId?: string;
  requestId: string;
}

/**
 * Extract common request context from an incoming request
 *
 * @param req - The incoming request
 * @returns Extracted request context
 */
export function extractRequestContext(req: Request): RequestContext {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded
    ? forwarded.split(',')[0].trim()
    : req.headers.get('x-real-ip') || 'unknown';

  const referer = req.headers.get('referer');

  return {
    ip,
    userAgent: req.headers.get('user-agent') || 'unknown',
    referer: referer || undefined,
    correlationId: req.headers.get('x-correlation-id') || undefined,
    requestId: req.headers.get('x-request-id') || generateRequestId(),
  };
}

/**
 * Add request tracking headers to a response
 *
 * @param headers - Existing headers to modify
 * @param requestId - Request ID to add
 * @param correlationId - Optional correlation ID to add
 */
export function addTrackingHeaders(
  headers: Headers,
  requestId: string,
  correlationId?: string
): void {
  headers.set('X-Request-ID', requestId);
  if (correlationId) {
    headers.set('X-Correlation-ID', correlationId);
  }
}
