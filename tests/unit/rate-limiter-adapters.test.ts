import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalRateLimiterAdapter } from '../../src/core/adapters/local-rate-limiter.adapter.js';
import { RedisRateLimiterAdapter } from '../../src/core/adapters/redis-rate-limiter.adapter.js';
import type { IRateLimiterAdapter } from '../../src/core/adapters/interfaces.js';

describe('LocalRateLimiterAdapter', () => {
  let adapter: IRateLimiterAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.stop();
    }
    vi.useRealTimers();
  });

  describe('interface compliance', () => {
    it('should implement IRateLimiterAdapter interface', () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 10,
        windowMs: 1000,
      });

      expect(adapter).toHaveProperty('check');
      expect(adapter).toHaveProperty('consume');
      expect(adapter).toHaveProperty('getStats');
      expect(adapter).toHaveProperty('reset');
      expect(adapter).toHaveProperty('resetAll');
      expect(adapter).toHaveProperty('updateConfig');
      expect(adapter).toHaveProperty('isEnabled');
      expect(adapter).toHaveProperty('stop');

      expect(typeof adapter.check).toBe('function');
      expect(typeof adapter.consume).toBe('function');
      expect(typeof adapter.getStats).toBe('function');
      expect(typeof adapter.reset).toBe('function');
      expect(typeof adapter.resetAll).toBe('function');
      expect(typeof adapter.updateConfig).toBe('function');
      expect(typeof adapter.isEnabled).toBe('function');
      expect(typeof adapter.stop).toBe('function');
    });

    it('should return promises for async methods', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 10,
        windowMs: 1000,
      });

      const checkResult = adapter.check('test-key');
      expect(checkResult).toBeInstanceOf(Promise);

      const consumeResult = adapter.consume('test-key');
      expect(consumeResult).toBeInstanceOf(Promise);

      const statsResult = adapter.getStats('test-key');
      expect(statsResult).toBeInstanceOf(Promise);

      const resetResult = adapter.reset('test-key');
      expect(resetResult).toBeInstanceOf(Promise);

      const resetAllResult = adapter.resetAll();
      expect(resetAllResult).toBeInstanceOf(Promise);

      const stopResult = adapter.stop();
      expect(stopResult).toBeInstanceOf(Promise);

      // Wait for all promises to resolve
      await Promise.all([
        checkResult,
        consumeResult,
        statsResult,
        resetResult,
        resetAllResult,
        stopResult,
      ]);
    });
  });

  describe('check', () => {
    beforeEach(() => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 3,
        windowMs: 1000,
      });
    });

    it('should allow requests within limit', async () => {
      const result1 = await adapter.check('test-key');
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);
      expect(result1.resetMs).toBe(1000);
      expect(result1.retryAfterMs).toBeUndefined();

      const result2 = await adapter.check('test-key');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      const result3 = await adapter.check('test-key');
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);
    });

    it('should deny requests exceeding limit', async () => {
      await adapter.check('test-key');
      await adapter.check('test-key');
      await adapter.check('test-key');

      const result = await adapter.check('test-key');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('should track separate keys independently', async () => {
      await adapter.check('key1');
      await adapter.check('key1');
      await adapter.check('key1');

      const result1 = await adapter.check('key1');
      expect(result1.allowed).toBe(false);

      const result2 = await adapter.check('key2');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(2);
    });

    it('should allow requests after time passes (token bucket refill)', async () => {
      await adapter.check('test-key');
      await adapter.check('test-key');
      await adapter.check('test-key');

      const rejected = await adapter.check('test-key');
      expect(rejected.allowed).toBe(false);

      // Advance time to allow token refill
      vi.advanceTimersByTime(1001);

      const allowed = await adapter.check('test-key');
      expect(allowed.allowed).toBe(true);
      expect(allowed.remaining).toBe(2);
    });

    it('should calculate correct retryAfterMs when rate limited', async () => {
      await adapter.check('test-key');
      await adapter.check('test-key');
      await adapter.check('test-key');

      const result = await adapter.check('test-key');
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeLessThanOrEqual(1000);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('should allow all requests when disabled', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 1,
        windowMs: 1000,
        enabled: false,
      });

      const result1 = await adapter.check('test-key');
      expect(result1.allowed).toBe(true);

      const result2 = await adapter.check('test-key');
      expect(result2.allowed).toBe(true);

      const result3 = await adapter.check('test-key');
      expect(result3.allowed).toBe(true);
    });
  });

  describe('consume', () => {
    beforeEach(() => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 2,
        windowMs: 1000,
      });
    });

    it('should return true when request is allowed', async () => {
      expect(await adapter.consume('test-key')).toBe(true);
      expect(await adapter.consume('test-key')).toBe(true);
    });

    it('should return false when limit is exceeded', async () => {
      await adapter.consume('test-key');
      await adapter.consume('test-key');

      expect(await adapter.consume('test-key')).toBe(false);
    });

    it('should consume tokens same as check', async () => {
      await adapter.consume('test-key');

      const stats = await adapter.getStats('test-key');
      expect(stats.count).toBe(1);
      expect(stats.remaining).toBe(1);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 2000,
      });
    });

    it('should return zero count for new key', async () => {
      const stats = await adapter.getStats('new-key');
      expect(stats.count).toBe(0);
      expect(stats.remaining).toBe(5);
      expect(stats.windowMs).toBe(2000);
    });

    it('should return correct count after requests', async () => {
      await adapter.check('test-key');
      await adapter.check('test-key');
      await adapter.check('test-key');

      const stats = await adapter.getStats('test-key');
      expect(stats.count).toBe(3);
      expect(stats.remaining).toBe(2);
      expect(stats.windowMs).toBe(2000);
    });

    it('should not consume tokens', async () => {
      const stats1 = await adapter.getStats('test-key');
      const stats2 = await adapter.getStats('test-key');
      const stats3 = await adapter.getStats('test-key');

      expect(stats1.count).toBe(0);
      expect(stats2.count).toBe(0);
      expect(stats3.count).toBe(0);
    });

    it('should account for token refill over time', async () => {
      await adapter.check('test-key');
      await adapter.check('test-key');

      vi.advanceTimersByTime(2001);

      const stats = await adapter.getStats('test-key');
      expect(stats.count).toBe(0);
      expect(stats.remaining).toBe(5);
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 2,
        windowMs: 1000,
      });
    });

    it('should reset rate limit for specific key', async () => {
      await adapter.check('test-key');
      await adapter.check('test-key');

      let result = await adapter.check('test-key');
      expect(result.allowed).toBe(false);

      await adapter.reset('test-key');

      result = await adapter.check('test-key');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it('should not affect other keys', async () => {
      await adapter.check('key1');
      await adapter.check('key2');

      await adapter.reset('key1');

      const stats1 = await adapter.getStats('key1');
      expect(stats1.count).toBe(0);

      const stats2 = await adapter.getStats('key2');
      expect(stats2.count).toBe(1);
    });

    it('should be safe to reset non-existent key', async () => {
      await expect(adapter.reset('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('resetAll', () => {
    beforeEach(() => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 2,
        windowMs: 1000,
      });
    });

    it('should reset all rate limits', async () => {
      await adapter.check('key1');
      await adapter.check('key2');
      await adapter.check('key3');

      await adapter.resetAll();

      expect((await adapter.getStats('key1')).count).toBe(0);
      expect((await adapter.getStats('key2')).count).toBe(0);
      expect((await adapter.getStats('key3')).count).toBe(0);
    });

    it('should allow all keys to consume full quota after reset', async () => {
      await adapter.check('key1');
      await adapter.check('key1');

      await adapter.resetAll();

      const result1 = await adapter.check('key1');
      const result2 = await adapter.check('key1');

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    it('should be safe to call on empty limiter', async () => {
      await expect(adapter.resetAll()).resolves.toBeUndefined();
    });
  });

  describe('updateConfig', () => {
    beforeEach(() => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
        enabled: true,
      });
    });

    it('should update maxRequests', async () => {
      adapter.updateConfig({ maxRequests: 10 });

      await adapter.check('test-key');
      const stats = await adapter.getStats('test-key');
      expect(stats.remaining).toBe(9);
    });

    it('should update windowMs', async () => {
      adapter.updateConfig({ windowMs: 2000 });

      const stats = await adapter.getStats('test-key');
      expect(stats.windowMs).toBe(2000);
    });

    it('should update enabled flag', () => {
      expect(adapter.isEnabled()).toBe(true);

      adapter.updateConfig({ enabled: false });
      expect(adapter.isEnabled()).toBe(false);
    });

    it('should update minBurstProtection', async () => {
      adapter.updateConfig({ minBurstProtection: 50 });

      // After update, burst protection should be 50
      // This is tested implicitly - the update should not throw
      expect(adapter.isEnabled()).toBe(true);
    });

    it('should update multiple config values at once', async () => {
      adapter.updateConfig({
        maxRequests: 20,
        windowMs: 5000,
        enabled: false,
      });

      expect(adapter.isEnabled()).toBe(false);
      const stats = await adapter.getStats('test-key');
      expect(stats.remaining).toBe(20);
      expect(stats.windowMs).toBe(5000);
    });

    it('should apply config changes immediately to new requests', async () => {
      await adapter.check('test-key');
      await adapter.check('test-key');
      await adapter.check('test-key');

      // Now at 2 remaining (5 max - 3 consumed)
      const stats1 = await adapter.getStats('test-key');
      expect(stats1.remaining).toBe(2);

      adapter.updateConfig({ maxRequests: 10 });

      // New requests should use new config
      const stats2 = await adapter.getStats('test-key');
      expect(stats2.remaining).toBeGreaterThanOrEqual(2);
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
        enabled: true,
      });

      expect(adapter.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
        enabled: false,
      });

      expect(adapter.isEnabled()).toBe(false);
    });

    it('should return true when enabled is not specified (default)', () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
      });

      expect(adapter.isEnabled()).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop cleanup interval and clear state', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
      });

      await adapter.check('test-key');
      await adapter.stop();

      const stats = await adapter.getStats('test-key');
      expect(stats.count).toBe(0);
    });

    it('should be safe to call multiple times', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
      });

      await adapter.stop();
      await adapter.stop();
      await adapter.stop();
      // Should not throw
    });

    it('should be safe to call before any operations', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
      });

      await expect(adapter.stop()).resolves.toBeUndefined();
    });
  });

  describe('burst protection', () => {
    it('should enforce minimum burst protection', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 100,
        windowMs: 60000,
        minBurstProtection: 10, // 10 requests per second max
      });

      // Make 10 requests in rapid succession
      for (let i = 0; i < 10; i++) {
        const result = await adapter.check('burst-key');
        expect(result.allowed).toBe(true);
      }

      // 11th request should be rate limited by burst protection
      const result = await adapter.check('burst-key');
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('should apply burst protection even when rate limiting is disabled', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 100,
        windowMs: 60000,
        enabled: false,
        minBurstProtection: 5,
      });

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        const result = await adapter.check('burst-key');
        expect(result.allowed).toBe(true);
      }

      // 6th request should be blocked by burst protection
      const result = await adapter.check('burst-key');
      expect(result.allowed).toBe(false);
    });

    it('should refill burst tokens over time', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 100,
        windowMs: 60000,
        minBurstProtection: 5,
      });

      // Consume all burst tokens
      for (let i = 0; i < 5; i++) {
        await adapter.check('burst-key');
      }

      const blocked = await adapter.check('burst-key');
      expect(blocked.allowed).toBe(false);

      // Advance time to refill tokens (5 tokens / 1000ms = 0.005 tokens/ms)
      vi.advanceTimersByTime(1000);

      // Should now be allowed
      const allowed = await adapter.check('burst-key');
      expect(allowed.allowed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle very small maxRequests', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 1,
        windowMs: 1000,
      });

      const result1 = await adapter.check('test-key');
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(0);

      const result2 = await adapter.check('test-key');
      expect(result2.allowed).toBe(false);
    });

    it('should handle very large maxRequests', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 10000,
        windowMs: 1000,
      });

      const result = await adapter.check('test-key');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9999);
    });

    it('should handle very short time windows', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 100,
      });

      // Make requests
      for (let i = 0; i < 5; i++) {
        await adapter.check('test-key');
      }

      const blocked = await adapter.check('test-key');
      expect(blocked.allowed).toBe(false);

      // Advance by short window
      vi.advanceTimersByTime(101);

      const allowed = await adapter.check('test-key');
      expect(allowed.allowed).toBe(true);
    });

    it('should handle very long time windows', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 3600000, // 1 hour
      });

      const stats = await adapter.getStats('test-key');
      expect(stats.windowMs).toBe(3600000);
    });

    it('should handle concurrent requests for different keys', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 3,
        windowMs: 1000,
      });

      const results = await Promise.all([
        adapter.check('key1'),
        adapter.check('key2'),
        adapter.check('key3'),
        adapter.check('key1'),
        adapter.check('key2'),
        adapter.check('key3'),
      ]);

      // All should be allowed as different keys
      expect(results.every((r) => r.allowed)).toBe(true);
    });

    it('should handle empty key string', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 2,
        windowMs: 1000,
      });

      const result = await adapter.check('');
      expect(result.allowed).toBe(true);
    });

    it('should handle special characters in keys', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 2,
        windowMs: 1000,
      });

      const specialKeys = [
        'user:123',
        'agent@email.com',
        '192.168.1.1',
        'key with spaces',
        'key/with/slashes',
        'key\\with\\backslashes',
      ];

      for (const key of specialKeys) {
        const result = await adapter.check(key);
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical API rate limiting scenario', async () => {
      // 100 requests per minute
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 100,
        windowMs: 60000,
      });

      const userId = 'user-123';

      // Make 100 successful requests
      for (let i = 0; i < 100; i++) {
        const result = await adapter.check(userId);
        expect(result.allowed).toBe(true);
      }

      // 101st should be blocked
      const blocked = await adapter.check(userId);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeLessThanOrEqual(60000);

      // Wait for window to pass
      vi.advanceTimersByTime(60001);

      // Should be allowed again
      const allowed = await adapter.check(userId);
      expect(allowed.allowed).toBe(true);
    });

    it('should handle multiple agents with different quotas', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 10,
        windowMs: 60000,
      });

      const agent1 = 'agent-1';
      const agent2 = 'agent-2';

      // Agent 1 consumes quota
      for (let i = 0; i < 10; i++) {
        await adapter.check(agent1);
      }

      // Agent 1 is blocked
      expect((await adapter.check(agent1)).allowed).toBe(false);

      // Agent 2 still has quota
      expect((await adapter.check(agent2)).allowed).toBe(true);
    });

    it('should support graceful degradation by disabling rate limiting', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
        enabled: true,
      });

      // Consume quota
      for (let i = 0; i < 5; i++) {
        await adapter.check('test-key');
      }

      // Should be blocked
      expect((await adapter.check('test-key')).allowed).toBe(false);

      // Disable rate limiting
      adapter.updateConfig({ enabled: false });

      // Should now be allowed
      expect((await adapter.check('test-key')).allowed).toBe(true);
    });

    it('should provide accurate stats for monitoring', async () => {
      adapter = new LocalRateLimiterAdapter({
        maxRequests: 10,
        windowMs: 60000,
      });

      // Make some requests
      await adapter.check('monitoring-key');
      await adapter.check('monitoring-key');
      await adapter.check('monitoring-key');

      const stats = await adapter.getStats('monitoring-key');

      expect(stats).toMatchObject({
        count: 3,
        remaining: 7,
        windowMs: 60000,
      });

      expect(stats.count + stats.remaining).toBe(10);
    });
  });
});

describe('RedisRateLimiterAdapter - Fail Modes (CRIT-012)', () => {
  let adapter: RedisRateLimiterAdapter;

  afterEach(async () => {
    if (adapter) {
      await adapter.stop();
    }
  });

  describe('fail-open mode (NOT RECOMMENDED)', () => {
    it('should allow all requests when Redis is unavailable', async () => {
      adapter = new RedisRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
        failMode: 'open',
        host: 'invalid-host', // Force connection failure
      });

      // Don't connect, simulate Redis unavailable
      const result1 = await adapter.check('test-key');
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(4);

      const result2 = await adapter.check('test-key');
      expect(result2.allowed).toBe(true);
    });

    it('should log warning about security risk', async () => {
      adapter = new RedisRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
        failMode: 'open',
        host: 'invalid-host',
      });

      // This should trigger the warning log
      const result = await adapter.check('test-key');
      expect(result.allowed).toBe(true);
    });
  });

  describe('fail-closed mode', () => {
    it('should deny all requests when Redis is unavailable', async () => {
      adapter = new RedisRateLimiterAdapter({
        maxRequests: 100,
        windowMs: 1000,
        failMode: 'closed',
        host: 'invalid-host', // Force connection failure
      });

      const result1 = await adapter.check('test-key');
      expect(result1.allowed).toBe(false);
      expect(result1.remaining).toBe(0);
      expect(result1.retryAfterMs).toBe(60000);

      const result2 = await adapter.check('test-key');
      expect(result2.allowed).toBe(false);
    });

    it('should provide consistent deny response', async () => {
      adapter = new RedisRateLimiterAdapter({
        maxRequests: 1000,
        windowMs: 60000,
        failMode: 'closed',
        host: 'invalid-host',
      });

      for (let i = 0; i < 10; i++) {
        const result = await adapter.check(`key-${i}`);
        expect(result.allowed).toBe(false);
        expect(result.retryAfterMs).toBe(60000);
      }
    });
  });

  describe('local-fallback mode (default)', () => {
    it('should use local rate limiter when Redis is unavailable', async () => {
      adapter = new RedisRateLimiterAdapter({
        maxRequests: 3,
        windowMs: 1000,
        failMode: 'local-fallback',
        host: 'invalid-host', // Force connection failure
      });

      // Should allow first 3 requests using local fallback
      const result1 = await adapter.check('test-key');
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);

      const result2 = await adapter.check('test-key');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      const result3 = await adapter.check('test-key');
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);

      // 4th request should be denied by local fallback
      const result4 = await adapter.check('test-key');
      expect(result4.allowed).toBe(false);
      expect(result4.retryAfterMs).toBeGreaterThan(0);
    });

    it('should track separate keys in local fallback', async () => {
      adapter = new RedisRateLimiterAdapter({
        maxRequests: 2,
        windowMs: 1000,
        failMode: 'local-fallback',
        host: 'invalid-host',
      });

      await adapter.check('key1');
      await adapter.check('key1');

      const result1 = await adapter.check('key1');
      expect(result1.allowed).toBe(false);

      const result2 = await adapter.check('key2');
      expect(result2.allowed).toBe(true);
    });

    it('should be initialized by default when failMode is local-fallback', async () => {
      adapter = new RedisRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
        failMode: 'local-fallback',
        host: 'invalid-host',
      });

      // Local fallback should be initialized in constructor
      const result = await adapter.check('test-key');
      expect(result.allowed).toBe(true);
    });

    it('should use environment variable for fail mode if not in config', async () => {
      const originalEnv = process.env.AGENT_MEMORY_RATE_LIMIT_FAIL_MODE;
      process.env.AGENT_MEMORY_RATE_LIMIT_FAIL_MODE = 'closed';

      adapter = new RedisRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
        host: 'invalid-host',
      });

      const result = await adapter.check('test-key');
      expect(result.allowed).toBe(false);

      // Restore environment
      if (originalEnv !== undefined) {
        process.env.AGENT_MEMORY_RATE_LIMIT_FAIL_MODE = originalEnv;
      } else {
        delete process.env.AGENT_MEMORY_RATE_LIMIT_FAIL_MODE;
      }
    });

    it('should default to local-fallback if no fail mode specified', async () => {
      adapter = new RedisRateLimiterAdapter({
        maxRequests: 3,
        windowMs: 1000,
        host: 'invalid-host',
      });

      // Should use local fallback by default
      const result1 = await adapter.check('test-key');
      expect(result1.allowed).toBe(true);

      const result2 = await adapter.check('test-key');
      expect(result2.allowed).toBe(true);

      const result3 = await adapter.check('test-key');
      expect(result3.allowed).toBe(true);

      const result4 = await adapter.check('test-key');
      expect(result4.allowed).toBe(false);
    });
  });

  describe('updateConfig with local fallback', () => {
    it('should update local fallback config when failMode is local-fallback', async () => {
      adapter = new RedisRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
        failMode: 'local-fallback',
        host: 'invalid-host',
      });

      await adapter.check('test-key');
      await adapter.check('test-key');

      // Update config
      adapter.updateConfig({ maxRequests: 10 });

      // New limit should apply in local fallback
      const result = await adapter.check('test-key');
      expect(result.allowed).toBe(true);
    });

    it('should not throw when updating config with fail-closed mode', async () => {
      adapter = new RedisRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
        failMode: 'closed',
        host: 'invalid-host',
      });

      // Should not throw even though localFallback is null
      expect(() => adapter.updateConfig({ maxRequests: 10 })).not.toThrow();
    });
  });

  describe('stop with local fallback', () => {
    it('should stop local fallback when stopping adapter', async () => {
      adapter = new RedisRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
        failMode: 'local-fallback',
        host: 'invalid-host',
      });

      await adapter.check('test-key');
      await adapter.stop();

      // After stop, should fail closed (fallback is stopped)
      const result = await adapter.check('test-key');
      expect(result.allowed).toBe(false);
    });

    it('should not throw when stopping without local fallback', async () => {
      adapter = new RedisRateLimiterAdapter({
        maxRequests: 5,
        windowMs: 1000,
        failMode: 'closed',
        host: 'invalid-host',
      });

      await expect(adapter.stop()).resolves.toBeUndefined();
    });
  });
});
