import { statSync } from 'node:fs';

interface CacheEntry<T> {
  value: T;
  mtime: number;
}

/**
 * Simple in-memory LRU cache keyed by file path + mtime.
 * Used to avoid re-parsing prompt files on every renderPrompt() call.
 */
export class PromptCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  get(filePath: string): T | undefined {
    const entry = this.cache.get(filePath);
    if (!entry) return undefined;

    try {
      const stat = statSync(filePath);
      if (stat.mtimeMs !== entry.mtime) {
        this.cache.delete(filePath);
        return undefined;
      }
    } catch {
      this.cache.delete(filePath);
      return undefined;
    }

    return entry.value;
  }

  set(filePath: string, value: T): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }

    try {
      const stat = statSync(filePath);
      this.cache.set(filePath, { value, mtime: stat.mtimeMs });
    } catch {
      // Can't stat the file — don't cache
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
