/**
 * Cache Versioning Utility
 *
 * Provides cache key versioning to handle schema/format changes gracefully.
 * When the cache version changes, old cached data is automatically invalidated.
 *
 * Features:
 * - Version-prefixed cache keys
 * - Automatic invalidation on version change
 * - Namespace support for different cache types
 * - Migration support for upgrading cached data
 *
 * Usage:
 *   const cache = new VersionedCache(lruCache, 'query', '2');
 *   cache.set('user:123', userData);
 *   cache.get('user:123'); // Returns userData
 *
 *   // After version change to '3':
 *   cache.get('user:123'); // Returns undefined (old version invalidated)
 */

import { createComponentLogger } from './logger.js';
import type { ICacheAdapter } from '../core/adapters/interfaces.js';

const logger = createComponentLogger('cache-version');

// =============================================================================
// TYPES
// =============================================================================

export interface CacheVersionConfig {
  namespace: string;
  version: string;
  migrations?: CacheMigration[];
}

export interface CacheMigration {
  fromVersion: string;
  toVersion: string;
  migrate: <T>(data: T) => T;
}

export interface VersionedCacheEntry<T> {
  version: string;
  data: T;
  timestamp: number;
}

// =============================================================================
// VERSIONED CACHE WRAPPER
// =============================================================================

/**
 * Wraps an ICacheAdapter with version-aware key prefixing
 */
export class VersionedCache<T = unknown> implements ICacheAdapter<T> {
  private cache: ICacheAdapter<VersionedCacheEntry<T>>;
  private namespace: string;
  private version: string;
  private migrations: Map<string, CacheMigration>;

  constructor(
    cache: ICacheAdapter<VersionedCacheEntry<T>>,
    config: CacheVersionConfig | string,
    version?: string
  ) {
    this.cache = cache;

    // Support simple (namespace, version) or config object
    if (typeof config === 'string') {
      this.namespace = config;
      this.version = version ?? '1';
      this.migrations = new Map();
    } else {
      this.namespace = config.namespace;
      this.version = config.version;
      this.migrations = new Map();
      for (const migration of config.migrations ?? []) {
        this.migrations.set(migration.fromVersion, migration);
      }
    }
  }

  /**
   * Get the versioned key
   */
  private getVersionedKey(key: string): string {
    return `${this.namespace}:v${this.version}:${key}`;
  }

  /**
   * Parse a versioned key to extract namespace, version, and original key
   * @internal Kept for potential future use in debugging/introspection
   */
  public parseVersionedKey(
    fullKey: string
  ): { namespace: string; version: string; key: string } | null {
    const pattern = new RegExp(`^${this.namespace}:v(\\d+):(.+)$`);
    const match = fullKey.match(pattern);
    if (!match) return null;
    // Extract capture groups - guaranteed to exist by regex match
    const version = match[1];
    const key = match[2];
    if (!version || !key) return null;
    return {
      namespace: this.namespace,
      version,
      key,
    };
  }

  /**
   * Get a value from cache, handling version mismatches
   */
  get(key: string): T | undefined {
    const versionedKey = this.getVersionedKey(key);
    const entry = this.cache.get(versionedKey);

    if (!entry) {
      // Try to find and migrate from older versions
      return this.tryMigrateFromOlder(key);
    }

    // Version matches - return data
    if (entry.version === this.version) {
      return entry.data;
    }

    // Version mismatch - try migration
    const migrated = this.tryMigrate(entry);
    if (migrated) {
      // Store migrated data
      this.set(key, migrated);
      return migrated;
    }

    // No migration available - return undefined (cache miss)
    logger.debug(
      { key, entryVersion: entry.version, currentVersion: this.version },
      'Cache version mismatch'
    );
    return undefined;
  }

  /**
   * Set a value in cache with current version
   */
  set(key: string, value: T, ttlMs?: number): void {
    const versionedKey = this.getVersionedKey(key);
    const entry: VersionedCacheEntry<T> = {
      version: this.version,
      data: value,
      timestamp: Date.now(),
    };
    this.cache.set(versionedKey, entry, ttlMs);
  }

  /**
   * Check if a key exists (with current version)
   */
  has(key: string): boolean {
    const versionedKey = this.getVersionedKey(key);
    const entry = this.cache.get(versionedKey);
    return entry !== undefined && entry.version === this.version;
  }

  /**
   * Delete a key
   */
  delete(key: string): boolean {
    const versionedKey = this.getVersionedKey(key);
    return this.cache.delete(versionedKey);
  }

  /**
   * Clear all entries for this namespace (all versions)
   */
  clear(): void {
    this.cache.invalidateByPrefix(`${this.namespace}:`);
  }

  /**
   * Clear entries for this namespace at current version
   */
  clearCurrentVersion(): void {
    this.cache.invalidateByPrefix(`${this.namespace}:v${this.version}:`);
  }

  /**
   * Clear entries for old versions (cleanup)
   */
  clearOldVersions(): number {
    const currentPrefix = `${this.namespace}:v${this.version}:`;
    const namespacePrefix = `${this.namespace}:v`;

    return this.cache.invalidateByPredicate((key) => {
      return key.startsWith(namespacePrefix) && !key.startsWith(currentPrefix);
    });
  }

  /**
   * Invalidate by prefix within this namespace
   */
  invalidateByPrefix(prefix: string): number {
    const fullPrefix = this.getVersionedKey(prefix);
    return this.cache.invalidateByPrefix(fullPrefix);
  }

  /**
   * Invalidate by predicate
   */
  invalidateByPredicate(predicate: (key: string) => boolean): number {
    const namespacePrefix = `${this.namespace}:v${this.version}:`;
    return this.cache.invalidateByPredicate((fullKey) => {
      if (!fullKey.startsWith(namespacePrefix)) return false;
      const originalKey = fullKey.slice(namespacePrefix.length);
      return predicate(originalKey);
    });
  }

  /**
   * Get cache size (entries for current version only)
   */
  size(): number {
    // This is an approximation - would need iteration for exact count
    return this.cache.size();
  }

  /**
   * Get memory usage
   */
  memoryBytes(): number {
    return this.cache.memoryBytes();
  }

  /**
   * Get current version
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * Get namespace
   */
  getNamespace(): string {
    return this.namespace;
  }

  /**
   * Try to migrate data from an older version
   */
  private tryMigrate(entry: VersionedCacheEntry<T>): T | undefined {
    const migration = this.migrations.get(entry.version);
    if (!migration || migration.toVersion !== this.version) {
      return undefined;
    }

    try {
      return migration.migrate(entry.data);
    } catch (error) {
      logger.warn(
        {
          fromVersion: entry.version,
          toVersion: this.version,
          error: error instanceof Error ? error.message : String(error),
        },
        'Cache migration failed'
      );
      return undefined;
    }
  }

  /**
   * Try to find and migrate from older version entries
   */
  private tryMigrateFromOlder(key: string): T | undefined {
    // Check for entries at older versions
    for (const [fromVersion, migration] of this.migrations) {
      if (migration.toVersion !== this.version) continue;

      const oldKey = `${this.namespace}:v${fromVersion}:${key}`;
      const oldEntry = this.cache.get(oldKey);

      if (oldEntry) {
        try {
          const migrated = migration.migrate(oldEntry.data);
          // Store at new version
          this.set(key, migrated);
          // Delete old entry
          this.cache.delete(oldKey);
          logger.debug({ key, fromVersion, toVersion: this.version }, 'Migrated cache entry');
          return migrated;
        } catch (error) {
          logger.warn(
            { key, fromVersion, error: error instanceof Error ? error.message : String(error) },
            'Cache migration failed'
          );
        }
      }
    }

    return undefined;
  }
}

// =============================================================================
// CACHE VERSION REGISTRY
// =============================================================================

/**
 * Central registry of cache versions for different namespaces.
 * Used to track and manage cache versions across the application.
 */
class CacheVersionRegistry {
  private versions: Map<string, string> = new Map();

  /**
   * Register a cache namespace with its version
   */
  register(namespace: string, version: string): void {
    this.versions.set(namespace, version);
  }

  /**
   * Get the version for a namespace
   */
  get(namespace: string): string | undefined {
    return this.versions.get(namespace);
  }

  /**
   * Get all registered namespaces and versions
   */
  getAll(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [namespace, version] of this.versions) {
      result[namespace] = version;
    }
    return result;
  }

  /**
   * Check if a namespace is registered
   */
  has(namespace: string): boolean {
    return this.versions.has(namespace);
  }
}

export const cacheVersionRegistry = new CacheVersionRegistry();

// =============================================================================
// PREDEFINED CACHE VERSIONS
// =============================================================================

/**
 * Cache version constants for different cache types.
 * Increment these when the cached data format changes.
 */
export const CACHE_VERSIONS = {
  // Query result cache - increment when query result format changes
  QUERY: '1',

  // Scope hierarchy cache - increment when scope resolution changes
  SCOPE: '1',

  // Embedding cache - increment when embedding format/dimensions change
  EMBEDDING: '1',

  // Search result cache - increment when search result format changes
  SEARCH: '1',

  // Health check cache - increment when health check format changes
  HEALTH: '1',
} as const;

// Register versions
cacheVersionRegistry.register('query', CACHE_VERSIONS.QUERY);
cacheVersionRegistry.register('scope', CACHE_VERSIONS.SCOPE);
cacheVersionRegistry.register('embedding', CACHE_VERSIONS.EMBEDDING);
cacheVersionRegistry.register('search', CACHE_VERSIONS.SEARCH);
cacheVersionRegistry.register('health', CACHE_VERSIONS.HEALTH);
