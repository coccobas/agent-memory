/**
 * Global memory coordinator for managing multiple LRU caches
 *
 * Provides centralized memory management to prevent unbounded growth
 * across all cache instances in the application
 */

import type { LRUCache } from './lru-cache.js';
import { createComponentLogger } from './logger.js';
import { config } from '../config/index.js';

const logger = createComponentLogger('memory-coordinator');

// Constants from config (for backward compatibility with existing code)
const CACHE_PRESSURE_THRESHOLD = config.cache.pressureThreshold;
const CACHE_EVICTION_TARGET = config.cache.evictionTarget;
const DEFAULT_MEMORY_CHECK_INTERVAL_MS = config.memory.checkIntervalMs;
const DEFAULT_TOTAL_CACHE_LIMIT_MB = config.cache.totalLimitMB;

/**
 * Cache registry entry
 */
interface CacheEntry {
  name: string;
  cache: LRUCache<unknown>;
  priority: number; // Higher priority = less likely to be evicted
}

/**
 * Memory coordinator configuration
 */
interface MemoryCoordinatorConfig {
  /** Total memory limit in MB across all caches */
  totalLimitMB: number;
  /** Memory pressure threshold (0-1) - when to start evicting */
  pressureThreshold: number;
  /** Check interval in milliseconds */
  checkIntervalMs: number;
}

/**
 * Global memory coordinator
 *
 * Manages multiple LRU caches and ensures total memory usage stays within limits
 */
class MemoryCoordinator {
  private caches = new Map<string, CacheEntry>();
  private config: MemoryCoordinatorConfig;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<MemoryCoordinatorConfig>) {
    this.config = {
      totalLimitMB: config?.totalLimitMB ?? DEFAULT_TOTAL_CACHE_LIMIT_MB,
      pressureThreshold: config?.pressureThreshold ?? CACHE_PRESSURE_THRESHOLD,
      checkIntervalMs: config?.checkIntervalMs ?? DEFAULT_MEMORY_CHECK_INTERVAL_MS,
    };

    // Start periodic memory check
    this.startMonitoring();
  }

  /**
   * Register a cache for global memory management
   *
   * @param name - Unique cache identifier
   * @param cache - LRU cache instance
   * @param priority - Cache priority (0-10, higher = more important)
   */
  register<T>(name: string, cache: LRUCache<T>, priority: number = 5): void {
    if (this.caches.has(name)) {
      logger.warn({ name }, 'Cache already registered, replacing');
    }

    this.caches.set(name, {
      name,
      cache: cache as LRUCache<unknown>,
      priority: Math.max(0, Math.min(10, priority)), // Clamp to 0-10
    });

    logger.debug({ name, priority, totalCaches: this.caches.size }, 'Cache registered');
  }

  /**
   * Unregister a cache from global memory management
   */
  unregister(name: string): void {
    if (this.caches.delete(name)) {
      logger.debug({ name, totalCaches: this.caches.size }, 'Cache unregistered');
    }
  }

  /**
   * Get total memory usage across all registered caches
   */
  getTotalMemoryMB(): number {
    let total = 0;
    for (const { cache } of this.caches.values()) {
      total += cache.stats.memoryMB;
    }
    return total;
  }

  /**
   * Get memory usage breakdown by cache
   */
  getMemoryBreakdown(): Array<{ name: string; memoryMB: number; priority: number }> {
    return Array.from(this.caches.values()).map(({ name, cache, priority }) => ({
      name,
      memoryMB: cache.stats.memoryMB,
      priority,
    }));
  }

  /**
   * Check if memory pressure is high
   */
  isMemoryPressureHigh(): boolean {
    const total = this.getTotalMemoryMB();
    const threshold = this.config.totalLimitMB * this.config.pressureThreshold;
    return total > threshold;
  }

  /**
   * Evict entries from caches to free memory
   * Uses partial eviction (LRU) instead of full cache clear
   * Evicts from lowest priority caches first
   */
  evictIfNeeded(): void {
    const totalMemory = this.getTotalMemoryMB();

    if (totalMemory <= this.config.totalLimitMB) {
      return; // No eviction needed
    }

    logger.info(
      {
        totalMemoryMB: totalMemory,
        limitMB: this.config.totalLimitMB,
        overageMB: totalMemory - this.config.totalLimitMB,
      },
      'Memory limit exceeded, starting eviction'
    );

    // Target: reduce to configured threshold to avoid frequent evictions
    const targetMemoryMB = this.config.totalLimitMB * CACHE_EVICTION_TARGET;
    const memoryToFree = totalMemory - targetMemoryMB;

    // Sort caches by priority (lowest first) and size (largest first for efficiency)
    const sortedCaches = Array.from(this.caches.values()).sort((a, b) => {
      // Primary sort: by priority (lower priority evicted first)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Secondary sort: by size (larger caches evicted first for efficiency)
      return b.cache.stats.memoryMB - a.cache.stats.memoryMB;
    });

    let totalFreed = 0;
    let totalEntriesEvicted = 0;

    // Evict from lowest priority caches until we've freed enough memory
    for (const { name, cache, priority } of sortedCaches) {
      if (totalFreed >= memoryToFree) {
        break;
      }

      const beforeMemory = cache.stats.memoryMB;

      // Calculate how much this cache should contribute to freeing
      // Proportional to its size relative to remaining memory to free
      const remainingToFree = memoryToFree - totalFreed;
      const cacheTargetMB = Math.max(0, beforeMemory - remainingToFree);

      // Use partial eviction instead of full clear
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
            cacheMemoryMB: cache.stats.memoryMB.toFixed(2),
            wasPartial: cache.stats.size > 0,
          },
          'Partial cache eviction due to memory pressure'
        );
      }

      // If partial eviction wasn't enough and we still need more memory,
      // continue to next cache (don't clear entirely unless absolutely necessary)
    }

    const finalMemory = this.getTotalMemoryMB();

    // Log final state
    logger.info(
      {
        initialMemoryMB: totalMemory.toFixed(2),
        finalMemoryMB: finalMemory.toFixed(2),
        targetMemoryMB: targetMemoryMB.toFixed(2),
        freedMB: totalFreed.toFixed(2),
        totalEntriesEvicted,
        success: finalMemory <= this.config.totalLimitMB,
      },
      'Memory eviction completed'
    );
  }

  /**
   * Start periodic memory monitoring
   */
  private startMonitoring(): void {
    if (this.checkInterval) {
      return; // Already monitoring
    }

    this.checkInterval = setInterval(() => {
      try {
        this.evictIfNeeded();
      } catch (error) {
        logger.error({ error }, 'Error during memory check');
      }
    }, this.config.checkIntervalMs);

    // Don't prevent process exit
    this.checkInterval.unref();

    logger.debug(
      {
        intervalMs: this.config.checkIntervalMs,
        limitMB: this.config.totalLimitMB,
      },
      'Memory monitoring started'
    );
  }

  /**
   * Stop periodic memory monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.debug('Memory monitoring stopped');
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): MemoryCoordinatorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MemoryCoordinatorConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...config };

    logger.info({ oldConfig, newConfig: this.config }, 'Memory coordinator configuration updated');

    // Restart monitoring if interval changed
    if (config.checkIntervalMs && config.checkIntervalMs !== oldConfig.checkIntervalMs) {
      this.stopMonitoring();
      this.startMonitoring();
    }

    // Check if we need immediate eviction with new limits
    this.evictIfNeeded();
  }

  /**
   * Get memory statistics
   */
  getStats() {
    const totalMemory = this.getTotalMemoryMB();
    const breakdown = this.getMemoryBreakdown();

    return {
      totalMemoryMB: totalMemory,
      limitMB: this.config.totalLimitMB,
      utilizationPct: (totalMemory / this.config.totalLimitMB) * 100,
      pressureThreshold: this.config.pressureThreshold,
      isUnderPressure: this.isMemoryPressureHigh(),
      cacheCount: this.caches.size,
      breakdown,
    };
  }
}

// Singleton instance
let coordinator: MemoryCoordinator | null = null;

/**
 * Get the global memory coordinator instance
 */
export function getMemoryCoordinator(): MemoryCoordinator {
  if (!coordinator) {
    coordinator = new MemoryCoordinator({
      totalLimitMB: config.cache.totalLimitMB,
      pressureThreshold: config.cache.pressureThreshold,
      checkIntervalMs: config.memory.checkIntervalMs,
    });
  }
  return coordinator;
}

/**
 * Reset the memory coordinator (useful for testing)
 */
export function resetMemoryCoordinator(): void {
  if (coordinator) {
    coordinator.stopMonitoring();
    coordinator = null;
  }
}
