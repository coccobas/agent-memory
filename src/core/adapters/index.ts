/**
 * Adapter Factory and Exports
 *
 * Provides a factory function to create all adapters
 * and exports all adapter interfaces and implementations.
 */

// Interfaces
export type {
  IStorageAdapter,
  ICacheAdapter,
  ILockAdapter,
  IEventAdapter,
  LockInfo,
  AcquireLockOptions,
  AcquireLockResult,
  ListLocksFilter,
  EntryEventAdapter,
  Adapters,
  EntryChangedEvent,
} from './interfaces.js';

// Implementations
export { SQLiteStorageAdapter, createSQLiteStorageAdapter } from './sqlite.adapter.js';
export {
  PostgreSQLStorageAdapter,
  createPostgreSQLStorageAdapter,
} from './postgresql.adapter.js';
export {
  MemoryCacheAdapter,
  IterableLRUCache,
  createMemoryCacheAdapter,
} from './memory-cache.adapter.js';
export { LocalLockAdapter, createLocalLockAdapter } from './local-lock.adapter.js';
export { LocalEventAdapter, createLocalEventAdapter } from './local-event.adapter.js';

// Dependencies for factory
import type Database from 'better-sqlite3';
import type { Pool } from 'pg';
import type { AppDb } from '../types.js';
import type { IFileLockRepository } from '../interfaces/repositories.js';
import type { Adapters, IStorageAdapter } from './interfaces.js';
import type { DatabaseType, Config } from '../../config/index.js';
import { LRUCache } from '../../utils/lru-cache.js';
import { createSQLiteStorageAdapter } from './sqlite.adapter.js';
import { createPostgreSQLStorageAdapter } from './postgresql.adapter.js';
import { createMemoryCacheAdapter } from './memory-cache.adapter.js';
import { createLocalLockAdapter } from './local-lock.adapter.js';
import { createLocalEventAdapter } from './local-event.adapter.js';

/**
 * Dependencies required to create SQLite adapters.
 */
export interface SQLiteAdapterDeps {
  dbType: 'sqlite';
  db: AppDb;
  sqlite: Database.Database;
  fileLockRepo: IFileLockRepository;
  cache?: LRUCache<unknown>;
}

/**
 * Dependencies required to create PostgreSQL adapters.
 */
export interface PostgreSQLAdapterDeps {
  dbType: 'postgresql';
  config: Config['postgresql'];
  pool?: Pool; // Optional - if not provided, adapter will create its own
  fileLockRepo: IFileLockRepository;
  cache?: LRUCache<unknown>;
}

/**
 * Union type for all adapter dependencies.
 */
export type AdapterDeps = SQLiteAdapterDeps | PostgreSQLAdapterDeps;

/**
 * Legacy adapter deps for backwards compatibility.
 * @deprecated Use AdapterDeps with dbType instead
 */
export interface LegacyAdapterDeps {
  db: AppDb;
  sqlite: Database.Database;
  fileLockRepo: IFileLockRepository;
  cache?: LRUCache<unknown>;
}

/**
 * Create all adapters from dependencies.
 *
 * Supports both SQLite and PostgreSQL backends based on dbType.
 */
export function createAdapters(deps: AdapterDeps | LegacyAdapterDeps): Adapters {
  // Handle legacy deps (no dbType = SQLite)
  const effectiveDeps: AdapterDeps = 'dbType' in deps
    ? deps
    : { ...deps, dbType: 'sqlite' as const };

  // Create storage adapter based on database type
  let storage: IStorageAdapter;

  if (effectiveDeps.dbType === 'postgresql') {
    storage = createPostgreSQLStorageAdapter(effectiveDeps.config);
  } else {
    // SQLite
    const sqliteDeps = effectiveDeps as SQLiteAdapterDeps;
    storage = createSQLiteStorageAdapter(sqliteDeps.db, sqliteDeps.sqlite);
  }

  // Cache adapter wraps LRUCache (create default if not provided)
  const cacheInstance =
    effectiveDeps.cache ??
    new LRUCache<unknown>({
      maxSize: 1000,
      maxMemoryMB: 100,
    });
  const cache = createMemoryCacheAdapter(cacheInstance);

  // Lock adapter wraps FileLockRepository
  const lock = createLocalLockAdapter(effectiveDeps.fileLockRepo);

  // Event adapter uses singleton EventBus
  const event = createLocalEventAdapter();

  return {
    storage,
    cache,
    lock,
    event,
  };
}

/**
 * Create a storage adapter based on database type.
 * Utility function for when you only need the storage adapter.
 */
export function createStorageAdapter(
  dbType: DatabaseType,
  deps: { db?: AppDb; sqlite?: Database.Database; config?: Config['postgresql'] }
): IStorageAdapter {
  if (dbType === 'postgresql') {
    if (!deps.config) {
      throw new Error('PostgreSQL config required for postgresql storage adapter');
    }
    return createPostgreSQLStorageAdapter(deps.config);
  } else {
    if (!deps.db || !deps.sqlite) {
      throw new Error('db and sqlite required for sqlite storage adapter');
    }
    return createSQLiteStorageAdapter(deps.db, deps.sqlite);
  }
}
