/**
 * Stats service for cached table counts
 *
 * Provides cached counts for health checks without blocking the SQLite connection.
 * Counts are refreshed in the background on a configurable interval.
 *
 * Uses Runtime.statsCache for storage when Runtime is registered.
 */

import { getSqlite } from '../db/connection.js';
import { getRuntime, isRuntimeRegistered } from '../core/container.js';
import type { TableCounts, StatsCache } from '../core/runtime.js';
import { createComponentLogger } from '../utils/logger.js';

// Re-export types for backward compatibility
export type { TableCounts, StatsCache };

const logger = createComponentLogger('stats');

// Default counts when no data is available
const DEFAULT_COUNTS: TableCounts = {
  organizations: 0,
  projects: 0,
  sessions: 0,
  tools: 0,
  guidelines: 0,
  knowledge: 0,
  tags: 0,
  fileLocks: 0,
  conflicts: 0,
};

// Cache TTL in milliseconds (1 minute)
const CACHE_TTL_MS = 60_000;

/**
 * Get the stats cache from Runtime or return null if not available
 */
function getStatsCache(): StatsCache | null {
  if (!isRuntimeRegistered()) {
    return null;
  }
  return getRuntime().statsCache;
}

/**
 * Single UNION ALL query to get all counts at once
 * Much more efficient than 9 separate queries
 */
const COUNTS_QUERY = `
  SELECT 'organizations' as table_name, COUNT(*) as count FROM organizations
  UNION ALL SELECT 'projects', COUNT(*) FROM projects
  UNION ALL SELECT 'sessions', COUNT(*) FROM sessions
  UNION ALL SELECT 'tools', COUNT(*) FROM tools WHERE is_active = 1
  UNION ALL SELECT 'guidelines', COUNT(*) FROM guidelines WHERE is_active = 1
  UNION ALL SELECT 'knowledge', COUNT(*) FROM knowledge WHERE is_active = 1
  UNION ALL SELECT 'tags', COUNT(*) FROM tags
  UNION ALL SELECT 'file_locks', COUNT(*) FROM file_locks
  UNION ALL SELECT 'conflicts', COUNT(*) FROM conflict_log WHERE resolved = 0
`;

/**
 * Refresh counts from database
 * Uses a single UNION ALL query instead of 9 separate queries
 */
function refreshCounts(): TableCounts {
  try {
    const sqlite = getSqlite();
    const rows = sqlite.prepare(COUNTS_QUERY).all() as Array<{
      table_name: string;
      count: number;
    }>;

    const counts: TableCounts = { ...DEFAULT_COUNTS };

    for (const row of rows) {
      switch (row.table_name) {
        case 'organizations':
          counts.organizations = row.count;
          break;
        case 'projects':
          counts.projects = row.count;
          break;
        case 'sessions':
          counts.sessions = row.count;
          break;
        case 'tools':
          counts.tools = row.count;
          break;
        case 'guidelines':
          counts.guidelines = row.count;
          break;
        case 'knowledge':
          counts.knowledge = row.count;
          break;
        case 'tags':
          counts.tags = row.count;
          break;
        case 'file_locks':
          counts.fileLocks = row.count;
          break;
        case 'conflicts':
          counts.conflicts = row.count;
          break;
      }
    }

    return counts;
  } catch (error) {
    logger.error({ error }, 'Failed to refresh table counts');
    return DEFAULT_COUNTS;
  }
}

/**
 * Check if cache is stale
 */
function isCacheStale(): boolean {
  const cache = getStatsCache();
  if (!cache) return true;
  return Date.now() - cache.lastUpdated > CACHE_TTL_MS;
}

/**
 * Trigger background refresh of counts
 * Non-blocking - returns immediately
 */
function triggerBackgroundRefresh(): void {
  const cache = getStatsCache();
  if (!cache) return;

  if (cache.isRefreshing) {
    return; // Already refreshing
  }

  cache.isRefreshing = true;

  // Use setImmediate to avoid blocking
  setImmediate(() => {
    try {
      const counts = refreshCounts();
      cache.counts = counts;
      cache.lastUpdated = Date.now();
      cache.isRefreshing = false;
    } catch (error) {
      logger.error({ error }, 'Background refresh failed');
      cache.isRefreshing = false;
    }
  });
}

/**
 * Get cached table counts
 *
 * Returns cached counts immediately. If cache is stale, triggers
 * a background refresh but still returns stale data for low latency.
 *
 * @param forceRefresh - If true, performs synchronous refresh (blocking)
 */
export function getCachedStats(forceRefresh = false): TableCounts {
  const cache = getStatsCache();

  if (forceRefresh || !cache || cache.lastUpdated === 0) {
    // First call or forced refresh - do synchronous refresh
    const counts = refreshCounts();
    if (cache) {
      cache.counts = counts;
      cache.lastUpdated = Date.now();
      cache.isRefreshing = false;
    }
    return counts;
  }

  if (isCacheStale()) {
    // Stale cache - trigger background refresh but return stale data
    triggerBackgroundRefresh();
  }

  return cache.counts;
}

/**
 * Get stats with metadata
 */
export function getStatsWithMeta(): {
  counts: TableCounts;
  lastUpdated: number;
  isStale: boolean;
} {
  const counts = getCachedStats();
  const cache = getStatsCache();
  return {
    counts,
    lastUpdated: cache?.lastUpdated ?? Date.now(),
    isStale: isCacheStale(),
  };
}

/**
 * Invalidate the stats cache
 * Called when data changes significantly
 */
export function invalidateStatsCache(): void {
  const cache = getStatsCache();
  if (cache) {
    // Mark as stale by setting lastUpdated to 0
    cache.lastUpdated = 0;
  }
}

/**
 * Get cache status (for debugging/monitoring)
 */
export function getStatsCacheStatus(): {
  hasCache: boolean;
  isStale: boolean;
  isRefreshing: boolean;
  ageMs: number;
} {
  const cache = getStatsCache();
  if (!cache || cache.lastUpdated === 0) {
    return {
      hasCache: cache !== null,
      isStale: true,
      isRefreshing: false,
      ageMs: 0,
    };
  }

  return {
    hasCache: true,
    isStale: isCacheStale(),
    isRefreshing: cache.isRefreshing,
    ageMs: Date.now() - cache.lastUpdated,
  };
}
