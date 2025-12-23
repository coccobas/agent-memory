/**
 * Unit tests for audit service
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { setupTestDb, cleanupTestDb } from '../fixtures/test-helpers.js';
import * as schema from '../../src/db/schema.js';
import {
  logAction,
  type AuditLogParams,
} from '../../src/services/audit.service.js';

const TEST_DB_PATH = './data/test-audit.db';
let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
    getSqlite: () => sqlite,
  };
});

describe('audit.service', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('logAction', () => {
    it('should log action asynchronously', async () => {
      const params: AuditLogParams = {
        agentId: 'agent-1',
        action: 'create',
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'global',
      };

      logAction(params, db);

      // Wait for async operation
      await new Promise((resolve) => setImmediate(resolve));

      const logs = db.select().from(schema.auditLog).all();
      expect(logs.length).toBeGreaterThan(0);
      const lastLog = logs[logs.length - 1];
      expect(lastLog?.agentId).toBe('agent-1');
      expect(lastLog?.action).toBe('create');
      expect(lastLog?.entryType).toBe('tool');
    });

    it('should log all action types', async () => {
      const actions: AuditLogParams['action'][] = ['query', 'create', 'update', 'delete', 'read'];

      for (const action of actions) {
        logAction({
          action,
          entryType: 'tool',
        }, db);
      }

      await new Promise((resolve) => setImmediate(resolve));

      const logs = db.select().from(schema.auditLog).orderBy(schema.auditLog.createdAt).all();
      const loggedActions = logs.slice(-5).map((l) => l.action);
      for (const action of actions) {
        expect(loggedActions).toContain(action);
      }
    });

    it('should handle null agentId', async () => {
      logAction({
        action: 'read',
        entryType: 'tool',
      }, db);

      await new Promise((resolve) => setImmediate(resolve));

      const logs = db.select().from(schema.auditLog).all();
      const lastLog = logs[logs.length - 1];
      expect(lastLog?.agentId).toBeNull();
    });

    it('should filter out project entryType', async () => {
      logAction({
        action: 'create',
        entryType: 'project',
      }, db);

      await new Promise((resolve) => setImmediate(resolve));

      const logs = db.select().from(schema.auditLog).all();
      const lastLog = logs[logs.length - 1];
      expect(lastLog?.entryType).toBeNull();
    });

    it('should store queryParams as JSON', async () => {
      const queryParams = { search: 'test', limit: 10 };
      logAction({
        action: 'query',
        queryParams,
      }, db);

      await new Promise((resolve) => setImmediate(resolve));

      const logs = db.select().from(schema.auditLog).all();
      const lastLog = logs[logs.length - 1];
      expect(lastLog?.queryParams).toBeDefined();
    });

    it('should store resultCount', async () => {
      logAction({
        action: 'query',
        resultCount: 42,
      }, db);

      await new Promise((resolve) => setImmediate(resolve));

      const logs = db.select().from(schema.auditLog).all();
      const lastLog = logs[logs.length - 1];
      expect(lastLog?.resultCount).toBe(42);
    });

    it('should not throw on database errors', async () => {
      // Close database to simulate error
      const originalDb = db;
      sqlite.close();

      expect(() => {
        logAction({
          action: 'create',
          entryType: 'tool',
        }, originalDb);
      }).not.toThrow();

      // Wait for async operation
      await new Promise((resolve) => setImmediate(resolve));

      // Reopen database for cleanup
      const testDb = setupTestDb(TEST_DB_PATH);
      sqlite = testDb.sqlite;
      db = testDb.db;
    });

    it('should handle all optional parameters as undefined', async () => {
      logAction({
        action: 'read',
      }, db);

      await new Promise((resolve) => setImmediate(resolve));

      const logs = db.select().from(schema.auditLog).all();
      const lastLog = logs[logs.length - 1];
      expect(lastLog?.action).toBe('read');
      expect(lastLog?.agentId).toBeNull();
      expect(lastLog?.entryType).toBeNull();
      expect(lastLog?.entryId).toBeNull();
    });
  });
});



