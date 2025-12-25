/**
 * SQLite Adapter Transaction Tests (HIGH-012)
 *
 * Tests for explicit error handling of async operations that escape
 * SQLite transaction context.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { SQLiteStorageAdapter } from '../../src/core/adapters/sqlite.adapter.js';
import type { AppDb } from '../../src/core/types.js';

describe('SQLiteStorageAdapter - Transaction Error Handling (HIGH-012)', () => {
  let sqlite: Database.Database;
  let db: AppDb;
  let adapter: SQLiteStorageAdapter;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    db = drizzle(sqlite) as AppDb;
    adapter = new SQLiteStorageAdapter(db, sqlite);

    sqlite.exec(`
      CREATE TABLE test_table (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        value TEXT NOT NULL
      )
    `);
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe('successful synchronous transactions', () => {
    it('should complete transaction with synchronous SQLite operations', async () => {
      const result = await adapter.transaction(() => {
        const raw = adapter.getRawConnection() as Database.Database;
        raw.prepare('INSERT INTO test_table (value) VALUES (?)').run('test1');
        raw.prepare('INSERT INTO test_table (value) VALUES (?)').run('test2');
        // Return immediately-resolved promise (synchronous)
        return Promise.resolve('success');
      });

      expect(result).toBe('success');
      const rows = sqlite.prepare('SELECT * FROM test_table').all();
      expect(rows).toHaveLength(2);
    });

    it('should rollback transaction on error', async () => {
      await expect(
        adapter.transaction(() => {
          const raw = adapter.getRawConnection() as Database.Database;
          raw.prepare('INSERT INTO test_table (value) VALUES (?)').run('test1');
          throw new Error('Intentional error');
        })
      ).rejects.toThrow('Intentional error');

      const rows = sqlite.prepare('SELECT * FROM test_table').all();
      expect(rows).toHaveLength(0);
    });
  });

  describe('async operation escape detection', () => {
    it('should detect and reject real async operations (setTimeout)', async () => {
      await expect(
        adapter.transaction(() => {
          // Using async/await here will cause the promise to not resolve immediately
          return new Promise((resolve) => setTimeout(resolve, 10));
        })
      ).rejects.toThrow(/SQLite transaction completed before async operation resolved/);
    });

    it('should provide detailed error message', async () => {
      try {
        await adapter.transaction(() => {
          return new Promise((resolve) => setTimeout(resolve, 1));
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        const msg = (error as Error).message;
        expect(msg).toContain('SQLite transaction completed before async operation resolved');
        expect(msg).toContain('Transaction ID: txn-');
        expect(msg).toContain('WHY THIS IS A PROBLEM');
        expect(msg).toContain('HOW TO FIX');
        expect(msg).toContain('DEBUGGING');
      }
    });
  });

  describe('nested transaction detection', () => {
    it('should detect and reject nested transactions', async () => {
      await expect(
        adapter.transaction(() => {
          // Synchronously call nested transaction
          // The returned promise won't resolve before the outer transaction completes
          return adapter.transaction(() => {
            return Promise.resolve();
          });
        })
      ).rejects.toThrow(/SQLite transaction completed before async operation resolved|Nested SQLite transaction detected/);
    });

    it('should clear state after error', async () => {
      await expect(
        adapter.transaction(() => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      await expect(
        adapter.transaction(() => {
          return Promise.resolve('success');
        })
      ).resolves.toBe('success');
    });
  });

  describe('real-world scenarios', () => {
    it('should detect escaped async in service layer', async () => {
      await expect(
        adapter.transaction(() => {
          // This async function call will not complete before transaction ends
          return (async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return 'done';
          })();
        })
      ).rejects.toThrow(/SQLite transaction completed before async operation resolved/);
    });

    it('should succeed when async called outside transaction', async () => {
      const mockService = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { data: 'external data' };
      };

      const externalData = await mockService();

      const result = await adapter.transaction(() => {
        const raw = adapter.getRawConnection() as Database.Database;
        raw.prepare('INSERT INTO test_table (value) VALUES (?)').run(externalData.data);
        return Promise.resolve('success');
      });

      expect(result).toBe('success');
      const rows = sqlite.prepare('SELECT * FROM test_table').all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ value: 'external data' });
    });
  });
});
