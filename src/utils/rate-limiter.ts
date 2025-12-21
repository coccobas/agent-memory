/**
 * Token bucket rate limiter for MCP tool calls
 *
 * Provides per-agent and global rate limiting to prevent DoS
 * and ensure fair resource usage across multiple agents.
 *
 * Uses token bucket algorithm for O(1) memory per key instead of
 * unbounded timestamp arrays. Tokens refill continuously based on
 * elapsed time.
 */

import { createComponentLogger } from './logger.js';
import { config } from '../config/index.js';

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

/**
 * Token bucket entry - O(1) memory per key
 * Stores current token count and last refill time instead of timestamp arrays
 */
interface TokenBucketEntry {
  tokens: number;
  lastRefillTime: number;
}

/**
 * Token bucket rate limiter
 *
 * Uses token bucket algorithm for fixed memory usage.
 * Tokens refill at a rate of maxRequests/windowMs per millisecond.
 * Each request consumes one token.
 */
export class RateLimiter {
  private buckets = new Map<string, TokenBucketEntry>();
  private burstBuckets = new Map<string, TokenBucketEntry>(); // Separate bucket for burst protection
  private config: Required<RateLimiterConfig>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Default minimum burst protection: 100 requests per second even when disabled
  private static readonly DEFAULT_MIN_BURST_PROTECTION = 100;

  constructor(config: RateLimiterConfig) {
    this.config = {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      enabled: config.enabled ?? true,
      minBurstProtection: config.minBurstProtection ?? RateLimiter.DEFAULT_MIN_BURST_PROTECTION,
    };

    // Start cleanup interval to remove stale entries (less critical now but still useful)
    this.startCleanup();
  }

  /**
   * Refill tokens for a bucket based on elapsed time
   */
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

  /**
   * Check if a request should be allowed
   *
   * @param key - Identifier for rate limiting (e.g., agentId, 'global')
   * @returns Object with allowed status and metadata
   */
  check(key: string): {
    allowed: boolean;
    remaining: number;
    resetMs: number;
    retryAfterMs?: number;
  } {
    const now = Date.now();

    // Always enforce minimum burst protection (even when rate limiting is disabled)
    // Burst protection: minBurstProtection tokens per 1000ms
    const burstRefillRate = this.config.minBurstProtection / 1000; // tokens per ms

    let burstBucket = this.burstBuckets.get(key);
    if (!burstBucket) {
      burstBucket = { tokens: this.config.minBurstProtection, lastRefillTime: now };
      this.burstBuckets.set(key, burstBucket);
    } else {
      this.refillBucket(burstBucket, this.config.minBurstProtection, burstRefillRate, now);
    }

    // Check burst protection
    if (burstBucket.tokens < 1) {
      // Calculate when we'll have 1 token again
      const tokensNeeded = 1 - burstBucket.tokens;
      const retryAfterMs = Math.ceil(tokensNeeded / burstRefillRate);

      logger.warn(
        {
          key,
          currentTokens: burstBucket.tokens,
          minBurstProtection: this.config.minBurstProtection,
          retryAfterMs,
        },
        'Minimum burst protection triggered (rate limiting may be disabled but DoS protection active)'
      );

      return {
        allowed: false,
        remaining: 0,
        resetMs: retryAfterMs,
        retryAfterMs,
      };
    }

    // Consume burst token
    burstBucket.tokens -= 1;

    // If rate limiting is disabled (but burst protection passed), allow the request
    if (!this.config.enabled) {
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetMs: 0,
      };
    }

    // Main rate limiting: maxRequests tokens per windowMs
    const refillRate = this.config.maxRequests / this.config.windowMs; // tokens per ms

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.config.maxRequests, lastRefillTime: now };
      this.buckets.set(key, bucket);
    } else {
      this.refillBucket(bucket, this.config.maxRequests, refillRate, now);
    }

    // Check if we have tokens available
    if (bucket.tokens < 1) {
      // Calculate when we'll have 1 token again
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

    // Consume token
    bucket.tokens -= 1;
    const remaining = Math.floor(bucket.tokens);

    return {
      allowed: true,
      remaining: remaining,
      resetMs: this.config.windowMs,
    };
  }

  /**
   * Consume a request slot (check + record in one call)
   * Returns true if request is allowed, false if rate limited
   */
  consume(key: string): boolean {
    return this.check(key).allowed;
  }

  /**
   * Get current stats for a key
   */
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

    // Refill to get current token count
    this.refillBucket(bucket, this.config.maxRequests, refillRate, now);

    const remaining = Math.floor(bucket.tokens);
    const count = this.config.maxRequests - remaining;

    return {
      count: Math.max(0, count),
      remaining: Math.max(0, remaining),
      windowMs: this.config.windowMs,
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(key: string): void {
    this.buckets.delete(key);
    this.burstBuckets.delete(key);
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.buckets.clear();
    this.burstBuckets.clear();
  }

  /**
   * Update configuration
   */
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
  }

  /**
   * Check if rate limiting is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Start periodic cleanup of stale entries
   * Less critical with token buckets but still useful for memory hygiene
   */
  private startCleanup(): void {
    // Clean up every minute - remove entries that have been idle for a while
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = this.config.windowMs * 2; // Consider stale after 2x window

      for (const [key, bucket] of this.buckets) {
        // If bucket is full and hasn't been touched recently, remove it
        if (
          bucket.tokens >= this.config.maxRequests &&
          now - bucket.lastRefillTime > staleThreshold
        ) {
          this.buckets.delete(key);
        }
      }

      // Clean up burst buckets
      for (const [key, bucket] of this.burstBuckets) {
        if (
          bucket.tokens >= this.config.minBurstProtection &&
          now - bucket.lastRefillTime > 2000 // 2 seconds for burst
        ) {
          this.burstBuckets.delete(key);
        }
      }
    }, 60000);

    // Don't prevent process exit
    this.cleanupInterval.unref();
  }

  /**
   * Stop the rate limiter and cleanup
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.buckets.clear();
    this.burstBuckets.clear();
  }
}

// Default rate limiter configurations from config
export const DEFAULT_RATE_LIMITS = {
  // Per-agent limits
  perAgent: config.rateLimit.perAgent,
  // Global limits (across all agents)
  global: config.rateLimit.global,
  // Burst protection (short window)
  burst: config.rateLimit.burst,
} as const;

// Singleton instances
let perAgentLimiter: RateLimiter | null = null;
let globalLimiter: RateLimiter | null = null;
let burstLimiter: RateLimiter | null = null;

/**
 * Get the per-agent rate limiter
 */
export function getPerAgentLimiter(): RateLimiter {
  if (!perAgentLimiter) {
    perAgentLimiter = new RateLimiter({
      ...DEFAULT_RATE_LIMITS.perAgent,
      enabled: config.rateLimit.enabled,
    });
  }
  return perAgentLimiter;
}

/**
 * Get the global rate limiter
 */
export function getGlobalLimiter(): RateLimiter {
  if (!globalLimiter) {
    globalLimiter = new RateLimiter({
      ...DEFAULT_RATE_LIMITS.global,
      enabled: config.rateLimit.enabled,
    });
  }
  return globalLimiter;
}

/**
 * Get the burst rate limiter
 */
export function getBurstLimiter(): RateLimiter {
  if (!burstLimiter) {
    burstLimiter = new RateLimiter({
      ...DEFAULT_RATE_LIMITS.burst,
      enabled: config.rateLimit.enabled,
    });
  }
  return burstLimiter;
}

/**
 * Check all rate limits for a request
 *
 * @param agentId - Agent making the request (optional)
 * @returns Object indicating if request is allowed
 */
export function checkRateLimits(agentId?: string): {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
} {
  // Check burst limit (global)
  const burstResult = getBurstLimiter().check('global');
  if (!burstResult.allowed) {
    return {
      allowed: false,
      reason: 'Burst rate limit exceeded',
      retryAfterMs: burstResult.retryAfterMs,
    };
  }

  // Check global limit
  const globalResult = getGlobalLimiter().check('global');
  if (!globalResult.allowed) {
    return {
      allowed: false,
      reason: 'Global rate limit exceeded',
      retryAfterMs: globalResult.retryAfterMs,
    };
  }

  // Check per-agent limit if agentId provided
  if (agentId) {
    const agentResult = getPerAgentLimiter().check(agentId);
    if (!agentResult.allowed) {
      return {
        allowed: false,
        reason: `Rate limit exceeded for agent ${agentId}`,
        retryAfterMs: agentResult.retryAfterMs,
      };
    }
  }

  return { allowed: true };
}

/**
 * Reset rate limiters (useful for testing)
 */
export function resetRateLimiters(): void {
  perAgentLimiter?.stop();
  globalLimiter?.stop();
  burstLimiter?.stop();
  perAgentLimiter = null;
  globalLimiter = null;
  burstLimiter = null;
}
