/**
 * Integration tests for initialization handler
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getSqlite } from '../../src/db/connection.js';
import { initHandlers } from '../../src/mcp/handlers/init.handler.js';
import { setupTestDb, cleanupTestDb, type TestDb } from '../fixtures/test-helpers.js';

const TEST_DB_PATH = 'data/test/init-handler-test.db';

describe('init.handler', () => {
  const ADMIN_KEY = 'test-admin-key';
  let previousAdminKey: string | undefined;
  let testDb: TestDb;

  beforeEach(() => {
    // Setup test database with container registration
    testDb = setupTestDb(TEST_DB_PATH);

    previousAdminKey = process.env.AGENT_MEMORY_ADMIN_KEY;
    process.env.AGENT_MEMORY_ADMIN_KEY = ADMIN_KEY;
  });

  afterEach(() => {
    closeDb();
    cleanupTestDb(TEST_DB_PATH);
    if (previousAdminKey === undefined) {
      delete process.env.AGENT_MEMORY_ADMIN_KEY;
    } else {
      process.env.AGENT_MEMORY_ADMIN_KEY = previousAdminKey;
    }
  });

  describe('status', () => {
    it('should return status for initialized database', () => {
      const result = initHandlers.status({});

      expect(result).toMatchObject({
        initialized: expect.any(Boolean),
        appliedMigrations: expect.any(Array),
        appliedCount: expect.any(Number),
        pendingMigrations: expect.any(Array),
        pendingCount: expect.any(Number),
        totalMigrations: expect.any(Number),
        status: expect.any(String),
      });
    });

    it('should show ready status for fully initialized database', () => {
      const result = initHandlers.status({});

      expect(result.initialized).toBe(true);
      expect(result.status).toMatch(/ready|needs_migration/);
      expect(result.appliedCount).toBeGreaterThanOrEqual(0);
      expect(result.totalMigrations).toBeGreaterThan(0);
    });
  });

  describe('init', () => {
    it('should report already initialized for test database', () => {
      // Test database is already initialized via setupTestDb
      const result = initHandlers.init({ admin_key: ADMIN_KEY } as unknown as Record<
        string,
        unknown
      >);

      expect(result).toMatchObject({
        success: expect.any(Boolean),
        alreadyInitialized: expect.any(Boolean),
        migrationsApplied: expect.any(Array),
        migrationCount: expect.any(Number),
        message: expect.any(String),
      });
    });

    it('should initialize database with force', () => {
      const result = initHandlers.init({ admin_key: ADMIN_KEY, force: true } as unknown as Record<
        string,
        unknown
      >);

      // Force mode attempts to re-apply migrations
      // May succeed or have errors if migrations already recorded
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('migrationCount');
      expect(result.alreadyInitialized).toBe(false); // Force resets this
    });

    it('should handle verbose mode', () => {
      const result = initHandlers.init({ admin_key: ADMIN_KEY, verbose: true } as unknown as Record<
        string,
        unknown
      >);
      // Verbose mode should work on already initialized database
      expect(result).toHaveProperty('success');
    });

    it('should return alreadyInitialized when database is already initialized', () => {
      // First init should detect already initialized (from setupTestDb)
      const result = initHandlers.init({ admin_key: ADMIN_KEY } as unknown as Record<
        string,
        unknown
      >);
      expect(result.alreadyInitialized).toBe(true);
      expect(result.message).toContain('already initialized');

      // Second init should also detect already initialized
      const result2 = initHandlers.init({ admin_key: ADMIN_KEY } as unknown as Record<
        string,
        unknown
      >);
      expect(result2.alreadyInitialized).toBe(true);
      expect(result2.message).toContain('already initialized');
    });
  });

  describe('reset', () => {
    it('should require confirmation', () => {
      const result = initHandlers.reset({ admin_key: ADMIN_KEY } as unknown as Record<
        string,
        unknown
      >);

      expect(result.success).toBe(false);
      expect(result.error).toContain('confirmation');
      expect(result.error).toContain('WARNING');
    });

    it('should reset database when confirmed', () => {
      const result = initHandlers.reset({
        admin_key: ADMIN_KEY,
        confirm: true,
      } as unknown as Record<string, unknown>);

      expect(result).toMatchObject({
        success: expect.any(Boolean),
        migrationsApplied: expect.any(Array),
        migrationCount: expect.any(Number),
        message: expect.any(String),
      });

      if (result.success) {
        expect(result.migrationCount).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle verbose mode in reset', () => {
      const result = initHandlers.reset({
        admin_key: ADMIN_KEY,
        confirm: true,
        verbose: true,
      } as unknown as Record<string, unknown>);
      expect(result.success).toBe(true);
    });
  });
});
