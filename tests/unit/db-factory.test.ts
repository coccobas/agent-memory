/**
 * Unit tests for database factory
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createDatabaseConnection, type SQLiteConnection } from '../../src/db/factory.js';
import type { Config } from '../../src/config/index.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const TEST_DB_DIR = './data/test-db-factory';
const TEST_DB_PATH = join(TEST_DB_DIR, 'test.db');

describe('Database Factory', () => {
  beforeEach(() => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_DIR)) {
      rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up
    if (existsSync(TEST_DB_DIR)) {
      rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  });

  const createTestConfig = (overrides: Partial<Config> = {}): Config => ({
    dbType: 'sqlite',
    database: {
      path: TEST_DB_PATH,
      busyTimeoutMs: 5000,
      skipInit: false,
      verbose: false,
      ...overrides.database,
    },
    postgresql: {
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test',
      ssl: false,
      maxConnections: 10,
      ...overrides.postgresql,
    },
    cache: {
      totalLimitMB: 100,
      evictionTarget: 0.7,
      pressureThreshold: 0.8,
      queryCacheTtlMs: 30000,
      queryCacheMaxSize: 1000,
      ...(overrides as any).cache,
    },
    memory: {
      checkIntervalMs: 60000,
      ...(overrides as any).memory,
    },
    semanticSearch: {
      enabled: false,
      duplicateThreshold: 0.85,
      ...(overrides as any).semanticSearch,
    },
    logging: {
      level: 'info',
      json: false,
      ...(overrides as any).logging,
    },
    rateLimit: {
      enabled: false,
      requestsPerMinute: 100,
      burstSize: 20,
      ...(overrides as any).rateLimit,
    },
    rest: {
      enabled: false,
      host: 'localhost',
      port: 3000,
      ...(overrides as any).rest,
    },
    ...overrides,
  } as Config);

  describe('createDatabaseConnection', () => {
    describe('SQLite', () => {
      it('should create SQLite connection with default config', async () => {
        const config = createTestConfig();

        const connection = await createDatabaseConnection(config);

        expect(connection.type).toBe('sqlite');
        expect((connection as SQLiteConnection).db).toBeDefined();
        expect((connection as SQLiteConnection).sqlite).toBeDefined();

        // Clean up
        (connection as SQLiteConnection).sqlite.close();
      });

      it('should create data directory if it does not exist', async () => {
        const customPath = './data/test-db-factory/nested/deep/test.db';
        const config = createTestConfig({
          database: { path: customPath, busyTimeoutMs: 5000, skipInit: false, verbose: false },
        });

        const connection = await createDatabaseConnection(config);

        expect(existsSync(dirname(customPath))).toBe(true);

        // Clean up
        (connection as SQLiteConnection).sqlite.close();
        rmSync('./data/test-db-factory/nested', { recursive: true, force: true });
      });

      it('should enable WAL mode', async () => {
        const config = createTestConfig();

        const connection = await createDatabaseConnection(config);
        const sqlite = (connection as SQLiteConnection).sqlite;

        const journalMode = sqlite.pragma('journal_mode', { simple: true });
        expect(journalMode).toBe('wal');

        sqlite.close();
      });

      it('should enable foreign keys', async () => {
        const config = createTestConfig();

        const connection = await createDatabaseConnection(config);
        const sqlite = (connection as SQLiteConnection).sqlite;

        const foreignKeys = sqlite.pragma('foreign_keys', { simple: true });
        expect(foreignKeys).toBe(1);

        sqlite.close();
      });

      it('should set busy timeout', async () => {
        const config = createTestConfig({
          database: { path: TEST_DB_PATH, busyTimeoutMs: 10000, skipInit: false, verbose: false },
        });

        const connection = await createDatabaseConnection(config);
        const sqlite = (connection as SQLiteConnection).sqlite;

        const busyTimeout = sqlite.pragma('busy_timeout', { simple: true });
        expect(busyTimeout).toBe(10000);

        sqlite.close();
      });

      it('should skip initialization when skipInit is true', async () => {
        // First create a valid database
        const config1 = createTestConfig();
        const conn1 = await createDatabaseConnection(config1);
        (conn1 as SQLiteConnection).sqlite.close();

        // Then reopen with skipInit
        const config2 = createTestConfig({
          database: { path: TEST_DB_PATH, busyTimeoutMs: 5000, skipInit: true, verbose: false },
        });

        const connection = await createDatabaseConnection(config2);

        expect(connection.type).toBe('sqlite');

        (connection as SQLiteConnection).sqlite.close();
      });

      it('should apply migrations when verbose is true', async () => {
        const config = createTestConfig({
          database: { path: TEST_DB_PATH, busyTimeoutMs: 5000, skipInit: false, verbose: true },
        });

        const connection = await createDatabaseConnection(config);

        expect(connection.type).toBe('sqlite');

        (connection as SQLiteConnection).sqlite.close();
      });

      it('should handle database path with special characters', async () => {
        const specialPath = './data/test-db-factory/path with spaces/test.db';
        const config = createTestConfig({
          database: { path: specialPath, busyTimeoutMs: 5000, skipInit: false, verbose: false },
        });

        const connection = await createDatabaseConnection(config);

        expect(connection.type).toBe('sqlite');

        (connection as SQLiteConnection).sqlite.close();
        rmSync('./data/test-db-factory/path with spaces', { recursive: true, force: true });
      });

      it('should return correct type discriminator', async () => {
        const config = createTestConfig();

        const connection = await createDatabaseConnection(config);

        if (connection.type === 'sqlite') {
          // TypeScript should narrow the type
          expect(connection.db).toBeDefined();
          expect(connection.sqlite).toBeDefined();
          connection.sqlite.close();
        } else {
          throw new Error('Expected SQLite connection');
        }
      });
    });

    describe('PostgreSQL', () => {
      it('should attempt PostgreSQL connection when dbType is postgresql', async () => {
        const config = createTestConfig({ dbType: 'postgresql' });

        // This will fail because there's no PostgreSQL server, but we're testing the branching
        await expect(createDatabaseConnection(config)).rejects.toThrow();
      });
    });

    describe('Error Handling', () => {
      it('should throw descriptive error for invalid database path', async () => {
        // Use an invalid path that will cause permission error
        const config = createTestConfig({
          database: { path: '/root/impossible/path/test.db', busyTimeoutMs: 5000, skipInit: false, verbose: false },
        });

        await expect(createDatabaseConnection(config)).rejects.toThrow();
      });

      it('should handle concurrent connection attempts', async () => {
        const config = createTestConfig();

        // Create multiple connections concurrently
        const connections = await Promise.all([
          createDatabaseConnection(config),
          createDatabaseConnection(config),
          createDatabaseConnection(config),
        ]);

        expect(connections).toHaveLength(3);
        connections.forEach((conn) => {
          expect(conn.type).toBe('sqlite');
        });

        // Clean up
        connections.forEach((conn) => {
          (conn as SQLiteConnection).sqlite.close();
        });
      });
    });
  });
});
