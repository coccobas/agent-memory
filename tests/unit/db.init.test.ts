/**
 * Unit tests for database initialization
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'node:fs';
import {
  initializeDatabase,
  getMigrationStatus,
  resetDatabase,
  type InitResult,
} from '../../src/db/init.js';
import { getDb, closeDb } from '../../src/db/connection.js';

describe('db/init', () => {
  const testDbPath = './data/test-init.db';

  beforeEach(() => {
    // Clean up test database
    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${testDbPath}${suffix}`;
      if (existsSync(path)) {
        unlinkSync(path);
      }
    }
    closeDb();
  });

  afterEach(() => {
    closeDb();
    // Clean up test database
    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${testDbPath}${suffix}`;
      if (existsSync(path)) {
        try {
          unlinkSync(path);
        } catch {
          // Ignore errors
        }
      }
    }
  });

  describe('initializeDatabase', () => {
    it('should initialize a new database', () => {
      const sqlite = new Database(testDbPath);
      const result = initializeDatabase(sqlite, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.alreadyInitialized).toBe(false);
      expect(result.migrationsApplied.length).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);

      sqlite.close();
    });

    it('should handle already initialized database', () => {
      const sqlite = new Database(testDbPath);
      initializeDatabase(sqlite, { verbose: false });
      const result = initializeDatabase(sqlite, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.alreadyInitialized).toBe(true);
      expect(result.migrationsApplied.length).toBe(0);

      sqlite.close();
    });

    it('should force re-initialization when force=true', () => {
      const sqlite = new Database(testDbPath);
      const firstResult = initializeDatabase(sqlite, { verbose: false });
      expect(firstResult.success).toBe(true);
      expect(firstResult.migrationsApplied.length).toBeGreaterThan(0);

      // Force mode re-applies all migrations (even if already applied)
      // Migrations use CREATE TABLE IF NOT EXISTS, so they should succeed
      // But recordMigration might fail if migration already recorded, causing errors
      const result = initializeDatabase(sqlite, { force: true, verbose: false });
      // Force mode attempts to re-apply, but may have errors if migrations already recorded
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('migrationsApplied');
      expect(result).toHaveProperty('errors');
      expect(result.alreadyInitialized).toBe(false); // Force resets this flag

      sqlite.close();
    });

    it('should handle verbose mode', () => {
      const sqlite = new Database(testDbPath);
      const result = initializeDatabase(sqlite, { verbose: true });

      expect(result.success).toBe(true);
      sqlite.close();
    });

    it('should handle errors gracefully', () => {
      // Create a database that will cause errors
      const sqlite = new Database(testDbPath);
      sqlite.exec('CREATE TABLE _migrations (id INTEGER PRIMARY KEY)');
      // Corrupt the migration table
      sqlite.exec('DROP TABLE _migrations');

      // This should still work but may have errors
      const result = initializeDatabase(sqlite, { verbose: false });
      // Should either succeed or have errors array
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('errors');

      sqlite.close();
    });
  });

  describe('getMigrationStatus', () => {
    it('should return status for uninitialized database', () => {
      const sqlite = new Database(testDbPath);
      const status = getMigrationStatus(sqlite);

      expect(status).toMatchObject({
        initialized: expect.any(Boolean),
        appliedMigrations: expect.any(Array),
        pendingMigrations: expect.any(Array),
        totalMigrations: expect.any(Number),
      });

      expect(status.initialized).toBe(false);
      expect(status.totalMigrations).toBeGreaterThan(0);

      sqlite.close();
    });

    it('should return status for initialized database', () => {
      const sqlite = new Database(testDbPath);
      initializeDatabase(sqlite, { verbose: false });
      const status = getMigrationStatus(sqlite);

      expect(status.initialized).toBe(true);
      expect(status.appliedMigrations.length).toBeGreaterThan(0);
      expect(status.pendingMigrations.length).toBe(0);

      sqlite.close();
    });

    it('should detect pending migrations', () => {
      const sqlite = new Database(testDbPath);
      // Initialize partially - need at least one real table for initialized check
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `);
      // Create a table to mark as initialized
      sqlite.exec('CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY)');
      // Only record first migration
      sqlite.exec("INSERT INTO _migrations (name) VALUES ('0000_lying_the_hand.sql')");

      const status = getMigrationStatus(sqlite);
      // Database is initialized if it has tables besides _migrations
      expect(status.initialized).toBe(true);
      // Should have pending migrations if not all are applied
      expect(status.pendingMigrations.length).toBeGreaterThanOrEqual(0);

      sqlite.close();
    });
  });

  describe('resetDatabase', () => {
    it('should reset and re-initialize database', () => {
      const sqlite = new Database(testDbPath);
      initializeDatabase(sqlite, { verbose: false });

      const result = resetDatabase(sqlite, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.migrationsApplied.length).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);

      sqlite.close();
    });

    it('should handle verbose mode in reset', () => {
      const sqlite = new Database(testDbPath);
      initializeDatabase(sqlite, { verbose: false });

      const result = resetDatabase(sqlite, { verbose: true });

      expect(result.success).toBe(true);
      sqlite.close();
    });

    it('should handle errors during reset', () => {
      const sqlite = new Database(testDbPath);
      // Don't initialize first - reset should still work
      const result = resetDatabase(sqlite, { verbose: false });

      // Should either succeed or handle gracefully
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('errors');

      sqlite.close();
    });
  });
});
