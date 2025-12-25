/**
 * Unit tests for cache versioning utility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  VersionedCache,
  cacheVersionRegistry,
  CACHE_VERSIONS,
  type CacheVersionConfig,
  type CacheMigration,
  type VersionedCacheEntry,
} from '../../src/utils/cache-version.js';
import type { ICacheAdapter } from '../../src/core/adapters/interfaces.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock cache adapter for testing
class MockCacheAdapter<T> implements ICacheAdapter<T> {
  private storage = new Map<string, T>();

  get(key: string): T | undefined {
    return this.storage.get(key);
  }

  set(key: string, value: T, _ttlMs?: number): void {
    this.storage.set(key, value);
  }

  has(key: string): boolean {
    return this.storage.has(key);
  }

  delete(key: string): boolean {
    return this.storage.delete(key);
  }

  clear(): void {
    this.storage.clear();
  }

  invalidateByPrefix(prefix: string): number {
    let count = 0;
    for (const key of Array.from(this.storage.keys())) {
      if (key.startsWith(prefix)) {
        this.storage.delete(key);
        count++;
      }
    }
    return count;
  }

  invalidateByPredicate(predicate: (key: string) => boolean): number {
    let count = 0;
    for (const key of Array.from(this.storage.keys())) {
      if (predicate(key)) {
        this.storage.delete(key);
        count++;
      }
    }
    return count;
  }

  size(): number {
    return this.storage.size;
  }

  memoryBytes(): number {
    return this.storage.size * 100; // Mock value
  }
}

describe('VersionedCache', () => {
  let mockCache: MockCacheAdapter<VersionedCacheEntry<unknown>>;

  beforeEach(() => {
    mockCache = new MockCacheAdapter();
  });

  describe('Constructor', () => {
    it('should create cache with string config', () => {
      const cache = new VersionedCache(mockCache, 'test', '1');

      expect(cache.getNamespace()).toBe('test');
      expect(cache.getVersion()).toBe('1');
    });

    it('should create cache with object config', () => {
      const config: CacheVersionConfig = {
        namespace: 'test',
        version: '2',
      };

      const cache = new VersionedCache(mockCache, config);

      expect(cache.getNamespace()).toBe('test');
      expect(cache.getVersion()).toBe('2');
    });

    it('should default version to 1 when not provided', () => {
      const cache = new VersionedCache(mockCache, 'test');

      expect(cache.getVersion()).toBe('1');
    });

    it('should accept migrations in config', () => {
      const migration: CacheMigration = {
        fromVersion: '1',
        toVersion: '2',
        migrate: (data) => data,
      };

      const config: CacheVersionConfig = {
        namespace: 'test',
        version: '2',
        migrations: [migration],
      };

      const cache = new VersionedCache(mockCache, config);

      expect(cache.getVersion()).toBe('2');
    });
  });

  describe('get/set operations', () => {
    it('should set and get value', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      cache.set('key1', 'value1');
      const result = cache.get('key1');

      expect(result).toBe('value1');
    });

    it('should return undefined for non-existent key', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      const result = cache.get('nonexistent');

      expect(result).toBeUndefined();
    });

    it('should use versioned keys internally', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      cache.set('key1', 'value1');

      // Check internal storage uses versioned key
      const internalKey = 'test:v1:key1';
      expect(mockCache.has(internalKey)).toBe(true);
    });

    it('should include version in stored entry', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      cache.set('key1', 'value1');

      const entry = mockCache.get('test:v1:key1');
      expect(entry?.version).toBe('1');
      expect(entry?.data).toBe('value1');
      expect(entry?.timestamp).toBeGreaterThan(0);
    });

    it('should pass TTL to underlying cache', () => {
      const setSpy = vi.spyOn(mockCache, 'set');
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      cache.set('key1', 'value1', 5000);

      expect(setSpy).toHaveBeenCalledWith('test:v1:key1', expect.any(Object), 5000);
    });

    it('should handle different data types', () => {
      const cache = new VersionedCache<unknown>(mockCache, 'test', '1');

      cache.set('string', 'text');
      cache.set('number', 42);
      cache.set('boolean', true);
      cache.set('object', { key: 'value' });
      cache.set('array', [1, 2, 3]);

      expect(cache.get('string')).toBe('text');
      expect(cache.get('number')).toBe(42);
      expect(cache.get('boolean')).toBe(true);
      expect(cache.get('object')).toEqual({ key: 'value' });
      expect(cache.get('array')).toEqual([1, 2, 3]);
    });
  });

  describe('has operation', () => {
    it('should return true for existing key with correct version', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      cache.set('key1', 'value1');

      expect(cache.has('key1')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return false for key with wrong version', () => {
      const cache1 = new VersionedCache<string>(mockCache, 'test', '1');
      cache1.set('key1', 'value1');

      const cache2 = new VersionedCache<string>(mockCache, 'test', '2');

      expect(cache2.has('key1')).toBe(false);
    });
  });

  describe('delete operation', () => {
    it('should delete existing key', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      cache.set('key1', 'value1');
      const deleted = cache.delete('key1');

      expect(deleted).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should return false when deleting non-existent key', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      const deleted = cache.delete('nonexistent');

      expect(deleted).toBe(false);
    });

    it('should delete from correct version', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      cache.set('key1', 'value1');
      cache.delete('key1');

      // Verify internal key is deleted
      expect(mockCache.has('test:v1:key1')).toBe(false);
    });
  });

  describe('clear operations', () => {
    beforeEach(() => {
      const cache1 = new VersionedCache<string>(mockCache, 'test', '1');
      const cache2 = new VersionedCache<string>(mockCache, 'test', '2');
      const cache3 = new VersionedCache<string>(mockCache, 'other', '1');

      cache1.set('key1', 'v1-value1');
      cache1.set('key2', 'v1-value2');
      cache2.set('key1', 'v2-value1');
      cache2.set('key2', 'v2-value2');
      cache3.set('key1', 'other-value1');
    });

    it('should clear all versions of namespace', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      cache.clear();

      // All 'test' namespace entries should be gone
      expect(mockCache.has('test:v1:key1')).toBe(false);
      expect(mockCache.has('test:v1:key2')).toBe(false);
      expect(mockCache.has('test:v2:key1')).toBe(false);
      expect(mockCache.has('test:v2:key2')).toBe(false);

      // Other namespace should remain
      expect(mockCache.has('other:v1:key1')).toBe(true);
    });

    it('should clear only current version', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      cache.clearCurrentVersion();

      // Version 1 should be gone
      expect(mockCache.has('test:v1:key1')).toBe(false);
      expect(mockCache.has('test:v1:key2')).toBe(false);

      // Version 2 should remain
      expect(mockCache.has('test:v2:key1')).toBe(true);
      expect(mockCache.has('test:v2:key2')).toBe(true);
    });

    it('should clear only old versions', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '2');

      const count = cache.clearOldVersions();

      expect(count).toBe(2); // Two v1 entries removed

      // Version 1 should be gone
      expect(mockCache.has('test:v1:key1')).toBe(false);
      expect(mockCache.has('test:v1:key2')).toBe(false);

      // Version 2 should remain
      expect(mockCache.has('test:v2:key1')).toBe(true);
      expect(mockCache.has('test:v2:key2')).toBe(true);
    });
  });

  describe('invalidateByPrefix', () => {
    it('should invalidate entries by prefix', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      cache.set('user:123', 'user123');
      cache.set('user:456', 'user456');
      cache.set('post:789', 'post789');

      const count = cache.invalidateByPrefix('user:');

      expect(count).toBe(2);
      expect(cache.get('user:123')).toBeUndefined();
      expect(cache.get('user:456')).toBeUndefined();
      expect(cache.get('post:789')).toBe('post789');
    });

    it('should use versioned prefix', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      cache.set('key1', 'value1');
      cache.invalidateByPrefix('key');

      expect(mockCache.has('test:v1:key1')).toBe(false);
    });
  });

  describe('invalidateByPredicate', () => {
    it('should invalidate entries matching predicate', () => {
      const cache = new VersionedCache<number>(mockCache, 'test', '1');

      cache.set('key1', 10);
      cache.set('key2', 20);
      cache.set('key3', 30);

      const count = cache.invalidateByPredicate((key) => key.startsWith('key1') || key.startsWith('key3'));

      expect(count).toBe(2);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe(20);
      expect(cache.get('key3')).toBeUndefined();
    });

    it('should only check keys in current version', () => {
      const cache1 = new VersionedCache<string>(mockCache, 'test', '1');
      const cache2 = new VersionedCache<string>(mockCache, 'test', '2');

      cache1.set('key1', 'v1');
      cache2.set('key1', 'v2');

      cache2.invalidateByPredicate((key) => key === 'key1');

      // v2 should be invalidated, v1 should remain
      expect(cache2.get('key1')).toBeUndefined();
      expect(cache1.get('key1')).toBe('v1');
    });
  });

  describe('size and memory', () => {
    it('should return cache size', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      // Note: size() returns total cache size, not namespace-specific
      expect(cache.size()).toBe(2);
    });

    it('should return memory usage', () => {
      const cache = new VersionedCache<string>(mockCache, 'test', '1');

      cache.set('key1', 'value1');

      const memory = cache.memoryBytes();
      expect(memory).toBeGreaterThan(0);
    });
  });

  describe('Version mismatch handling', () => {
    it('should return undefined when version mismatches', () => {
      const cache1 = new VersionedCache<string>(mockCache, 'test', '1');
      cache1.set('key1', 'value1');

      const cache2 = new VersionedCache<string>(mockCache, 'test', '2');
      const result = cache2.get('key1');

      expect(result).toBeUndefined();
    });

    it('should not retrieve data from old version without migration', () => {
      const cache1 = new VersionedCache<string>(mockCache, 'test', '1');
      cache1.set('key1', 'old-value');

      const cache2 = new VersionedCache<string>(mockCache, 'test', '2');

      expect(cache2.get('key1')).toBeUndefined();
    });
  });

  describe('Migration support', () => {
    it('should migrate data when migration available', () => {
      // Create v1 cache and store data
      const cache1 = new VersionedCache<{ value: string }>(mockCache, 'test', '1');
      cache1.set('key1', { value: 'old' });

      // Create v2 cache with migration
      const migration: CacheMigration = {
        fromVersion: '1',
        toVersion: '2',
        migrate: (data: { value: string }) => ({ value: data.value.toUpperCase() }),
      };

      const config: CacheVersionConfig = {
        namespace: 'test',
        version: '2',
        migrations: [migration],
      };

      const cache2 = new VersionedCache<{ value: string }>(mockCache, config);
      const result = cache2.get('key1');

      expect(result).toEqual({ value: 'OLD' });
    });

    it('should store migrated data at new version', () => {
      const cache1 = new VersionedCache<string>(mockCache, 'test', '1');
      cache1.set('key1', 'data');

      const migration: CacheMigration = {
        fromVersion: '1',
        toVersion: '2',
        migrate: (data: string) => data.toUpperCase(),
      };

      const cache2 = new VersionedCache<string>(mockCache, {
        namespace: 'test',
        version: '2',
        migrations: [migration],
      });

      cache2.get('key1'); // Trigger migration

      // Check data is now at v2
      const entry = mockCache.get('test:v2:key1');
      expect(entry?.version).toBe('2');
      expect(entry?.data).toBe('DATA');
    });

    it('should delete old version entry after migration', () => {
      const cache1 = new VersionedCache<string>(mockCache, 'test', '1');
      cache1.set('key1', 'data');

      const migration: CacheMigration = {
        fromVersion: '1',
        toVersion: '2',
        migrate: (data: string) => data,
      };

      const cache2 = new VersionedCache<string>(mockCache, {
        namespace: 'test',
        version: '2',
        migrations: [migration],
      });

      cache2.get('key1'); // Trigger migration

      // Old version should be deleted
      expect(mockCache.has('test:v1:key1')).toBe(false);
    });

    it('should handle migration errors gracefully', () => {
      const cache1 = new VersionedCache<string>(mockCache, 'test', '1');
      cache1.set('key1', 'data');

      const migration: CacheMigration = {
        fromVersion: '1',
        toVersion: '2',
        migrate: () => {
          throw new Error('Migration failed');
        },
      };

      const cache2 = new VersionedCache<string>(mockCache, {
        namespace: 'test',
        version: '2',
        migrations: [migration],
      });

      const result = cache2.get('key1');

      // Should return undefined on migration failure
      expect(result).toBeUndefined();
    });

    it('should not migrate if toVersion does not match current version', () => {
      const cache1 = new VersionedCache<string>(mockCache, 'test', '1');
      cache1.set('key1', 'data');

      const migration: CacheMigration = {
        fromVersion: '1',
        toVersion: '3', // Different from current version
        migrate: (data: string) => data.toUpperCase(),
      };

      const cache2 = new VersionedCache<string>(mockCache, {
        namespace: 'test',
        version: '2',
        migrations: [migration],
      });

      const result = cache2.get('key1');

      expect(result).toBeUndefined();
    });
  });

  describe('parseVersionedKey', () => {
    it('should parse valid versioned key', () => {
      const cache = new VersionedCache(mockCache, 'test', '1');

      const parsed = cache.parseVersionedKey('test:v1:mykey');

      expect(parsed).toEqual({
        namespace: 'test',
        version: '1',
        key: 'mykey',
      });
    });

    it('should return null for invalid key format', () => {
      const cache = new VersionedCache(mockCache, 'test', '1');

      const parsed = cache.parseVersionedKey('invalid-key');

      expect(parsed).toBeNull();
    });

    it('should return null for wrong namespace', () => {
      const cache = new VersionedCache(mockCache, 'test', '1');

      const parsed = cache.parseVersionedKey('other:v1:mykey');

      expect(parsed).toBeNull();
    });

    it('should parse keys with complex original keys', () => {
      const cache = new VersionedCache(mockCache, 'test', '1');

      const parsed = cache.parseVersionedKey('test:v1:user:123:profile');

      expect(parsed).toEqual({
        namespace: 'test',
        version: '1',
        key: 'user:123:profile',
      });
    });
  });
});

describe('CacheVersionRegistry', () => {
  beforeEach(() => {
    // Note: registry is a singleton, so we can't fully reset it
    // We'll test with unique namespace names
  });

  describe('register', () => {
    it('should register namespace with version', () => {
      const namespace = `test-${Date.now()}`;
      cacheVersionRegistry.register(namespace, '1');

      expect(cacheVersionRegistry.has(namespace)).toBe(true);
    });

    it('should update version if already registered', () => {
      const namespace = `test-${Date.now()}`;
      cacheVersionRegistry.register(namespace, '1');
      cacheVersionRegistry.register(namespace, '2');

      expect(cacheVersionRegistry.get(namespace)).toBe('2');
    });
  });

  describe('get', () => {
    it('should return version for registered namespace', () => {
      const namespace = `test-${Date.now()}`;
      cacheVersionRegistry.register(namespace, '5');

      const version = cacheVersionRegistry.get(namespace);

      expect(version).toBe('5');
    });

    it('should return undefined for unregistered namespace', () => {
      const version = cacheVersionRegistry.get('nonexistent-namespace');

      expect(version).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for registered namespace', () => {
      const namespace = `test-${Date.now()}`;
      cacheVersionRegistry.register(namespace, '1');

      expect(cacheVersionRegistry.has(namespace)).toBe(true);
    });

    it('should return false for unregistered namespace', () => {
      expect(cacheVersionRegistry.has('unregistered-namespace')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return all registered namespaces', () => {
      const all = cacheVersionRegistry.getAll();

      expect(typeof all).toBe('object');
      expect(all).toHaveProperty('query');
      expect(all).toHaveProperty('scope');
      expect(all).toHaveProperty('embedding');
      expect(all).toHaveProperty('search');
      expect(all).toHaveProperty('health');
    });

    it('should include custom registered namespaces', () => {
      const namespace = `test-${Date.now()}`;
      cacheVersionRegistry.register(namespace, '1');

      const all = cacheVersionRegistry.getAll();

      expect(all).toHaveProperty(namespace);
      expect(all[namespace]).toBe('1');
    });
  });
});

describe('CACHE_VERSIONS', () => {
  it('should define cache version constants', () => {
    expect(CACHE_VERSIONS).toHaveProperty('QUERY');
    expect(CACHE_VERSIONS).toHaveProperty('SCOPE');
    expect(CACHE_VERSIONS).toHaveProperty('EMBEDDING');
    expect(CACHE_VERSIONS).toHaveProperty('SEARCH');
    expect(CACHE_VERSIONS).toHaveProperty('HEALTH');
  });

  it('should have string version values', () => {
    expect(typeof CACHE_VERSIONS.QUERY).toBe('string');
    expect(typeof CACHE_VERSIONS.SCOPE).toBe('string');
    expect(typeof CACHE_VERSIONS.EMBEDDING).toBe('string');
    expect(typeof CACHE_VERSIONS.SEARCH).toBe('string');
    expect(typeof CACHE_VERSIONS.HEALTH).toBe('string');
  });

  it('should be registered in registry', () => {
    expect(cacheVersionRegistry.get('query')).toBe(CACHE_VERSIONS.QUERY);
    expect(cacheVersionRegistry.get('scope')).toBe(CACHE_VERSIONS.SCOPE);
    expect(cacheVersionRegistry.get('embedding')).toBe(CACHE_VERSIONS.EMBEDDING);
    expect(cacheVersionRegistry.get('search')).toBe(CACHE_VERSIONS.SEARCH);
    expect(cacheVersionRegistry.get('health')).toBe(CACHE_VERSIONS.HEALTH);
  });
});

describe('Edge Cases', () => {
  let mockCache: MockCacheAdapter<VersionedCacheEntry<unknown>>;

  beforeEach(() => {
    mockCache = new MockCacheAdapter();
  });

  it('should handle empty namespace', () => {
    const cache = new VersionedCache(mockCache, '', '1');

    cache.set('key1', 'value1');
    const result = cache.get('key1');

    expect(result).toBe('value1');
  });

  it('should handle special characters in namespace', () => {
    const cache = new VersionedCache(mockCache, 'test-namespace_123', '1');

    cache.set('key1', 'value1');

    expect(cache.get('key1')).toBe('value1');
  });

  it('should handle numeric version strings', () => {
    const cache = new VersionedCache(mockCache, 'test', '123');

    cache.set('key1', 'value1');

    expect(cache.get('key1')).toBe('value1');
  });

  it('should handle null/undefined data', () => {
    const cache = new VersionedCache<unknown>(mockCache, 'test', '1');

    cache.set('null-key', null);
    cache.set('undefined-key', undefined);

    expect(cache.get('null-key')).toBe(null);
    expect(cache.get('undefined-key')).toBe(undefined);
  });

  it('should handle concurrent access to same key', () => {
    const cache = new VersionedCache<number>(mockCache, 'test', '1');

    cache.set('counter', 0);
    cache.set('counter', 1);
    cache.set('counter', 2);

    expect(cache.get('counter')).toBe(2);
  });
});
