/**
 * Enhanced Rate Limiting with Sliding Window Algorithm
 * Implements RFC 6585 compliant rate limiting with support for:
 * - Per-IP rate limiting
 * - Per-user rate limiting (authenticated users get higher limits)
 * - Per-provider rate limiting (to prevent overloading single providers)
 * - API key rotation for load distribution
 */

import { log } from '../utils/logger';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface RateLimitConfig {
  windowMs: number;        // Window size in milliseconds (e.g., 60000 for 1 minute)
  maxRequests: number;     // Maximum requests allowed in the window
  keyPrefix: string;       // Prefix for keys (e.g., 'ip:', 'user:', 'provider:')
}

export interface RateLimitResult {
  allowed: boolean;        // Whether the request is allowed
  remaining: number;       // Remaining requests in current window
  resetAt: number;         // Unix timestamp when the window resets
  retryAfter?: number;     // Seconds until retry is allowed (only on 429)
}

export interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
  'Retry-After'?: string;
}

export interface ApiKeyPool {
  keys: string[];
  currentIndex: number;
  usageCount: Map<string, number>;
  failureCount: Map<string, number>;
  lastRotation: number;
}

export interface ApiKeyUsageReport {
  provider: string;
  key: string;
  success: boolean;
  timestamp: number;
}

// ============================================================================
// Sliding Window Rate Limiter
// ============================================================================

export class SlidingWindowRateLimiter {
  private windows: Map<string, number[]>;  // Map of key -> array of request timestamps
  private readonly config: RateLimitConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.windows = new Map();

    // Start periodic cleanup of old entries (every 5 minutes)
    this.startCleanup();
  }

  /**
   * Check if a request would be allowed without consuming a slot
   */
  check(key: string): RateLimitResult {
    const fullKey = `${this.config.keyPrefix}${key}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get existing timestamps and filter to current window
    const timestamps = this.windows.get(fullKey) || [];
    const validTimestamps = timestamps.filter((ts) => ts > windowStart);

    const requestCount = validTimestamps.length;
    const remaining = Math.max(0, this.config.maxRequests - requestCount);
    const allowed = requestCount < this.config.maxRequests;

    // Calculate reset time (end of current window from first request)
    const resetAt = validTimestamps.length > 0
      ? Math.ceil((validTimestamps[0] + this.config.windowMs) / 1000)
      : Math.ceil((now + this.config.windowMs) / 1000);

    const result: RateLimitResult = {
      allowed,
      remaining,
      resetAt,
    };

    if (!allowed) {
      const oldestTimestamp = validTimestamps[0];
      const retryAfterMs = oldestTimestamp + this.config.windowMs - now;
      result.retryAfter = Math.ceil(retryAfterMs / 1000);
    }

    return result;
  }

  /**
   * Consume a rate limit slot for the given key
   */
  consume(key: string): RateLimitResult {
    const fullKey = `${this.config.keyPrefix}${key}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get existing timestamps and filter to current window
    let timestamps = this.windows.get(fullKey) || [];
    timestamps = timestamps.filter((ts) => ts > windowStart);

    const requestCount = timestamps.length;
    const allowed = requestCount < this.config.maxRequests;

    if (allowed) {
      // Add current request timestamp
      timestamps.push(now);
      this.windows.set(fullKey, timestamps);
    }

    const remaining = Math.max(0, this.config.maxRequests - timestamps.length);

    // Calculate reset time
    const resetAt = timestamps.length > 0
      ? Math.ceil((timestamps[0] + this.config.windowMs) / 1000)
      : Math.ceil((now + this.config.windowMs) / 1000);

    const result: RateLimitResult = {
      allowed,
      remaining,
      resetAt,
    };

    if (!allowed) {
      const oldestTimestamp = timestamps[0];
      const retryAfterMs = oldestTimestamp + this.config.windowMs - now;
      result.retryAfter = Math.ceil(retryAfterMs / 1000);

      log('warn', 'Rate limit exceeded', {
        key: fullKey,
        limit: this.config.maxRequests,
        retryAfter: result.retryAfter
      });
    }

    return result;
  }

  /**
   * Reset the rate limit for a specific key
   */
  reset(key: string): void {
    const fullKey = `${this.config.keyPrefix}${key}`;
    this.windows.delete(fullKey);
  }

  /**
   * Get current usage statistics
   */
  getUsage(key: string): { current: number; limit: number; windowMs: number } {
    const fullKey = `${this.config.keyPrefix}${key}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    const timestamps = this.windows.get(fullKey) || [];
    const validTimestamps = timestamps.filter((ts) => ts > windowStart);

    return {
      current: validTimestamps.length,
      limit: this.config.maxRequests,
      windowMs: this.config.windowMs,
    };
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanup(): void {
    // Clean up every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up expired entries from memory
   */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    let cleaned = 0;

    // Use Array.from for compatibility with ES2015 target
    const entries = Array.from(this.windows.entries());
    for (const [key, timestamps] of entries) {
      const validTimestamps = timestamps.filter((ts) => ts > windowStart);

      if (validTimestamps.length === 0) {
        this.windows.delete(key);
        cleaned++;
      } else if (validTimestamps.length !== timestamps.length) {
        this.windows.set(key, validTimestamps);
      }
    }

    if (cleaned > 0) {
      log('info', 'Rate limiter cleanup', {
        prefix: this.config.keyPrefix,
        entriesRemoved: cleaned
      });
    }
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// ============================================================================
// Pre-configured Rate Limiters
// ============================================================================

// IP-based rate limiting: 20 requests per minute for anonymous users
export const ipLimiter = new SlidingWindowRateLimiter({
  windowMs: 60_000,  // 1 minute
  maxRequests: 20,
  keyPrefix: 'ip:',
});

// User-based rate limiting: 50 requests per minute for authenticated users
export const userLimiter = new SlidingWindowRateLimiter({
  windowMs: 60_000,  // 1 minute
  maxRequests: 50,
  keyPrefix: 'user:',
});

// Provider-based rate limiting: 100 requests per minute per provider
export const providerLimiter = new SlidingWindowRateLimiter({
  windowMs: 60_000,  // 1 minute
  maxRequests: 100,
  keyPrefix: 'provider:',
});

// ============================================================================
// API Key Pool Management
// ============================================================================

const apiKeyPools: Map<string, ApiKeyPool> = new Map();

/**
 * Initialize an API key pool for a provider
 */
export function initializeKeyPool(provider: string, keys: string[]): void {
  if (keys.length === 0) {
    return;
  }

  apiKeyPools.set(provider, {
    keys,
    currentIndex: 0,
    usageCount: new Map(),
    failureCount: new Map(),
    lastRotation: Date.now(),
  });

  log('info', 'API key pool initialized', {
    provider,
    keyCount: keys.length
  });
}

/**
 * Get the next available API key for a provider using round-robin rotation
 * Keys with high failure rates are temporarily skipped
 */
export function getNextApiKey(provider: string): string | null {
  const pool = apiKeyPools.get(provider);

  if (!pool || pool.keys.length === 0) {
    // Fall back to environment variable
    const envKey = getEnvKeyForProvider(provider);
    return envKey;
  }

  const maxAttempts = pool.keys.length;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const key = pool.keys[pool.currentIndex];
    const failures = pool.failureCount.get(key) || 0;

    // Skip keys with more than 3 recent failures
    if (failures < 3) {
      // Rotate to next key for the next request
      pool.currentIndex = (pool.currentIndex + 1) % pool.keys.length;
      pool.lastRotation = Date.now();

      // Increment usage count
      const usage = pool.usageCount.get(key) || 0;
      pool.usageCount.set(key, usage + 1);

      return key;
    }

    // Try next key
    pool.currentIndex = (pool.currentIndex + 1) % pool.keys.length;
    attempts++;
  }

  // All keys have high failure rates, use the first one anyway
  log('warn', 'All API keys have failures, using first available', { provider });
  return pool.keys[0];
}

/**
 * Report the usage result for an API key
 */
export function reportKeyUsage(
  provider: string,
  key: string,
  success: boolean
): void {
  const pool = apiKeyPools.get(provider);

  if (!pool) {
    return;
  }

  if (success) {
    // Reset failure count on success
    pool.failureCount.set(key, 0);
  } else {
    // Increment failure count
    const failures = pool.failureCount.get(key) || 0;
    pool.failureCount.set(key, failures + 1);

    log('warn', 'API key failure reported', {
      provider,
      keyIndex: pool.keys.indexOf(key),
      totalFailures: failures + 1
    });
  }
}

/**
 * Reset failure counts for all keys (e.g., after a cooldown period)
 */
export function resetKeyFailures(provider: string): void {
  const pool = apiKeyPools.get(provider);

  if (pool) {
    pool.failureCount.clear();
    log('info', 'API key failures reset', { provider });
  }
}

/**
 * Get usage statistics for a provider's key pool
 */
export function getKeyPoolStats(provider: string): {
  totalKeys: number;
  currentIndex: number;
  usagePerKey: Record<string, number>;
  failuresPerKey: Record<string, number>;
} | null {
  const pool = apiKeyPools.get(provider);

  if (!pool) {
    return null;
  }

  const usagePerKey: Record<string, number> = {};
  const failuresPerKey: Record<string, number> = {};

  pool.keys.forEach((key, index) => {
    const maskedKey = `key_${index}`;
    usagePerKey[maskedKey] = pool.usageCount.get(key) || 0;
    failuresPerKey[maskedKey] = pool.failureCount.get(key) || 0;
  });

  return {
    totalKeys: pool.keys.length,
    currentIndex: pool.currentIndex,
    usagePerKey,
    failuresPerKey,
  };
}

/**
 * Get the environment variable key for a provider
 */
function getEnvKeyForProvider(provider: string): string | null {
  const envVarMap: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    groq: 'GROQ_API_KEY',
  };

  const envVar = envVarMap[provider];
  return envVar ? (process.env[envVar] || null) : null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build rate limit headers for the response (RFC 6585)
 */
export function buildRateLimitHeaders(result: RateLimitResult, limit: number): RateLimitHeaders {
  const headers: RateLimitHeaders = {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.resetAt),
  };

  if (result.retryAfter !== undefined) {
    headers['Retry-After'] = String(result.retryAfter);
  }

  return headers;
}

/**
 * Check all rate limiters and return combined result
 */
export function checkAllLimiters(params: {
  ip: string;
  userId?: string | null;
  provider?: string;
}): {
  allowed: boolean;
  limitType: 'ip' | 'user' | 'provider' | null;
  result: RateLimitResult;
  limit: number;
} {
  // Check IP limiter first (for anonymous users)
  if (!params.userId) {
    const ipResult = ipLimiter.check(params.ip);
    if (!ipResult.allowed) {
      return {
        allowed: false,
        limitType: 'ip',
        result: ipResult,
        limit: 20,
      };
    }
  }

  // Check user limiter (for authenticated users)
  if (params.userId) {
    const userResult = userLimiter.check(params.userId);
    if (!userResult.allowed) {
      return {
        allowed: false,
        limitType: 'user',
        result: userResult,
        limit: 50,
      };
    }
  }

  // Check provider limiter
  if (params.provider) {
    const providerResult = providerLimiter.check(params.provider);
    if (!providerResult.allowed) {
      return {
        allowed: false,
        limitType: 'provider',
        result: providerResult,
        limit: 100,
      };
    }
  }

  // All checks passed - consume slots
  const result = params.userId
    ? userLimiter.consume(params.userId)
    : ipLimiter.consume(params.ip);

  const limit = params.userId ? 50 : 20;

  return {
    allowed: true,
    limitType: null,
    result,
    limit,
  };
}

/**
 * Consume rate limit for a specific provider
 */
export function consumeProviderLimit(provider: string): RateLimitResult {
  return providerLimiter.consume(provider);
}

/**
 * Extract client IP from request headers
 */
export function extractClientIp(req: Request): string {
  // Check various headers in order of preference
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }

  return 'unknown';
}

/**
 * Initialize API key pools from environment variables
 * Call this on application startup
 */
export function initializeApiKeyPools(): void {
  const providers = ['anthropic', 'openai', 'google', 'mistral', 'groq'] as const;

  for (const provider of providers) {
    const envVar = `${provider.toUpperCase()}_API_KEYS`;
    const keysString = process.env[envVar];

    if (keysString) {
      const keys = keysString.split(',').map((k) => k.trim()).filter(Boolean);
      initializeKeyPool(provider, keys);
    }
  }
}
