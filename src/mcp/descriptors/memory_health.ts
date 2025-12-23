/**
 * memory_health tool descriptor
 *
 * This is a SimpleToolDescriptor - no actions, just a single handler.
 * Context-aware handler that receives AppContext for dependency injection.
 */

import type { SimpleToolDescriptor } from './types.js';
import { getRuntime, isRuntimeRegistered } from '../../core/container.js';
import { getCachedStats, getStatsCacheStatus } from '../../services/stats.service.js';
import { getEmbeddingQueueStats } from '../../db/repositories/embedding-hooks.js';
import { getBackupSchedulerStatus } from '../../services/backup-scheduler.service.js';
import { VERSION } from '../../version.js';

export const memoryHealthDescriptor: SimpleToolDescriptor = {
  name: 'memory_health',
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

    return {
      serverVersion: VERSION,
      status: 'healthy',
      database: {
        type: 'SQLite',
        inMemory: false,
        walEnabled: true,
      },
      cache: {
        ...queryCacheStats,
        tableCountsAge: statsCacheStatus.ageMs,
        tableCountsStale: statsCacheStatus.isStale,
      },
      embeddingQueue: getEmbeddingQueueStats(),
      backupScheduler: getBackupSchedulerStatus(),
      tables: tableCounts,
    };
  },
};
