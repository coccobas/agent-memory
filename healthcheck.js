#!/usr/bin/env node
/**
 * Health check script for Agent Memory MCP server
 * Checks if the database is accessible and the process is responsive
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';

const dbPath = process.env.AGENT_MEMORY_DB_PATH || '/data/memory.db';

try {
  // Check if database file exists
  if (!existsSync(dbPath)) {
    console.error(`Database file not found at ${dbPath}`);
    process.exit(1);
  }

  // Try to open database and run a simple query
  const db = new Database(dbPath, { readonly: true });

  // Verify database is accessible
  db.prepare('SELECT 1').get();

  // Check if database has been initialized (has tables)
  const tableCount = db
    .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'")
    .get();

  if (tableCount.count === 0) {
    console.error('Database exists but is not initialized');
    db.close();
    process.exit(1);
  }

  db.close();
  console.log('Health check passed: Database is accessible and initialized');
  process.exit(0);
} catch (error) {
  console.error('Health check failed:', error.message);
  process.exit(1);
}
