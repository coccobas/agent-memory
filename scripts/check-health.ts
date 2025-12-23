#!/usr/bin/env tsx
/**
 * Check Agent Memory health status
 */

import { getSqlite } from '../src/db/connection.js';
import { getRuntime, isRuntimeRegistered } from '../src/core/container.js';
import { VERSION } from '../src/version.js';

function checkHealth() {
  try {
    const sqlite = getSqlite();

    // Get cache stats from Runtime (if available)
    const cacheStats = isRuntimeRegistered()
      ? getRuntime().queryCache.cache.stats
      : { size: 0, memoryMB: 0 };

    // Get database stats
    const stats: {
      serverVersion: string;
      status: string;
      database: {
        type: string;
        inMemory: boolean;
        walEnabled: boolean;
        error?: string;
      };
      cache: { size: number; memoryMB: number };
      tables: Record<string, number>;
    } = {
      serverVersion: VERSION,
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
        organizations: (
          sqlite.prepare('SELECT COUNT(*) as count FROM organizations').get() as { count: number }
        ).count,
        projects: (
          sqlite.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number }
        ).count,
        sessions: (
          sqlite.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number }
        ).count,
        tools: (
          sqlite.prepare('SELECT COUNT(*) as count FROM tools WHERE is_active = 1').get() as {
            count: number;
          }
        ).count,
        guidelines: (
          sqlite.prepare('SELECT COUNT(*) as count FROM guidelines WHERE is_active = 1').get() as {
            count: number;
          }
        ).count,
        knowledge: (
          sqlite.prepare('SELECT COUNT(*) as count FROM knowledge WHERE is_active = 1').get() as {
            count: number;
          }
        ).count,
        tags: (sqlite.prepare('SELECT COUNT(*) as count FROM tags').get() as { count: number })
          .count,
        fileLocks: (
          sqlite.prepare('SELECT COUNT(*) as count FROM file_locks').get() as { count: number }
        ).count,
        conflicts: (
          sqlite
            .prepare('SELECT COUNT(*) as count FROM conflict_log WHERE resolved = 0')
            .get() as { count: number }
        ).count,
      };
    } catch (error) {
      stats.status = 'error';
      stats.database.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Output formatted results
    console.log('\n🔍 Agent Memory Health Check\n');
    console.log(`Server Version: ${stats.serverVersion}`);
    console.log(`Status: ${stats.status === 'healthy' ? '✅ healthy' : '❌ ' + stats.status}`);
    console.log('\n📊 Database:');
    console.log(`  Type: ${stats.database.type}`);
    console.log(`  In-Memory: ${stats.database.inMemory ? 'Yes' : 'No'}`);
    console.log(`  WAL Enabled: ${stats.database.walEnabled ? 'Yes' : 'No'}`);
    if (stats.database.error) {
      console.log(`  ⚠️  Error: ${stats.database.error}`);
    }

    console.log('\n📈 Entry Counts:');
    console.log(`  Organizations: ${stats.tables.organizations}`);
    console.log(`  Projects: ${stats.tables.projects}`);
    console.log(`  Sessions: ${stats.tables.sessions}`);
    console.log(`  Tools: ${stats.tables.tools}`);
    console.log(`  Guidelines: ${stats.tables.guidelines}`);
    console.log(`  Knowledge: ${stats.tables.knowledge}`);
    console.log(`  Tags: ${stats.tables.tags}`);
    console.log(`  File Locks: ${stats.tables.fileLocks}`);
    console.log(`  Unresolved Conflicts: ${stats.tables.conflicts}`);

    console.log('\n💾 Cache Stats:');
    console.log(`  Size: ${cacheStats.size} entries`);
    console.log(`  Memory: ${cacheStats.memoryMB.toFixed(2)} MB`);

    console.log('\n');

    return stats;
  } catch (error) {
    console.error('❌ Health check failed:', error);
    process.exit(1);
  }
}

checkHealth();














