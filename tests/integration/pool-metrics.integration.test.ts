/**
 * Integration tests for database connection pool metrics
 *
 * Tests pool metrics with actual database adapters to ensure
 * accurate monitoring in production scenarios.
 *
 * Note: These tests require a PostgreSQL database to be running.
 * They are skipped if PostgreSQL is not available (SQLite mode).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  metrics,
  recordPoolMetrics,
  createPoolMetricsRecorder,
  dbPoolSizeGauge,
  dbPoolAvailableGauge,
  dbPoolWaitingGauge,
  dbPoolIdleGauge,
  dbPoolMaxGauge,
} from '../../src/utils/metrics.js';
import { PostgreSQLStorageAdapter } from '../../src/core/adapters/postgresql.adapter.js';
import type { Config } from '../../src/config/index.js';

// Test configuration for PostgreSQL
const testConfig: Config['postgresql'] = {
  host: process.env.AGENT_MEMORY_PG_HOST || 'localhost',
  port: parseInt(process.env.AGENT_MEMORY_PG_PORT || '5432', 10),
  database: process.env.AGENT_MEMORY_PG_DATABASE || 'agent_memory_test',
  user: process.env.AGENT_MEMORY_PG_USER || 'postgres',
  password: process.env.AGENT_MEMORY_PG_PASSWORD || 'postgres',
  ssl: process.env.AGENT_MEMORY_PG_SSL === 'true',
  sslRejectUnauthorized: process.env.AGENT_MEMORY_PG_SSL_REJECT_UNAUTHORIZED !== 'false',
  poolMin: 2,
  poolMax: 10,
  idleTimeoutMs: 30000,
  connectionTimeoutMs: 5000,
  statementTimeoutMs: 30000,
};

// Check if PostgreSQL is available
const isPostgreSQLAvailable = process.env.AGENT_MEMORY_DB_TYPE === 'postgresql';

describe.skipIf(!isPostgreSQLAvailable)('Pool Metrics Integration', () => {
  let adapter: PostgreSQLStorageAdapter;

  beforeEach(async () => {
    metrics.reset();
    adapter = new PostgreSQLStorageAdapter(testConfig);
    try {
      await adapter.connect();
    } catch (error) {
      console.warn('PostgreSQL not available, skipping pool metrics integration tests');
      throw error;
    }
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.close();
    }
  });

  describe('PostgreSQL Adapter Pool Stats', () => {
    it('should get pool statistics from adapter', () => {
      const stats = adapter.getPoolStats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('totalCount');
      expect(stats).toHaveProperty('idleCount');
      expect(stats).toHaveProperty('waitingCount');
      expect(typeof stats.totalCount).toBe('number');
      expect(typeof stats.idleCount).toBe('number');
      expect(typeof stats.waitingCount).toBe('number');
    });

    it('should have connections in pool after connection', () => {
      const stats = adapter.getPoolStats();

      // After connection, should have at least minimum pool size
      expect(stats.totalCount).toBeGreaterThanOrEqual(testConfig.poolMin);
      expect(stats.totalCount).toBeLessThanOrEqual(testConfig.poolMax);
    });

    it('should track idle connections', () => {
      const stats = adapter.getPoolStats();

      // Initially, all connections should be idle
      expect(stats.idleCount).toBeGreaterThan(0);
      expect(stats.idleCount).toBeLessThanOrEqual(stats.totalCount);
    });

    it('should show no waiting requests initially', () => {
      const stats = adapter.getPoolStats();

      // No queries running, so no waiting requests
      expect(stats.waitingCount).toBe(0);
    });

    it('should update stats after query execution', async () => {
      // Get initial stats
      const initialStats = adapter.getPoolStats();

      // Execute a query
      const result = await adapter.executeRaw<{ result: number }>('SELECT 1 as result');
      expect(result[0].result).toBe(1);

      // Get updated stats
      const afterStats = adapter.getPoolStats();

      // Stats should still be valid
      expect(afterStats.totalCount).toBeGreaterThan(0);
      expect(afterStats.idleCount).toBeGreaterThanOrEqual(0);
      expect(afterStats.waitingCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle concurrent queries', async () => {
      // Execute multiple concurrent queries
      const queries = Array.from({ length: 5 }, (_, i) =>
        adapter.executeRaw<{ result: number }>(`SELECT ${i + 1} as result`)
      );

      const results = await Promise.all(queries);

      // Verify all queries completed
      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result[0].result).toBe(i + 1);
      });

      // Pool should still be healthy
      const stats = adapter.getPoolStats();
      expect(stats.totalCount).toBeGreaterThan(0);
      expect(stats.idleCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Recording Pool Metrics', () => {
    it('should record metrics from PostgreSQL adapter', () => {
      const stats = adapter.getPoolStats();

      recordPoolMetrics(stats, { maxConnections: testConfig.poolMax });

      // Verify metrics were recorded
      expect(dbPoolSizeGauge.get()).toBe(stats.totalCount);
      expect(dbPoolIdleGauge.get()).toBe(stats.idleCount);
      expect(dbPoolWaitingGauge.get()).toBe(stats.waitingCount);
      expect(dbPoolAvailableGauge.get()).toBe(stats.idleCount);
      expect(dbPoolMaxGauge.get()).toBe(testConfig.poolMax);
    });

    it('should record metrics after query execution', async () => {
      // Execute a query
      await adapter.executeRaw('SELECT 1');

      const stats = adapter.getPoolStats();
      recordPoolMetrics(stats, { maxConnections: testConfig.poolMax });

      // Metrics should reflect actual pool state
      expect(dbPoolSizeGauge.get()).toBeGreaterThan(0);
      expect(dbPoolIdleGauge.get()).toBeGreaterThanOrEqual(0);
    });

    it('should reflect pool growth under load', async () => {
      // Initial stats
      const initialStats = adapter.getPoolStats();
      const initialTotal = initialStats.totalCount;

      // Create load that might trigger pool growth
      const heavyQueries = Array.from({ length: 8 }, (_, i) =>
        adapter.executeRaw(`SELECT pg_sleep(0.1), ${i} as result`)
      );

      // Get stats while queries are running (without waiting)
      const duringStats = adapter.getPoolStats();

      // Wait for queries to complete
      await Promise.all(heavyQueries);

      // Pool might have grown to handle concurrent queries
      // or stayed the same if it had enough connections
      expect(duringStats.totalCount).toBeGreaterThanOrEqual(initialTotal);
      expect(duringStats.totalCount).toBeLessThanOrEqual(testConfig.poolMax);
    });
  });

  describe('Periodic Metrics Recorder', () => {
    it('should create recorder for PostgreSQL adapter', () => {
      const recorder = createPoolMetricsRecorder(
        () => adapter.getPoolStats(),
        { maxConnections: testConfig.poolMax },
        1000
      );

      expect(recorder).toHaveProperty('start');
      expect(recorder).toHaveProperty('stop');
    });

    it('should record metrics on start', () => {
      const recorder = createPoolMetricsRecorder(() => adapter.getPoolStats(), {
        maxConnections: testConfig.poolMax,
      });

      recorder.start();

      // Metrics should be recorded immediately
      expect(dbPoolMaxGauge.get()).toBe(testConfig.poolMax);
      expect(dbPoolSizeGauge.get()).toBeGreaterThan(0);

      recorder.stop();
    });

    it('should handle adapter lifecycle', async () => {
      const recorder = createPoolMetricsRecorder(() => adapter.getPoolStats(), {
        maxConnections: testConfig.poolMax,
      });

      // Start recording
      recorder.start();
      const initialSize = dbPoolSizeGauge.get();
      expect(initialSize).toBeGreaterThan(0);

      // Execute some queries
      await adapter.executeRaw('SELECT 1');

      // Stats should still be valid
      const afterSize = dbPoolSizeGauge.get();
      expect(afterSize).toBeGreaterThan(0);

      recorder.stop();
    });
  });

  describe('Metrics Export', () => {
    it('should include pool metrics in Prometheus output', () => {
      const stats = adapter.getPoolStats();
      recordPoolMetrics(stats, { maxConnections: testConfig.poolMax });

      const output = metrics.format();

      // Verify Prometheus format
      expect(output).toContain('# HELP agentmem_db_pool_size');
      expect(output).toContain('# TYPE agentmem_db_pool_size gauge');
      expect(output).toContain('# HELP agentmem_db_pool_max');
      expect(output).toContain('# TYPE agentmem_db_pool_max gauge');

      // Verify values are present
      expect(output).toMatch(/agentmem_db_pool_size \d+/);
      expect(output).toMatch(/agentmem_db_pool_max \d+/);
      expect(output).toMatch(/agentmem_db_pool_idle \d+/);
      expect(output).toMatch(/agentmem_db_pool_waiting \d+/);
    });

    it('should export valid Prometheus metrics format', () => {
      const stats = adapter.getPoolStats();
      recordPoolMetrics(stats, { maxConnections: testConfig.poolMax });

      const output = metrics.format();

      // Check for standard Prometheus format elements
      const lines = output.split('\n');

      // Should have HELP lines
      const helpLines = lines.filter((line) => line.startsWith('# HELP'));
      expect(helpLines.length).toBeGreaterThan(0);

      // Should have TYPE lines
      const typeLines = lines.filter((line) => line.startsWith('# TYPE'));
      expect(typeLines.length).toBeGreaterThan(0);

      // Should have metric value lines (not starting with #)
      const valueLines = lines.filter((line) => line && !line.startsWith('#'));
      expect(valueLines.length).toBeGreaterThan(0);
    });
  });

  describe('Health Check Integration', () => {
    it('should verify pool health alongside metrics', async () => {
      const health = await adapter.healthCheck();
      const stats = adapter.getPoolStats();

      expect(health.ok).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);

      // Record metrics for healthy pool
      recordPoolMetrics(stats, { maxConnections: testConfig.poolMax });

      expect(dbPoolSizeGauge.get()).toBeGreaterThan(0);
    });

    it('should track pool health over time', async () => {
      const recorder = createPoolMetricsRecorder(() => adapter.getPoolStats(), {
        maxConnections: testConfig.poolMax,
      });

      recorder.start();

      // Perform health checks
      const health1 = await adapter.healthCheck();
      expect(health1.ok).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const health2 = await adapter.healthCheck();
      expect(health2.ok).toBe(true);

      // Metrics should reflect healthy pool
      expect(dbPoolSizeGauge.get()).toBeGreaterThan(0);

      recorder.stop();
    });
  });
});
