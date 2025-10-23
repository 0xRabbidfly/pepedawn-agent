/**
 * Lightweight in-memory LRU-ish cache with TTL for LLM results.
 * Keeps memory usage bounded and avoids repeat calls for identical prompts.
 */

import { createHash } from 'node:crypto';

type CacheEntry<V> = {
  value: V;
  expiresAt: number;
  lastAccess: number;
};

export class LlmCache<V = string> {
  private store: Map<string, CacheEntry<V>> = new Map();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;

  constructor(options?: { maxEntries?: number; defaultTtlMs?: number }) {
    this.maxEntries = options?.maxEntries ?? 500;
    this.defaultTtlMs = options?.defaultTtlMs ?? 15 * 60 * 1000; // 15 minutes
  }

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    const now = Date.now();
    if (entry.expiresAt < now) {
      this.store.delete(key);
      return undefined;
    }
    entry.lastAccess = now;
    return entry.value;
  }

  set(key: string, value: V, ttlMs?: number): void {
    const now = Date.now();
    const entry: CacheEntry<V> = {
      value,
      expiresAt: now + (ttlMs ?? this.defaultTtlMs),
      lastAccess: now,
    };
    this.store.set(key, entry);
    this.evictIfNeeded();
  }

  private evictIfNeeded(): void {
    if (this.store.size <= this.maxEntries) return;
    // Evict 10% least recently used
    const toEvict = Math.ceil(this.store.size * 0.1);
    const entries = Array.from(this.store.entries());
    entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    for (let i = 0; i < toEvict; i++) {
      this.store.delete(entries[i][0]);
    }
  }
}

export function hashKey(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 24);
}

// Shared caches for common operations
export const summarizationCache = new LlmCache<string>({ defaultTtlMs: 6 * 60 * 60 * 1000 }); // 6h
export const storyCache = new LlmCache<string>({ defaultTtlMs: 60 * 60 * 1000 }); // 1h
export const evaluatorCache = new LlmCache<string>({ defaultTtlMs: 15 * 60 * 1000 }); // 15m
