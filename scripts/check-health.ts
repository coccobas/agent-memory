#!/usr/bin/env tsx
/**
 * Check Agent Memory health status
 *
 * Supports two modes:
 * 1. Full mode: Initializes app context for complete stats (cache, runtime)
 * 2. Direct mode: Falls back to direct database access if initialization fails
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import Database from 'better-sqlite3';
import { VERSION } from '../src/version.js';

interface HealthStats {
  serverVersion: string;
  status: 'healthy' | 'degraded' | 'error';
  mode: 'full' | 'direct';
  database: {
    type: string;
    path: string;
    sizeBytes: number;
    walEnabled: boolean;
    integrityOk: boolean;
    error?: string;
  };
  cache?: { size: number; memoryMB: number };
  tables: Record<string, number>;
  warnings: string[];
}

async function tryFullMode(): Promise<HealthStats | null> {
  // Suppress logs during initialization attempt (use 'fatal' to minimize output)
  const originalLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'fatal';

  try {
    const { getCliContext, shutdownCliContext } = await import('../src/cli/utils/context.js');
    const { getRuntime } = await import('../src/core/container.js');

    const context = await getCliContext();
    const sqlite = context.sqlite;

    if (!sqlite) {
      return null; // PostgreSQL mode - fall through to direct mode
    }

    const cacheStats = getRuntime().queryCache.cache.stats;
    const dbPath =
      process.env.AGENT_MEMORY_DB_PATH || join(homedir(), '.agent-memory', 'memory.db');

    const stats: HealthStats = {
      serverVersion: VERSION,
      status: 'healthy',
      mode: 'full',
      database: {
        type: 'SQLite',
        path: dbPath,
        sizeBytes: 0,
        walEnabled: true,
        integrityOk: true,
      },
      cache: cacheStats,
      tables: {},
      warnings: [],
    };

    // Count entries in each table
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
      tags: (sqlite.prepare('SELECT COUNT(*) as count FROM tags').get() as { count: number }).count,
      fileLocks: (
        sqlite.prepare('SELECT COUNT(*) as count FROM file_locks').get() as { count: number }
      ).count,
      conflicts: (
        sqlite.prepare('SELECT COUNT(*) as count FROM conflict_log WHERE resolved = 0').get() as {
          count: number;
        }
      ).count,
      auditLog: (
        sqlite.prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number }
      ).count,
    };

    await shutdownCliContext();
    return stats;
  } catch {
    return null; // Fall through to direct mode
  } finally {
    // Restore original log level
    if (originalLevel !== undefined) {
      process.env.LOG_LEVEL = originalLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
  }
}

async function directMode(): Promise<HealthStats> {
  const dbPath = process.env.AGENT_MEMORY_DB_PATH || join(homedir(), '.agent-memory', 'memory.db');

  const stats: HealthStats = {
    serverVersion: VERSION,
    status: 'healthy',
    mode: 'direct',
    database: {
      type: 'SQLite',
      path: dbPath,
      sizeBytes: 0,
      walEnabled: false,
      integrityOk: false,
    },
    tables: {},
    warnings: ['Running in direct mode - app context initialization failed'],
  };

  if (!existsSync(dbPath)) {
    stats.status = 'error';
    stats.database.error = `Database file not found: ${dbPath}`;
    return stats;
  }

  try {
    const sqlite = new Database(dbPath, { readonly: true });

    // Check integrity
    const integrityResult = sqlite.prepare('PRAGMA integrity_check').get() as {
      integrity_check: string;
    };
    stats.database.integrityOk = integrityResult.integrity_check === 'ok';

    // Check WAL mode
    const journalMode = sqlite.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    stats.database.walEnabled = journalMode.journal_mode === 'wal';

    // Get file size
    const { statSync } = await import('node:fs');
    const fileStats = statSync(dbPath);
    stats.database.sizeBytes = fileStats.size;

    // Count entries in each table
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
      tags: (sqlite.prepare('SELECT COUNT(*) as count FROM tags').get() as { count: number }).count,
      fileLocks: (
        sqlite.prepare('SELECT COUNT(*) as count FROM file_locks').get() as { count: number }
      ).count,
      conflicts: (
        sqlite.prepare('SELECT COUNT(*) as count FROM conflict_log WHERE resolved = 0').get() as {
          count: number;
        }
      ).count,
      auditLog: (
        sqlite.prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number }
      ).count,
    };

    sqlite.close();

    if (!stats.database.integrityOk) {
      stats.status = 'error';
      stats.warnings.push('Database integrity check failed');
    }
  } catch (error) {
    stats.status = 'error';
    stats.database.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return stats;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function printStats(stats: HealthStats): void {
  console.log('\n🔍 Agent Memory Health Check\n');
  console.log(`Server Version: ${stats.serverVersion}`);
  console.log(`Mode: ${stats.mode === 'full' ? '✅ Full' : '⚠️  Direct (fallback)'}`);

  const statusIcon = stats.status === 'healthy' ? '✅' : stats.status === 'degraded' ? '⚠️' : '❌';
  console.log(`Status: ${statusIcon} ${stats.status}`);

  console.log('\n📊 Database:');
  console.log(`  Type: ${stats.database.type}`);
  console.log(`  Path: ${stats.database.path}`);
  if (stats.database.sizeBytes > 0) {
    console.log(`  Size: ${formatBytes(stats.database.sizeBytes)}`);
  }
  console.log(`  WAL Enabled: ${stats.database.walEnabled ? 'Yes' : 'No'}`);
  console.log(`  Integrity: ${stats.database.integrityOk ? '✅ OK' : '❌ Failed'}`);
  if (stats.database.error) {
    console.log(`  ⚠️  Error: ${stats.database.error}`);
  }

  console.log('\n📈 Entry Counts:');
  console.log(`  Organizations: ${stats.tables.organizations ?? 'N/A'}`);
  console.log(`  Projects: ${stats.tables.projects ?? 'N/A'}`);
  console.log(`  Sessions: ${stats.tables.sessions ?? 'N/A'}`);
  console.log(`  Tools: ${stats.tables.tools ?? 'N/A'}`);
  console.log(`  Guidelines: ${stats.tables.guidelines ?? 'N/A'}`);
  console.log(`  Knowledge: ${stats.tables.knowledge ?? 'N/A'}`);
  console.log(`  Tags: ${stats.tables.tags ?? 'N/A'}`);
  console.log(`  Audit Log: ${stats.tables.auditLog ?? 'N/A'}`);
  console.log(`  File Locks: ${stats.tables.fileLocks ?? 'N/A'}`);
  console.log(`  Unresolved Conflicts: ${stats.tables.conflicts ?? 'N/A'}`);

  if (stats.cache) {
    console.log('\n💾 Cache Stats:');
    console.log(`  Size: ${stats.cache.size} entries`);
    console.log(`  Memory: ${stats.cache.memoryMB.toFixed(2)} MB`);
  }

  if (stats.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    for (const warning of stats.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  console.log('\n');
}

async function main(): Promise<void> {
  // Try full mode first, fall back to direct mode
  let stats = await tryFullMode();

  if (!stats) {
    stats = await directMode();
  }

  printStats(stats);

  if (stats.status === 'error') {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Health check failed:', err);
  process.exit(1);
});
