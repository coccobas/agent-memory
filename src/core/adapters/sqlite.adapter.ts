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

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type Database from 'better-sqlite3';
import type { AppDb } from '../types.js';
import type { IStorageAdapter } from './interfaces.js';
import { transactionWithDb } from '../../db/connection.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('sqlite-adapter');

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
  private activeTransactionId: string | null = null;
  private transactionStartTime: number | null = null;

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
   * IMPORTANT: The fn parameter MUST only contain synchronous Drizzle operations.
   * Truly async operations (I/O, timers, fetch, etc.) will throw an error.
   *
   * Transaction Context Tracking (HIGH-012):
   * - Tracks active transaction via unique ID and timestamp
   * - Detects async operations that escape transaction context
   * - Provides detailed error messages with debugging information
   * - Logs warnings when potentially problematic patterns are detected
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const transactionId = `txn-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();

    // Detect nested transactions (not supported in SQLite)
    // This check MUST happen before we set activeTransactionId
    if (this.activeTransactionId !== null) {
      const error = new Error(
        `Nested SQLite transaction detected. Active transaction: ${this.activeTransactionId}, ` +
          `attempted new transaction: ${transactionId}. ` +
          `SQLite does not support nested transactions. ` +
          `This usually indicates an async operation escaped the transaction context.`
      );
      logger.error(
        {
          activeTransactionId: this.activeTransactionId,
          newTransactionId: transactionId,
          activeTransactionDurationMs: this.transactionStartTime
            ? Date.now() - this.transactionStartTime
            : null,
        },
        'Nested transaction attempted - potential async escape detected'
      );
      throw error;
    }

    let resultValue: T;
    let resultError: Error | undefined;
    let wasResolved = false;

    this.activeTransactionId = transactionId;
    this.transactionStartTime = startTime;

    try {
      // Bug #244 fix: If fn() throws synchronously, we need to catch and re-throw
      // inside the transaction to trigger rollback
      let syncThrowError: Error | undefined;

      transactionWithDb(this.sqlite, () => {
        // Bug #244 fix: Catch synchronous throws from fn() and re-throw them
        // to ensure the transaction rolls back
        let promise: Promise<T>;
        try {
          promise = fn();
        } catch (syncError) {
          // fn() threw synchronously - store it and throw to trigger rollback
          syncThrowError = syncError instanceof Error ? syncError : new Error(String(syncError));
          throw syncThrowError;
        }

        // Check if the promise resolved synchronously (microtask)
        promise
          .then((value) => {
            resultValue = value;
            wasResolved = true;
          })
          .catch((error: unknown) => {
            // Error type from catch is unknown - ensure it's an Error object
            resultError = error instanceof Error ? error : new Error(String(error));
            wasResolved = true;
          });
      });

      // If there was a sync throw, the transaction was rolled back - re-throw
      if (syncThrowError) {
        throw syncThrowError;
      }

      // Yield to microtask queue to let synchronously-resolved promises execute
      // This allows promises that resolve immediately (like synchronous Drizzle ops)
      // to complete their .then() callbacks
      await Promise.resolve();

      const durationMs = Date.now() - startTime;

      if (!wasResolved) {
        const error = new Error(
          `SQLite transaction completed before async operation resolved. ` +
            `Transaction ID: ${transactionId}, Duration: ${durationMs}ms. ` +
            `\n\nThis indicates an async operation escaped the transaction context. ` +
            `\n\nWHY THIS IS A PROBLEM:` +
            `\n- SQLite transactions are synchronous and complete immediately` +
            `\n- Async operations (I/O, timers, fetch, await real promises) run after the transaction ends` +
            `\n- Data changes from these operations won't be atomic with the transaction` +
            `\n- This can lead to data inconsistency and race conditions` +
            `\n\nHOW TO FIX:` +
            `\n1. Use only synchronous Drizzle operations within SQLite transactions` +
            `\n2. Move async I/O operations (file reads, HTTP calls, etc.) outside the transaction` +
            `\n3. For PostgreSQL, use the PostgreSQLStorageAdapter which supports true async transactions` +
            `\n4. Consider using transactionWithRetry() from db/connection.ts for better error handling` +
            `\n\nDEBUGGING:` +
            `\n- Review the call stack to identify which async operation didn't complete` +
            `\n- Look for: fetch(), fs promises, setTimeout/setInterval, external API calls` +
            `\n- Check if the transaction callback contains 'await' on non-Drizzle promises`
        );

        logger.error(
          {
            transactionId,
            durationMs,
            wasResolved: false,
          },
          'Async operation escaped SQLite transaction context'
        );

        throw error;
      }

      // Log warning for suspiciously long transactions
      if (durationMs > 100) {
        logger.warn(
          {
            transactionId,
            durationMs,
            threshold: 100,
          },
          'SQLite transaction took longer than expected - may contain async operations'
        );
      }

      if (resultError) {
        logger.debug(
          {
            transactionId,
            durationMs,
            error: resultError.message,
          },
          'Transaction failed with error'
        );
        throw resultError;
      }

      logger.debug(
        {
          transactionId,
          durationMs,
        },
        'Transaction completed successfully'
      );

      return resultValue!;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error(
        {
          transactionId,
          durationMs,
          error: error instanceof Error ? error.message : String(error),
        },
        'Transaction failed'
      );
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      // Always clear transaction tracking in finally block
      this.activeTransactionId = null;
      this.transactionStartTime = null;
    }
  }

  getDb(): AppDb {
    return this.db;
  }

  getRawConnection(): Database.Database {
    return this.sqlite;
  }

  /**
   * Perform a health check on the database connection.
   * Optionally attempts to reconnect if the connection is broken.
   *
   * Note: SQLite reconnection is limited since the adapter is constructed
   * with pre-initialized db and sqlite instances. If the database file
   * is corrupted or missing, reconnection won't help.
   */
  async healthCheck(options?: { attemptReconnect?: boolean }): Promise<{
    ok: boolean;
    latencyMs: number;
    reconnected?: boolean;
  }> {
    const start = Date.now();
    try {
      if (!this.sqlite.open) {
        if (options?.attemptReconnect) {
          logger.warn(
            'Health check: SQLite database is closed. Reconnection not supported for ' +
              'pre-constructed SQLite adapters. Please restart the application.'
          );
          return { ok: false, latencyMs: Date.now() - start, reconnected: false };
        }
        return { ok: false, latencyMs: Date.now() - start };
      }
      this.sqlite.prepare('SELECT 1').get();
      return { ok: true, latencyMs: Date.now() - start };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug({ error: errorMessage }, 'Health check failed, database not accessible');

      if (options?.attemptReconnect) {
        logger.warn(
          { error: errorMessage },
          'Health check failed: SQLite reconnection not supported for pre-constructed adapters'
        );
        return { ok: false, latencyMs: Date.now() - start, reconnected: false };
      }

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
