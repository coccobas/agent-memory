/**
 * Integration tests for Redis adapters.
 *
 * These tests require a running Redis instance.
 * Skip if AGENT_MEMORY_REDIS_ENABLED is not set.
 *
 * To run locally:
 *   docker run -d -p 6379:6379 redis:alpine
 *   AGENT_MEMORY_REDIS_ENABLED=true npm run test tests/integration/redis-adapters.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { config } from '../../src/config/index.js';

// Skip if Redis is not configured
const REDIS_ENABLED = process.env.AGENT_MEMORY_REDIS_ENABLED === 'true';

describe.skipIf(!REDIS_ENABLED)('Redis Adapters Integration', () => {
  // Dynamic imports to avoid loading ioredis when not used
  let RedisCacheAdapter: typeof import('../../src/core/adapters/redis-cache.adapter.js').RedisCacheAdapter;
  let RedisLockAdapter: typeof import('../../src/core/adapters/redis-lock.adapter.js').RedisLockAdapter;
  let RedisEventAdapter: typeof import('../../src/core/adapters/redis-event.adapter.js').RedisEventAdapter;

  beforeAll(async () => {
    const cacheModule = await import('../../src/core/adapters/redis-cache.adapter.js');
    const lockModule = await import('../../src/core/adapters/redis-lock.adapter.js');
    const eventModule = await import('../../src/core/adapters/redis-event.adapter.js');

    RedisCacheAdapter = cacheModule.RedisCacheAdapter;
    RedisLockAdapter = lockModule.RedisLockAdapter;
    RedisEventAdapter = eventModule.RedisEventAdapter;
  });

  describe('RedisCacheAdapter', () => {
    let cache: InstanceType<typeof RedisCacheAdapter>;

    beforeEach(async () => {
      cache = new RedisCacheAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:cache:',
        defaultTTLMs: 60000,
      });
      await cache.connect();
    });

    afterEach(async () => {
      await cache.clearAsync();
      await cache.close();
    });

    it('should connect to Redis', () => {
      expect(cache.isConnected()).toBe(true);
    });

    it('should set and get values', async () => {
      await cache.setAsync('key1', { foo: 'bar' });
      const value = await cache.getAsync('key1');
      expect(value).toEqual({ foo: 'bar' });
    });

    it('should return undefined for missing keys', async () => {
      const value = await cache.getAsync('nonexistent');
      expect(value).toBeUndefined();
    });

    it('should check key existence', async () => {
      await cache.setAsync('exists', 'value');
      expect(await cache.hasAsync('exists')).toBe(true);
      expect(await cache.hasAsync('notexists')).toBe(false);
    });

    it('should delete keys', async () => {
      await cache.setAsync('todelete', 'value');
      expect(await cache.hasAsync('todelete')).toBe(true);
      const deleted = await cache.deleteAsync('todelete');
      expect(deleted).toBe(true);
      expect(await cache.hasAsync('todelete')).toBe(false);
    });

    it('should invalidate by prefix', async () => {
      await cache.setAsync('prefix:one', 'value1');
      await cache.setAsync('prefix:two', 'value2');
      await cache.setAsync('other:three', 'value3');

      const count = await cache.invalidateByPrefixAsync('prefix:');

      expect(count).toBe(2);
      expect(await cache.hasAsync('prefix:one')).toBe(false);
      expect(await cache.hasAsync('prefix:two')).toBe(false);
      expect(await cache.hasAsync('other:three')).toBe(true);
    });

    it('should expire keys based on TTL', async () => {
      await cache.setAsync('expiring', 'value', 100); // 100ms TTL
      expect(await cache.hasAsync('expiring')).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await cache.hasAsync('expiring')).toBe(false);
    });
  });

  describe('RedisLockAdapter', () => {
    let lock: InstanceType<typeof RedisLockAdapter>;

    beforeEach(async () => {
      lock = new RedisLockAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:lock:',
        defaultTTLMs: 5000,
        retryCount: 3,
        retryDelayMs: 100,
      });
      await lock.connect();
    });

    afterEach(async () => {
      // Clean up any remaining locks
      const locks = await lock.listLocks();
      for (const l of locks) {
        await lock.forceRelease(l.key, 'test cleanup');
      }
      await lock.close();
    });

    it('should acquire and release locks', async () => {
      const result = await lock.acquire('resource1', 'agent1');

      expect(result.acquired).toBe(true);
      expect(result.lock).toBeDefined();
      expect(result.lock!.owner).toBe('agent1');

      const released = await lock.release('resource1', 'agent1');
      expect(released).toBe(true);
    });

    it('should prevent double locking', async () => {
      const result1 = await lock.acquire('resource2', 'agent1');
      expect(result1.acquired).toBe(true);

      const result2 = await lock.acquire('resource2', 'agent2');
      expect(result2.acquired).toBe(false);

      await lock.release('resource2', 'agent1');
    });

    it('should check lock status', async () => {
      expect(await lock.isLocked('resource3')).toBe(false);

      await lock.acquire('resource3', 'agent1');
      expect(await lock.isLocked('resource3')).toBe(true);

      await lock.release('resource3', 'agent1');
      expect(await lock.isLocked('resource3')).toBe(false);
    });

    it('should get lock information', async () => {
      await lock.acquire('resource4', 'agent1', {
        metadata: { purpose: 'test' },
      });

      const info = await lock.getLock('resource4');
      expect(info).toBeDefined();
      expect(info!.owner).toBe('agent1');
      expect(info!.metadata).toEqual({ purpose: 'test' });

      await lock.release('resource4', 'agent1');
    });

    it('should force release locks', async () => {
      await lock.acquire('resource5', 'agent1');
      expect(await lock.isLocked('resource5')).toBe(true);

      const forceReleased = await lock.forceRelease('resource5', 'admin override');
      expect(forceReleased).toBe(true);
      expect(await lock.isLocked('resource5')).toBe(false);
    });

    it('should list all locks', async () => {
      await lock.acquire('list:a', 'agent1');
      await lock.acquire('list:b', 'agent2');

      const locks = await lock.listLocks();
      expect(locks.length).toBeGreaterThanOrEqual(2);

      await lock.release('list:a', 'agent1');
      await lock.release('list:b', 'agent2');
    });

    it('should expire locks based on TTL', async () => {
      await lock.acquire('expiring', 'agent1', { ttlMs: 200 });
      expect(await lock.isLocked('expiring')).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(await lock.isLocked('expiring')).toBe(false);
    });
  });

  describe('RedisEventAdapter', () => {
    let event1: InstanceType<typeof RedisEventAdapter>;
    let event2: InstanceType<typeof RedisEventAdapter>;

    beforeEach(async () => {
      event1 = new RedisEventAdapter({
        host: config.redis.host,
        port: config.redis.port,
        channel: 'test:events',
        instanceId: 'instance1',
      });
      event2 = new RedisEventAdapter({
        host: config.redis.host,
        port: config.redis.port,
        channel: 'test:events',
        instanceId: 'instance2',
      });

      await event1.connect();
      await event2.connect();
    });

    afterEach(async () => {
      event1.clear();
      event2.clear();
      await event1.close();
      await event2.close();
    });

    it('should subscribe and emit events locally', async () => {
      const received: unknown[] = [];
      event1.subscribe((event) => received.push(event));

      event1.emit({
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        action: 'create',
      });

      // Local events are synchronous
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(
        expect.objectContaining({
          entryType: 'tool',
          entryId: 'tool-1',
        })
      );
    });

    it('should propagate events between instances', async () => {
      const received: unknown[] = [];
      event2.subscribe((event) => received.push(event));

      event1.emit({
        entryType: 'guideline',
        entryId: 'guide-1',
        scopeType: 'global',
        scopeId: null,
        action: 'update',
      });

      // Wait for Redis pub/sub propagation
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(
        expect.objectContaining({
          entryType: 'guideline',
          entryId: 'guide-1',
        })
      );
    });

    it('should not receive own events from Redis', async () => {
      const received: unknown[] = [];

      // This should only receive local events, not from Redis
      const unsubscribe = event1.subscribe((event) => {
        received.push({ ...event, source: 'local' });
      });

      event1.emit({
        entryType: 'knowledge',
        entryId: 'know-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        action: 'delete',
      });

      // Wait for any Redis messages
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should only have received the local event once
      expect(received).toHaveLength(1);

      unsubscribe();
    });

    it('should track subscriber count', () => {
      expect(event1.subscriberCount()).toBe(0);

      const unsub1 = event1.subscribe(() => {});
      expect(event1.subscriberCount()).toBe(1);

      const unsub2 = event1.subscribe(() => {});
      expect(event1.subscriberCount()).toBe(2);

      unsub1();
      expect(event1.subscriberCount()).toBe(1);

      unsub2();
      expect(event1.subscriberCount()).toBe(0);
    });

    it('should clear all subscribers', () => {
      event1.subscribe(() => {});
      event1.subscribe(() => {});
      expect(event1.subscriberCount()).toBe(2);

      event1.clear();
      expect(event1.subscriberCount()).toBe(0);
    });
  });

  describe('Cross-Instance Scenarios', () => {
    it('should handle cache invalidation across instances', async () => {
      const cache1 = new RedisCacheAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'cross:cache:',
      });
      const cache2 = new RedisCacheAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'cross:cache:',
      });

      await cache1.connect();
      await cache2.connect();

      try {
        // Instance 1 sets a value
        await cache1.setAsync('shared-key', { data: 'original' });

        // Instance 2 can read it
        const value = await cache2.getAsync('shared-key');
        expect(value).toEqual({ data: 'original' });

        // Instance 1 invalidates
        await cache1.deleteAsync('shared-key');

        // Allow pub/sub invalidation message to propagate
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Instance 2 should see the deletion (local cache invalidated via pub/sub)
        const deleted = await cache2.getAsync('shared-key');
        expect(deleted).toBeUndefined();
      } finally {
        await cache1.clearAsync();
        await cache1.close();
        await cache2.close();
      }
    });

    it('should coordinate locks across instances', async () => {
      const lock1 = new RedisLockAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'cross:lock:',
      });
      const lock2 = new RedisLockAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'cross:lock:',
      });

      await lock1.connect();
      await lock2.connect();

      try {
        // Instance 1 acquires lock
        const result1 = await lock1.acquire('shared-resource', 'instance1');
        expect(result1.acquired).toBe(true);

        // Instance 2 cannot acquire
        const result2 = await lock2.acquire('shared-resource', 'instance2');
        expect(result2.acquired).toBe(false);

        // Instance 1 releases
        await lock1.release('shared-resource', 'instance1');

        // Now instance 2 can acquire
        const result3 = await lock2.acquire('shared-resource', 'instance2');
        expect(result3.acquired).toBe(true);

        await lock2.release('shared-resource', 'instance2');
      } finally {
        await lock1.close();
        await lock2.close();
      }
    });
  });
});
