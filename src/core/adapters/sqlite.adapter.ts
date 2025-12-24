/**
 * SQLite Storage Adapter
 *
 * Wraps the existing SQLite + Drizzle database connection
 * behind the IStorageAdapter interface.
 *
 * Design: Implements async-first interface by wrapping sync SQLite
 * calls in Promise.resolve(). This allows the same interface to
 * work with both SQLite (sync) and PostgreSQL (async).
 */

import type Database from 'better-sqlite3';
import type { AppDb } from '../types.js';
import type { IStorageAdapter } from './interfaces.js';
import { transactionWithDb } from '../../db/connection.js';

/**
 * SQLite storage adapter implementation.
 * Wraps existing better-sqlite3 + Drizzle ORM instances.
 *
 * All async methods wrap synchronous SQLite calls in Promise.resolve()
 * for interface compatibility with PostgreSQL adapters.
 */
export class SQLiteStorageAdapter implements IStorageAdapter {
  private db: AppDb;
  private sqlite: Database.Database;
  private connected = true; // Assumes already connected when constructed

  constructor(db: AppDb, sqlite: Database.Database) {
    this.db = db;
    this.sqlite = sqlite;
  }

  async connect(): Promise<void> {
    // SQLite connection is created synchronously in factory
    // This method exists for interface compatibility (PostgreSQL would use it)
    this.connected = true;
  }

  async close(): Promise<void> {
    if (this.connected && this.sqlite.open) {
      this.sqlite.close();
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.sqlite.open;
  }

  /**
   * Execute a raw SQL query and return all results.
   * Wraps sync SQLite call in Promise for interface compatibility.
   */
  async executeRaw<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const stmt = this.sqlite.prepare(sql);
    const result = (params ? stmt.all(...params) : stmt.all()) as T[];
    return Promise.resolve(result);
  }

  /**
   * Execute a raw SQL query and return the first result.
   * Wraps sync SQLite call in Promise for interface compatibility.
   */
  async executeRawSingle<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const stmt = this.sqlite.prepare(sql);
    const result = (params ? stmt.get(...params) : stmt.get()) as T | undefined;
    return Promise.resolve(result);
  }

  /**
   * Execute a function within a database transaction.
   *
   * For SQLite with better-sqlite3, the underlying transaction is synchronous.
   * The async fn is executed within the sync transaction context.
   * This works because Drizzle with better-sqlite3 returns immediately-resolved promises.
   *
   * Note: Truly async operations (I/O, timers) within fn would break this pattern,
   * but all Drizzle operations with better-sqlite3 are synchronous internally.
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // SQLite transactions are synchronous internally
    // We wrap the sync transaction in a Promise for interface compatibility
    return new Promise((resolve, reject) => {
      try {
        const result = transactionWithDb(this.sqlite, () => {
          // Execute the async fn synchronously
          // This works because Drizzle/better-sqlite3 operations resolve immediately
          let syncResult: T;
          let syncError: Error | undefined;

          // Start the promise chain
          fn()
            .then((r) => {
              syncResult = r;
            })
            .catch((e) => {
              syncError = e;
            });

          // Since SQLite is sync, the promise has already resolved/rejected
          if (syncError) {
            throw syncError;
          }
          return syncResult!;
        });
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  }

  getDb(): AppDb {
    return this.db;
  }

  getRawConnection(): Database.Database {
    return this.sqlite;
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      if (!this.sqlite.open) {
        return { ok: false, latencyMs: Date.now() - start };
      }
      this.sqlite.prepare('SELECT 1').get();
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }
}

/**
 * Create a SQLite storage adapter from existing db instances.
 */
export function createSQLiteStorageAdapter(db: AppDb, sqlite: Database.Database): IStorageAdapter {
  return new SQLiteStorageAdapter(db, sqlite);
}
