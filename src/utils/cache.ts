// ============================================
// src/utils/cache.ts — Simple TTL In-Memory Cache
// ============================================
// Provides a generic cache with time-to-live (TTL) expiration.
// Used to avoid repeated API calls for the same data within
// a short window (e.g. fetching events for the same series ticker).
// ============================================

import { createLogger } from "../logger.js";

const log = createLogger("Cache");

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

/**
 * A simple in-memory TTL cache.
 *
 * @template T  The type of values stored in the cache
 *
 * Usage:
 * ```ts
 * const cache = new TtlCache<EventData[]>(60_000); // 60 second TTL
 * const events = cache.get("KXNBA") ?? await fetchEvents("KXNBA");
 * cache.set("KXNBA", events);
 * ```
 */
export class TtlCache<T> {
    private cache = new Map<string, CacheEntry<T>>();
    private ttlMs: number;

    /**
     * @param ttlMs  Time-to-live in milliseconds. Entries expire after this duration.
     */
    constructor(ttlMs: number) {
        this.ttlMs = ttlMs;
        log.info("Cache initialized", { ttlMs });
    }

    /**
     * Gets a cached value if it exists and hasn't expired.
     * Returns undefined if not found or expired.
     */
    get(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;

        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            log.debug("Cache expired", { key });
            return undefined;
        }

        log.debug("Cache hit", { key });
        return entry.value;
    }

    /**
     * Sets a value in the cache with the configured TTL.
     */
    set(key: string, value: T): void {
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + this.ttlMs,
        });
        log.debug("Cache set", { key, expiresAt: Date.now() + this.ttlMs });
    }

    /**
     * Returns the number of entries currently in the cache (including expired).
     */
    get size(): number {
        return this.cache.size;
    }

    /**
     * Clears all entries from the cache.
     */
    clear(): void {
        this.cache.clear();
        log.debug("Cache cleared");
    }
}
