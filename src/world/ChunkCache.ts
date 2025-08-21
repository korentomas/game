/**
 * Professional-grade multi-tier chunk caching system
 * Implements memory cache + persistent storage like modern games
 */

import { getChunkCache, putChunkCache } from '../engine/cache';

export interface ChunkData {
  positions: ArrayBuffer;
  normals: ArrayBuffer;
  colors: ArrayBuffer;
  timestamp: number;
  lod: number;
}

export class ChunkCache {
  private memoryCache: Map<string, ChunkData> = new Map();
  private maxMemorySize: number;
  private accessTimes: Map<string, number> = new Map();
  private pendingWrites: Set<string> = new Set();

  constructor(maxMemorySize: number = 200) {
    this.maxMemorySize = maxMemorySize;
  }

  async get(key: string): Promise<ChunkData | null> {
    // Check memory cache first
    const cached = this.memoryCache.get(key);
    if (cached) {
      this.accessTimes.set(key, performance.now());
      return cached;
    }

    // Check persistent storage
    try {
      const stored = await getChunkCache(key);
      if (stored) {
        const chunkData: ChunkData = {
          ...stored,
          timestamp: Date.now(),
          lod: this.extractLODFromKey(key)
        };
        
        // Store in memory cache
        this.set(key, chunkData, false); // Don't write back to storage
        return chunkData;
      }
    } catch (error) {
      // Storage error, continue without cache
    }

    return null;
  }

  set(key: string, data: ChunkData, persistToDisk: boolean = true): void {
    // Update memory cache
    this.memoryCache.set(key, data);
    this.accessTimes.set(key, performance.now());

    // Enforce memory limits
    this.enforceMemoryLimit();

    // Persist to disk asynchronously if requested
    if (persistToDisk && !this.pendingWrites.has(key)) {
      this.pendingWrites.add(key);
      this.writeToDiskAsync(key, data).finally(() => {
        this.pendingWrites.delete(key);
      });
    }
  }

  private async writeToDiskAsync(key: string, data: ChunkData): Promise<void> {
    try {
      await putChunkCache(key, {
        positions: data.positions,
        normals: data.normals,
        colors: data.colors
      });
    } catch (error) {
      // Ignore storage errors
    }
  }

  private enforceMemoryLimit(): void {
    if (this.memoryCache.size <= this.maxMemorySize) return;

    // Sort by access time (LRU eviction)
    const entries = Array.from(this.accessTimes.entries())
      .sort((a, b) => a[1] - b[1]);

    const toRemove = this.memoryCache.size - this.maxMemorySize + 10; // Remove extra for buffer
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const [key] = entries[i];
      this.memoryCache.delete(key);
      this.accessTimes.delete(key);
    }
  }

  private extractLODFromKey(key: string): number {
    const parts = key.split(':');
    return parts.length > 2 ? parseInt(parts[2]) || 0 : 0;
  }

  has(key: string): boolean {
    return this.memoryCache.has(key);
  }

  delete(key: string): void {
    this.memoryCache.delete(key);
    this.accessTimes.delete(key);
  }

  clear(): void {
    this.memoryCache.clear();
    this.accessTimes.clear();
  }

  getStats() {
    return {
      memorySize: this.memoryCache.size,
      pendingWrites: this.pendingWrites.size,
      memoryUsage: `${this.memoryCache.size}/${this.maxMemorySize}`
    };
  }
}