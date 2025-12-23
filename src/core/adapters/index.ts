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
  MemoryCacheAdapter,
  IterableLRUCache,
  createMemoryCacheAdapter,
} from './memory-cache.adapter.js';
export { LocalLockAdapter, createLocalLockAdapter } from './local-lock.adapter.js';
export { LocalEventAdapter, createLocalEventAdapter } from './local-event.adapter.js';

// Dependencies for factory
import type Database from 'better-sqlite3';
import type { AppDb } from '../types.js';
import type { IFileLockRepository } from '../interfaces/repositories.js';
import type { Adapters, ICacheAdapter } from './interfaces.js';
import { LRUCache } from '../../utils/lru-cache.js';
import { createSQLiteStorageAdapter } from './sqlite.adapter.js';
import { createMemoryCacheAdapter } from './memory-cache.adapter.js';
import { createLocalLockAdapter } from './local-lock.adapter.js';
import { createLocalEventAdapter } from './local-event.adapter.js';

/**
 * Dependencies required to create adapters.
 */
export interface AdapterDeps {
  db: AppDb;
  sqlite: Database.Database;
  fileLockRepo: IFileLockRepository;
  cache?: LRUCache<unknown>;
}

/**
 * Create all adapters from dependencies.
 *
 * Currently creates local/SQLite implementations.
 * Future: could switch based on config (e.g., PostgreSQL, Redis).
 */
export function createAdapters(deps: AdapterDeps): Adapters {
  // Storage adapter wraps SQLite + Drizzle
  const storage = createSQLiteStorageAdapter(deps.db, deps.sqlite);

  // Cache adapter wraps LRUCache (create default if not provided)
  const cacheInstance =
    deps.cache ??
    new LRUCache<unknown>({
      maxSize: 1000,
      maxMemoryMB: 100,
    });
  const cache = createMemoryCacheAdapter(cacheInstance) as ICacheAdapter;

  // Lock adapter wraps FileLockRepository
  const lock = createLocalLockAdapter(deps.fileLockRepo);

  // Event adapter uses singleton EventBus
  const event = createLocalEventAdapter();

  return {
    storage,
    cache,
    lock,
    event,
  };
}
