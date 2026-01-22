/**
 * Request deduplication module
 * Prevents identical concurrent requests from being executed multiple times
 */

export interface PendingRequest<T = unknown> {
  promise: Promise<T>;
  timestamp: number;
  subscribers: number;
}

/**
 * Map of pending requests keyed by their cache key
 */
const pendingRequests = new Map<string, PendingRequest>();

/**
 * Timeout for pending requests (prevent memory leaks)
 * Requests older than this will be removed
 */
const PENDING_REQUEST_TIMEOUT = 60_000; // 60 seconds

/**
 * Deduplicate concurrent requests
 *
 * If a request with the same key is already in-flight, returns the existing promise.
 * Otherwise, executes the function and stores the promise for potential reuse.
 *
 * @param key - Unique identifier for this request
 * @param fn - Async function to execute
 * @returns The result of the async function
 *
 * @example
 * ```typescript
 * // Multiple concurrent calls with the same key will only execute fn once
 * const result1 = dedup('user-123', () => fetchUser(123));
 * const result2 = dedup('user-123', () => fetchUser(123));
 * // Both result1 and result2 will receive the same promise
 * ```
 */
export function dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // Clean up old pending requests
  cleanupPendingRequests();

  // Check if there's already a pending request
  const existing = pendingRequests.get(key);
  if (existing) {
    existing.subscribers++;
    return existing.promise as Promise<T>;
  }

  // Create new pending request
  const promise = fn()
    .finally(() => {
      // Remove from pending when complete
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, {
    promise,
    timestamp: Date.now(),
    subscribers: 1,
  });

  return promise;
}

/**
 * Generate a cache key from request parameters
 * Combines prompt, model, and grounding flag into a unique key
 */
export function generateRequestKey(
  prompt: string,
  model?: string,
  grounding?: boolean
): string {
  const normalizedPrompt = prompt.trim().toLowerCase();
  const normalizedModel = model ?? 'default';
  const groundingFlag = grounding ?? true;

  // Simple but effective key generation
  // For more complex scenarios, use the async SHA-256 from cache.ts
  return `req_${hashString(normalizedPrompt)}_${normalizedModel}_${groundingFlag}`;
}

/**
 * Simple string hash function (FNV-1a)
 */
function hashString(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Clean up old pending requests to prevent memory leaks
 */
function cleanupPendingRequests(): void {
  const now = Date.now();

  for (const [key, request] of pendingRequests.entries()) {
    if (now - request.timestamp > PENDING_REQUEST_TIMEOUT) {
      pendingRequests.delete(key);
    }
  }
}

/**
 * Get statistics about pending requests
 */
export function getPendingStats(): {
  count: number;
  keys: string[];
  totalSubscribers: number;
} {
  let totalSubscribers = 0;

  for (const request of pendingRequests.values()) {
    totalSubscribers += request.subscribers;
  }

  return {
    count: pendingRequests.size,
    keys: Array.from(pendingRequests.keys()),
    totalSubscribers,
  };
}

/**
 * Check if a request is currently pending
 */
export function isPending(key: string): boolean {
  return pendingRequests.has(key);
}

/**
 * Clear all pending requests
 * Use with caution - may cause issues with in-flight requests
 */
export function clearPending(): void {
  pendingRequests.clear();
}

/**
 * Dedup with timeout
 * Automatically cancels the request if it takes too long
 */
export function dedupWithTimeout<T>(
  key: string,
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return dedup(key, () => {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  });
}

/**
 * Batch multiple dedup requests
 * Useful for prefetching or parallel operations
 */
export async function dedupBatch<T>(
  requests: Array<{ key: string; fn: () => Promise<T> }>
): Promise<Map<string, T | Error>> {
  const results = new Map<string, T | Error>();

  const promises = requests.map(async ({ key, fn }) => {
    try {
      const result = await dedup(key, fn);
      results.set(key, result);
    } catch (error) {
      results.set(key, error instanceof Error ? error : new Error(String(error)));
    }
  });

  await Promise.allSettled(promises);
  return results;
}

/**
 * Dedup decorator for class methods
 * Use with TypeScript experimental decorators
 */
export function Deduplicated(keyGenerator: (...args: unknown[]) => string) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: unknown[]) {
      const key = keyGenerator(...args);
      return dedup(key, () => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}
