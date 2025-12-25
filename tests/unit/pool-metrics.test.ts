/**
 * Unit tests for database connection pool metrics
 *
 * Tests the pool metrics recording functionality including:
 * - Individual metric gauges
 * - Pool statistics recording
 * - Periodic metrics recorder
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  metrics,
  recordPoolMetrics,
  createPoolMetricsRecorder,
  dbPoolSizeGauge,
  dbPoolAvailableGauge,
  dbPoolWaitingGauge,
  dbPoolIdleGauge,
  dbPoolMaxGauge,
  dbPoolGauge,
  type PoolStats,
  type PoolMetricsConfig,
} from '../../src/utils/metrics.js';

describe('Pool Metrics', () => {
  beforeEach(() => {
    // Reset all metrics before each test
    metrics.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('recordPoolMetrics', () => {
    it('should record all pool statistics correctly', () => {
      const stats: PoolStats = {
        totalCount: 10,
        idleCount: 6,
        waitingCount: 2,
      };

      recordPoolMetrics(stats);

      // Check individual gauges
      expect(dbPoolSizeGauge.get()).toBe(10);
      expect(dbPoolAvailableGauge.get()).toBe(6);
      expect(dbPoolWaitingGauge.get()).toBe(2);
      expect(dbPoolIdleGauge.get()).toBe(6);

      // Check state-based gauge
      expect(dbPoolGauge.get({ state: 'idle' })).toBe(6);
      expect(dbPoolGauge.get({ state: 'active' })).toBe(4); // 10 total - 6 idle
      expect(dbPoolGauge.get({ state: 'waiting' })).toBe(2);
    });

    it('should record max connections when provided', () => {
      const stats: PoolStats = {
        totalCount: 5,
        idleCount: 3,
        waitingCount: 0,
      };

      const config: PoolMetricsConfig = {
        maxConnections: 20,
      };

      recordPoolMetrics(stats, config);

      expect(dbPoolMaxGauge.get()).toBe(20);
    });

    it('should not update max gauge when not provided', () => {
      const stats: PoolStats = {
        totalCount: 5,
        idleCount: 3,
        waitingCount: 0,
      };

      // Set initial max value
      dbPoolMaxGauge.set(20);

      // Record without config
      recordPoolMetrics(stats);

      // Max should remain unchanged
      expect(dbPoolMaxGauge.get()).toBe(20);
    });

    it('should handle zero values correctly', () => {
      const stats: PoolStats = {
        totalCount: 0,
        idleCount: 0,
        waitingCount: 0,
      };

      recordPoolMetrics(stats);

      expect(dbPoolSizeGauge.get()).toBe(0);
      expect(dbPoolAvailableGauge.get()).toBe(0);
      expect(dbPoolWaitingGauge.get()).toBe(0);
      expect(dbPoolIdleGauge.get()).toBe(0);
    });

    it('should handle all connections active', () => {
      const stats: PoolStats = {
        totalCount: 10,
        idleCount: 0,
        waitingCount: 5,
      };

      recordPoolMetrics(stats);

      expect(dbPoolSizeGauge.get()).toBe(10);
      expect(dbPoolIdleGauge.get()).toBe(0);
      expect(dbPoolGauge.get({ state: 'active' })).toBe(10);
      expect(dbPoolGauge.get({ state: 'idle' })).toBe(0);
      expect(dbPoolGauge.get({ state: 'waiting' })).toBe(5);
    });

    it('should handle all connections idle', () => {
      const stats: PoolStats = {
        totalCount: 10,
        idleCount: 10,
        waitingCount: 0,
      };

      recordPoolMetrics(stats);

      expect(dbPoolSizeGauge.get()).toBe(10);
      expect(dbPoolIdleGauge.get()).toBe(10);
      expect(dbPoolGauge.get({ state: 'active' })).toBe(0);
      expect(dbPoolGauge.get({ state: 'idle' })).toBe(10);
      expect(dbPoolGauge.get({ state: 'waiting' })).toBe(0);
    });

    it('should handle pool under load', () => {
      const stats: PoolStats = {
        totalCount: 20,
        idleCount: 2,
        waitingCount: 15,
      };

      const config: PoolMetricsConfig = {
        maxConnections: 20,
      };

      recordPoolMetrics(stats, config);

      expect(dbPoolSizeGauge.get()).toBe(20);
      expect(dbPoolIdleGauge.get()).toBe(2);
      expect(dbPoolAvailableGauge.get()).toBe(2);
      expect(dbPoolWaitingGauge.get()).toBe(15);
      expect(dbPoolMaxGauge.get()).toBe(20);
      expect(dbPoolGauge.get({ state: 'active' })).toBe(18); // 20 - 2
    });
  });

  describe('createPoolMetricsRecorder', () => {
    it('should create recorder with start and stop methods', () => {
      const getStats = vi.fn(
        (): PoolStats => ({
          totalCount: 5,
          idleCount: 3,
          waitingCount: 0,
        })
      );

      const recorder = createPoolMetricsRecorder(getStats, { maxConnections: 10 });

      expect(recorder).toHaveProperty('start');
      expect(recorder).toHaveProperty('stop');
      expect(typeof recorder.start).toBe('function');
      expect(typeof recorder.stop).toBe('function');
    });

    it('should record metrics immediately on start', () => {
      const stats: PoolStats = {
        totalCount: 8,
        idleCount: 4,
        waitingCount: 1,
      };

      const getStats = vi.fn(() => stats);
      const recorder = createPoolMetricsRecorder(getStats, { maxConnections: 10 });

      recorder.start();

      expect(getStats).toHaveBeenCalledTimes(1);
      expect(dbPoolSizeGauge.get()).toBe(8);
      expect(dbPoolIdleGauge.get()).toBe(4);
      expect(dbPoolWaitingGauge.get()).toBe(1);

      recorder.stop();
    });

    it('should record metrics at specified interval', () => {
      let totalCount = 5;
      const getStats = vi.fn(
        (): PoolStats => ({
          totalCount: totalCount++,
          idleCount: 3,
          waitingCount: 0,
        })
      );

      const recorder = createPoolMetricsRecorder(getStats, { maxConnections: 10 }, 1000);
      recorder.start();

      // Initial call on start
      expect(getStats).toHaveBeenCalledTimes(1);
      expect(dbPoolSizeGauge.get()).toBe(5);

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);
      expect(getStats).toHaveBeenCalledTimes(2);
      expect(dbPoolSizeGauge.get()).toBe(6);

      // Advance time by another 2 seconds
      vi.advanceTimersByTime(2000);
      expect(getStats).toHaveBeenCalledTimes(4);
      expect(dbPoolSizeGauge.get()).toBe(8);

      recorder.stop();
    });

    it('should use default interval of 15 seconds', () => {
      const getStats = vi.fn(
        (): PoolStats => ({
          totalCount: 5,
          idleCount: 3,
          waitingCount: 0,
        })
      );

      const recorder = createPoolMetricsRecorder(getStats);
      recorder.start();

      // Initial call
      expect(getStats).toHaveBeenCalledTimes(1);

      // Advance by 15 seconds
      vi.advanceTimersByTime(15000);
      expect(getStats).toHaveBeenCalledTimes(2);

      recorder.stop();
    });

    it('should stop recording when stop is called', () => {
      const getStats = vi.fn(
        (): PoolStats => ({
          totalCount: 5,
          idleCount: 3,
          waitingCount: 0,
        })
      );

      const recorder = createPoolMetricsRecorder(getStats, undefined, 1000);
      recorder.start();

      // Initial call
      expect(getStats).toHaveBeenCalledTimes(1);

      // Advance and verify it's recording
      vi.advanceTimersByTime(1000);
      expect(getStats).toHaveBeenCalledTimes(2);

      // Stop recording
      recorder.stop();

      // Advance time again - should not record
      vi.advanceTimersByTime(2000);
      expect(getStats).toHaveBeenCalledTimes(2); // Still 2, not increased
    });

    it('should handle errors in getStats gracefully', () => {
      const getStats = vi.fn(() => {
        throw new Error('Connection failed');
      });

      const recorder = createPoolMetricsRecorder(getStats, { maxConnections: 10 }, 1000);

      // Should not throw
      expect(() => recorder.start()).not.toThrow();
      expect(() => vi.advanceTimersByTime(1000)).not.toThrow();

      recorder.stop();
    });

    it('should not start multiple times', () => {
      const getStats = vi.fn(
        (): PoolStats => ({
          totalCount: 5,
          idleCount: 3,
          waitingCount: 0,
        })
      );

      const recorder = createPoolMetricsRecorder(getStats, undefined, 1000);
      recorder.start();
      recorder.start(); // Try to start again

      // Advance time
      vi.advanceTimersByTime(1000);

      // Should only have 2 calls (initial + 1 interval), not 3
      expect(getStats).toHaveBeenCalledTimes(2);

      recorder.stop();
    });

    it('should handle stop when not started', () => {
      const getStats = vi.fn(
        (): PoolStats => ({
          totalCount: 5,
          idleCount: 3,
          waitingCount: 0,
        })
      );

      const recorder = createPoolMetricsRecorder(getStats);

      // Should not throw
      expect(() => recorder.stop()).not.toThrow();
    });

    it('should allow restart after stop', () => {
      const getStats = vi.fn(
        (): PoolStats => ({
          totalCount: 5,
          idleCount: 3,
          waitingCount: 0,
        })
      );

      const recorder = createPoolMetricsRecorder(getStats, undefined, 1000);

      // Start, advance, stop
      recorder.start();
      vi.advanceTimersByTime(1000);
      recorder.stop();
      const callsAfterStop = getStats.mock.calls.length;

      // Start again
      recorder.start();
      vi.advanceTimersByTime(1000);

      // Should have new calls
      expect(getStats).toHaveBeenCalledTimes(callsAfterStop + 2);

      recorder.stop();
    });

    it('should record dynamic pool statistics', () => {
      let poolState = {
        total: 10,
        idle: 5,
        waiting: 0,
      };

      const getStats = vi.fn(
        (): PoolStats => ({
          totalCount: poolState.total,
          idleCount: poolState.idle,
          waitingCount: poolState.waiting,
        })
      );

      const recorder = createPoolMetricsRecorder(getStats, { maxConnections: 20 }, 1000);
      recorder.start();

      // Initial state
      expect(dbPoolSizeGauge.get()).toBe(10);
      expect(dbPoolIdleGauge.get()).toBe(5);

      // Simulate pool growth
      poolState = { total: 15, idle: 3, waiting: 2 };
      vi.advanceTimersByTime(1000);

      expect(dbPoolSizeGauge.get()).toBe(15);
      expect(dbPoolIdleGauge.get()).toBe(3);
      expect(dbPoolWaitingGauge.get()).toBe(2);

      // Simulate pool shrinking
      poolState = { total: 8, idle: 7, waiting: 0 };
      vi.advanceTimersByTime(1000);

      expect(dbPoolSizeGauge.get()).toBe(8);
      expect(dbPoolIdleGauge.get()).toBe(7);
      expect(dbPoolWaitingGauge.get()).toBe(0);

      recorder.stop();
    });
  });

  describe('Integration with Prometheus format', () => {
    it('should export pool metrics in Prometheus format', () => {
      const stats: PoolStats = {
        totalCount: 10,
        idleCount: 6,
        waitingCount: 2,
      };

      recordPoolMetrics(stats, { maxConnections: 20 });

      const output = metrics.format();

      // Check that all metrics are present
      expect(output).toContain('agentmem_db_pool_size');
      expect(output).toContain('agentmem_db_pool_available');
      expect(output).toContain('agentmem_db_pool_waiting');
      expect(output).toContain('agentmem_db_pool_idle');
      expect(output).toContain('agentmem_db_pool_max');
      expect(output).toContain('agentmem_db_pool_connections');

      // Check values
      expect(output).toMatch(/agentmem_db_pool_size \d+/);
      expect(output).toMatch(/agentmem_db_pool_max \d+/);
    });

    it('should include proper HELP and TYPE metadata', () => {
      const stats: PoolStats = {
        totalCount: 5,
        idleCount: 3,
        waitingCount: 0,
      };

      recordPoolMetrics(stats);

      const output = metrics.format();

      expect(output).toContain('# HELP agentmem_db_pool_size');
      expect(output).toContain('# TYPE agentmem_db_pool_size gauge');
      expect(output).toContain('# HELP agentmem_db_pool_available');
      expect(output).toContain('# TYPE agentmem_db_pool_available gauge');
    });
  });
});
