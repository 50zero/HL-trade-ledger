import { RawFill, ClearinghouseState } from '../types';
import { CacheConfig } from '../config';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * In-memory cache manager with TTL support.
 * Caches fills and clearinghouse state to reduce API calls.
 */
export class CacheManager {
  private readonly fillsCache: Map<string, CacheEntry<RawFill[]>>;
  private readonly clearinghouseCache: Map<string, CacheEntry<ClearinghouseState>>;
  private readonly config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
    this.fillsCache = new Map();
    this.clearinghouseCache = new Map();
  }

  /**
   * Generate cache key for fills query.
   */
  private fillsCacheKey(
    user: string,
    coin: string | undefined,
    fromMs: number,
    toMs: number
  ): string {
    return `${user.toLowerCase()}:${coin || '*'}:${fromMs}:${toMs}`;
  }

  /**
   * Get cached fills or fetch using provided function.
   */
  async getFills(
    user: string,
    coin: string | undefined,
    fromMs: number,
    toMs: number,
    fetcher: () => Promise<RawFill[]>
  ): Promise<RawFill[]> {
    const key = this.fillsCacheKey(user, coin, fromMs, toMs);
    const cached = this.fillsCache.get(key);

    // Check if cache is still valid
    if (cached && Date.now() - cached.timestamp < this.config.fillsTtlMs) {
      return cached.data;
    }

    // Fetch fresh data
    const data = await fetcher();

    // Store in cache
    this.fillsCache.set(key, {
      data,
      timestamp: Date.now(),
    });

    // Prune old entries periodically
    this.pruneCache();

    return data;
  }

  /**
   * Get cached clearinghouse state or fetch using provided function.
   */
  async getClearinghouseState(
    user: string,
    fetcher: () => Promise<ClearinghouseState>
  ): Promise<ClearinghouseState> {
    const key = user.toLowerCase();
    const cached = this.clearinghouseCache.get(key);

    // Check if cache is still valid (shorter TTL for positions)
    if (cached && Date.now() - cached.timestamp < this.config.clearinghouseTtlMs) {
      return cached.data;
    }

    // Fetch fresh data
    const data = await fetcher();

    // Store in cache
    this.clearinghouseCache.set(key, {
      data,
      timestamp: Date.now(),
    });

    return data;
  }

  /**
   * Invalidate fills cache for a user.
   */
  invalidateFillsCache(user: string): void {
    const prefix = user.toLowerCase() + ':';
    for (const key of this.fillsCache.keys()) {
      if (key.startsWith(prefix)) {
        this.fillsCache.delete(key);
      }
    }
  }

  /**
   * Invalidate clearinghouse cache for a user.
   */
  invalidateClearinghouseCache(user: string): void {
    this.clearinghouseCache.delete(user.toLowerCase());
  }

  /**
   * Clear all caches.
   */
  clearAll(): void {
    this.fillsCache.clear();
    this.clearinghouseCache.clear();
  }

  /**
   * Remove expired entries from caches.
   */
  private pruneCache(): void {
    const now = Date.now();

    // Prune fills cache
    for (const [key, entry] of this.fillsCache.entries()) {
      if (now - entry.timestamp > this.config.fillsTtlMs * 2) {
        this.fillsCache.delete(key);
      }
    }

    // Prune clearinghouse cache
    for (const [key, entry] of this.clearinghouseCache.entries()) {
      if (now - entry.timestamp > this.config.clearinghouseTtlMs * 2) {
        this.clearinghouseCache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics (for debugging).
   */
  getStats(): { fillsCount: number; clearinghouseCount: number } {
    return {
      fillsCount: this.fillsCache.size,
      clearinghouseCount: this.clearinghouseCache.size,
    };
  }
}
