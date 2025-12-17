import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RateLimiter,
  DEFAULT_RATE_LIMITS,
  getPerAgentLimiter,
  getGlobalLimiter,
  getBurstLimiter,
  checkRateLimits,
  resetRateLimiters,
} from '../../src/utils/rate-limiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    limiter?.stop();
    vi.useRealTimers();
    resetRateLimiters();
  });

  describe('constructor', () => {
    it('should create rate limiter with provided config', () => {
      limiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 1000,
      });

      expect(limiter.isEnabled()).toBe(true);
    });

    it('should create rate limiter with enabled flag', () => {
      limiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 1000,
        enabled: false,
      });

      expect(limiter.isEnabled()).toBe(false);
    });

    it('should default enabled to true when not specified', () => {
      limiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 1000,
      });

      expect(limiter.isEnabled()).toBe(true);
    });
  });

  describe('check', () => {
    beforeEach(() => {
      limiter = new RateLimiter({
        maxRequests: 3,
        windowMs: 1000,
      });
    });

    it('should allow requests within limit', () => {
      const result1 = limiter.check('test-key');
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);
      expect(result1.resetMs).toBe(1000);

      const result2 = limiter.check('test-key');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      const result3 = limiter.check('test-key');
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);
    });

    it('should reject requests exceeding limit', () => {
      limiter.check('test-key');
      limiter.check('test-key');
      limiter.check('test-key');

      const result = limiter.check('test-key');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('should track separate keys independently', () => {
      limiter.check('key1');
      limiter.check('key1');
      limiter.check('key1');

      const result1 = limiter.check('key1');
      expect(result1.allowed).toBe(false);

      const result2 = limiter.check('key2');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(2);
    });

    it('should allow requests after window expires', () => {
      limiter.check('test-key');
      limiter.check('test-key');
      limiter.check('test-key');

      const rejectedResult = limiter.check('test-key');
      expect(rejectedResult.allowed).toBe(false);

      // Advance time past window
      vi.advanceTimersByTime(1001);

      const allowedResult = limiter.check('test-key');
      expect(allowedResult.allowed).toBe(true);
      expect(allowedResult.remaining).toBe(2);
    });

    it('should slide window correctly', () => {
      limiter.check('test-key');
      vi.advanceTimersByTime(500);
      limiter.check('test-key');
      vi.advanceTimersByTime(500);

      // First request should have expired now
      const result = limiter.check('test-key');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it('should allow all requests when disabled', () => {
      limiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 1000,
        enabled: false,
      });

      const result1 = limiter.check('test-key');
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(1);

      const result2 = limiter.check('test-key');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      const result3 = limiter.check('test-key');
      expect(result3.allowed).toBe(true);
    });

    it('should calculate correct retryAfterMs', () => {
      limiter.check('test-key');
      limiter.check('test-key');
      limiter.check('test-key');

      const result = limiter.check('test-key');
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeLessThanOrEqual(1000);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });
  });

  describe('consume', () => {
    beforeEach(() => {
      limiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 1000,
      });
    });

    it('should return true when request is allowed', () => {
      expect(limiter.consume('test-key')).toBe(true);
      expect(limiter.consume('test-key')).toBe(true);
    });

    it('should return false when limit is exceeded', () => {
      limiter.consume('test-key');
      limiter.consume('test-key');

      expect(limiter.consume('test-key')).toBe(false);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 2000,
      });
    });

    it('should return zero count for new key', () => {
      const stats = limiter.getStats('new-key');
      expect(stats.count).toBe(0);
      expect(stats.remaining).toBe(5);
      expect(stats.windowMs).toBe(2000);
    });

    it('should return correct count after requests', () => {
      limiter.check('test-key');
      limiter.check('test-key');
      limiter.check('test-key');

      const stats = limiter.getStats('test-key');
      expect(stats.count).toBe(3);
      expect(stats.remaining).toBe(2);
      expect(stats.windowMs).toBe(2000);
    });

    it('should filter expired timestamps', () => {
      limiter.check('test-key');
      limiter.check('test-key');

      vi.advanceTimersByTime(2001);

      const stats = limiter.getStats('test-key');
      expect(stats.count).toBe(0);
      expect(stats.remaining).toBe(5);
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      limiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 1000,
      });
    });

    it('should reset rate limit for specific key', () => {
      limiter.check('test-key');
      limiter.check('test-key');

      let result = limiter.check('test-key');
      expect(result.allowed).toBe(false);

      limiter.reset('test-key');

      result = limiter.check('test-key');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it('should not affect other keys', () => {
      limiter.check('key1');
      limiter.check('key2');

      limiter.reset('key1');

      const stats1 = limiter.getStats('key1');
      expect(stats1.count).toBe(0);

      const stats2 = limiter.getStats('key2');
      expect(stats2.count).toBe(1);
    });
  });

  describe('resetAll', () => {
    beforeEach(() => {
      limiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 1000,
      });
    });

    it('should reset all rate limits', () => {
      limiter.check('key1');
      limiter.check('key2');
      limiter.check('key3');

      limiter.resetAll();

      expect(limiter.getStats('key1').count).toBe(0);
      expect(limiter.getStats('key2').count).toBe(0);
      expect(limiter.getStats('key3').count).toBe(0);
    });
  });

  describe('updateConfig', () => {
    beforeEach(() => {
      limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
        enabled: true,
      });
    });

    it('should update maxRequests', () => {
      limiter.updateConfig({ maxRequests: 10 });

      limiter.check('test-key');
      const stats = limiter.getStats('test-key');
      expect(stats.remaining).toBe(9);
    });

    it('should update windowMs', () => {
      limiter.updateConfig({ windowMs: 2000 });

      const stats = limiter.getStats('test-key');
      expect(stats.windowMs).toBe(2000);
    });

    it('should update enabled flag', () => {
      expect(limiter.isEnabled()).toBe(true);

      limiter.updateConfig({ enabled: false });
      expect(limiter.isEnabled()).toBe(false);
    });

    it('should update multiple config values', () => {
      limiter.updateConfig({
        maxRequests: 20,
        windowMs: 5000,
        enabled: false,
      });

      expect(limiter.isEnabled()).toBe(false);
      const stats = limiter.getStats('test-key');
      expect(stats.remaining).toBe(20);
      expect(stats.windowMs).toBe(5000);
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
        enabled: true,
      });

      expect(limiter.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
        enabled: false,
      });

      expect(limiter.isEnabled()).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should periodically clean up expired entries', () => {
      limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });

      limiter.check('key1');
      limiter.check('key2');
      limiter.check('key3');

      // Advance time past window
      vi.advanceTimersByTime(2000);

      // Trigger cleanup interval (runs every 60 seconds)
      vi.advanceTimersByTime(60000);

      // All stats should show 0 count as entries were cleaned up
      expect(limiter.getStats('key1').count).toBe(0);
      expect(limiter.getStats('key2').count).toBe(0);
      expect(limiter.getStats('key3').count).toBe(0);
    });
  });

  describe('stop', () => {
    it('should stop cleanup interval and clear windows', () => {
      limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });

      limiter.check('test-key');
      limiter.stop();

      const stats = limiter.getStats('test-key');
      expect(stats.count).toBe(0);
    });

    it('should be safe to call multiple times', () => {
      limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });

      limiter.stop();
      limiter.stop();
      // Should not throw
    });
  });
});

describe('Singleton Rate Limiters', () => {
  beforeEach(async () => {
    delete process.env.AGENT_MEMORY_RATE_LIMIT;
    const { reloadConfig } = await import('../../src/config/index.js');
    reloadConfig();
    resetRateLimiters();
  });

  afterEach(async () => {
    resetRateLimiters();
    delete process.env.AGENT_MEMORY_RATE_LIMIT;
    const { reloadConfig } = await import('../../src/config/index.js');
    reloadConfig();
  });

  describe('getPerAgentLimiter', () => {
    it('should return singleton instance', () => {
      const limiter1 = getPerAgentLimiter();
      const limiter2 = getPerAgentLimiter();

      expect(limiter1).toBe(limiter2);
    });

    it('should use default per-agent config', () => {
      const limiter = getPerAgentLimiter();
      const stats = limiter.getStats('test');

      expect(stats.remaining).toBe(DEFAULT_RATE_LIMITS.perAgent.maxRequests);
      expect(stats.windowMs).toBe(DEFAULT_RATE_LIMITS.perAgent.windowMs);
    });

    it('should be enabled by default', () => {
      const limiter = getPerAgentLimiter();
      expect(limiter.isEnabled()).toBe(true);
    });

    it('should be disabled when env var is set to 0', async () => {
      process.env.AGENT_MEMORY_RATE_LIMIT = '0';
      const { reloadConfig } = await import('../../src/config/index.js');
      reloadConfig();
      resetRateLimiters();

      const limiter = getPerAgentLimiter();
      expect(limiter.isEnabled()).toBe(false);
    });
  });

  describe('getGlobalLimiter', () => {
    it('should return singleton instance', () => {
      const limiter1 = getGlobalLimiter();
      const limiter2 = getGlobalLimiter();

      expect(limiter1).toBe(limiter2);
    });

    it('should use default global config', () => {
      const limiter = getGlobalLimiter();
      const stats = limiter.getStats('global');

      expect(stats.remaining).toBe(DEFAULT_RATE_LIMITS.global.maxRequests);
      expect(stats.windowMs).toBe(DEFAULT_RATE_LIMITS.global.windowMs);
    });

    it('should be disabled when env var is set to 0', async () => {
      process.env.AGENT_MEMORY_RATE_LIMIT = '0';
      const { reloadConfig } = await import('../../src/config/index.js');
      reloadConfig();
      resetRateLimiters();

      const limiter = getGlobalLimiter();
      expect(limiter.isEnabled()).toBe(false);
    });
  });

  describe('getBurstLimiter', () => {
    it('should return singleton instance', () => {
      const limiter1 = getBurstLimiter();
      const limiter2 = getBurstLimiter();

      expect(limiter1).toBe(limiter2);
    });

    it('should use default burst config', () => {
      const limiter = getBurstLimiter();
      const stats = limiter.getStats('global');

      expect(stats.remaining).toBe(DEFAULT_RATE_LIMITS.burst.maxRequests);
      expect(stats.windowMs).toBe(DEFAULT_RATE_LIMITS.burst.windowMs);
    });

    it('should be disabled when env var is set to 0', async () => {
      process.env.AGENT_MEMORY_RATE_LIMIT = '0';
      const { reloadConfig } = await import('../../src/config/index.js');
      reloadConfig();
      resetRateLimiters();

      const limiter = getBurstLimiter();
      expect(limiter.isEnabled()).toBe(false);
    });
  });
});

describe('checkRateLimits', () => {
  beforeEach(async () => {
    delete process.env.AGENT_MEMORY_RATE_LIMIT;
    const { reloadConfig } = await import('../../src/config/index.js');
    reloadConfig();
    resetRateLimiters();
  });

  afterEach(async () => {
    resetRateLimiters();
    delete process.env.AGENT_MEMORY_RATE_LIMIT;
    const { reloadConfig } = await import('../../src/config/index.js');
    reloadConfig();
  });

  it('should allow request when all limits are satisfied', () => {
    const result = checkRateLimits('agent-1');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should allow request without agentId', () => {
    const result = checkRateLimits();
    expect(result.allowed).toBe(true);
  });

  it('should reject when burst limit exceeded', () => {
    const burstLimiter = getBurstLimiter();

    // Exhaust burst limit
    for (let i = 0; i < DEFAULT_RATE_LIMITS.burst.maxRequests; i++) {
      burstLimiter.check('global');
    }

    const result = checkRateLimits('agent-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Burst rate limit exceeded');
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('should reject when global limit exceeded', () => {
    const globalLimiter = getGlobalLimiter();

    // Exhaust global limit
    for (let i = 0; i < DEFAULT_RATE_LIMITS.global.maxRequests; i++) {
      globalLimiter.check('global');
    }

    const result = checkRateLimits('agent-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Global rate limit exceeded');
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('should reject when per-agent limit exceeded', () => {
    const perAgentLimiter = getPerAgentLimiter();

    // Exhaust per-agent limit for specific agent
    for (let i = 0; i < DEFAULT_RATE_LIMITS.perAgent.maxRequests; i++) {
      perAgentLimiter.check('agent-1');
    }

    const result = checkRateLimits('agent-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Rate limit exceeded for agent agent-1');
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('should check limits in correct order (burst -> global -> per-agent)', () => {
    const burstLimiter = getBurstLimiter();
    const globalLimiter = getGlobalLimiter();

    // Exhaust both burst and global
    for (let i = 0; i < DEFAULT_RATE_LIMITS.burst.maxRequests; i++) {
      burstLimiter.check('global');
    }
    for (let i = 0; i < DEFAULT_RATE_LIMITS.global.maxRequests; i++) {
      globalLimiter.check('global');
    }

    const result = checkRateLimits('agent-1');
    // Should fail on burst first
    expect(result.reason).toBe('Burst rate limit exceeded');
  });
});

describe('resetRateLimiters', () => {
  it('should reset all singleton limiters', () => {
    const perAgent = getPerAgentLimiter();
    const global = getGlobalLimiter();
    const burst = getBurstLimiter();

    perAgent.check('agent-1');
    global.check('global');
    burst.check('global');

    resetRateLimiters();

    // New instances should be created
    const newPerAgent = getPerAgentLimiter();
    const newGlobal = getGlobalLimiter();
    const newBurst = getBurstLimiter();

    expect(newPerAgent).not.toBe(perAgent);
    expect(newGlobal).not.toBe(global);
    expect(newBurst).not.toBe(burst);
  });
});

describe('DEFAULT_RATE_LIMITS', () => {
  it('should have correct per-agent limits', () => {
    expect(DEFAULT_RATE_LIMITS.perAgent.maxRequests).toBe(100);
    expect(DEFAULT_RATE_LIMITS.perAgent.windowMs).toBe(60000);
  });

  it('should have correct global limits', () => {
    expect(DEFAULT_RATE_LIMITS.global.maxRequests).toBe(1000);
    expect(DEFAULT_RATE_LIMITS.global.windowMs).toBe(60000);
  });

  it('should have correct burst limits', () => {
    expect(DEFAULT_RATE_LIMITS.burst.maxRequests).toBe(20);
    expect(DEFAULT_RATE_LIMITS.burst.windowMs).toBe(1000);
  });
});
