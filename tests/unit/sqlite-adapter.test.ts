/**
 * SQLite Storage Adapter Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import {
  SQLiteStorageAdapter,
  createSQLiteStorageAdapter,
} from '../../src/core/adapters/sqlite.adapter.js';
import type { AppDb } from '../../src/core/types.js';

describe('SQLiteStorageAdapter', () => {
  let sqlite: Database.Database;
  let db: AppDb;
  let adapter: SQLiteStorageAdapter;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    db = drizzle(sqlite) as AppDb;
    adapter = new SQLiteStorageAdapter(db, sqlite);

    // Create test table
    sqlite.exec(`
      CREATE TABLE test_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value INTEGER
      )
    `);

    // Insert some test data
    sqlite.prepare('INSERT INTO test_items (name, value) VALUES (?, ?)').run('item1', 100);
    sqlite.prepare('INSERT INTO test_items (name, value) VALUES (?, ?)').run('item2', 200);
    sqlite.prepare('INSERT INTO test_items (name, value) VALUES (?, ?)').run('item3', 300);
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.close();
    }
  });

  describe('connect', () => {
    it('should set connected status', async () => {
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);
    });
  });

  describe('close', () => {
    it('should close the connection', async () => {
      expect(adapter.isConnected()).toBe(true);
      await adapter.close();
      expect(adapter.isConnected()).toBe(false);
    });

    it('should be safe to call multiple times', async () => {
      await adapter.close();
      await adapter.close(); // Should not throw
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('isConnected', () => {
    it('should return true when connected', () => {
      expect(adapter.isConnected()).toBe(true);
    });

    it('should return false after close', async () => {
      await adapter.close();
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('executeRaw', () => {
    it('should execute SQL and return all results', async () => {
      const results = await adapter.executeRaw<{ id: number; name: string; value: number }>(
        'SELECT * FROM test_items ORDER BY id'
      );

      expect(results).toHaveLength(3);
      expect(results[0].name).toBe('item1');
      expect(results[1].name).toBe('item2');
      expect(results[2].name).toBe('item3');
    });

    it('should execute SQL with parameters', async () => {
      const results = await adapter.executeRaw<{ id: number; name: string; value: number }>(
        'SELECT * FROM test_items WHERE value > ?',
        [150]
      );

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('item2');
      expect(results[1].name).toBe('item3');
    });

    it('should return empty array when no matches', async () => {
      const results = await adapter.executeRaw<{ id: number }>(
        'SELECT * FROM test_items WHERE value > ?',
        [1000]
      );

      expect(results).toHaveLength(0);
    });

    it('should handle SELECT with multiple parameters', async () => {
      const results = await adapter.executeRaw<{ name: string }>(
        'SELECT name FROM test_items WHERE value >= ? AND value <= ?',
        [100, 200]
      );

      expect(results).toHaveLength(2);
    });
  });

  describe('executeRawSingle', () => {
    it('should return first result', async () => {
      const result = await adapter.executeRawSingle<{ id: number; name: string }>(
        'SELECT * FROM test_items ORDER BY id'
      );

      expect(result).toBeDefined();
      expect(result?.name).toBe('item1');
    });

    it('should execute with parameters', async () => {
      const result = await adapter.executeRawSingle<{ id: number; name: string }>(
        'SELECT * FROM test_items WHERE name = ?',
        ['item2']
      );

      expect(result).toBeDefined();
      expect(result?.name).toBe('item2');
    });

    it('should return undefined when no match', async () => {
      const result = await adapter.executeRawSingle<{ id: number }>(
        'SELECT * FROM test_items WHERE name = ?',
        ['nonexistent']
      );

      expect(result).toBeUndefined();
    });

    it('should execute without parameters', async () => {
      const result = await adapter.executeRawSingle<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM test_items'
      );

      expect(result?.cnt).toBe(3);
    });
  });

  describe('getDb', () => {
    it('should return the Drizzle database instance', () => {
      const dbInstance = adapter.getDb();
      expect(dbInstance).toBe(db);
    });
  });

  describe('getRawConnection', () => {
    it('should return the raw SQLite connection', () => {
      const rawConnection = adapter.getRawConnection();
      expect(rawConnection).toBe(sqlite);
    });
  });

  describe('healthCheck', () => {
    it('should return ok: true for healthy connection', async () => {
      const result = await adapter.healthCheck();

      expect(result.ok).toBe(true);
      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return ok: false when connection is closed', async () => {
      await adapter.close();

      const result = await adapter.healthCheck();

      expect(result.ok).toBe(false);
    });

    it('should measure latency correctly', async () => {
      const result = await adapter.healthCheck();

      // Should complete quickly for in-memory database
      expect(result.latencyMs).toBeLessThan(100);
    });
  });

  describe('createSQLiteStorageAdapter', () => {
    it('should create adapter instance', () => {
      const newAdapter = createSQLiteStorageAdapter(db, sqlite);

      expect(newAdapter).toBeInstanceOf(SQLiteStorageAdapter);
    });

    it('should create functional adapter', async () => {
      const newSqlite = new Database(':memory:');
      const newDb = drizzle(newSqlite) as AppDb;
      const newAdapter = createSQLiteStorageAdapter(newDb, newSqlite);

      expect(newAdapter.isConnected()).toBe(true);

      // Create a table and insert data
      newSqlite.exec('CREATE TABLE t (id INTEGER)');
      const results = await newAdapter.executeRaw('SELECT 1 as n');
      expect(results).toHaveLength(1);

      await newAdapter.close();
    });
  });

  describe('edge cases', () => {
    it('should handle empty tables', async () => {
      sqlite.exec('DELETE FROM test_items');

      const results = await adapter.executeRaw('SELECT * FROM test_items');

      expect(results).toHaveLength(0);
    });

    it('should handle special characters in parameters', async () => {
      sqlite.prepare('INSERT INTO test_items (name, value) VALUES (?, ?)').run("item'with'quotes", 400);

      const result = await adapter.executeRawSingle<{ name: string }>(
        'SELECT name FROM test_items WHERE name = ?',
        ["item'with'quotes"]
      );

      expect(result?.name).toBe("item'with'quotes");
    });

    it('should handle null values', async () => {
      sqlite.prepare('INSERT INTO test_items (name, value) VALUES (?, ?)').run('null-item', null);

      const result = await adapter.executeRawSingle<{ name: string; value: number | null }>(
        'SELECT * FROM test_items WHERE name = ?',
        ['null-item']
      );

      expect(result?.value).toBeNull();
    });
  });
});
