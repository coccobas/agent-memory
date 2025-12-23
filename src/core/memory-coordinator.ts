/**
 * Memory Coordinator
 *
 * Manages memory pressure across multiple LRU caches.
 * Coordinates eviction when total memory usage exceeds configured limits.
 */

import { LRUCache } from '../utils/lru-cache.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('memory-coordinator');

interface CacheEntry {
  name: string;
  cache: LRUCache<unknown>;
  priority: number;
}

export interface MemoryCoordinatorConfig {
  totalLimitMB: number;
  pressureThreshold: number;
  checkIntervalMs: number;
}

export class MemoryCoordinator {
  private caches = new Map<string, CacheEntry>();
  private coordinatorConfig: MemoryCoordinatorConfig;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(config: MemoryCoordinatorConfig) {
    this.coordinatorConfig = { ...config };
    this.startMonitoring();
  }

  register<T>(name: string, cache: LRUCache<T>, priority: number = 5): void {
    if (this.caches.has(name)) {
      logger.warn({ name }, 'Cache already registered, replacing');
    }
    this.caches.set(name, {
      name,
      cache: cache as LRUCache<unknown>,
      priority: Math.max(0, Math.min(10, priority)),
    });
    logger.debug({ name, priority, totalCaches: this.caches.size }, 'Cache registered');
  }

  unregister(name: string): void {
    if (this.caches.delete(name)) {
      logger.debug({ name, totalCaches: this.caches.size }, 'Cache unregistered');
    }
  }

  getTotalMemoryMB(): number {
    let total = 0;
    for (const { cache } of this.caches.values()) {
      total += cache.stats.memoryMB;
    }
    return total;
  }

  getMemoryBreakdown(): Array<{ name: string; memoryMB: number; priority: number }> {
    return Array.from(this.caches.values()).map(({ name, cache, priority }) => ({
      name,
      memoryMB: cache.stats.memoryMB,
      priority,
    }));
  }

  isMemoryPressureHigh(): boolean {
    const total = this.getTotalMemoryMB();
    const threshold = this.coordinatorConfig.totalLimitMB * this.coordinatorConfig.pressureThreshold;
    return total > threshold;
  }

  evictIfNeeded(): void {
    const totalMemory = this.getTotalMemoryMB();
    if (totalMemory <= this.coordinatorConfig.totalLimitMB) {
      return;
    }

    logger.info(
      {
        totalMemoryMB: totalMemory,
        limitMB: this.coordinatorConfig.totalLimitMB,
        overageMB: totalMemory - this.coordinatorConfig.totalLimitMB,
      },
      'Memory limit exceeded, starting eviction'
    );

    const targetMemoryMB = this.coordinatorConfig.totalLimitMB * 0.8; // 80% target
    const memoryToFree = totalMemory - targetMemoryMB;

    const sortedCaches = Array.from(this.caches.values()).sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.cache.stats.memoryMB - a.cache.stats.memoryMB;
    });

    let totalFreed = 0;
    let totalEntriesEvicted = 0;

    for (const { name, cache, priority } of sortedCaches) {
      if (totalFreed >= memoryToFree) break;

      const beforeMemory = cache.stats.memoryMB;
      const remainingToFree = memoryToFree - totalFreed;
      const cacheTargetMB = Math.max(0, beforeMemory - remainingToFree);
      const result = cache.evictUntilMemory(cacheTargetMB);

      const freedMemory = beforeMemory - cache.stats.memoryMB;
      totalFreed += freedMemory;
      totalEntriesEvicted += result.evicted;

      if (result.evicted > 0) {
        logger.info(
          {
            cacheName: name,
            priority,
            freedMB: freedMemory.toFixed(2),
            entriesEvicted: result.evicted,
            entriesRemaining: cache.stats.size,
          },
          'Partial cache eviction due to memory pressure'
        );
      }
    }

    logger.info(
      {
        initialMemoryMB: totalMemory.toFixed(2),
        finalMemoryMB: this.getTotalMemoryMB().toFixed(2),
        freedMB: totalFreed.toFixed(2),
        totalEntriesEvicted,
      },
      'Memory eviction completed'
    );
  }

  private startMonitoring(): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      try {
        this.evictIfNeeded();
      } catch (error) {
        logger.error({ error }, 'Error during memory check');
      }
    }, this.coordinatorConfig.checkIntervalMs);

    this.checkInterval.unref();
    logger.debug(
      { intervalMs: this.coordinatorConfig.checkIntervalMs, limitMB: this.coordinatorConfig.totalLimitMB },
      'Memory monitoring started'
    );
  }

  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.debug('Memory monitoring stopped');
    }
  }

  getConfig(): MemoryCoordinatorConfig {
    return { ...this.coordinatorConfig };
  }

  getStats() {
    const totalMemory = this.getTotalMemoryMB();
    return {
      totalMemoryMB: totalMemory,
      limitMB: this.coordinatorConfig.totalLimitMB,
      utilizationPct: (totalMemory / this.coordinatorConfig.totalLimitMB) * 100,
      pressureThreshold: this.coordinatorConfig.pressureThreshold,
      isUnderPressure: this.isMemoryPressureHigh(),
      cacheCount: this.caches.size,
      breakdown: this.getMemoryBreakdown(),
    };
  }
}
