/**
 * Redis Circuit Breaker State Adapter
 *
 * Implements ICircuitBreakerStateAdapter using Redis for distributed state sharing.
 * Uses Lua scripts for atomic state transitions across multiple instances.
 *
 * Features:
 * - Atomic state transitions via Lua scripts
 * - TTL-based state expiration
 * - Local fallback when Redis unavailable
 * - Configurable fail mode
 *
 * For enterprise deployments with horizontal scaling.
 */

/**
 * NOTE: Non-null assertions used for Redis data access after existence checks
 * and Map lookups after has() validation.
 */

/* eslint-disable @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-non-null-assertion */

import type {
  ICircuitBreakerStateAdapter,
  CircuitBreakerState,
  CircuitBreakerStateConfig,
} from './interfaces.js';
import { createComponentLogger } from '../../utils/logger.js';
import { LocalCircuitBreakerAdapter } from './local-circuit-breaker.adapter.js';
import { ConnectionGuard } from '../../utils/connection-guard.js';

// Type imports for ioredis (actual import is dynamic to avoid loading when not used)
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- inline import() needed for dynamic type
type Redis = import('ioredis').default;

const logger = createComponentLogger('redis-circuit-breaker');

/**
 * Redis fail mode configuration.
 * - 'local-fallback': Use local in-memory state when Redis unavailable (default)
 * - 'closed': Treat circuit as closed when Redis unavailable
 * - 'open': Treat circuit as open when Redis unavailable (conservative)
 */
export type RedisCircuitBreakerFailMode = 'local-fallback' | 'closed' | 'open';

/**
 * Configuration options for Redis circuit breaker state adapter.
 */
export interface RedisCircuitBreakerConfig {
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
  /** Key prefix for circuit breaker state (default: 'agentmem:cb:') */
  keyPrefix?: string;
  /** Enable TLS/SSL */
  tls?: boolean;
  /** Fail mode when Redis unavailable (default: 'local-fallback') */
  failMode?: RedisCircuitBreakerFailMode;
  /** State TTL in milliseconds (default: 5 minutes) */
  stateTTLMs?: number;
}

/**
 * Lua script for recording failure atomically.
 *
 * KEYS[1] - Circuit breaker key
 * ARGV[1] - Failure threshold
 * ARGV[2] - Reset timeout in ms
 * ARGV[3] - Current timestamp (ms)
 * ARGV[4] - State TTL in ms
 *
 * Returns: JSON encoded state
 */
const RECORD_FAILURE_LUA = `
local key = KEYS[1]
local failureThreshold = tonumber(ARGV[1])
local resetTimeoutMs = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttlMs = tonumber(ARGV[4])

-- Get current state
local stateJson = redis.call("GET", key)
local state = nil

if stateJson then
  state = cjson.decode(stateJson)
else
  -- Initialize default state
  state = {
    state = "closed",
    failures = 0,
    successes = 0
  }
end

-- Update failure tracking
state.failures = state.failures + 1
state.successes = 0
state.lastFailureTime = now

-- Handle state transitions
if state.state == "half-open" then
  -- Immediately open on failure in half-open state
  state.state = "open"
  state.nextAttemptTime = now + resetTimeoutMs
elseif state.state == "closed" and state.failures >= failureThreshold then
  -- Open when failure threshold is reached
  state.state = "open"
  state.nextAttemptTime = now + resetTimeoutMs
end

-- Save state with TTL
local newStateJson = cjson.encode(state)
redis.call("SET", key, newStateJson, "PX", ttlMs)

return newStateJson
`;

/**
 * Lua script for recording success atomically.
 *
 * KEYS[1] - Circuit breaker key
 * ARGV[1] - Success threshold
 * ARGV[2] - Current timestamp (ms)
 * ARGV[3] - State TTL in ms
 *
 * Returns: JSON encoded state
 */
const RECORD_SUCCESS_LUA = `
local key = KEYS[1]
local successThreshold = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local ttlMs = tonumber(ARGV[3])

-- Get current state
local stateJson = redis.call("GET", key)
local state = nil

if stateJson then
  state = cjson.decode(stateJson)
else
  -- Initialize default state
  state = {
    state = "closed",
    failures = 0,
    successes = 0
  }
end

-- Update success tracking
state.successes = state.successes + 1

-- Handle state transitions
if state.state == "half-open" then
  if state.successes >= successThreshold then
    -- Close circuit after enough successes
    state.state = "closed"
    state.failures = 0
    state.successes = 0
    state.nextAttemptTime = nil
  end
elseif state.state == "closed" then
  -- Reset failure count on success
  state.failures = 0
end

-- Save state with TTL
local newStateJson = cjson.encode(state)
redis.call("SET", key, newStateJson, "PX", ttlMs)

return newStateJson
`;

/**
 * Lua script for checking and transitioning from open to half-open.
 *
 * KEYS[1] - Circuit breaker key
 * ARGV[1] - Current timestamp (ms)
 * ARGV[2] - State TTL in ms
 *
 * Returns: JSON encoded state
 */
const CHECK_AND_TRANSITION_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local ttlMs = tonumber(ARGV[2])

-- Get current state
local stateJson = redis.call("GET", key)
if not stateJson then
  return nil
end

local state = cjson.decode(stateJson)

-- Check if we should transition from open to half-open
if state.state == "open" and state.nextAttemptTime and now >= state.nextAttemptTime then
  state.state = "half-open"
  state.successes = 0

  -- Save updated state
  local newStateJson = cjson.encode(state)
  redis.call("SET", key, newStateJson, "PX", ttlMs)
  return newStateJson
end

return stateJson
`;

/**
 * Parse Redis state JSON into CircuitBreakerState.
 */
function parseState(json: string | null): CircuitBreakerState | null {
  if (!json) return null;

  try {
    // JSON.parse returns unknown - cast to expected shape after parsing
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(json);
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      state: parsed.state,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      failures: parsed.failures,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      successes: parsed.successes,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      lastFailureTime: parsed.lastFailureTime,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      nextAttemptTime: parsed.nextAttemptTime,
    };
  } catch (error) {
    logger.warn({ error, json }, 'Failed to parse circuit breaker state');
    return null;
  }
}

/**
 * Redis circuit breaker state adapter implementation.
 * Uses Lua scripts for atomic state management across distributed instances.
 */
export class RedisCircuitBreakerAdapter implements ICircuitBreakerStateAdapter {
  private client: Redis | null = null;
  private keyPrefix: string;
  private config: RedisCircuitBreakerConfig;
  private connectionGuard = new ConnectionGuard();
  private failMode: RedisCircuitBreakerFailMode;
  private stateTTLMs: number;
  private localFallback: LocalCircuitBreakerAdapter | null = null;

  // Script SHA hashes (cached after first load)
  private recordFailureSha: string | null = null;
  private recordSuccessSha: string | null = null;
  private checkAndTransitionSha: string | null = null;

  constructor(config: RedisCircuitBreakerConfig) {
    this.config = config;
    this.keyPrefix = config.keyPrefix ?? 'agentmem:cb:';
    this.stateTTLMs = config.stateTTLMs ?? 300000; // 5 minutes default

    // Bug #272 fix: Validate fail mode instead of unsafe type assertion
    const envFailMode = process.env.AGENT_MEMORY_CB_FAIL_MODE;
    const validFailModes = ['local-fallback', 'closed', 'open'] as const;
    const validatedEnvMode =
      envFailMode && validFailModes.includes(envFailMode as RedisCircuitBreakerFailMode)
        ? (envFailMode as RedisCircuitBreakerFailMode)
        : undefined;
    this.failMode = config.failMode ?? validatedEnvMode ?? 'local-fallback';

    // Initialize local fallback if needed
    if (this.failMode === 'local-fallback') {
      this.localFallback = new LocalCircuitBreakerAdapter();
      logger.info('Local fallback circuit breaker initialized');
    }
  }

  /**
   * Initialize Redis connection.
   */
  async connect(): Promise<void> {
    return this.connectionGuard.connect(async () => {
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

      const client = this.client;

      client.on('connect', () => {
        logger.info('Redis circuit breaker adapter connected');
      });

      client.on('error', (error: Error) => {
        logger.error({ error }, 'Redis circuit breaker adapter error');
      });

      client.on('close', () => {
        this.connectionGuard.reset();
      });

      await client.connect();

      // Load Lua scripts
      await this.loadScripts();
    });
  }

  /**
   * Close Redis connection.
   */
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.client = null;
        this.connectionGuard.reset();
        this.recordFailureSha = null;
        this.recordSuccessSha = null;
        this.checkAndTransitionSha = null;
        logger.info('Redis circuit breaker adapter closed');
      } catch (error) {
        logger.warn({ error }, 'Error closing Redis circuit breaker adapter');
      }
    }
  }

  /**
   * Load Lua scripts into Redis and cache their SHA hashes.
   */
  private async loadScripts(): Promise<void> {
    if (!this.client) return;

    try {
      this.recordFailureSha = (await this.client.script('LOAD', RECORD_FAILURE_LUA)) as string;
      logger.debug({ sha: this.recordFailureSha }, 'Loaded RECORD_FAILURE_LUA script');

      this.recordSuccessSha = (await this.client.script('LOAD', RECORD_SUCCESS_LUA)) as string;
      logger.debug({ sha: this.recordSuccessSha }, 'Loaded RECORD_SUCCESS_LUA script');

      this.checkAndTransitionSha = (await this.client.script(
        'LOAD',
        CHECK_AND_TRANSITION_LUA
      )) as string;
      logger.debug({ sha: this.checkAndTransitionSha }, 'Loaded CHECK_AND_TRANSITION_LUA script');
    } catch (error) {
      logger.warn({ error }, 'Failed to load Lua scripts, will use EVAL');
    }
  }

  /**
   * Handle Redis unavailability based on configured fail mode.
   */
  private handleRedisUnavailable(): CircuitBreakerState {
    switch (this.failMode) {
      case 'open':
        // Conservative: Treat circuit as open
        logger.warn({ failMode: this.failMode }, 'Redis unavailable, treating circuit as open');
        return {
          state: 'open',
          failures: 0,
          successes: 0,
          nextAttemptTime: Date.now() + 60000, // 1 minute
        };

      case 'closed':
        // Permissive: Treat circuit as closed
        logger.warn({ failMode: this.failMode }, 'Redis unavailable, treating circuit as closed');
        return {
          state: 'closed',
          failures: 0,
          successes: 0,
        };

      case 'local-fallback':
      default:
        // This shouldn't be reached if local fallback is used correctly
        logger.warn({ failMode: this.failMode }, 'Redis unavailable, no local fallback available');
        return {
          state: 'closed',
          failures: 0,
          successes: 0,
        };
    }
  }

  /**
   * Check if Redis is connected.
   */
  private isConnected(): boolean {
    return this.client !== null && this.connectionGuard.connected;
  }

  /**
   * Get the full Redis key for a service.
   */
  private getKey(serviceName: string): string {
    return this.keyPrefix + serviceName;
  }

  /**
   * Get the current state for a service.
   */
  async getState(serviceName: string): Promise<CircuitBreakerState | null> {
    // Use local fallback if Redis not connected
    if (!this.isConnected() && this.localFallback) {
      return this.localFallback.getState(serviceName);
    }

    if (!this.isConnected()) {
      return null;
    }

    try {
      const key = this.getKey(serviceName);
      const now = Date.now();

      // Check and transition first (handles open -> half-open)
      let result: string | null;

      if (this.checkAndTransitionSha) {
        try {
          result = (await this.client!.evalsha(
            this.checkAndTransitionSha,
            1,
            key,
            now,
            this.stateTTLMs
          )) as string | null;
        } catch {
          // Script might have been flushed, reload and use EVAL
          await this.loadScripts();
          result = (await this.client!.eval(
            CHECK_AND_TRANSITION_LUA,
            1,
            key,
            now,
            this.stateTTLMs
          )) as string | null;
        }
      } else {
        result = (await this.client!.eval(
          CHECK_AND_TRANSITION_LUA,
          1,
          key,
          now,
          this.stateTTLMs
        )) as string | null;
      }

      return parseState(result);
    } catch (error) {
      logger.error({ error, serviceName }, 'Failed to get circuit breaker state');

      if (this.localFallback) {
        return this.localFallback.getState(serviceName);
      }

      return null;
    }
  }

  /**
   * Set the state for a service.
   */
  async setState(serviceName: string, state: CircuitBreakerState): Promise<void> {
    // Use local fallback if Redis not connected
    if (!this.isConnected() && this.localFallback) {
      return this.localFallback.setState(serviceName, state);
    }

    if (!this.isConnected()) {
      return;
    }

    try {
      const key = this.getKey(serviceName);
      const stateJson = JSON.stringify(state);
      await this.client!.set(key, stateJson, 'PX', this.stateTTLMs);
      logger.debug({ serviceName, state: state.state }, 'State set');
    } catch (error) {
      logger.error({ error, serviceName }, 'Failed to set circuit breaker state');

      if (this.localFallback) {
        await this.localFallback.setState(serviceName, state);
      }
    }
  }

  /**
   * Record a failure and return the updated state.
   */
  async recordFailure(
    serviceName: string,
    config: CircuitBreakerStateConfig
  ): Promise<CircuitBreakerState> {
    // Use local fallback if Redis not connected
    if (!this.isConnected() && this.localFallback) {
      return this.localFallback.recordFailure(serviceName, config);
    }

    if (!this.isConnected()) {
      return this.handleRedisUnavailable();
    }

    try {
      const key = this.getKey(serviceName);
      const now = Date.now();

      let result: string;

      if (this.recordFailureSha) {
        try {
          result = (await this.client!.evalsha(
            this.recordFailureSha,
            1,
            key,
            config.failureThreshold,
            config.resetTimeoutMs,
            now,
            this.stateTTLMs
          )) as string;
        } catch {
          // Script might have been flushed, reload and use EVAL
          await this.loadScripts();
          result = (await this.client!.eval(
            RECORD_FAILURE_LUA,
            1,
            key,
            config.failureThreshold,
            config.resetTimeoutMs,
            now,
            this.stateTTLMs
          )) as string;
        }
      } else {
        result = (await this.client!.eval(
          RECORD_FAILURE_LUA,
          1,
          key,
          config.failureThreshold,
          config.resetTimeoutMs,
          now,
          this.stateTTLMs
        )) as string;
      }

      const state = parseState(result);
      if (!state) {
        throw new Error('Failed to parse state from Redis');
      }

      if (state.state === 'open') {
        logger.warn(
          { serviceName, failures: state.failures, resetTime: state.nextAttemptTime },
          'Circuit breaker opened'
        );
      }

      return state;
    } catch (error) {
      logger.error({ error, serviceName }, 'Failed to record circuit breaker failure');

      if (this.localFallback) {
        return this.localFallback.recordFailure(serviceName, config);
      }

      return this.handleRedisUnavailable();
    }
  }

  /**
   * Record a success and return the updated state.
   */
  async recordSuccess(
    serviceName: string,
    config: CircuitBreakerStateConfig
  ): Promise<CircuitBreakerState> {
    // Use local fallback if Redis not connected
    if (!this.isConnected() && this.localFallback) {
      return this.localFallback.recordSuccess(serviceName, config);
    }

    if (!this.isConnected()) {
      return this.handleRedisUnavailable();
    }

    try {
      const key = this.getKey(serviceName);
      const now = Date.now();

      let result: string;

      if (this.recordSuccessSha) {
        try {
          result = (await this.client!.evalsha(
            this.recordSuccessSha,
            1,
            key,
            config.successThreshold,
            now,
            this.stateTTLMs
          )) as string;
        } catch {
          // Script might have been flushed, reload and use EVAL
          await this.loadScripts();
          result = (await this.client!.eval(
            RECORD_SUCCESS_LUA,
            1,
            key,
            config.successThreshold,
            now,
            this.stateTTLMs
          )) as string;
        }
      } else {
        result = (await this.client!.eval(
          RECORD_SUCCESS_LUA,
          1,
          key,
          config.successThreshold,
          now,
          this.stateTTLMs
        )) as string;
      }

      const state = parseState(result);
      if (!state) {
        throw new Error('Failed to parse state from Redis');
      }

      if (state.state === 'closed' && state.failures === 0) {
        logger.info({ serviceName }, 'Circuit breaker closed');
      }

      return state;
    } catch (error) {
      logger.error({ error, serviceName }, 'Failed to record circuit breaker success');

      if (this.localFallback) {
        return this.localFallback.recordSuccess(serviceName, config);
      }

      return this.handleRedisUnavailable();
    }
  }

  /**
   * Reset the circuit breaker state for a service.
   */
  async reset(serviceName: string): Promise<void> {
    // Also reset local fallback if present
    if (this.localFallback) {
      await this.localFallback.reset(serviceName);
    }

    if (!this.isConnected()) {
      return;
    }

    try {
      const key = this.getKey(serviceName);
      await this.client!.del(key);
      logger.debug({ serviceName }, 'Circuit breaker reset');
    } catch (error) {
      logger.warn({ error, serviceName }, 'Failed to reset circuit breaker');
    }
  }

  /**
   * Reset all circuit breaker states.
   */
  async resetAll(): Promise<void> {
    // Also reset local fallback if present
    if (this.localFallback) {
      await this.localFallback.resetAll();
    }

    if (!this.isConnected()) {
      return;
    }

    const pattern = this.keyPrefix + '*';

    try {
      let cursor = '0';
      let totalDeleted = 0;

      do {
        const [newCursor, keys] = await this.client!.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = newCursor;

        if (keys.length > 0) {
          const deleted = await this.client!.del(...keys);
          totalDeleted += deleted;
        }
      } while (cursor !== '0');

      logger.info({ count: totalDeleted }, 'All circuit breakers reset');
    } catch (error) {
      logger.warn({ error }, 'Failed to reset all circuit breakers');
    }
  }

  /**
   * Check if connected to Redis.
   */
  isRedisConnected(): boolean {
    return this.connectionGuard.connected;
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
  getConfig(): RedisCircuitBreakerConfig {
    return {
      ...this.config,
      keyPrefix: this.keyPrefix,
      failMode: this.failMode,
      stateTTLMs: this.stateTTLMs,
    };
  }
}

/**
 * Factory function to create a RedisCircuitBreakerAdapter instance.
 *
 * @param config - Redis circuit breaker configuration
 * @returns Configured RedisCircuitBreakerAdapter instance
 *
 * @example
 * ```typescript
 * const adapter = createRedisCircuitBreakerAdapter({
 *   host: 'localhost',
 *   port: 6379,
 *   keyPrefix: 'myapp:cb:',
 * });
 *
 * await adapter.connect();
 *
 * // Record failures/successes
 * const state = await adapter.recordFailure('payment-service', {
 *   failureThreshold: 5,
 *   resetTimeoutMs: 30000,
 *   successThreshold: 2,
 * });
 *
 * // Check if circuit is open
 * if (state.state === 'open') {
 *   console.log(`Circuit open until ${new Date(state.nextAttemptTime!)}`);
 * }
 *
 * await adapter.close();
 * ```
 */
export function createRedisCircuitBreakerAdapter(
  config: RedisCircuitBreakerConfig
): RedisCircuitBreakerAdapter {
  return new RedisCircuitBreakerAdapter(config);
}
