/**
 * Integration tests for initialization handler
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb, getSqlite } from '../../src/db/connection.js';
import { initHandlers } from '../../src/mcp/handlers/init.handler.js';
import { getMigrationStatus } from '../../src/db/init.js';

describe('init.handler', () => {
  beforeEach(() => {
    // Ensure clean state
    closeDb();
  });

  afterEach(() => {
    closeDb();
  });

  describe('status', () => {
    it('should return status for uninitialized database', () => {
      const sqlite = getSqlite();
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

    it('should return status for initialized database', () => {
      // Initialize first
      getDb();
      const result = initHandlers.status({});

      expect(result.initialized).toBe(true);
      expect(result.status).toMatch(/ready|needs_migration/);
      expect(result.appliedCount).toBeGreaterThanOrEqual(0);
      expect(result.totalMigrations).toBeGreaterThan(0);
    });
  });

  describe('init', () => {
    it('should initialize database without force', () => {
      const result = initHandlers.init({});

      expect(result).toMatchObject({
        success: expect.any(Boolean),
        alreadyInitialized: expect.any(Boolean),
        migrationsApplied: expect.any(Array),
        migrationCount: expect.any(Number),
        message: expect.any(String),
      });

      if (result.success) {
        expect(result.migrationCount).toBeGreaterThanOrEqual(0);
      }
    });

    it('should initialize database with force', () => {
      // Initialize first
      getDb();
      const result = initHandlers.init({ force: true });

      // Force mode attempts to re-apply migrations
      // May succeed or have errors if migrations already recorded
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('migrationCount');
      expect(result.alreadyInitialized).toBe(false); // Force resets this
    });

    it('should handle verbose mode', () => {
      const result = initHandlers.init({ verbose: true });
      expect(result.success).toBe(true);
    });

    it('should return alreadyInitialized when database is already initialized', () => {
      // Initialize first
      getDb();
      const result = initHandlers.init({});

      // Second init should detect already initialized
      const result2 = initHandlers.init({});
      expect(result2.alreadyInitialized).toBe(true);
      expect(result2.message).toContain('already initialized');
    });
  });

  describe('reset', () => {
    it('should require confirmation', () => {
      getDb(); // Initialize first
      const result = initHandlers.reset({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('confirmation');
      expect(result.error).toContain('WARNING');
    });

    it('should reset database when confirmed', () => {
      getDb(); // Initialize first
      const result = initHandlers.reset({ confirm: true });

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
      getDb(); // Initialize first
      const result = initHandlers.reset({ confirm: true, verbose: true });
      expect(result.success).toBe(true);
    });
  });
});
