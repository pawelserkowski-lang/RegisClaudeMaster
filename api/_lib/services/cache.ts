/**
 * LRU (Least Recently Used) Cache implementation for API responses
 * Supports TTL-based expiry and statistics tracking
 */

export interface CacheEntry<T> {
  value: T;
  expiry: number;
  hits: number;
  createdAt: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  maxSize: number;
  ttlMs: number;
}

export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private readonly maxSize: number;
  private readonly ttl: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxSize: number, ttlMs: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttlMs;
  }

  /**
   * Get a value from the cache
   * Returns null if not found or expired
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check expiry
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update hits and move to end (most recently used)
    entry.hits++;
    this.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set a value in the cache with TTL
   */
  set(key: string, value: T): void {
    // If key exists, delete it first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict LRU entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    const entry: CacheEntry<T> = {
      value,
      expiry: Date.now() + this.ttl,
      hits: 0,
      createdAt: Date.now(),
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  stats(): CacheStats {
    // Clean expired entries before calculating stats
    this.cleanExpired();

    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      maxSize: this.maxSize,
      ttlMs: this.ttl,
    };
  }

  /**
   * Get all keys (for debugging/monitoring)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Remove expired entries
   */
  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache entry metadata (for debugging)
   */
  getMetadata(key: string): Omit<CacheEntry<T>, 'value'> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    return {
      expiry: entry.expiry,
      hits: entry.hits,
      createdAt: entry.createdAt,
    };
  }
}

// ============================================================================
// Cache Instances for Different Use Cases
// ============================================================================

/**
 * Response structure from execute endpoint
 */
export interface ApiResponse {
  success: boolean;
  response: string;
  sources: SearchResult[];
  model_used: string;
  grounding_performed: boolean;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

/**
 * Response cache for execute endpoint
 * - 100 entries max
 * - 5 minute TTL
 */
export const responseCache = new LRUCache<ApiResponse>(100, 5 * 60 * 1000);

/**
 * Search results cache (for grounding)
 * - 50 entries max
 * - 10 minute TTL (search results change less frequently)
 */
export const searchCache = new LRUCache<SearchResult[]>(50, 10 * 60 * 1000);

/**
 * Models cache
 * - 10 entries max
 * - 5 minute TTL
 */
export interface ModelInfo {
  id: string;
  label: string;
  provider: string;
}

export const modelsCache = new LRUCache<ModelInfo[]>(10, 5 * 60 * 1000);

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Generate a cache key from request parameters using SHA-256 hash
 * Key components: prompt + model + grounding_enabled
 */
export async function generateCacheKey(
  prompt: string,
  model: string = 'default',
  grounding: boolean = true
): Promise<string> {
  const input = `${prompt}|${model}|${grounding}`;

  // Use Web Crypto API for hashing (available in Edge Runtime)
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * Synchronous cache key generation (for simpler use cases)
 * Uses a simple hash function instead of SHA-256
 */
export function generateCacheKeySync(
  prompt: string,
  model: string = 'default',
  grounding: boolean = true
): string {
  const input = `${prompt}|${model}|${grounding}`;

  // Simple FNV-1a hash
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `cache_${(hash >>> 0).toString(16)}`;
}

/**
 * Generate search cache key
 */
export function generateSearchKey(query: string): string {
  return generateCacheKeySync(query, 'search', false);
}

// ============================================================================
// Cache Management Functions
// ============================================================================

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  responseCache.clear();
  searchCache.clear();
  modelsCache.clear();
}

/**
 * Get combined statistics from all caches
 */
export function getAllCacheStats(): Record<string, CacheStats> {
  return {
    responses: responseCache.stats(),
    search: searchCache.stats(),
    models: modelsCache.stats(),
  };
}

/**
 * Invalidate cache entries matching a pattern
 */
export function invalidateByPattern(pattern: RegExp): number {
  let invalidated = 0;

  for (const cache of [responseCache, searchCache, modelsCache]) {
    for (const key of cache.keys()) {
      if (pattern.test(key)) {
        cache.delete(key);
        invalidated++;
      }
    }
  }

  return invalidated;
}

/**
 * Invalidate cache entries by model
 * Call this when model configuration changes
 */
export function invalidateByModel(modelId: string): number {
  let invalidated = 0;

  for (const key of responseCache.keys()) {
    // Keys containing the model ID will be invalidated
    if (key.includes(modelId)) {
      responseCache.delete(key);
      invalidated++;
    }
  }

  // Clear models cache when model config changes
  modelsCache.clear();
  invalidated++;

  return invalidated;
}
