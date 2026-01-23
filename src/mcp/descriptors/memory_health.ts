/**
 * memory_health tool descriptor
 *
 * This is a SimpleToolDescriptor - no actions, just a single handler.
 * Context-aware handler that receives AppContext for dependency injection.
 *
 * Enhanced with:
 * - Circuit breaker states
 * - Dead letter queue stats
 * - Backpressure monitoring
 * - Memory pressure detection
 * - Connection pool stats (PostgreSQL)
 */

import type { SimpleToolDescriptor } from './types.js';
import { getRuntime, isRuntimeRegistered } from '../../core/container.js';
import { getCachedStats, getStatsCacheStatus } from '../../services/stats.service.js';
import { getEmbeddingQueueStats } from '../../db/repositories/embedding-hooks.js';
import { getBackupSchedulerStatus } from '../../services/backup-scheduler.service.js';
import { VERSION } from '../../version.js';
import { getAllCircuitBreakerStats } from '../../utils/circuit-breaker.js';
import { getEmbeddingDLQ, getVectorDLQ } from '../../utils/dead-letter-queue.js';
import { backpressure } from '../../utils/backpressure.js';
import { config } from '../../config/index.js';

export const memoryHealthDescriptor: SimpleToolDescriptor = {
  name: 'memory_health',
  visibility: 'system',
  description: `Check server health and database status. Returns version, database stats, and cache info.

Use this to verify the memory server is working or to get entry counts.`,
  params: {},
  contextHandler: (_ctx) => {
    // Get cache stats from Runtime (if available)
    const queryCacheStats = isRuntimeRegistered()
      ? getRuntime().queryCache.cache.stats
      : { size: 0, memoryMB: 0 };
    const tableCounts = getCachedStats();
    const statsCacheStatus = getStatsCacheStatus();

    // Get circuit breaker stats
    const circuitBreakers = getAllCircuitBreakerStats();
    const openCircuits = Object.entries(circuitBreakers)
      .filter(([, stats]) => stats.state === 'OPEN')
      .map(([name]) => name);

    // Get DLQ stats
    const embeddingDLQStats = getEmbeddingDLQ().getStats();
    const vectorDLQStats = getVectorDLQ().getStats();

    // Get backpressure stats
    const backpressureStats = backpressure.getStats();

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const warnings: string[] = [];

    // Check for degraded conditions
    if (openCircuits.length > 0) {
      status = 'degraded';
      warnings.push(`Circuit breakers open: ${openCircuits.join(', ')}`);
    }

    if (embeddingDLQStats.exhausted > 0 || vectorDLQStats.exhausted > 0) {
      status = 'degraded';
      warnings.push(
        `DLQ exhausted entries: ${embeddingDLQStats.exhausted + vectorDLQStats.exhausted}`
      );
    }

    if (backpressureStats.memoryPressure.underPressure) {
      status = 'degraded';
      warnings.push(`Memory pressure: ${backpressureStats.memoryPressure.utilizationPercent}%`);
    }

    return {
      serverVersion: VERSION,
      status,
      warnings: warnings.length > 0 ? warnings : undefined,
      database: {
        type: config.dbType === 'postgresql' ? 'PostgreSQL' : 'SQLite',
        path: config.dbType === 'sqlite' ? config.database.path : undefined,
        inMemory: false,
        walEnabled: config.dbType === 'sqlite',
      },
      cache: {
        ...queryCacheStats,
        tableCountsAge: statsCacheStatus.ageMs,
        tableCountsStale: statsCacheStatus.isStale,
      },
      embeddingQueue: getEmbeddingQueueStats(),
      backupScheduler: getBackupSchedulerStatus(),
      tables: tableCounts,

      // Enhanced monitoring
      circuitBreakers: {
        total: Object.keys(circuitBreakers).length,
        open: openCircuits.length,
        details: Object.entries(circuitBreakers).map(([name, stats]) => ({
          name,
          state: stats.state,
          failures: stats.failures,
          totalCalls: stats.totalCalls,
        })),
      },
      deadLetterQueues: {
        embedding: {
          total: embeddingDLQStats.total,
          exhausted: embeddingDLQStats.exhausted,
          avgAttempts: Math.round(embeddingDLQStats.avgAttempts * 10) / 10,
        },
        vector: {
          total: vectorDLQStats.total,
          exhausted: vectorDLQStats.exhausted,
          avgAttempts: Math.round(vectorDLQStats.avgAttempts * 10) / 10,
        },
      },
      resources: {
        memory: backpressureStats.memoryPressure,
        hasBackpressure: backpressure.hasBackpressure(),
      },
    };
  },
};
