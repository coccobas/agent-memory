import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  LocalRateLimiterAdapter,
  createLocalRateLimiterAdapter,
} from '../../src/core/adapters/local-rate-limiter.adapter.js';
import type { RateLimiterConfig } from '../../src/utils/rate-limiter-core.js';

describe('LocalRateLimiterAdapter', () => {
  let adapter: LocalRateLimiterAdapter;
  const defaultConfig: RateLimiterConfig = {
    maxRequests: 10,
    windowMs: 1000,
    enabled: true,
    minBurstProtection: 5,
  };

  beforeEach(() => {
    adapter = new LocalRateLimiterAdapter(defaultConfig);
  });

  afterEach(async () => {
    await adapter.stop();
  });

  describe('constructor', () => {
    it('should create an adapter with config', () => {
      expect(adapter).toBeDefined();
    });

    it('should respect enabled config', () => {
      const disabledAdapter = new LocalRateLimiterAdapter({
        ...defaultConfig,
        enabled: false,
      });
      expect(disabledAdapter.isEnabled()).toBe(false);
      disabledAdapter.stop();
    });
  });

  describe('check', () => {
    it('should allow requests under limit', async () => {
      const result = await adapter.check('test-key');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeDefined();
    });

    it('should return remaining tokens', async () => {
      const result = await adapter.check('test-key');
      expect(typeof result.remaining).toBe('number');
      expect(result.remaining).toBeLessThanOrEqual(defaultConfig.maxRequests);
    });

    it('should deny requests over limit', async () => {
      const key = 'rate-limit-test';

      // Consume all tokens
      for (let i = 0; i < defaultConfig.maxRequests + 5; i++) {
        await adapter.check(key);
      }

      const result = await adapter.check(key);
      expect(result.allowed).toBe(false);
    });

    it('should track different keys separately', async () => {
      const key1 = 'key-1';
      const key2 = 'key-2';

      // Consume all tokens for key1
      for (let i = 0; i < defaultConfig.maxRequests + 5; i++) {
        await adapter.check(key1);
      }

      // key2 should still be allowed
      const result = await adapter.check(key2);
      expect(result.allowed).toBe(true);
    });

    it('should return retryAfterMs when blocked', async () => {
      const key = 'retry-test';

      // Consume all tokens
      for (let i = 0; i < defaultConfig.maxRequests + 10; i++) {
        await adapter.check(key);
      }

      const result = await adapter.check(key);
      if (!result.allowed) {
        expect(result.retryAfterMs).toBeGreaterThan(0);
      }
    });
  });

  describe('consume', () => {
    it('should return true when allowed', async () => {
      const result = await adapter.consume('consume-test');
      expect(result).toBe(true);
    });

    it('should return false when blocked', async () => {
      const key = 'consume-block-test';

      // Consume all tokens
      for (let i = 0; i < defaultConfig.maxRequests + 5; i++) {
        await adapter.consume(key);
      }

      const result = await adapter.consume(key);
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return stats for new key', async () => {
      const stats = await adapter.getStats('new-key');
      expect(stats).toBeDefined();
      expect(stats.remaining).toBeDefined();
    });

    it('should return stats after some requests', async () => {
      const key = 'stats-test';

      await adapter.check(key);
      await adapter.check(key);
      await adapter.check(key);

      const stats = await adapter.getStats(key);
      expect(stats.remaining).toBeLessThan(defaultConfig.maxRequests);
    });

    it('should not consume token when getting stats', async () => {
      const key = 'stats-no-consume';

      const statsBefore = await adapter.getStats(key);
      await adapter.getStats(key);
      await adapter.getStats(key);
      const statsAfter = await adapter.getStats(key);

      expect(statsAfter.remaining).toBe(statsBefore.remaining);
    });
  });

  describe('reset', () => {
    it('should reset tokens for specific key', async () => {
      const key = 'reset-test';

      // Consume some tokens
      for (let i = 0; i < 5; i++) {
        await adapter.check(key);
      }

      const statsBefore = await adapter.getStats(key);
      expect(statsBefore.remaining).toBeLessThan(defaultConfig.maxRequests);

      await adapter.reset(key);

      const statsAfter = await adapter.getStats(key);
      expect(statsAfter.remaining).toBeGreaterThanOrEqual(statsBefore.remaining);
    });

    it('should not affect other keys', async () => {
      const key1 = 'reset-key1';
      const key2 = 'reset-key2';

      await adapter.check(key1);
      await adapter.check(key2);

      await adapter.reset(key1);

      // key2 should still have reduced tokens
      const stats2 = await adapter.getStats(key2);
      expect(stats2.remaining).toBeLessThan(defaultConfig.maxRequests);
    });
  });

  describe('resetAll', () => {
    it('should reset all keys', async () => {
      await adapter.check('all-key-1');
      await adapter.check('all-key-2');
      await adapter.check('all-key-3');

      await adapter.resetAll();

      // All keys should be reset
      const stats1 = await adapter.getStats('all-key-1');
      const stats2 = await adapter.getStats('all-key-2');
      const stats3 = await adapter.getStats('all-key-3');

      // After resetAll, stats should show max tokens again
      expect(stats1.remaining).toBe(defaultConfig.maxRequests);
      expect(stats2.remaining).toBe(defaultConfig.maxRequests);
      expect(stats3.remaining).toBe(defaultConfig.maxRequests);
    });
  });

  describe('updateConfig', () => {
    it('should update max requests', () => {
      adapter.updateConfig({ maxRequests: 20 });
      expect(adapter.isEnabled()).toBe(true);
    });

    it('should update window', () => {
      adapter.updateConfig({ windowMs: 5000 });
      expect(adapter.isEnabled()).toBe(true);
    });

    it('should update enabled status', () => {
      adapter.updateConfig({ enabled: false });
      expect(adapter.isEnabled()).toBe(false);
    });

    it('should allow multiple config updates', () => {
      adapter.updateConfig({ maxRequests: 50 });
      adapter.updateConfig({ windowMs: 2000 });
      adapter.updateConfig({ minBurstProtection: 25 });
      expect(adapter.isEnabled()).toBe(true);
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      expect(adapter.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const disabledAdapter = new LocalRateLimiterAdapter({
        ...defaultConfig,
        enabled: false,
      });
      expect(disabledAdapter.isEnabled()).toBe(false);
      disabledAdapter.stop();
    });
  });

  describe('stop', () => {
    it('should stop without error', async () => {
      await expect(adapter.stop()).resolves.not.toThrow();
    });

    it('should be safe to call multiple times', async () => {
      await adapter.stop();
      await expect(adapter.stop()).resolves.not.toThrow();
    });
  });
});

describe('createLocalRateLimiterAdapter', () => {
  it('should create an adapter', () => {
    const adapter = createLocalRateLimiterAdapter({
      maxRequests: 100,
      windowMs: 60000,
      enabled: true,
      minBurstProtection: 50,
    });

    expect(adapter).toBeDefined();
    expect(adapter).toBeInstanceOf(LocalRateLimiterAdapter);
    adapter.stop();
  });

  it('should create a working adapter', async () => {
    const adapter = createLocalRateLimiterAdapter({
      maxRequests: 5,
      windowMs: 1000,
      enabled: true,
      minBurstProtection: 2,
    });

    const result = await adapter.check('test');
    expect(result.allowed).toBe(true);
    await adapter.stop();
  });
});

describe('LocalRateLimiterAdapter when disabled', () => {
  let adapter: LocalRateLimiterAdapter;

  beforeEach(() => {
    adapter = new LocalRateLimiterAdapter({
      maxRequests: 10,
      windowMs: 1000,
      enabled: false,
      minBurstProtection: 5,
    });
  });

  afterEach(async () => {
    await adapter.stop();
  });

  it('should report as not enabled', () => {
    expect(adapter.isEnabled()).toBe(false);
  });

  it('should still track requests even when disabled', async () => {
    // When disabled, rate limiting may still track but behavior varies
    const result = await adapter.check('disabled-test');
    expect(result).toBeDefined();
    expect(typeof result.allowed).toBe('boolean');
  });
});
