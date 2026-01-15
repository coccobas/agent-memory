/**
 * Redis Lock Adapter
 *
 * Implements ILockAdapter using Redis for distributed locking.
 * Uses the Redlock algorithm for safe distributed locks.
 *
 * For enterprise deployments with horizontal scaling.
 */

import type {
  ILockAdapter,
  LockInfo,
  AcquireLockOptions,
  AcquireLockResult,
  ListLocksFilter,
} from './interfaces.js';
import { createComponentLogger } from '../../utils/logger.js';
import { ConnectionGuard } from '../../utils/connection-guard.js';

// Type imports for ioredis (actual import is dynamic to avoid loading when not used)
type Redis = import('ioredis').default;

const logger = createComponentLogger('redis-lock');

/**
 * Configuration options for Redis lock adapter.
 */
export interface RedisLockConfig {
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
  /** Key prefix for locks (default: 'agentmem:lock:') */
  keyPrefix?: string;
  /** Default lock TTL in milliseconds (default: 30000 = 30 seconds) */
  defaultTTLMs?: number;
  /** Lock retry count (default: 3) */
  retryCount?: number;
  /** Lock retry delay in ms (default: 200) */
  retryDelayMs?: number;
  /** Clock drift factor for Redlock (default: 0.01) */
  driftFactor?: number;
  /** Enable TLS/SSL */
  tls?: boolean;
}

/**
 * Internal lock record stored in Redis.
 */
interface RedisLockRecord {
  owner: string;
  acquiredAt: string;
  expiresAt: string | null;
  metadata?: Record<string, unknown>;
  token: string; // Unique token for safe unlock
}

/**
 * Generate a random token for lock safety.
 */
function generateToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Redis lock adapter implementation.
 * Uses Redis SET NX with expiration for atomic lock acquisition.
 */
export class RedisLockAdapter implements ILockAdapter {
  private client: Redis | null = null;
  private keyPrefix: string;
  private defaultTTLMs: number;
  private retryCount: number;
  private retryDelayMs: number;
  // driftFactor kept for future Redlock implementation
  // private driftFactor: number;
  private config: RedisLockConfig;
  private connected = false;
  private connectionGuard = new ConnectionGuard();

  // Track local lock tokens for safe unlock
  private localTokens = new Map<string, string>();

  constructor(config: RedisLockConfig) {
    this.config = config;
    this.keyPrefix = config.keyPrefix ?? 'agentmem:lock:';
    this.defaultTTLMs = config.defaultTTLMs ?? 30000;
    this.retryCount = config.retryCount ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 200;
    // driftFactor is configured but not used until full Redlock impl
    // this.driftFactor = config.driftFactor ?? 0.01;
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

      const client = this.client!;

      client.on('connect', () => {
        this.connected = true;
        logger.info('Redis lock adapter connected');
      });

      client.on('error', (error: Error) => {
        logger.error({ error }, 'Redis lock adapter error');
      });

      client.on('close', () => {
        this.connected = false;
        this.connectionGuard.setDisconnected();
      });

      await client.connect();
      this.connected = true;

      // Define Lua scripts for atomic operations
      await this.defineScripts();
    });
  }

  /**
   * Close Redis connection.
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * Define Lua scripts for atomic lock operations.
   */
  private async defineScripts(): Promise<void> {
    if (!this.client) return;

    // Script to release lock only if token matches
    this.client.defineCommand('unlockIfOwned', {
      numberOfKeys: 1,
      lua: `
        local lock = redis.call("GET", KEYS[1])
        if lock then
          local data = cjson.decode(lock)
          if data.token == ARGV[1] then
            redis.call("DEL", KEYS[1])
            return 1
          end
        end
        return 0
      `,
    });

    // Script to extend lock TTL if token matches
    this.client.defineCommand('extendIfOwned', {
      numberOfKeys: 1,
      lua: `
        local lock = redis.call("GET", KEYS[1])
        if lock then
          local data = cjson.decode(lock)
          if data.token == ARGV[1] then
            data.expiresAt = ARGV[2]
            redis.call("SET", KEYS[1], cjson.encode(data), "PX", ARGV[3])
            return 1
          end
        end
        return 0
      `,
    });
  }

  /**
   * Acquire a distributed lock.
   * Uses SET NX (set if not exists) with expiration.
   */
  async acquire(
    key: string,
    owner: string,
    options?: AcquireLockOptions
  ): Promise<AcquireLockResult> {
    if (!this.client || !this.connected) {
      return { acquired: false };
    }

    const fullKey = this.keyPrefix + key;
    const ttlMs = options?.ttlMs ?? this.defaultTTLMs;
    const token = generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const lockRecord: RedisLockRecord = {
      owner,
      acquiredAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      metadata: options?.metadata,
      token,
    };

    // Try to acquire with retries
    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        // SET key value NX PX ttl
        const result = await this.client.set(
          fullKey,
          JSON.stringify(lockRecord),
          'PX',
          ttlMs,
          'NX'
        );

        if (result === 'OK') {
          // Lock acquired
          this.localTokens.set(fullKey, token);

          logger.debug({ key, owner, ttlMs }, 'Lock acquired');

          return {
            acquired: true,
            lock: {
              key,
              owner,
              acquiredAt: now,
              expiresAt,
              metadata: options?.metadata,
            },
          };
        }
      } catch (error) {
        logger.warn({ error, key, attempt }, 'Lock acquire attempt failed');
      }

      // Wait before retry
      if (attempt < this.retryCount - 1) {
        await this.sleep(this.retryDelayMs);
      }
    }

    logger.debug({ key, owner }, 'Lock acquisition failed after retries');
    return { acquired: false };
  }

  /**
   * Release a lock.
   * Only succeeds if the owner's token matches.
   */
  async release(key: string, owner: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      return false;
    }

    const fullKey = this.keyPrefix + key;
    const token = this.localTokens.get(fullKey);

    if (!token) {
      // We don't have a token, try to verify owner from Redis
      const lock = await this.getLock(key);
      if (!lock || lock.owner !== owner) {
        return false;
      }
      // Can't safely release without token
      logger.warn({ key, owner }, 'Cannot release lock without token');
      return false;
    }

    try {
      // Use Lua script to atomically check and delete
      const result = await (
        this.client as Redis & {
          unlockIfOwned: (key: string, token: string) => Promise<number>;
        }
      ).unlockIfOwned(fullKey, token);

      if (result === 1) {
        this.localTokens.delete(fullKey);
        logger.debug({ key, owner }, 'Lock released');
        return true;
      } else {
        // Token didn't match or lock doesn't exist - clean up local token
        this.localTokens.delete(fullKey);
        return false;
      }
    } catch (error) {
      // Fallback: try direct delete if Lua script not available
      logger.warn({ error, key }, 'Lua unlock failed, trying fallback');
      try {
        const lockData = await this.client.get(fullKey);
        if (lockData) {
          // Bug #254 fix: Validate parsed JSON structure instead of unsafe type assertion
          let record: unknown;
          try {
            record = JSON.parse(lockData);
          } catch {
            logger.warn({ key }, 'Invalid JSON in lock record, treating as no lock');
            this.localTokens.delete(fullKey);
            return false;
          }
          // Validate the record has the expected token field
          if (
            typeof record === 'object' &&
            record !== null &&
            'token' in record &&
            typeof (record as { token: unknown }).token === 'string'
          ) {
            if ((record as RedisLockRecord).token === token) {
              await this.client.del(fullKey);
              this.localTokens.delete(fullKey);
              return true;
            }
          }
        }
        // Token didn't match - clean up local token
        this.localTokens.delete(fullKey);
        return false;
      } catch (fallbackError) {
        // Fallback failed - clean up local token
        this.localTokens.delete(fullKey);
        logger.warn({ error: fallbackError, key }, 'Fallback unlock failed');
        return false;
      }
    }
  }

  /**
   * Force release a lock regardless of owner.
   */
  async forceRelease(key: string, reason?: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      return false;
    }

    const fullKey = this.keyPrefix + key;

    try {
      const result = await this.client.del(fullKey);
      this.localTokens.delete(fullKey);

      if (result > 0) {
        logger.info({ key, reason }, 'Lock force released');
        return true;
      }
    } catch (error) {
      logger.warn({ error, key }, 'Force release failed');
    }

    return false;
  }

  /**
   * Check if a key is locked.
   */
  async isLocked(key: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      return false;
    }

    const fullKey = this.keyPrefix + key;

    try {
      const exists = await this.client.exists(fullKey);
      return exists === 1;
    } catch (error) {
      logger.debug({ error, key }, 'Failed to check if lock exists, returning false');
      return false;
    }
  }

  /**
   * Get lock information.
   */
  async getLock(key: string): Promise<LockInfo | null> {
    if (!this.client || !this.connected) {
      return null;
    }

    const fullKey = this.keyPrefix + key;

    try {
      const data = await this.client.get(fullKey);
      if (data) {
        const record = JSON.parse(data) as RedisLockRecord;
        return {
          key,
          owner: record.owner,
          acquiredAt: new Date(record.acquiredAt),
          expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
          metadata: record.metadata,
        };
      }
    } catch (error) {
      logger.warn({ error, key }, 'Get lock failed');
    }

    return null;
  }

  /**
   * List all locks.
   */
  async listLocks(filter?: ListLocksFilter): Promise<LockInfo[]> {
    if (!this.client || !this.connected) {
      return [];
    }

    const locks: LockInfo[] = [];
    const pattern = this.keyPrefix + '*';

    try {
      let cursor = '0';
      do {
        const [newCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = newCursor;

        for (const fullKey of keys) {
          const data = await this.client.get(fullKey);
          if (data) {
            const record = JSON.parse(data) as RedisLockRecord;
            const key = fullKey.slice(this.keyPrefix.length);

            // Apply owner filter if specified
            if (filter?.owner && record.owner !== filter.owner) {
              continue;
            }

            locks.push({
              key,
              owner: record.owner,
              acquiredAt: new Date(record.acquiredAt),
              expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
              metadata: record.metadata,
            });
          }
        }
      } while (cursor !== '0');
    } catch (error) {
      logger.warn({ error }, 'List locks failed');
    }

    return locks;
  }

  /**
   * Cleanup expired locks.
   * Note: Redis handles expiration automatically via TTL.
   * This method is a no-op for Redis but returns 0 for interface compatibility.
   */
  async cleanupExpired(): Promise<number> {
    // Redis automatically expires keys with TTL
    // Nothing to do here
    return 0;
  }

  /**
   * Extend a lock's TTL.
   */
  async extend(key: string, owner: string, ttlMs: number): Promise<boolean> {
    if (!this.client || !this.connected) {
      return false;
    }

    const fullKey = this.keyPrefix + key;
    const token = this.localTokens.get(fullKey);

    if (!token) {
      return false;
    }

    const newExpiresAt = new Date(Date.now() + ttlMs).toISOString();

    try {
      const result = await (
        this.client as Redis & {
          extendIfOwned: (
            key: string,
            token: string,
            expiresAt: string,
            ttl: number
          ) => Promise<number>;
        }
      ).extendIfOwned(fullKey, token, newExpiresAt, ttlMs);

      if (result === 1) {
        logger.debug({ key, owner, ttlMs }, 'Lock extended');
        return true;
      }
    } catch (error) {
      logger.warn({ error, key }, 'Extend lock failed');
    }

    return false;
  }

  /**
   * Sleep helper.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get Redis client for direct access.
   */
  getClient(): Redis | null {
    return this.client;
  }
}

/**
 * Create a Redis lock adapter.
 */
export function createRedisLockAdapter(config: RedisLockConfig): RedisLockAdapter {
  return new RedisLockAdapter(config);
}
