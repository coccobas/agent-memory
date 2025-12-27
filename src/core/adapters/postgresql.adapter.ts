/**
 * PostgreSQL Storage Adapter
 *
 * Implements IStorageAdapter for PostgreSQL using:
 * - pg (node-postgres) for connection pooling
 * - Drizzle ORM for type-safe queries
 *
 * Design: Native async implementation using PostgreSQL's async driver.
 * Connection pooling is managed by pg-pool.
 */

import type { Pool, PoolClient, PoolConfig } from 'pg';
import type { IStorageAdapter } from './interfaces.js';
import type { Config } from '../../config/index.js';
import type { PostgreSQLAppDb } from '../types.js';
import { createComponentLogger } from '../../utils/logger.js';
import { createValidationError, createServiceUnavailableError } from '../errors.js';

const logger = createComponentLogger('pg-adapter');

/**
 * PostgreSQL error codes that indicate transient issues worth retrying.
 * See: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const PG_RETRYABLE_ERROR_CODES = [
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '57P01', // admin_shutdown (transient)
  '08006', // connection_failure
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '53300', // too_many_connections
  '55P03', // lock_not_available
];

/**
 * Default retry configuration for PostgreSQL transactions.
 */
const DEFAULT_PG_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 50,
  maxDelayMs: 1000,
  backoffMultiplier: 2,
};

/**
 * Check if a PostgreSQL error is retryable.
 */
function isPgRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // Check for PostgreSQL error code
  const code = 'code' in error ? String(error.code) : '';
  if (PG_RETRYABLE_ERROR_CODES.includes(code)) {
    return true;
  }

  // Check error message for connection issues
  const message = error.message.toLowerCase();
  if (
    message.includes('connection terminated') ||
    message.includes('connection refused') ||
    message.includes('could not connect')
  ) {
    return true;
  }

  return false;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * PostgreSQL storage adapter implementation.
 * Uses pg-pool for connection pooling and Drizzle ORM for queries.
 */
export class PostgreSQLStorageAdapter implements IStorageAdapter {
  private pool: Pool | null = null;
  private db: PostgreSQLAppDb | null = null;
  private config: Config['postgresql'];
  private connected = false;
  // Track the current transaction client for nested executeRaw calls
  private transactionClient: PoolClient | null = null;

  constructor(config: Config['postgresql']) {
    this.config = config;
  }

  /**
   * Connect to PostgreSQL and initialize the connection pool.
   */
  async connect(): Promise<void> {
    if (this.connected && this.pool) {
      return;
    }

    // Security validation: enforce SSL certificate validation in production
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && this.config.ssl && !this.config.sslRejectUnauthorized) {
      throw createValidationError(
        'sslRejectUnauthorized',
        'SSL certificate validation must be enabled in production',
        'Set AGENT_MEMORY_PG_SSL_REJECT_UNAUTHORIZED=true or disable production mode'
      );
    }

    // Warn in development when certificate validation is disabled
    if (!isProduction && this.config.ssl && !this.config.sslRejectUnauthorized) {
      logger.warn(
        {
          ssl: true,
          sslRejectUnauthorized: false,
          environment: process.env.NODE_ENV || 'development',
        },
        'WARNING: SSL certificate validation is disabled. This is insecure and should only be used in development/testing.'
      );
    }

    // Dynamic import to avoid loading pg when using SQLite
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');

    const poolConfig: PoolConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: this.config.sslRejectUnauthorized } : false,
      min: this.config.poolMin,
      max: this.config.poolMax,
      idleTimeoutMillis: this.config.idleTimeoutMs,
      connectionTimeoutMillis: this.config.connectionTimeoutMs,
    };

    this.pool = new Pool(poolConfig);

    // Set statement timeout for all connections
    if (this.config.statementTimeoutMs > 0) {
      this.pool.on('connect', (client: PoolClient) => {
        client.query(`SET statement_timeout = ${this.config.statementTimeoutMs}`);
      });
    }

    // Create Drizzle instance with schema for type safety
    // Dynamic import of PG schema to ensure proper typing
    const pgSchema = await import('../../db/schema/postgresql/index.js');
    this.db = drizzle(this.pool, { schema: pgSchema }) as unknown as PostgreSQLAppDb;

    // Verify connection with a test query
    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      await client.query('SELECT 1');
      this.connected = true;
    } catch (error) {
      // CRITICAL: Close pool on connection failure
      if (client) client.release();
      try {
        await this.pool.end();
      } catch (closeError) {
        logger.warn({ closeError }, 'Failed to close pool after connection error');
      }
      this.pool = null;
      this.db = null;
      throw error;
    } finally {
      if (client) client.release();
    }
  }

  /**
   * Close the connection pool.
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.db = null;
      this.connected = false;
    }
  }

  /**
   * Check if the adapter is connected.
   */
  isConnected(): boolean {
    return this.connected && this.pool !== null;
  }

  /**
   * Execute a raw SQL query and return all results.
   * Uses parameterized queries for security.
   * If called within a transaction, uses the transaction client.
   */
  async executeRaw<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.pool) {
      throw createServiceUnavailableError('PostgreSQL adapter', 'not connected');
    }
    // Use transaction client if we're inside a transaction, otherwise use pool
    const queryable = this.transactionClient ?? this.pool;
    const result = await queryable.query(sql, params);
    return result.rows as T[];
  }

  /**
   * Execute a raw SQL query and return the first result.
   */
  async executeRawSingle<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const results = await this.executeRaw<T>(sql, params);
    return results[0];
  }

  /**
   * Execute a function within a database transaction with retry logic.
   * Automatically commits on success, rolls back on error.
   * Retries on transient errors (deadlocks, serialization failures, connection issues).
   *
   * Uses a dedicated client from the pool for the transaction.
   * All executeRaw calls within fn() will use this transaction client.
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw createServiceUnavailableError('PostgreSQL adapter', 'not connected');
    }

    const { maxRetries, initialDelayMs, maxDelayMs, backoffMultiplier } = DEFAULT_PG_RETRY_CONFIG;
    let lastError: Error | undefined;
    let delay = initialDelayMs;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const client = await this.pool.connect();
      const previousClient = this.transactionClient;

      try {
        await client.query('BEGIN');
        // Set transaction client so executeRaw uses it
        this.transactionClient = client;
        const result = await fn();
        await client.query('COMMIT');
        return result;
      } catch (error) {
        // Always rollback on error
        try {
          await client.query('ROLLBACK');
        } catch {
          // Ignore rollback errors
        }

        lastError = error instanceof Error ? error : new Error(String(error));
        const isRetryable = isPgRetryableError(error);
        const hasMoreAttempts = attempt <= maxRetries;

        if (!isRetryable || !hasMoreAttempts) {
          logger.warn(
            {
              error: lastError.message,
              code: 'code' in (error as object) ? (error as { code: string }).code : undefined,
              attempt,
              maxRetries: maxRetries + 1,
              retryable: isRetryable,
            },
            'PostgreSQL transaction failed'
          );
          throw lastError;
        }

        logger.debug(
          {
            error: lastError.message,
            code: 'code' in (error as object) ? (error as { code: string }).code : undefined,
            attempt,
            nextDelayMs: delay,
          },
          'Retrying PostgreSQL transaction after transient error'
        );

        await sleep(delay);
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      } finally {
        // Restore previous client and release
        this.transactionClient = previousClient;
        client.release();
      }
    }

    // Should not reach here, but TypeScript needs it
    throw lastError ?? new Error('Transaction failed with unknown error');
  }

  /**
   * Get the Drizzle ORM database instance.
   * Use this for type-safe queries.
   */
  getDb(): PostgreSQLAppDb {
    if (!this.db) {
      throw createServiceUnavailableError('PostgreSQL adapter', 'not connected');
    }
    return this.db;
  }

  /**
   * Get the raw pg Pool instance.
   * Use this for low-level operations.
   */
  getRawConnection(): Pool {
    if (!this.pool) {
      throw createServiceUnavailableError('PostgreSQL adapter', 'not connected');
    }
    return this.pool;
  }

  /**
   * Perform a health check on the database connection.
   */
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      if (!this.pool) {
        return { ok: false, latencyMs: Date.now() - start };
      }
      await this.pool.query('SELECT 1');
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  /**
   * Get pool statistics for monitoring.
   */
  getPoolStats(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  } {
    if (!this.pool) {
      return { totalCount: 0, idleCount: 0, waitingCount: 0 };
    }
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}

/**
 * Create a PostgreSQL storage adapter from configuration.
 */
export function createPostgreSQLStorageAdapter(config: Config['postgresql']): IStorageAdapter {
  return new PostgreSQLStorageAdapter(config);
}
