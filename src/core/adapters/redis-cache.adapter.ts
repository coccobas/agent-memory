/**
 * Redis Cache Adapter
 *
 * Implements ICacheAdapter using ioredis for distributed caching.
 * Supports TTL per entry and prefix-based invalidation.
 *
 * For enterprise deployments with horizontal scaling.
 */

import type { ICacheAdapter } from './interfaces.js';
import { createComponentLogger } from '../../utils/logger.js';
import { ConnectionGuard } from '../../utils/connection-guard.js';

// Type imports for ioredis (actual import is dynamic to avoid loading when not used)
type Redis = import('ioredis').default;
type RedisOptions = import('ioredis').RedisOptions;

const logger = createComponentLogger('redis-cache');
const MAX_SCAN_ITERATIONS = 10000;

/**
 * Configuration options for Redis cache adapter.
 */
export interface RedisCacheConfig {
  /** Redis connection URL (e.g., redis://localhost:6379) */
  url?: string;
  /** Redis host (default: localhost) */
  host?: string;
  /** Redis port (default: 6379) */
  port?: number;
  /** Redis password */
  password?: string;
  /** Redis database number (default: 0) */
  db?: number;
  /** Key prefix for namespacing (default: 'agentmem:cache:') */
  keyPrefix?: string;
  /** Default TTL in milliseconds (default: 3600000 = 1 hour) */
  defaultTTLMs?: number;
  /** Enable TLS/SSL */
  tls?: boolean;
  /** Connection timeout in ms (default: 10000) */
  connectTimeoutMs?: number;
  /** Max retries per request (default: 3) */
  maxRetriesPerRequest?: number;
}

/**
 * Redis cache adapter implementation.
 * Uses ioredis for async Redis operations.
 *
 * Note: This adapter uses synchronous-style interface methods but
 * internally queues async operations. For truly async operations,
 * use the async* methods directly.
 */
export class RedisCacheAdapter<T = unknown> implements ICacheAdapter<T> {
  private client: Redis | null = null;
  private subClient: Redis | null = null;
  private keyPrefix: string;
  private defaultTTLMs: number;
  private config: RedisCacheConfig;
  private pendingOps = new Map<string, Promise<unknown>>();
  private localCache = new Map<string, { value: T; expiresAt: number }>();
  private connectionGuard = new ConnectionGuard();
  private invalidationChannel: string;

  constructor(config: RedisCacheConfig) {
    this.config = config;
    this.keyPrefix = config.keyPrefix ?? 'agentmem:cache:';
    this.defaultTTLMs = config.defaultTTLMs ?? 3600000; // 1 hour default
    this.invalidationChannel = `${this.keyPrefix}invalidation`;
  }

  /**
   * Initialize Redis connection.
   * Must be called before using the adapter.
   */
  async connect(): Promise<void> {
    return this.connectionGuard.connect(async () => {
      // Dynamic import to avoid loading ioredis when not using Redis
      const { Redis: IORedis } = await import('ioredis');

      const options: RedisOptions = {
        host: this.config.host ?? 'localhost',
        port: this.config.port ?? 6379,
        password: this.config.password,
        db: this.config.db ?? 0,
        connectTimeout: this.config.connectTimeoutMs ?? 10000,
        maxRetriesPerRequest: this.config.maxRetriesPerRequest ?? 3,
        retryStrategy: (times: number) => {
          if (times > 10) return null; // Stop retrying
          return Math.min(times * 100, 3000);
        },
        lazyConnect: true,
      };

      if (this.config.tls) {
        options.tls = {};
      }

      // If URL is provided, use it instead
      if (this.config.url) {
        this.client = new IORedis(this.config.url, options);
      } else {
        this.client = new IORedis(options);
      }

      const client = this.client!;

      // Handle connection events
      client.on('connect', () => {
        logger.info('Redis cache connected');
      });

      client.on('error', (error: Error) => {
        logger.error({ error }, 'Redis cache error');
      });

      client.on('close', () => {
        this.connectionGuard.setDisconnected();
        logger.warn('Redis cache connection closed');
      });

      // Actually connect
      await client.connect();

      // Set up a separate subscriber client for invalidation messages
      await this.setupInvalidationSubscriber(IORedis, options);
    });
  }

  /**
   * Set up pub/sub subscriber for cross-instance cache invalidation.
   */
  private async setupInvalidationSubscriber(
    IORedis: typeof import('ioredis').default,
    options: RedisOptions
  ): Promise<void> {
    // Create a separate client for subscriptions (Redis requirement)
    if (this.config.url) {
      this.subClient = new IORedis(this.config.url, options);
    } else {
      this.subClient = new IORedis(options);
    }

    await this.subClient.connect();

    // Subscribe to invalidation channel
    await this.subClient.subscribe(this.invalidationChannel);

    this.subClient.on('message', (channel: string, message: string) => {
      if (channel !== this.invalidationChannel) return;

      try {
        const { key, type } = JSON.parse(message) as { key: string; type: 'delete' | 'clear' };

        if (type === 'clear') {
          // Clear all local cache entries with our prefix
          for (const fullKey of this.localCache.keys()) {
            if (fullKey.startsWith(this.keyPrefix)) {
              this.localCache.delete(fullKey);
            }
          }
        } else if (type === 'delete' && key) {
          // Delete specific key from local cache
          this.localCache.delete(key);
        }
      } catch {
        // Ignore malformed messages
      }
    });
  }

  /**
   * Close Redis connection.
   */
  async close(): Promise<void> {
    if (this.subClient) {
      await this.subClient.unsubscribe(this.invalidationChannel);
      await this.subClient.quit();
      this.subClient = null;
    }
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
    this.connectionGuard.reset();
  }

  /**
   * Check if connected to Redis.
   */
  isConnected(): boolean {
    return this.connectionGuard.connected && this.client !== null;
  }

  /**
   * Get a value from cache.
   * Uses local cache as L1, Redis as L2.
   */
  get(key: string): T | undefined {
    const fullKey = this.keyPrefix + key;

    // Check local cache first (L1)
    const local = this.localCache.get(fullKey);
    if (local && local.expiresAt > Date.now()) {
      return local.value;
    }

    // Remove expired local entry
    if (local) {
      this.localCache.delete(fullKey);
    }

    // For sync interface, we can't truly await Redis
    // Queue an async fetch that updates local cache
    if (this.client && this.connectionGuard.connected) {
      this.fetchAsync(fullKey).catch((error) => {
        logger.debug({ error, key }, 'Async fetch failed');
      });
    }

    return undefined;
  }

  /**
   * Async get from Redis.
   */
  async getAsync(key: string): Promise<T | undefined> {
    const fullKey = this.keyPrefix + key;

    // Check local cache first
    const local = this.localCache.get(fullKey);
    if (local && local.expiresAt > Date.now()) {
      return local.value;
    }

    if (!this.client || !this.connectionGuard.connected) {
      return undefined;
    }

    try {
      const data = await this.client.get(fullKey);
      if (data) {
        const value = JSON.parse(data) as T;
        // Cache in local with short TTL
        this.localCache.set(fullKey, {
          value,
          expiresAt: Date.now() + 10000, // 10 second local TTL
        });
        return value;
      }
    } catch (error) {
      logger.debug({ error, key }, 'Redis get failed');
    }

    return undefined;
  }

  /**
   * Set a value in cache.
   */
  set(key: string, value: T, ttlMs?: number): void {
    const fullKey = this.keyPrefix + key;
    const ttl = ttlMs ?? this.defaultTTLMs;

    // Update local cache immediately
    this.localCache.set(fullKey, {
      value,
      expiresAt: Date.now() + ttl,
    });

    // Queue async Redis set
    if (this.client && this.connectionGuard.connected) {
      this.setAsync(key, value, ttlMs).catch((error) => {
        logger.debug({ error, key }, 'Async set failed');
      });
    }
  }

  /**
   * Async set to Redis.
   */
  async setAsync(key: string, value: T, ttlMs?: number): Promise<void> {
    if (!this.client || !this.connectionGuard.connected) {
      return;
    }

    const fullKey = this.keyPrefix + key;
    const ttl = ttlMs ?? this.defaultTTLMs;

    try {
      const data = JSON.stringify(value);
      await this.client.set(fullKey, data, 'PX', ttl);
    } catch (error) {
      logger.debug({ error, key }, 'Redis set failed');
    }
  }

  /**
   * Check if key exists in cache.
   */
  has(key: string): boolean {
    const fullKey = this.keyPrefix + key;

    // Check local cache
    const local = this.localCache.get(fullKey);
    return local !== undefined && local.expiresAt > Date.now();
  }

  /**
   * Async check if key exists in Redis.
   */
  async hasAsync(key: string): Promise<boolean> {
    if (!this.client || !this.connectionGuard.connected) {
      return this.has(key);
    }

    const fullKey = this.keyPrefix + key;
    try {
      const exists = await this.client.exists(fullKey);
      return exists === 1;
    } catch {
      return false;
    }
  }

  /**
   * Delete a key from cache.
   */
  delete(key: string): boolean {
    const fullKey = this.keyPrefix + key;
    const hadLocal = this.localCache.delete(fullKey);

    // Queue async Redis delete
    if (this.client && this.connectionGuard.connected) {
      this.deleteAsync(key).catch((error) => {
        logger.debug({ error, key }, 'Async delete failed');
      });
    }

    return hadLocal;
  }

  /**
   * Async delete from Redis.
   */
  async deleteAsync(key: string): Promise<boolean> {
    if (!this.client || !this.connectionGuard.connected) {
      return false;
    }

    const fullKey = this.keyPrefix + key;
    try {
      const result = await this.client.del(fullKey);

      // Publish invalidation message for cross-instance consistency
      await this.publishInvalidation(fullKey, 'delete');

      return result > 0;
    } catch {
      return false;
    }
  }

  /**
   * Publish cache invalidation message to other instances.
   */
  private async publishInvalidation(
    key: string,
    type: 'delete' | 'clear'
  ): Promise<void> {
    if (!this.client || !this.connectionGuard.connected) return;

    try {
      await this.client.publish(
        this.invalidationChannel,
        JSON.stringify({ key, type })
      );
    } catch {
      // Ignore publish errors - best effort invalidation
    }
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.localCache.clear();

    // Queue async Redis clear
    if (this.client && this.connectionGuard.connected) {
      this.clearAsync().catch((error) => {
        logger.warn({ error }, 'Async clear failed');
      });
    }
  }

  /**
   * Async clear all entries with our prefix.
   */
  async clearAsync(): Promise<void> {
    if (!this.client || !this.connectionGuard.connected) {
      return;
    }

    try {
      // Use SCAN to find all keys with our prefix
      const pattern = this.keyPrefix + '*';
      let cursor = '0';
      const keysToDelete: string[] = [];
      let iterations = 0;

      do {
        if (++iterations > MAX_SCAN_ITERATIONS) {
          logger.warn(
            { iterations, keysFound: keysToDelete.length },
            'SCAN iteration limit reached in clearAsync'
          );
          break;
        }

        const [newCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = newCursor;
        keysToDelete.push(...keys);
      } while (cursor !== '0');

      if (keysToDelete.length > 0) {
        await this.client.del(...keysToDelete);
      }

      // Publish clear invalidation for cross-instance consistency
      await this.publishInvalidation('', 'clear');
    } catch (error) {
      logger.error({ error }, 'Redis clear failed');
    }
  }

  /**
   * Invalidate all keys matching a prefix.
   */
  invalidateByPrefix(prefix: string): number {
    let count = 0;
    const fullPrefix = this.keyPrefix + prefix;

    // Invalidate local cache
    for (const key of this.localCache.keys()) {
      if (key.startsWith(fullPrefix)) {
        this.localCache.delete(key);
        count++;
      }
    }

    // Queue async Redis invalidation
    if (this.client && this.connectionGuard.connected) {
      this.invalidateByPrefixAsync(prefix).catch((error) => {
        logger.debug({ error, prefix }, 'Async invalidate by prefix failed');
      });
    }

    return count;
  }

  /**
   * Async invalidate by prefix in Redis.
   */
  async invalidateByPrefixAsync(prefix: string): Promise<number> {
    if (!this.client || !this.connectionGuard.connected) {
      return 0;
    }

    try {
      const pattern = this.keyPrefix + prefix + '*';
      let cursor = '0';
      const keysToDelete: string[] = [];
      let iterations = 0;

      do {
        if (++iterations > MAX_SCAN_ITERATIONS) {
          logger.warn(
            { iterations, keysFound: keysToDelete.length, prefix },
            'SCAN iteration limit reached in invalidateByPrefixAsync'
          );
          break;
        }

        const [newCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = newCursor;
        keysToDelete.push(...keys);
      } while (cursor !== '0');

      if (keysToDelete.length > 0) {
        await this.client.del(...keysToDelete);
      }

      return keysToDelete.length;
    } catch (error) {
      logger.error({ error, prefix }, 'Redis invalidate by prefix failed');
      return 0;
    }
  }

  /**
   * Invalidate keys matching a predicate.
   * Note: This is expensive for Redis and should be used sparingly.
   */
  invalidateByPredicate(predicate: (key: string) => boolean): number {
    let count = 0;

    // Invalidate local cache
    for (const fullKey of this.localCache.keys()) {
      const key = fullKey.slice(this.keyPrefix.length);
      if (predicate(key)) {
        this.localCache.delete(fullKey);
        count++;
      }
    }

    // Note: We don't do async Redis invalidation by predicate
    // as it would require scanning all keys - too expensive

    return count;
  }

  /**
   * Get approximate size (local cache only).
   */
  size(): number {
    return this.localCache.size;
  }

  /**
   * Get memory bytes (estimated from local cache).
   */
  memoryBytes(): number {
    let bytes = 0;
    for (const [key, entry] of this.localCache) {
      bytes += key.length * 2; // UTF-16
      bytes += JSON.stringify(entry.value).length * 2;
      bytes += 8; // expiresAt number
    }
    return bytes;
  }

  /**
   * Internal async fetch to populate local cache.
   */
  private async fetchAsync(fullKey: string): Promise<void> {
    if (!this.client || !this.connectionGuard.connected) return;

    // Dedupe concurrent fetches for same key
    const existing = this.pendingOps.get(fullKey);
    if (existing) {
      await existing;
      return;
    }

    const op = (async () => {
      try {
        const data = await this.client!.get(fullKey);
        if (data) {
          const value = JSON.parse(data) as T;
          this.localCache.set(fullKey, {
            value,
            expiresAt: Date.now() + 10000, // 10 second local TTL
          });
        }
      } finally {
        this.pendingOps.delete(fullKey);
      }
    })();

    this.pendingOps.set(fullKey, op);
    await op;
  }

  /**
   * Get Redis client for direct access if needed.
   */
  getClient(): Redis | null {
    return this.client;
  }
}

/**
 * Create a Redis cache adapter.
 */
export function createRedisCacheAdapter<T = unknown>(
  config: RedisCacheConfig
): RedisCacheAdapter<T> {
  return new RedisCacheAdapter<T>(config);
}
