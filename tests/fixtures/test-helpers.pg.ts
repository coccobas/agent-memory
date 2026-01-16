/**
 * PostgreSQL Test Helpers
 *
 * Utilities for PostgreSQL integration tests.
 * Provides connection management, migration running, and test isolation.
 */

import { Pool, PoolConfig } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Default test database configuration.
 * Matches docker-compose.yml settings.
 */
export const PG_TEST_CONFIG: PoolConfig = {
  host: process.env.AGENT_MEMORY_PG_HOST || 'localhost',
  port: parseInt(process.env.AGENT_MEMORY_PG_PORT || '5433', 10),
  database: process.env.AGENT_MEMORY_PG_DATABASE || 'agent_memory_test',
  user: process.env.AGENT_MEMORY_PG_USER || 'test',
  password: process.env.AGENT_MEMORY_PG_PASSWORD || 'test',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

/**
 * Create a test database pool.
 */
export function createTestPool(config: PoolConfig = PG_TEST_CONFIG): Pool {
  return new Pool(config);
}

/**
 * Check if PostgreSQL is available for testing.
 */
export async function isPostgresAvailable(config: PoolConfig = PG_TEST_CONFIG): Promise<boolean> {
  const pool = new Pool({ ...config, connectionTimeoutMillis: 2000 });
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    await pool.end();
    return true;
  } catch {
    await pool.end().catch(() => {});
    return false;
  }
}

/**
 * Run all PostgreSQL migrations in order.
 */
export async function runMigrations(pool: Pool): Promise<void> {
  const migrationsDir = join(__dirname, '../../src/db/migrations/postgresql');

  // Get all migration files sorted by name
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    try {
      await pool.query(sql);
    } catch (error) {
      // Skip pgvector migration if extension is not available
      if (
        file.includes('pgvector') &&
        error instanceof Error &&
        error.message.includes('extension "vector" is not available')
      ) {
        console.log(`Skipping ${file}: pgvector extension not available`);
        continue;
      }
      throw error;
    }
  }
}

/**
 * Reset the test database (drop and recreate all tables).
 */
export async function resetDatabase(pool: Pool): Promise<void> {
  // Drop all tables in reverse dependency order
  await pool.query(`
    DROP TABLE IF EXISTS _vector_meta CASCADE;
    DROP TABLE IF EXISTS vector_embeddings CASCADE;
    DROP TABLE IF EXISTS verification_log CASCADE;
    DROP TABLE IF EXISTS session_guideline_acknowledgments CASCADE;
    DROP TABLE IF EXISTS conversation_context CASCADE;
    DROP TABLE IF EXISTS conversation_messages CASCADE;
    DROP TABLE IF EXISTS conversations CASCADE;
    DROP TABLE IF EXISTS agent_votes CASCADE;
    DROP TABLE IF EXISTS audit_log CASCADE;
    DROP TABLE IF EXISTS permissions CASCADE;
    DROP TABLE IF EXISTS entry_embeddings CASCADE;
    DROP TABLE IF EXISTS file_locks CASCADE;
    DROP TABLE IF EXISTS conflict_log CASCADE;
    DROP TABLE IF EXISTS entry_relations CASCADE;
    DROP TABLE IF EXISTS entry_tags CASCADE;
    DROP TABLE IF EXISTS tags CASCADE;
    DROP TABLE IF EXISTS knowledge_versions CASCADE;
    DROP TABLE IF EXISTS knowledge CASCADE;
    DROP TABLE IF EXISTS guideline_versions CASCADE;
    DROP TABLE IF EXISTS guidelines CASCADE;
    DROP TABLE IF EXISTS tool_versions CASCADE;
    DROP TABLE IF EXISTS tools CASCADE;
    DROP TABLE IF EXISTS sessions CASCADE;
    DROP TABLE IF EXISTS projects CASCADE;
    DROP TABLE IF EXISTS organizations CASCADE;
  `);

  // Run migrations to recreate
  await runMigrations(pool);
}

/**
 * Wrap a test in a transaction that gets rolled back.
 * Provides test isolation without needing to reset the entire database.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: import('pg').PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('ROLLBACK');
    return result;
  } finally {
    client.release();
  }
}

/**
 * Helper to skip tests when PostgreSQL is not available.
 */
export function describeIfPostgres(name: string, fn: () => void): void {
  const isAvailable = process.env.POSTGRES_AVAILABLE === 'true';
  if (isAvailable) {
    describe(name, fn);
  } else {
    describe.skip(`${name} (PostgreSQL not available)`, fn);
  }
}

/**
 * Setup hook for PostgreSQL test suites.
 * Call this in beforeAll to check availability and run migrations.
 */
export async function setupPostgresTests(): Promise<Pool | null> {
  const available = await isPostgresAvailable();
  if (!available) {
    console.log('PostgreSQL not available, skipping PostgreSQL tests');
    return null;
  }

  const pool = createTestPool();
  await resetDatabase(pool);
  return pool;
}

/**
 * Teardown hook for PostgreSQL test suites.
 */
export async function teardownPostgresTests(pool: Pool | null): Promise<void> {
  if (pool) {
    await pool.end();
  }
}
