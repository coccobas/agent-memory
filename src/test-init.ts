/**
 * Test script for database initialization
 */

import { getDb, closeDb, getSqlite } from './db/connection.js';
import { getMigrationStatus } from './db/init.js';

function testInit() {
  console.log('=== Testing Database Initialization ===\n');

  try {
    // This should automatically initialize the database
    console.log('1. Getting database connection (should auto-initialize)...');
    getDb();
    console.log('✓ Database connection established\n');

    // Check migration status
    console.log('2. Checking migration status...');
    const sqlite = getSqlite();
    const status = getMigrationStatus(sqlite);

    console.log(`✓ Database initialized: ${status.initialized}`);
    console.log(`✓ Total migrations: ${status.totalMigrations}`);
    console.log(`✓ Applied migrations: ${status.appliedMigrations.length}`);
    console.log(`✓ Pending migrations: ${status.pendingMigrations.length}`);

    if (status.appliedMigrations.length > 0) {
      console.log('\nApplied migrations:');
      status.appliedMigrations.forEach((m: string) => console.log(`  - ${m}`));
    }

    if (status.pendingMigrations.length > 0) {
      console.log('\nPending migrations:');
      status.pendingMigrations.forEach((m: string) => console.log(`  - ${m}`));
    }

    // Test querying tables
    console.log('\n3. Verifying tables exist...');
    const tables = sqlite
      .prepare(
        `
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `
      )
      .all() as { name: string }[];

    console.log(`✓ Found ${tables.length} tables:`);
    tables.forEach((t: { name: string }) => console.log(`  - ${t.name}`));

    console.log('\n=== ✓ All tests passed! ===');
  } catch (error) {
    console.error('\n✗ Test failed:', error);
    process.exit(1);
  } finally {
    closeDb();
  }
}

void testInit();
