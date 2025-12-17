/**
 * SearchCache - In-memory query cache for fast repeated searches
 * TTL: 5 seconds (stale results acceptable for instant feedback)
 * Max entries: 50 (LRU eviction)
 */

interface CacheEntry {
  results: any[];
  timestamp: number;
}

class SearchCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL = 5000; // 5 seconds
  private readonly MAX_ENTRIES = 50;

  /**
   * Get cached results for a query
   * Returns null if not cached or expired
   */
  get(query: string): any[] | null {
    const key = this.normalizeKey(query);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.results;
  }

  /**
   * Cache search results for a query
   */
  set(query: string, results: any[]): void {
    const key = this.normalizeKey(query);

    // Evict oldest entry if at capacity
    if (this.cache.size >= this.MAX_ENTRIES && !this.cache.has(key)) {
      const oldestKey = this.findOldestKey();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      results,
      timestamp: Date.now()
    });
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; maxSize: number; ttl: number } {
    return {
      size: this.cache.size,
      maxSize: this.MAX_ENTRIES,
      ttl: this.TTL
    };
  }

  /**
   * Normalize query for consistent cache keys
   */
  private normalizeKey(query: string): string {
    return query.toLowerCase().trim();
  }

  /**
   * Find the oldest cache entry (LRU eviction)
   */
  private findOldestKey(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }
}

// Singleton instance
let instance: SearchCache | null = null;

export function getSearchCache(): SearchCache {
  if (!instance) {
    instance = new SearchCache();
  }
  return instance;
}

export default SearchCache;
