/**
 * Token bucket rate limiter core
 *
 * Pure implementation with no dependency on global config/singletons.
 * Intended for use by AppContext-bound services (e.g. SecurityService).
 */

import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('rate-limiter');

export interface RateLimiterConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Whether to enable rate limiting (default: true) */
  enabled?: boolean;
  /**
   * Minimum burst protection - applies even when rate limiting is disabled
   * Prevents DoS by limiting max requests per second (default: 100)
   */
  minBurstProtection?: number;
}

interface TokenBucketEntry {
  tokens: number;
  lastRefillTime: number;
}

export class RateLimiter {
  private buckets = new Map<string, TokenBucketEntry>();
  private burstBuckets = new Map<string, TokenBucketEntry>();
  private config: Required<RateLimiterConfig>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  private static readonly DEFAULT_MIN_BURST_PROTECTION = 100;

  constructor(config: RateLimiterConfig) {
    this.config = {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      enabled: config.enabled ?? true,
      minBurstProtection: config.minBurstProtection ?? RateLimiter.DEFAULT_MIN_BURST_PROTECTION,
    };

    this.startCleanup();
  }

  private refillBucket(
    bucket: TokenBucketEntry,
    maxTokens: number,
    refillRatePerMs: number,
    now: number
  ): void {
    const elapsed = now - bucket.lastRefillTime;
    const tokensToAdd = elapsed * refillRatePerMs;
    bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefillTime = now;
  }

  check(key: string): {
    allowed: boolean;
    remaining: number;
    resetMs: number;
    retryAfterMs?: number;
  } {
    const now = Date.now();

    const burstRefillRate = this.config.minBurstProtection / 1000;

    let burstBucket = this.burstBuckets.get(key);
    if (!burstBucket) {
      burstBucket = { tokens: this.config.minBurstProtection, lastRefillTime: now };
      this.burstBuckets.set(key, burstBucket);
    } else {
      this.refillBucket(burstBucket, this.config.minBurstProtection, burstRefillRate, now);
    }

    if (burstBucket.tokens < 1) {
      const tokensNeeded = 1 - burstBucket.tokens;
      const retryAfterMs = Math.ceil(tokensNeeded / burstRefillRate);

      logger.warn(
        {
          key,
          currentTokens: burstBucket.tokens,
          minBurstProtection: this.config.minBurstProtection,
          retryAfterMs,
        },
        'Minimum burst protection triggered'
      );

      return {
        allowed: false,
        remaining: 0,
        resetMs: retryAfterMs,
        retryAfterMs,
      };
    }

    burstBucket.tokens -= 1;

    if (!this.config.enabled) {
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetMs: 0,
      };
    }

    const refillRate = this.config.maxRequests / this.config.windowMs;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.config.maxRequests, lastRefillTime: now };
      this.buckets.set(key, bucket);
    } else {
      this.refillBucket(bucket, this.config.maxRequests, refillRate, now);
    }

    if (bucket.tokens < 1) {
      const tokensNeeded = 1 - bucket.tokens;
      const retryAfterMs = Math.ceil(tokensNeeded / refillRate);

      logger.warn(
        {
          key,
          currentTokens: bucket.tokens,
          maxRequests: this.config.maxRequests,
          retryAfterMs,
        },
        'Rate limit exceeded'
      );

      return {
        allowed: false,
        remaining: 0,
        resetMs: retryAfterMs,
        retryAfterMs,
      };
    }

    bucket.tokens -= 1;
    const remaining = Math.floor(bucket.tokens);

    return {
      allowed: true,
      remaining,
      resetMs: this.config.windowMs,
    };
  }

  consume(key: string): boolean {
    return this.check(key).allowed;
  }

  getStats(key: string): { count: number; remaining: number; windowMs: number } {
    const now = Date.now();
    const refillRate = this.config.maxRequests / this.config.windowMs;

    const bucket = this.buckets.get(key);
    if (!bucket) {
      return {
        count: 0,
        remaining: this.config.maxRequests,
        windowMs: this.config.windowMs,
      };
    }

    this.refillBucket(bucket, this.config.maxRequests, refillRate, now);

    const remaining = Math.floor(bucket.tokens);
    const count = this.config.maxRequests - remaining;

    return {
      count: Math.max(0, count),
      remaining: Math.max(0, remaining),
      windowMs: this.config.windowMs,
    };
  }

  updateConfig(config: Partial<RateLimiterConfig>): void {
    if (config.maxRequests !== undefined) {
      this.config.maxRequests = config.maxRequests;
    }
    if (config.windowMs !== undefined) {
      this.config.windowMs = config.windowMs;
    }
    if (config.enabled !== undefined) {
      this.config.enabled = config.enabled;
    }
    if (config.minBurstProtection !== undefined) {
      this.config.minBurstProtection = config.minBurstProtection;
    }
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  reset(key: string): void {
    this.buckets.delete(key);
    this.burstBuckets.delete(key);
  }

  resetAll(): void {
    this.buckets.clear();
    this.burstBuckets.clear();
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.buckets.clear();
    this.burstBuckets.clear();
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = this.config.windowMs * 2;

      for (const [key, bucket] of this.buckets) {
        if (bucket.tokens >= this.config.maxRequests && now - bucket.lastRefillTime > staleThreshold) {
          this.buckets.delete(key);
        }
      }

      for (const [key, bucket] of this.burstBuckets) {
        if (
          bucket.tokens >= this.config.minBurstProtection &&
          now - bucket.lastRefillTime > 2000
        ) {
          this.burstBuckets.delete(key);
        }
      }
    }, 60000);

    this.cleanupInterval.unref();
  }
}
