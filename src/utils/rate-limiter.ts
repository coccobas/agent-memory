/**
 * Simple sliding window rate limiter for MCP tool calls
 *
 * Provides per-agent and global rate limiting to prevent DoS
 * and ensure fair resource usage across multiple agents.
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

interface WindowEntry {
  timestamps: number[];
}

/**
 * Sliding window rate limiter
 *
 * Tracks request timestamps within a sliding window and rejects
 * requests that would exceed the configured limit.
 */
export class RateLimiter {
  private windows = new Map<string, WindowEntry>();
  private burstWindows = new Map<string, WindowEntry>(); // Separate window for burst protection
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

    // Start cleanup interval to prevent memory leaks
    this.startCleanup();
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
    // This prevents DoS attacks by limiting max requests per second
    const burstWindowStart = now - 1000; // 1 second window for burst protection
    let burstEntry = this.burstWindows.get(key);
    if (!burstEntry) {
      burstEntry = { timestamps: [] };
      this.burstWindows.set(key, burstEntry);
    }

    // Remove timestamps outside the burst window
    burstEntry.timestamps = burstEntry.timestamps.filter((ts) => ts > burstWindowStart);

    // Check burst protection
    if (burstEntry.timestamps.length >= this.config.minBurstProtection) {
      const oldestTimestamp = burstEntry.timestamps[0] ?? now;
      const retryAfterMs = Math.max(0, oldestTimestamp + 1000 - now);

      logger.warn(
        {
          key,
          currentCount: burstEntry.timestamps.length,
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

    // Record this request in burst window
    burstEntry.timestamps.push(now);

    // If rate limiting is disabled (but burst protection passed), allow the request
    if (!this.config.enabled) {
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetMs: 0,
      };
    }

    const windowStart = now - this.config.windowMs;

    // Get or create window for this key
    let entry = this.windows.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(key, entry);
    }

    // Remove timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    // Check if under limit
    const currentCount = entry.timestamps.length;
    const remaining = Math.max(0, this.config.maxRequests - currentCount);

    if (currentCount >= this.config.maxRequests) {
      // Find when the oldest request in window will expire
      const oldestTimestamp = entry.timestamps[0] ?? now;
      const retryAfterMs = Math.max(0, oldestTimestamp + this.config.windowMs - now);

      logger.warn(
        {
          key,
          currentCount,
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

    // Record this request
    entry.timestamps.push(now);

    return {
      allowed: true,
      remaining: remaining - 1,
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
    const windowStart = now - this.config.windowMs;

    const entry = this.windows.get(key);
    if (!entry) {
      return {
        count: 0,
        remaining: this.config.maxRequests,
        windowMs: this.config.windowMs,
      };
    }

    const count = entry.timestamps.filter((ts) => ts > windowStart).length;

    return {
      count,
      remaining: Math.max(0, this.config.maxRequests - count),
      windowMs: this.config.windowMs,
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(key: string): void {
    this.windows.delete(key);
    this.burstWindows.delete(key);
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.windows.clear();
    this.burstWindows.clear();
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
   * Start periodic cleanup of expired entries
   */
  private startCleanup(): void {
    // Clean up every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const windowStart = now - this.config.windowMs;
      const burstWindowStart = now - 1000; // 1 second for burst protection

      for (const [key, entry] of this.windows) {
        // Remove expired timestamps
        entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

        // Remove empty entries
        if (entry.timestamps.length === 0) {
          this.windows.delete(key);
        }
      }

      // Clean up burst windows
      for (const [key, entry] of this.burstWindows) {
        entry.timestamps = entry.timestamps.filter((ts) => ts > burstWindowStart);

        if (entry.timestamps.length === 0) {
          this.burstWindows.delete(key);
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
    this.windows.clear();
    this.burstWindows.clear();
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
