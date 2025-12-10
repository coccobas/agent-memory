/**
 * Direct test of memory_health tool
 * Run with: npx tsx test-health.ts
 */

import { getDb, getSqlite } from './src/db/connection.js';
import { getQueryCacheStats } from './src/services/query.service.js';

// Initialize database
getDb();

// Replicate the memory_health handler logic
const sqlite = getSqlite();
const cacheStats = getQueryCacheStats();

const stats: {
  serverVersion: string;
  status: string;
  database: {
    type: string;
    inMemory: boolean;
    walEnabled: boolean;
    error?: string;
  };
  cache: ReturnType<typeof getQueryCacheStats>;
  tables: Record<string, number>;
} = {
  serverVersion: '0.2.0',
  status: 'healthy',
  database: {
    type: 'SQLite',
    inMemory: false,
    walEnabled: true,
  },
  cache: cacheStats,
  tables: {},
};

// Count entries in each table
try {
  stats.tables = {
    organizations: (sqlite.prepare('SELECT COUNT(*) as count FROM organizations').get() as { count: number }).count,
    projects: (sqlite.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number }).count,
    sessions: (sqlite.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number }).count,
    tools: (sqlite.prepare('SELECT COUNT(*) as count FROM tools WHERE is_active = 1').get() as { count: number }).count,
    guidelines: (sqlite.prepare('SELECT COUNT(*) as count FROM guidelines WHERE is_active = 1').get() as { count: number }).count,
    knowledge: (sqlite.prepare('SELECT COUNT(*) as count FROM knowledge WHERE is_active = 1').get() as { count: number }).count,
    tags: (sqlite.prepare('SELECT COUNT(*) as count FROM tags').get() as { count: number }).count,
    fileLocks: (sqlite.prepare('SELECT COUNT(*) as count FROM file_locks').get() as { count: number }).count,
    conflicts: (sqlite.prepare('SELECT COUNT(*) as count FROM conflict_log WHERE resolved = 0').get() as { count: number }).count,
  };
} catch (error) {
  stats.status = 'error';
  stats.database.error = error instanceof Error ? error.message : 'Unknown error';
}

console.log('Memory Health Check Results:\n');
console.log(JSON.stringify(stats, null, 2));


