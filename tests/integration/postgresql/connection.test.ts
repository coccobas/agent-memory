/**
 * PostgreSQL Connection Tests
 *
 * Tests PostgreSQL adapter connection, health checks, and pool management.
 * Requires PostgreSQL to be running (see docker-compose.yml).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import {
  setupPostgresTests,
  teardownPostgresTests,
  isPostgresAvailable,
  PG_TEST_CONFIG,
} from '../../fixtures/test-helpers.pg.js';
import { PostgreSQLStorageAdapter } from '../../../src/core/adapters/postgresql.adapter.js';

describe('PostgreSQL Connection', () => {
  let pool: Pool | null = null;
  let isAvailable = false;

  beforeAll(async () => {
    isAvailable = await isPostgresAvailable();
    if (isAvailable) {
      pool = await setupPostgresTests();
    }
  });

  afterAll(async () => {
    await teardownPostgresTests(pool);
  });

  describe('when PostgreSQL is available', () => {
    it('should connect successfully', async () => {
      if (!isAvailable) {
        console.log('Skipping: PostgreSQL not available');
        return;
      }

      const adapter = new PostgreSQLStorageAdapter({
        host: PG_TEST_CONFIG.host!,
        port: PG_TEST_CONFIG.port!,
        database: PG_TEST_CONFIG.database!,
        user: PG_TEST_CONFIG.user!,
        password: PG_TEST_CONFIG.password as string,
        ssl: false,
        poolMin: 1,
        poolMax: 5,
        idleTimeoutMs: 30000,
        connectionTimeoutMs: 5000,
        statementTimeoutMs: 30000,
      });

      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);

      await adapter.close();
      expect(adapter.isConnected()).toBe(false);
    });

    it('should perform health checks', async () => {
      if (!isAvailable) {
        console.log('Skipping: PostgreSQL not available');
        return;
      }

      const adapter = new PostgreSQLStorageAdapter({
        host: PG_TEST_CONFIG.host!,
        port: PG_TEST_CONFIG.port!,
        database: PG_TEST_CONFIG.database!,
        user: PG_TEST_CONFIG.user!,
        password: PG_TEST_CONFIG.password as string,
        ssl: false,
        poolMin: 1,
        poolMax: 5,
        idleTimeoutMs: 30000,
        connectionTimeoutMs: 5000,
        statementTimeoutMs: 30000,
      });

      await adapter.connect();

      const health = await adapter.healthCheck();
      expect(health.ok).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);

      await adapter.close();
    });

    it('should execute raw queries', async () => {
      if (!isAvailable) {
        console.log('Skipping: PostgreSQL not available');
        return;
      }

      const adapter = new PostgreSQLStorageAdapter({
        host: PG_TEST_CONFIG.host!,
        port: PG_TEST_CONFIG.port!,
        database: PG_TEST_CONFIG.database!,
        user: PG_TEST_CONFIG.user!,
        password: PG_TEST_CONFIG.password as string,
        ssl: false,
        poolMin: 1,
        poolMax: 5,
        idleTimeoutMs: 30000,
        connectionTimeoutMs: 5000,
        statementTimeoutMs: 30000,
      });

      await adapter.connect();

      const results = await adapter.executeRaw<{ result: number }>('SELECT 1 + 1 as result');
      expect(results).toHaveLength(1);
      expect(results[0].result).toBe(2);

      await adapter.close();
    });

    it('should handle transactions', async () => {
      if (!isAvailable) {
        console.log('Skipping: PostgreSQL not available');
        return;
      }

      const adapter = new PostgreSQLStorageAdapter({
        host: PG_TEST_CONFIG.host!,
        port: PG_TEST_CONFIG.port!,
        database: PG_TEST_CONFIG.database!,
        user: PG_TEST_CONFIG.user!,
        password: PG_TEST_CONFIG.password as string,
        ssl: false,
        poolMin: 1,
        poolMax: 5,
        idleTimeoutMs: 30000,
        connectionTimeoutMs: 5000,
        statementTimeoutMs: 30000,
      });

      await adapter.connect();

      // Transaction should rollback on error
      let errorThrown = false;
      try {
        await adapter.transaction(async () => {
          await adapter.executeRaw(
            "INSERT INTO organizations (id, name) VALUES ('test-org', 'Test Org')"
          );
          throw new Error('Intentional rollback');
        });
      } catch (e) {
        errorThrown = true;
      }

      expect(errorThrown).toBe(true);

      // The insert should have been rolled back
      const results = await adapter.executeRaw<{ id: string }>(
        "SELECT id FROM organizations WHERE id = 'test-org'"
      );
      expect(results).toHaveLength(0);

      await adapter.close();
    });

    it('should report pool statistics', async () => {
      if (!isAvailable) {
        console.log('Skipping: PostgreSQL not available');
        return;
      }

      const adapter = new PostgreSQLStorageAdapter({
        host: PG_TEST_CONFIG.host!,
        port: PG_TEST_CONFIG.port!,
        database: PG_TEST_CONFIG.database!,
        user: PG_TEST_CONFIG.user!,
        password: PG_TEST_CONFIG.password as string,
        ssl: false,
        poolMin: 1,
        poolMax: 5,
        idleTimeoutMs: 30000,
        connectionTimeoutMs: 5000,
        statementTimeoutMs: 30000,
      });

      await adapter.connect();

      const stats = adapter.getPoolStats();
      expect(stats.totalCount).toBeGreaterThanOrEqual(0);
      expect(stats.idleCount).toBeGreaterThanOrEqual(0);
      expect(stats.waitingCount).toBeGreaterThanOrEqual(0);

      await adapter.close();
    });
  });

  describe('when PostgreSQL is not available', () => {
    it('should fail health check when not connected', async () => {
      const adapter = new PostgreSQLStorageAdapter({
        host: 'nonexistent-host',
        port: 5432,
        database: 'test',
        user: 'test',
        password: 'test',
        ssl: false,
        poolMin: 1,
        poolMax: 2,
        idleTimeoutMs: 1000,
        connectionTimeoutMs: 1000,
        statementTimeoutMs: 1000,
      });

      // Without connecting, health check should fail
      const health = await adapter.healthCheck();
      expect(health.ok).toBe(false);
    });
  });
});
