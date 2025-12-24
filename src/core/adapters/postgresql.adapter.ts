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

/**
 * Type alias for PostgreSQL Drizzle database instance.
 * We use 'unknown' here to avoid circular dependencies with the schema.
 * The actual type is: drizzle<AppSchema>(pool)
 */
export type PostgresDb = unknown;

/**
 * PostgreSQL storage adapter implementation.
 * Uses pg-pool for connection pooling and Drizzle ORM for queries.
 */
export class PostgreSQLStorageAdapter implements IStorageAdapter {
  private pool: Pool | null = null;
  private db: PostgresDb | null = null;
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

    // Dynamic import to avoid loading pg when using SQLite
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');

    const poolConfig: PoolConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
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

    // Create Drizzle instance
    this.db = drizzle(this.pool);

    // Verify connection with a test query
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      this.connected = true;
    } finally {
      client.release();
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
      throw new Error('PostgreSQL adapter not connected');
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
   * Execute a function within a database transaction.
   * Automatically commits on success, rolls back on error.
   *
   * Uses a dedicated client from the pool for the transaction.
   * All executeRaw calls within fn() will use this transaction client.
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('PostgreSQL adapter not connected');
    }

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
      await client.query('ROLLBACK');
      throw error;
    } finally {
      // Restore previous client (supports nested transactions conceptually)
      this.transactionClient = previousClient;
      client.release();
    }
  }

  /**
   * Get the Drizzle ORM database instance.
   * Use this for type-safe queries.
   */
  getDb(): PostgresDb {
    if (!this.db) {
      throw new Error('PostgreSQL adapter not connected');
    }
    return this.db;
  }

  /**
   * Get the raw pg Pool instance.
   * Use this for low-level operations.
   */
  getRawConnection(): Pool {
    if (!this.pool) {
      throw new Error('PostgreSQL adapter not connected');
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
