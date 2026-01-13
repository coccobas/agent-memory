/**
 * Redis Rate Limiter Adapter
 *
 * Implements IRateLimiterAdapter using Redis for distributed rate limiting.
 * Uses token bucket algorithm with Lua scripts for atomic operations.
 *
 * Features:
 * - Dual bucket: burst protection + main rate limit
 * - Atomic token consumption via Lua
 * - Configurable fail mode: local-fallback (default), closed, or open
 * - Configurable key prefix for namespace isolation
 *
 * For enterprise deployments with horizontal scaling.
 */

import type {
  IRateLimiterAdapter,
  RateLimitCheckResult,
  RateLimitStats,
  RateLimiterBucketConfig,
} from './interfaces.js';
import { createComponentLogger } from '../../utils/logger.js';
import { LocalRateLimiterAdapter } from './local-rate-limiter.adapter.js';
import { ConnectionGuard } from '../../utils/connection-guard.js';

// Type imports for ioredis (actual import is dynamic to avoid loading when not used)
type Redis = import('ioredis').default;

const logger = createComponentLogger('redis-rate-limiter');

/**
 * Redis fail mode configuration.
 * - 'local-fallback': Use local in-memory rate limiter when Redis unavailable (default, secure)
 * - 'closed': Deny all requests when Redis unavailable (most secure)
 * - 'open': Allow all requests when Redis unavailable (NOT RECOMMENDED - security risk)
 */
export type RedisFailMode = 'local-fallback' | 'closed' | 'open';

/**
 * Configuration options for Redis rate limiter adapter.
 */
export interface RedisRateLimiterConfig extends RateLimiterBucketConfig {
  /** Redis connection URL */
  url?: string;
  /** Redis host (default: localhost) */
  host?: string;
  /** Redis port (default: 6379) */
  port?: number;
  /** Redis password */
  password?: string;
  /** Redis database number (default: 0) */
  db?: number;
  /** Key prefix for rate limits (default: 'agentmem:ratelimit:') */
  keyPrefix?: string;
  /** Enable TLS/SSL */
  tls?: boolean;
  /** Fail mode when Redis unavailable (default: 'local-fallback') */
  failMode?: RedisFailMode;
}


/**
 * Lua script for atomic token bucket check and consume.
 *
 * KEYS[1] - Rate limit key
 * ARGV[1] - Max tokens (capacity)
 * ARGV[2] - Refill rate (tokens per millisecond)
 * ARGV[3] - Current timestamp (milliseconds)
 * ARGV[4] - Window duration (milliseconds) for expiration
 * ARGV[5] - Burst protection threshold
 *
 * Returns: [allowed (1/0), remaining, resetMs]
 */
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local maxTokens = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local windowMs = tonumber(ARGV[4])
local burstProtection = tonumber(ARGV[5])

-- Get current state
local state = redis.call("GET", key)
local tokens = maxTokens
local lastRefill = now

if state then
  local parts = {}
  for part in string.gmatch(state, "[^:]+") do
    table.insert(parts, part)
  end
  tokens = tonumber(parts[1])
  lastRefill = tonumber(parts[2])

  -- Calculate refill since last access
  local timePassed = now - lastRefill
  local tokensToAdd = timePassed * refillRate
  tokens = math.min(maxTokens, tokens + tokensToAdd)
  lastRefill = now
end

-- Check burst protection (minimum tokens required)
local minRequired = math.max(1, burstProtection)
if tokens < minRequired then
  -- Not enough tokens even for burst
  local resetMs = math.ceil((minRequired - tokens) / refillRate)
  return {0, math.floor(tokens), resetMs}
end

-- Consume one token
local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

-- Calculate reset time (when bucket will be full)
local resetMs = 0
if tokens < maxTokens then
  resetMs = math.ceil((maxTokens - tokens) / refillRate)
end

-- Save state with expiration
local newState = string.format("%.6f:%d", tokens, lastRefill)
redis.call("SET", key, newState, "PX", windowMs * 2)

return {allowed, math.floor(tokens), resetMs}
`;

/**
 * Lua script for getting rate limit statistics without consuming tokens.
 *
 * KEYS[1] - Rate limit key
 * ARGV[1] - Max tokens (capacity)
 * ARGV[2] - Refill rate (tokens per millisecond)
 * ARGV[3] - Current timestamp (milliseconds)
 * ARGV[4] - Window duration (milliseconds)
 *
 * Returns: [tokens, remaining, windowMs]
 */
const GET_STATS_LUA = `
local key = KEYS[1]
local maxTokens = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local windowMs = tonumber(ARGV[4])

-- Get current state
local state = redis.call("GET", key)
if not state then
  return {0, maxTokens, windowMs}
end

local parts = {}
for part in string.gmatch(state, "[^:]+") do
  table.insert(parts, part)
end
local tokens = tonumber(parts[1])
local lastRefill = tonumber(parts[2])

-- Calculate refill since last access
local timePassed = now - lastRefill
local tokensToAdd = timePassed * refillRate
tokens = math.min(maxTokens, tokens + tokensToAdd)

local count = math.floor(maxTokens - tokens)
local remaining = math.floor(tokens)

return {count, remaining, windowMs}
`;

/**
 * Redis rate limiter adapter implementation.
 * Uses token bucket algorithm with atomic Lua scripts.
 */
export class RedisRateLimiterAdapter implements IRateLimiterAdapter {
  private client: Redis | null = null;
  private keyPrefix: string;
  private config: RedisRateLimiterConfig;
  private connectionGuard = new ConnectionGuard();
  private enabled: boolean;
  private maxRequests: number;
  private windowMs: number;
  private minBurstProtection: number;
  private refillRate: number; // Tokens per millisecond
  private failMode: RedisFailMode;
  private localFallback: LocalRateLimiterAdapter | null = null;

  // Script SHA hashes (cached after first load)
  private tokenBucketSha: string | null = null;
  private getStatsSha: string | null = null;

  constructor(config: RedisRateLimiterConfig) {
    this.config = config;
    this.keyPrefix = config.keyPrefix ?? 'agentmem:ratelimit:';
    this.enabled = config.enabled ?? true;
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
    this.minBurstProtection = config.minBurstProtection ?? 100;

    // Calculate refill rate (tokens per millisecond)
    this.refillRate = this.maxRequests / this.windowMs;

    // Get fail mode from config or environment variable
    this.failMode = config.failMode ??
      (process.env.AGENT_MEMORY_RATE_LIMIT_FAIL_MODE as RedisFailMode) ??
      'local-fallback';

    // Initialize local fallback if needed
    if (this.failMode === 'local-fallback') {
      this.localFallback = new LocalRateLimiterAdapter({
        maxRequests: this.maxRequests,
        windowMs: this.windowMs,
        enabled: this.enabled,
        minBurstProtection: this.minBurstProtection,
      });
      logger.info('Local fallback rate limiter initialized');
    }
  }

  /**
   * Initialize Redis connection.
   */
  async connect(): Promise<void> {
    return this.connectionGuard.connect(async () => {
      try {
        const { Redis: IORedis } = await import('ioredis');

        const options = {
          host: this.config.host ?? 'localhost',
          port: this.config.port ?? 6379,
          password: this.config.password,
          db: this.config.db ?? 0,
          lazyConnect: true,
          ...(this.config.tls ? { tls: {} } : {}),
        };

        if (this.config.url) {
          this.client = new IORedis(this.config.url, options);
        } else {
          this.client = new IORedis(options);
        }

        const client = this.client!;

        client.on('connect', () => {
          logger.info('Redis rate limiter adapter connected');
        });

        client.on('error', (error: Error) => {
          logger.error({ error }, 'Redis rate limiter adapter error');
        });

        client.on('close', () => {
          this.connectionGuard.reset();
        });

        await client.connect();

        // Load Lua scripts
        await this.loadScripts();
      } catch (error) {
        logger.error({ error }, 'Failed to connect to Redis for rate limiting');
        // Don't throw - graceful degradation
        throw error;
      }
    });
  }

  /**
   * Load Lua scripts into Redis and cache their SHA hashes.
   */
  private async loadScripts(): Promise<void> {
    if (!this.client) return;

    try {
      // Load token bucket script
      this.tokenBucketSha = (await this.client.script('LOAD', TOKEN_BUCKET_LUA)) as string;
      logger.debug({ sha: this.tokenBucketSha }, 'Loaded TOKEN_BUCKET_LUA script');

      // Load get stats script
      this.getStatsSha = (await this.client.script('LOAD', GET_STATS_LUA)) as string;
      logger.debug({ sha: this.getStatsSha }, 'Loaded GET_STATS_LUA script');
    } catch (error) {
      logger.warn({ error }, 'Failed to load Lua scripts, will use EVAL');
    }
  }

  /**
   * Handle Redis unavailability based on configured fail mode.
   * SECURITY: Implements fail-closed pattern to prevent rate limit bypass.
   */
  private async handleRedisUnavailable(
    key: string
  ): Promise<[allowed: number, remaining: number, resetMs: number]> {
    switch (this.failMode) {
      case 'open':
        // NOT RECOMMENDED: Allow all requests (security risk)
        logger.warn(
          { key, failMode: this.failMode },
          'Redis unavailable, allowing request (fail-open - NOT RECOMMENDED)'
        );
        return [1, this.maxRequests - 1, 0];

      case 'closed':
        // Most secure: Deny all requests
        logger.warn(
          { key, failMode: this.failMode },
          'Redis unavailable, denying request (fail-closed)'
        );
        return [0, 0, 60000]; // Deny with 60s retry

      case 'local-fallback':
      default:
        // Default: Use local in-memory rate limiter
        logger.warn(
          { key, failMode: this.failMode },
          'Redis unavailable, using local fallback rate limiter'
        );
        if (!this.localFallback) {
          // Fallback not initialized, fail closed
          logger.error('Local fallback not initialized, failing closed');
          return [0, 0, 60000];
        }
        const result = await this.localFallback.check(key);
        return [
          result.allowed ? 1 : 0,
          result.remaining,
          result.retryAfterMs ?? result.resetMs,
        ];
    }
  }

  /**
   * Execute token bucket Lua script.
   */
  private async executeTokenBucket(
    key: string
  ): Promise<[allowed: number, remaining: number, resetMs: number]> {
    if (!this.client || !this.connectionGuard.connected) {
      // Handle Redis unavailability based on fail mode
      return this.handleRedisUnavailable(key);
    }

    const fullKey = this.keyPrefix + key;
    const now = Date.now();
    const args = [
      this.maxRequests,
      this.refillRate,
      now,
      this.windowMs,
      this.minBurstProtection,
    ];

    try {
      let result: unknown[];

      if (this.tokenBucketSha) {
        // Use cached script SHA
        try {
          result = await this.client.evalsha(this.tokenBucketSha, 1, fullKey, ...args) as unknown[];
        } catch (error) {
          // Script might have been flushed, reload
          logger.debug({ error }, 'Script SHA invalid, reloading');
          await this.loadScripts();
          result = await this.client.eval(TOKEN_BUCKET_LUA, 1, fullKey, ...args) as unknown[];
        }
      } else {
        // Use EVAL directly
        result = await this.client.eval(TOKEN_BUCKET_LUA, 1, fullKey, ...args) as unknown[];
      }

      // Bug #257 fix: Guard against NaN from undefined/invalid array elements
      // Number(undefined) returns NaN which would propagate through rate limiting
      const allowed = Number(result[0]);
      const remaining = Number(result[1]);
      const resetAfter = Number(result[2]);
      return [
        Number.isFinite(allowed) ? allowed : 0,
        Number.isFinite(remaining) ? remaining : 0,
        Number.isFinite(resetAfter) ? resetAfter : this.windowMs,
      ];
    } catch (error) {
      logger.error({ error, key }, 'Token bucket script failed');
      // Handle Redis errors with same fail mode logic
      return this.handleRedisUnavailable(key);
    }
  }

  /**
   * Execute get stats Lua script.
   */
  private async executeGetStats(
    key: string
  ): Promise<[count: number, remaining: number, windowMs: number]> {
    if (!this.client || !this.connectionGuard.connected) {
      return [0, this.maxRequests, this.windowMs];
    }

    const fullKey = this.keyPrefix + key;
    const now = Date.now();
    const args = [this.maxRequests, this.refillRate, now, this.windowMs];

    try {
      let result: unknown[];

      if (this.getStatsSha) {
        try {
          result = await this.client.evalsha(this.getStatsSha, 1, fullKey, ...args) as unknown[];
        } catch (error) {
          logger.debug({ error }, 'Script SHA invalid, reloading');
          await this.loadScripts();
          result = await this.client.eval(GET_STATS_LUA, 1, fullKey, ...args) as unknown[];
        }
      } else {
        result = await this.client.eval(GET_STATS_LUA, 1, fullKey, ...args) as unknown[];
      }

      // Bug #262 fix: Guard against NaN from undefined/invalid array elements
      const count = Number(result[0]);
      const remaining = Number(result[1]);
      const windowMs = Number(result[2]);
      return [
        Number.isFinite(count) ? count : 0,
        Number.isFinite(remaining) ? remaining : this.maxRequests,
        Number.isFinite(windowMs) ? windowMs : this.windowMs,
      ];
    } catch (error) {
      logger.error({ error, key }, 'Get stats script failed');
      return [0, this.maxRequests, this.windowMs];
    }
  }

  /**
   * Check if a request is allowed and consume a token if so.
   */
  async check(key: string): Promise<RateLimitCheckResult> {
    // If disabled, always allow
    if (!this.enabled) {
      return {
        allowed: true,
        remaining: this.maxRequests,
        resetMs: 0,
      };
    }

    // Auto-connect if not connected
    if (!this.connectionGuard.connected) {
      try {
        await this.connect();
      } catch (error) {
        // Connection failed - will use fallback mode in executeTokenBucket
        logger.debug({ error }, 'Failed to connect to Redis, using fallback mode');
      }
    }

    const [allowed, remaining, resetMs] = await this.executeTokenBucket(key);

    const result: RateLimitCheckResult = {
      allowed: allowed === 1,
      remaining,
      resetMs,
    };

    // Add retry-after if not allowed
    if (!result.allowed) {
      result.retryAfterMs = resetMs;
    }

    logger.debug({ key, result }, 'Rate limit check');

    return result;
  }

  /**
   * Consume a token for the given key.
   */
  async consume(key: string): Promise<boolean> {
    const result = await this.check(key);
    return result.allowed;
  }

  /**
   * Get statistics for a given key without consuming a token.
   */
  async getStats(key: string): Promise<RateLimitStats> {
    // Auto-connect if not connected
    if (!this.connectionGuard.connected) {
      try {
        await this.connect();
      } catch (error) {
        // Connection failed - will use defaults in executeGetStats
        logger.debug({ error }, 'Failed to connect to Redis for stats');
      }
    }

    const [count, remaining, windowMs] = await this.executeGetStats(key);

    return {
      count,
      remaining,
      windowMs,
    };
  }

  /**
   * Reset rate limit counters for a specific key.
   */
  async reset(key: string): Promise<void> {
    if (!this.client || !this.connectionGuard.connected) {
      return;
    }

    const fullKey = this.keyPrefix + key;

    try {
      await this.client.del(fullKey);
      logger.debug({ key }, 'Rate limit reset');
    } catch (error) {
      logger.warn({ error, key }, 'Reset failed');
    }
  }

  /**
   * Reset all rate limit counters.
   */
  async resetAll(): Promise<void> {
    if (!this.client || !this.connectionGuard.connected) {
      return;
    }

    const pattern = this.keyPrefix + '*';

    try {
      let cursor = '0';
      let totalDeleted = 0;

      do {
        const [newCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = newCursor;

        if (keys.length > 0) {
          const deleted = await this.client.del(...keys);
          totalDeleted += deleted;
        }
      } while (cursor !== '0');

      logger.info({ count: totalDeleted }, 'All rate limits reset');
    } catch (error) {
      logger.warn({ error }, 'Reset all failed');
    }
  }

  /**
   * Update configuration dynamically.
   */
  updateConfig(config: Partial<RateLimiterBucketConfig>): void {
    if (config.enabled !== undefined) {
      this.enabled = config.enabled;
    }

    if (config.maxRequests !== undefined) {
      this.maxRequests = config.maxRequests;
      // Recalculate refill rate
      this.refillRate = this.maxRequests / this.windowMs;
    }

    if (config.windowMs !== undefined) {
      this.windowMs = config.windowMs;
      // Recalculate refill rate
      this.refillRate = this.maxRequests / this.windowMs;
    }

    if (config.minBurstProtection !== undefined) {
      this.minBurstProtection = config.minBurstProtection;
    }

    // Update local fallback if it exists
    if (this.localFallback) {
      this.localFallback.updateConfig(config);
    }

    logger.info({ config }, 'Rate limiter config updated');
  }

  /**
   * Check if rate limiting is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Check if connected to Redis.
   */
  isConnected(): boolean {
    return this.connectionGuard.connected;
  }

  /**
   * Stop and cleanup resources.
   */
  async stop(): Promise<void> {
    // Stop local fallback if it exists
    if (this.localFallback) {
      await this.localFallback.stop();
      this.localFallback = null;
    }

    if (this.client) {
      try {
        await this.client.quit();
        this.client = null;
        this.connectionGuard.reset();
        this.tokenBucketSha = null;
        this.getStatsSha = null;
        logger.info('Redis rate limiter adapter stopped');
      } catch (error) {
        logger.warn({ error }, 'Error stopping Redis rate limiter');
      }
    }
  }

  /**
   * Get Redis client for direct access.
   */
  getClient(): Redis | null {
    return this.client;
  }

  /**
   * Get current configuration.
   */
  getConfig(): RedisRateLimiterConfig {
    return {
      ...this.config,
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
      enabled: this.enabled,
      minBurstProtection: this.minBurstProtection,
    };
  }
}

/**
 * Create a Redis rate limiter adapter.
 */
export function createRedisRateLimiterAdapter(
  config: RedisRateLimiterConfig
): RedisRateLimiterAdapter {
  const adapter = new RedisRateLimiterAdapter(config);

  // Auto-connect on creation
  adapter.connect().catch((error) => {
    logger.warn({ error }, 'Failed to auto-connect Redis rate limiter');
  });

  return adapter;
}
