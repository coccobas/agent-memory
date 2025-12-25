/**
 * Integration tests for Redis Rate Limiter.
 *
 * These tests require a running Redis instance.
 * Skip if AGENT_MEMORY_REDIS_ENABLED is not set.
 *
 * To run locally:
 *   docker run -d -p 6379:6379 redis:alpine
 *   AGENT_MEMORY_REDIS_ENABLED=true npm run test tests/integration/redis-rate-limiter.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { config } from '../../src/config/index.js';

// Skip if Redis is not configured
const REDIS_ENABLED = process.env.AGENT_MEMORY_REDIS_ENABLED === 'true';

describe.skipIf(!REDIS_ENABLED)('Redis Rate Limiter Integration', () => {
  // Dynamic import to avoid loading ioredis when not used
  let RedisRateLimiterAdapter: typeof import('../../src/core/adapters/redis-rate-limiter.adapter.js').RedisRateLimiterAdapter;

  beforeAll(async () => {
    const module = await import('../../src/core/adapters/redis-rate-limiter.adapter.js');
    RedisRateLimiterAdapter = module.RedisRateLimiterAdapter;
  });

  describe('Token Bucket Algorithm', () => {
    let rateLimiter: InstanceType<typeof RedisRateLimiterAdapter>;

    beforeEach(async () => {
      rateLimiter = new RedisRateLimiterAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:ratelimit:bucket:',
        maxRequests: 5,
        windowMs: 1000,
        enabled: true,
        minBurstProtection: 1,
      });
      await rateLimiter.connect();
    });

    afterEach(async () => {
      await rateLimiter.resetAll();
      await rateLimiter.stop();
    });

    it('should allow requests within limit', async () => {
      const key = 'user:allow-test';

      // Should allow up to maxRequests (5) requests
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.check(key);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBeGreaterThanOrEqual(0);
        expect(result.resetMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should deny requests over limit', async () => {
      const key = 'user:deny-test';

      // Consume all 5 tokens
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.check(key);
        expect(result.allowed).toBe(true);
      }

      // 6th request should be denied
      const deniedResult = await rateLimiter.check(key);
      expect(deniedResult.allowed).toBe(false);
      expect(deniedResult.remaining).toBe(0);
      expect(deniedResult.retryAfterMs).toBeDefined();
      expect(deniedResult.retryAfterMs!).toBeGreaterThan(0);
    });

    it('should track remaining tokens correctly', async () => {
      const key = 'user:remaining-test';

      // First request: should have 4 remaining (5 - 1)
      const result1 = await rateLimiter.check(key);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(4);

      // Second request: should have 3 remaining (5 - 2)
      const result2 = await rateLimiter.check(key);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(3);

      // Third request: should have 2 remaining (5 - 3)
      const result3 = await rateLimiter.check(key);
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(2);
    });

    it('should consume tokens using consume method', async () => {
      const key = 'user:consume-test';

      // consume() should return true when allowed
      for (let i = 0; i < 5; i++) {
        const allowed = await rateLimiter.consume(key);
        expect(allowed).toBe(true);
      }

      // 6th consume should return false
      const deniedConsume = await rateLimiter.consume(key);
      expect(deniedConsume).toBe(false);
    });
  });

  describe('Token Refill Over Time', () => {
    let rateLimiter: InstanceType<typeof RedisRateLimiterAdapter>;

    beforeEach(async () => {
      rateLimiter = new RedisRateLimiterAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:ratelimit:refill:',
        maxRequests: 10,
        windowMs: 1000, // 10 tokens per second = 0.01 tokens/ms
        enabled: true,
        minBurstProtection: 1,
      });
      await rateLimiter.connect();
    });

    afterEach(async () => {
      await rateLimiter.resetAll();
      await rateLimiter.stop();
    });

    it('should refill tokens over time', async () => {
      const key = 'user:refill-test';

      // Consume all 10 tokens
      for (let i = 0; i < 10; i++) {
        const result = await rateLimiter.check(key);
        expect(result.allowed).toBe(true);
      }

      // Should be denied immediately
      const deniedResult = await rateLimiter.check(key);
      expect(deniedResult.allowed).toBe(false);

      // Wait for refill (500ms = 5 tokens at rate of 0.01 tokens/ms)
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should now have ~5 tokens refilled
      const result1 = await rateLimiter.check(key);
      expect(result1.allowed).toBe(true);

      const result2 = await rateLimiter.check(key);
      expect(result2.allowed).toBe(true);

      const result3 = await rateLimiter.check(key);
      expect(result3.allowed).toBe(true);
    });

    it('should not exceed max tokens when refilling', async () => {
      const key = 'user:max-refill-test';

      // Consume 5 tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.check(key);
      }

      // Wait for more than window duration
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Get stats - should have refilled to max (10), not more
      const stats = await rateLimiter.getStats(key);
      expect(stats.remaining).toBeLessThanOrEqual(10);
    });

    it('should calculate resetMs correctly', async () => {
      const key = 'user:reset-test';

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await rateLimiter.check(key);
      }

      // Check denied result
      const deniedResult = await rateLimiter.check(key);
      expect(deniedResult.allowed).toBe(false);
      expect(deniedResult.resetMs).toBeGreaterThan(0);
      expect(deniedResult.resetMs).toBeLessThanOrEqual(1000); // Should reset within window
    });
  });

  describe('Key Isolation', () => {
    let rateLimiter: InstanceType<typeof RedisRateLimiterAdapter>;

    beforeEach(async () => {
      rateLimiter = new RedisRateLimiterAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:ratelimit:isolation:',
        maxRequests: 3,
        windowMs: 1000,
        enabled: true,
        minBurstProtection: 1,
      });
      await rateLimiter.connect();
    });

    afterEach(async () => {
      await rateLimiter.resetAll();
      await rateLimiter.stop();
    });

    it('should isolate different keys', async () => {
      const key1 = 'user:alice';
      const key2 = 'user:bob';

      // Consume all tokens for key1
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.check(key1);
        expect(result.allowed).toBe(true);
      }

      // key1 should be denied
      const deniedResult = await rateLimiter.check(key1);
      expect(deniedResult.allowed).toBe(false);

      // key2 should still be allowed (independent bucket)
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.check(key2);
        expect(result.allowed).toBe(true);
      }
    });

    it('should maintain separate stats for different keys', async () => {
      const key1 = 'user:charlie';
      const key2 = 'user:diana';

      // Use different amounts for each key
      await rateLimiter.check(key1);
      await rateLimiter.check(key1);

      await rateLimiter.check(key2);

      // Check stats independently
      const stats1 = await rateLimiter.getStats(key1);
      expect(stats1.count).toBe(2);
      expect(stats1.remaining).toBe(1);

      const stats2 = await rateLimiter.getStats(key2);
      expect(stats2.count).toBe(1);
      expect(stats2.remaining).toBe(2);
    });

    it('should not affect other keys when resetting', async () => {
      const key1 = 'user:eve';
      const key2 = 'user:frank';

      // Use tokens for both keys
      await rateLimiter.check(key1);
      await rateLimiter.check(key1);

      await rateLimiter.check(key2);

      // Reset only key1
      await rateLimiter.reset(key1);

      // key1 should have full tokens again
      const stats1 = await rateLimiter.getStats(key1);
      expect(stats1.count).toBe(0);
      expect(stats1.remaining).toBe(3);

      // key2 should still have consumed state
      const stats2 = await rateLimiter.getStats(key2);
      expect(stats2.count).toBe(1);
      expect(stats2.remaining).toBe(2);
    });
  });

  describe('Reset Functionality', () => {
    let rateLimiter: InstanceType<typeof RedisRateLimiterAdapter>;

    beforeEach(async () => {
      rateLimiter = new RedisRateLimiterAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:ratelimit:reset:',
        maxRequests: 5,
        windowMs: 1000,
        enabled: true,
        minBurstProtection: 1,
      });
      await rateLimiter.connect();
    });

    afterEach(async () => {
      await rateLimiter.resetAll();
      await rateLimiter.stop();
    });

    it('should reset rate limit for a specific key', async () => {
      const key = 'user:reset-single';

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.check(key);
      }

      // Should be denied
      const deniedResult = await rateLimiter.check(key);
      expect(deniedResult.allowed).toBe(false);

      // Reset the key
      await rateLimiter.reset(key);

      // Should now be allowed again
      const allowedResult = await rateLimiter.check(key);
      expect(allowedResult.allowed).toBe(true);
      expect(allowedResult.remaining).toBe(4); // 5 - 1
    });

    it('should reset all rate limits', async () => {
      const keys = ['user:reset-all-1', 'user:reset-all-2', 'user:reset-all-3'];

      // Consume tokens for all keys
      for (const key of keys) {
        for (let i = 0; i < 5; i++) {
          await rateLimiter.check(key);
        }
      }

      // All should be denied
      for (const key of keys) {
        const result = await rateLimiter.check(key);
        expect(result.allowed).toBe(false);
      }

      // Reset all
      await rateLimiter.resetAll();

      // All should be allowed again
      for (const key of keys) {
        const result = await rateLimiter.check(key);
        expect(result.allowed).toBe(true);
      }
    });

    it('should handle reset on non-existent key', async () => {
      const key = 'user:never-used';

      // Reset should not throw
      await expect(rateLimiter.reset(key)).resolves.toBeUndefined();

      // Should still work normally
      const result = await rateLimiter.check(key);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Distributed Scenario (Two Instances)', () => {
    let rateLimiter1: InstanceType<typeof RedisRateLimiterAdapter>;
    let rateLimiter2: InstanceType<typeof RedisRateLimiterAdapter>;

    beforeEach(async () => {
      const sharedConfig = {
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:ratelimit:distributed:',
        maxRequests: 10,
        windowMs: 1000,
        enabled: true,
        minBurstProtection: 1,
      };

      rateLimiter1 = new RedisRateLimiterAdapter(sharedConfig);
      rateLimiter2 = new RedisRateLimiterAdapter(sharedConfig);

      await rateLimiter1.connect();
      await rateLimiter2.connect();
    });

    afterEach(async () => {
      await rateLimiter1.resetAll();
      await rateLimiter1.stop();
      await rateLimiter2.stop();
    });

    it('should share rate limits across instances', async () => {
      const key = 'user:distributed-share';

      // Instance 1 consumes 6 tokens
      for (let i = 0; i < 6; i++) {
        const result = await rateLimiter1.check(key);
        expect(result.allowed).toBe(true);
      }

      // Instance 2 should see only 4 remaining tokens
      const stats = await rateLimiter2.getStats(key);
      expect(stats.remaining).toBe(4);

      // Instance 2 consumes 4 tokens
      for (let i = 0; i < 4; i++) {
        const result = await rateLimiter2.check(key);
        expect(result.allowed).toBe(true);
      }

      // Both instances should now deny requests
      const denied1 = await rateLimiter1.check(key);
      expect(denied1.allowed).toBe(false);

      const denied2 = await rateLimiter2.check(key);
      expect(denied2.allowed).toBe(false);
    });

    it('should coordinate across instances in real-time', async () => {
      const key = 'user:distributed-realtime';

      // Interleave requests from both instances
      let totalAllowed = 0;

      for (let i = 0; i < 20; i++) {
        const limiter = i % 2 === 0 ? rateLimiter1 : rateLimiter2;
        const result = await limiter.check(key);

        if (result.allowed) {
          totalAllowed++;
        }
      }

      // Should allow exactly maxRequests (10), regardless of which instance
      expect(totalAllowed).toBe(10);
    });

    it('should see reset from other instance', async () => {
      const key = 'user:distributed-reset';

      // Instance 1 consumes all tokens
      for (let i = 0; i < 10; i++) {
        await rateLimiter1.check(key);
      }

      // Instance 2 should be denied
      const denied = await rateLimiter2.check(key);
      expect(denied.allowed).toBe(false);

      // Instance 1 resets
      await rateLimiter1.reset(key);

      // Instance 2 should now be allowed
      const allowed = await rateLimiter2.check(key);
      expect(allowed.allowed).toBe(true);
    });

    it('should maintain consistency under concurrent load', async () => {
      const key = 'user:distributed-concurrent';

      // Simulate concurrent requests from both instances
      const promises: Promise<boolean>[] = [];

      for (let i = 0; i < 10; i++) {
        promises.push(rateLimiter1.consume(key));
        promises.push(rateLimiter2.consume(key));
      }

      const results = await Promise.all(promises);
      const allowedCount = results.filter((r) => r).length;

      // Due to token bucket refill, we might allow slightly more than 10
      // but should be close to the limit
      expect(allowedCount).toBeLessThanOrEqual(12); // Allow small margin
      expect(allowedCount).toBeGreaterThanOrEqual(10);
    });

    it('should share stats across instances', async () => {
      const key = 'user:distributed-stats';

      // Instance 1 uses some tokens
      await rateLimiter1.check(key);
      await rateLimiter1.check(key);
      await rateLimiter1.check(key);

      // Instance 2 should see the same stats
      const stats1 = await rateLimiter1.getStats(key);
      const stats2 = await rateLimiter2.getStats(key);

      expect(stats1.count).toBe(stats2.count);
      expect(stats1.remaining).toBe(stats2.remaining);
      expect(stats1.windowMs).toBe(stats2.windowMs);
    });
  });

  describe('Configuration and Edge Cases', () => {
    it('should respect enabled flag', async () => {
      const rateLimiter = new RedisRateLimiterAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:ratelimit:disabled:',
        maxRequests: 1,
        windowMs: 1000,
        enabled: false,
      });

      await rateLimiter.connect();

      try {
        // Should always allow when disabled
        for (let i = 0; i < 100; i++) {
          const result = await rateLimiter.check('user:test');
          expect(result.allowed).toBe(true);
        }
      } finally {
        await rateLimiter.stop();
      }
    });

    it('should update config dynamically', async () => {
      const rateLimiter = new RedisRateLimiterAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:ratelimit:config:',
        maxRequests: 5,
        windowMs: 1000,
        enabled: true,
      });

      await rateLimiter.connect();

      try {
        const key = 'user:config-update';

        // Use 3 tokens
        for (let i = 0; i < 3; i++) {
          await rateLimiter.check(key);
        }

        // Update to lower limit
        rateLimiter.updateConfig({ maxRequests: 2 });

        // Reset to apply new config
        await rateLimiter.reset(key);

        // Should now only allow 2 requests
        const result1 = await rateLimiter.check(key);
        expect(result1.allowed).toBe(true);

        const result2 = await rateLimiter.check(key);
        expect(result2.allowed).toBe(true);

        const result3 = await rateLimiter.check(key);
        expect(result3.allowed).toBe(false);
      } finally {
        await rateLimiter.resetAll();
        await rateLimiter.stop();
      }
    });

    it('should handle graceful degradation when Redis unavailable', async () => {
      const rateLimiter = new RedisRateLimiterAdapter({
        host: 'invalid-host-that-does-not-exist.local',
        port: 9999,
        keyPrefix: 'test:ratelimit:degraded:',
        maxRequests: 5,
        windowMs: 1000,
        enabled: true,
      });

      // Don't await connect - it will fail silently
      rateLimiter.connect().catch(() => {});

      // Should allow requests (graceful degradation)
      const result = await rateLimiter.check('user:test');
      expect(result.allowed).toBe(true);

      await rateLimiter.stop();
    });

    it('should return correct stats for unused key', async () => {
      const rateLimiter = new RedisRateLimiterAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:ratelimit:unused:',
        maxRequests: 10,
        windowMs: 1000,
        enabled: true,
      });

      await rateLimiter.connect();

      try {
        const stats = await rateLimiter.getStats('user:never-used');

        expect(stats.count).toBe(0);
        expect(stats.remaining).toBe(10);
        expect(stats.windowMs).toBe(1000);
      } finally {
        await rateLimiter.stop();
      }
    });

    it('should expose config and client', async () => {
      const rateLimiter = new RedisRateLimiterAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:ratelimit:expose:',
        maxRequests: 10,
        windowMs: 2000,
        enabled: true,
        minBurstProtection: 5,
      });

      await rateLimiter.connect();

      try {
        const config = rateLimiter.getConfig();
        expect(config.maxRequests).toBe(10);
        expect(config.windowMs).toBe(2000);
        expect(config.enabled).toBe(true);
        expect(config.minBurstProtection).toBe(5);

        const client = rateLimiter.getClient();
        expect(client).not.toBeNull();
      } finally {
        await rateLimiter.stop();
      }
    });

    it('should check if enabled', async () => {
      const rateLimiter = new RedisRateLimiterAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:ratelimit:isenabled:',
        maxRequests: 10,
        windowMs: 1000,
        enabled: true,
      });

      expect(rateLimiter.isEnabled()).toBe(true);

      rateLimiter.updateConfig({ enabled: false });
      expect(rateLimiter.isEnabled()).toBe(false);

      await rateLimiter.stop();
    });
  });

  describe('Burst Protection', () => {
    let rateLimiter: InstanceType<typeof RedisRateLimiterAdapter>;

    beforeEach(async () => {
      rateLimiter = new RedisRateLimiterAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:ratelimit:burst:',
        maxRequests: 100,
        windowMs: 10000, // 100 tokens over 10 seconds
        enabled: true,
        minBurstProtection: 10, // Require at least 10 tokens for burst
      });
      await rateLimiter.connect();
    });

    afterEach(async () => {
      await rateLimiter.resetAll();
      await rateLimiter.stop();
    });

    it('should enforce burst protection threshold', async () => {
      const key = 'user:burst-test';

      // Consume tokens down to just below burst threshold
      for (let i = 0; i < 91; i++) {
        await rateLimiter.check(key);
      }

      // Should still have 9 tokens left
      const stats = await rateLimiter.getStats(key);
      expect(stats.remaining).toBe(9);

      // Should be denied due to burst protection (< 10 tokens)
      const result = await rateLimiter.check(key);
      expect(result.allowed).toBe(false);
    });
  });
});
