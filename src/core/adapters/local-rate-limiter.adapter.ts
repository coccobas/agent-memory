/**
 * Local Rate Limiter Adapter
 *
 * Wraps the existing RateLimiter class behind the IRateLimiterAdapter interface.
 * Provides an async interface over the synchronous RateLimiter implementation.
 */

import type {
  IRateLimiterAdapter,
  RateLimitCheckResult,
  RateLimitStats,
  RateLimiterBucketConfig,
} from './interfaces.js';
import { RateLimiter, type RateLimiterConfig } from '../../utils/rate-limiter-core.js';

/**
 * Local in-memory rate limiter adapter.
 * Wraps the synchronous RateLimiter with async interface for consistency.
 */
export class LocalRateLimiterAdapter implements IRateLimiterAdapter {
  private rateLimiter: RateLimiter;

  constructor(config: RateLimiterConfig) {
    this.rateLimiter = new RateLimiter(config);
  }

  /**
   * Check if a request is allowed and consume a token if so.
   * @param key - The rate limit key (e.g., agent ID, IP address)
   * @returns Result with allowed status, remaining tokens, and timing info
   */
  async check(key: string): Promise<RateLimitCheckResult> {
    return Promise.resolve(this.rateLimiter.check(key));
  }

  /**
   * Consume a token for the given key.
   * @param key - The rate limit key
   * @returns Whether the request was allowed
   */
  async consume(key: string): Promise<boolean> {
    return Promise.resolve(this.rateLimiter.consume(key));
  }

  /**
   * Get statistics for a given key without consuming a token.
   * @param key - The rate limit key
   * @returns Current usage statistics
   */
  async getStats(key: string): Promise<RateLimitStats> {
    return Promise.resolve(this.rateLimiter.getStats(key));
  }

  /**
   * Reset rate limit counters for a specific key.
   * @param key - The rate limit key to reset
   */
  async reset(key: string): Promise<void> {
    return Promise.resolve(this.rateLimiter.reset(key));
  }

  /**
   * Reset all rate limit counters.
   */
  async resetAll(): Promise<void> {
    return Promise.resolve(this.rateLimiter.resetAll());
  }

  /**
   * Update configuration dynamically.
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<RateLimiterBucketConfig>): void {
    this.rateLimiter.updateConfig(config);
  }

  /**
   * Check if rate limiting is enabled.
   */
  isEnabled(): boolean {
    return this.rateLimiter.isEnabled();
  }

  /**
   * Stop and cleanup resources.
   */
  async stop(): Promise<void> {
    return Promise.resolve(this.rateLimiter.stop());
  }
}

/**
 * Factory function to create a LocalRateLimiterAdapter instance.
 *
 * @param config - Rate limiter configuration
 * @returns Configured LocalRateLimiterAdapter instance
 *
 * @example
 * ```typescript
 * const rateLimiter = createLocalRateLimiterAdapter({
 *   maxRequests: 100,
 *   windowMs: 60000,
 *   enabled: true,
 *   minBurstProtection: 50,
 * });
 *
 * const result = await rateLimiter.check('user-123');
 * if (!result.allowed) {
 *   console.log(`Rate limited. Retry after ${result.retryAfterMs}ms`);
 * }
 * ```
 */
export function createLocalRateLimiterAdapter(config: RateLimiterConfig): IRateLimiterAdapter {
  return new LocalRateLimiterAdapter(config);
}
