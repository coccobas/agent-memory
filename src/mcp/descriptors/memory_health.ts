/**
 * memory_health tool descriptor
 *
 * This is a SimpleToolDescriptor - no actions, just a single handler.
 */

import type { SimpleToolDescriptor } from './types.js';
import { getQueryCacheStats } from '../../services/query.service.js';
import { getCachedStats, getStatsCacheStatus } from '../../services/stats.service.js';
import { VERSION } from '../../version.js';

export const memoryHealthDescriptor: SimpleToolDescriptor = {
  name: 'memory_health',
  description: `Check server health and database status. Returns version, database stats, and cache info.

Use this to verify the memory server is working or to get entry counts.`,
  params: {},
  handler: () => {
    const queryCacheStats = getQueryCacheStats();
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
      tables: tableCounts,
    };
  },
};
