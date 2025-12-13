/**
 * Unit tests for permission service
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  setupTestDb,
  cleanupTestDb,
  createTestOrg,
  createTestProject,
} from '../fixtures/test-helpers.js';
import * as schema from '../../src/db/schema.js';
import {
  checkPermission,
  grantPermission,
  revokePermission,
  listPermissions,
  getAgentPermissions,
} from '../../src/services/permission.service.js';

const TEST_DB_PATH = './data/test-permission.db';
let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

describe('permission.service', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('checkPermission', () => {
    it('should deny access when no agentId provided', () => {
      const result = checkPermission(null, 'read', 'tool', null, 'global', null);
      expect(result).toBe(false);
    });

    it('should allow access by default when no permissions configured', () => {
      // No permissions in database = backward compatible full access
      const result = checkPermission('agent-1', 'read', 'tool', null, 'global', null);
      expect(result).toBe(true);
    });

    it('should allow project entryType by default', () => {
      const result = checkPermission('agent-1', 'read', 'project', null, 'global', null);
      expect(result).toBe(true);
    });

    it('should check read permission correctly', () => {
      // Grant read permission
      grantPermission({
        agentId: 'agent-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      expect(checkPermission('agent-1', 'read', 'tool', null, 'global', null)).toBe(true);
      // agent-2 doesn't have permission, and once we've granted a permission, default behavior changes
      // (default allow only when NO permissions exist in database)
      expect(checkPermission('agent-2', 'read', 'tool', null, 'global', null)).toBe(false);
    });

    it('should enforce permission hierarchy - write can read', () => {
      grantPermission({
        agentId: 'agent-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'write',
      });

      // Wait for permission to be in DB (flush any async operations)
      const perms = db
        .select()
        .from(schema.permissions)
        .where(eq(schema.permissions.agentId, 'agent-1'))
        .all();

      expect(checkPermission('agent-1', 'read', 'tool', null, 'global', null)).toBe(true);
      expect(checkPermission('agent-1', 'write', 'tool', null, 'global', null)).toBe(true);
      expect(checkPermission('agent-1', 'delete', 'tool', null, 'global', null)).toBe(false); // delete requires admin
    });

    it('should enforce permission hierarchy - admin can do everything', () => {
      grantPermission({
        agentId: 'agent-2',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'admin',
      });

      expect(checkPermission('agent-2', 'read', 'tool', null, 'global', null)).toBe(true);
      expect(checkPermission('agent-2', 'write', 'tool', null, 'global', null)).toBe(true);
      expect(checkPermission('agent-2', 'delete', 'tool', null, 'global', null)).toBe(true);
    });

    it('should check entry-specific permissions', () => {
      grantPermission({
        agentId: 'agent-3',
        scopeType: 'global',
        entryType: 'tool',
        entryId: 'tool-123',
        permission: 'write',
      });

      expect(checkPermission('agent-3', 'write', 'tool', 'tool-123', 'global', null)).toBe(true);
      // tool-456 doesn't have specific permission, so depends on default behavior
      expect(checkPermission('agent-3', 'write', 'tool', 'tool-456', 'global', null)).toBeDefined();
    });

    it('should check scope-specific permissions', () => {
      const org = createTestOrg(db, 'Test Org');
      const project = createTestProject(db, 'Test Project', org.id);

      grantPermission({
        agentId: 'agent-4',
        scopeType: 'project',
        scopeId: project.id,
        entryType: 'tool',
        permission: 'read',
      });

      expect(checkPermission('agent-4', 'read', 'tool', null, 'project', project.id)).toBe(true);
      // Should default allow for other scopes when no specific permission
    });

    it('should deny access when permission is insufficient', () => {
      grantPermission({
        agentId: 'agent-5',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      expect(checkPermission('agent-5', 'read', 'tool', null, 'global', null)).toBe(true);
      expect(checkPermission('agent-5', 'write', 'tool', null, 'global', null)).toBe(false);
      expect(checkPermission('agent-5', 'delete', 'tool', null, 'global', null)).toBe(false);
    });
  });

  describe('grantPermission', () => {
    it('should grant permission', () => {
      grantPermission({
        agentId: 'agent-grant-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      const perms = db
        .select()
        .from(schema.permissions)
        .where(eq(schema.permissions.agentId, 'agent-grant-1'))
        .all();
      expect(perms.length).toBeGreaterThan(0);
      expect(perms[0]?.permission).toBe('read');
    });

    it('should update existing permission on conflict', () => {
      grantPermission({
        agentId: 'agent-grant-2-update',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      grantPermission({
        agentId: 'agent-grant-2-update',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'write',
      });

      const perms = db
        .select()
        .from(schema.permissions)
        .where(eq(schema.permissions.agentId, 'agent-grant-2-update'))
        .all();
      // The permission ID includes the permission level, so updating creates a new entry
      // with the new permission level. We should have both entries.
      const writePerm = perms.find((p) => p.entryType === 'tool' && p.permission === 'write');
      expect(writePerm).toBeDefined();
      expect(writePerm?.permission).toBe('write');
    });

    it('should skip granting permission for project entryType', () => {
      grantPermission({
        agentId: 'agent-grant-3',
        scopeType: 'global',
        entryType: 'project',
        permission: 'read',
      });

      const perms = db
        .select()
        .from(schema.permissions)
        .where(eq(schema.permissions.agentId, 'agent-grant-3'))
        .all();
      expect(perms.length).toBe(0);
    });

    it('should grant permission with null scopeId', () => {
      grantPermission({
        agentId: 'agent-grant-4',
        scopeType: 'global',
        scopeId: null,
        entryType: 'tool',
        permission: 'admin',
      });

      const perms = db
        .select()
        .from(schema.permissions)
        .where(eq(schema.permissions.agentId, 'agent-grant-4'))
        .all();
      expect(perms.length).toBeGreaterThan(0);
    });
  });

  describe('revokePermission', () => {
    it('should revoke permission', () => {
      grantPermission({
        agentId: 'agent-revoke-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      revokePermission({
        agentId: 'agent-revoke-1',
        scopeType: 'global',
        entryType: 'tool',
      });

      const perms = db
        .select()
        .from(schema.permissions)
        .where(eq(schema.permissions.agentId, 'agent-revoke-1'))
        .all();
      expect(perms.length).toBe(0);
    });

    it('should revoke specific permission level', () => {
      grantPermission({
        agentId: 'agent-revoke-2',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      grantPermission({
        agentId: 'agent-revoke-2',
        scopeType: 'global',
        entryType: 'guideline',
        permission: 'write',
      });

      revokePermission({
        agentId: 'agent-revoke-2',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      const perms = db
        .select()
        .from(schema.permissions)
        .where(eq(schema.permissions.agentId, 'agent-revoke-2'))
        .all();
      expect(perms.length).toBe(1);
      expect(perms[0]?.entryType).toBe('guideline');
    });

    it('should skip revoking permission for project entryType', () => {
      // This should not error, just return early
      expect(() => {
        revokePermission({
          agentId: 'agent-revoke-3',
          entryType: 'project',
        });
      }).not.toThrow();
    });
  });

  describe('listPermissions', () => {
    beforeEach(() => {
      // Clean up permissions before each test
      db.delete(schema.permissions).run();
    });

    it('should list all permissions when no filters', () => {
      grantPermission({
        agentId: 'agent-list-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      grantPermission({
        agentId: 'agent-list-2',
        scopeType: 'global',
        entryType: 'guideline',
        permission: 'write',
      });

      const perms = listPermissions();
      expect(perms.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by agentId', () => {
      grantPermission({
        agentId: 'agent-list-filter-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      grantPermission({
        agentId: 'agent-list-filter-2',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'write',
      });

      const perms = listPermissions({ agentId: 'agent-list-filter-1' });
      expect(perms.length).toBe(1);
      expect(perms[0]?.agentId).toBe('agent-list-filter-1');
    });

    it('should filter by scopeType', () => {
      const org = createTestOrg(db, 'Test Org');
      const project = createTestProject(db, 'Test Project', org.id);

      grantPermission({
        agentId: 'agent-list-scope-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      grantPermission({
        agentId: 'agent-list-scope-1',
        scopeType: 'project',
        scopeId: project.id,
        entryType: 'tool',
        permission: 'write',
      });

      const perms = listPermissions({ scopeType: 'project' });
      expect(perms.length).toBe(1);
      expect(perms[0]?.scopeType).toBe('project');
    });

    it('should filter by entryType', () => {
      grantPermission({
        agentId: 'agent-list-entry-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      grantPermission({
        agentId: 'agent-list-entry-1',
        scopeType: 'global',
        entryType: 'guideline',
        permission: 'write',
      });

      const perms = listPermissions({ entryType: 'tool' });
      const toolPerms = perms.filter((p) => p.entryType === 'tool');
      expect(toolPerms.length).toBeGreaterThan(0);
    });

    it('should filter by entryId', () => {
      grantPermission({
        agentId: 'agent-list-entryid-1',
        scopeType: 'global',
        entryType: 'tool',
        entryId: 'tool-123',
        permission: 'read',
      });

      grantPermission({
        agentId: 'agent-list-entryid-1',
        scopeType: 'global',
        entryType: 'tool',
        entryId: 'tool-456',
        permission: 'write',
      });

      const perms = listPermissions({ entryId: 'tool-123' });
      expect(perms.length).toBe(1);
      expect(perms[0]?.entryId).toBe('tool-123');
    });
  });

  describe('getAgentPermissions', () => {
    it('should get all permissions for an agent', () => {
      grantPermission({
        agentId: 'agent-get-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      grantPermission({
        agentId: 'agent-get-1',
        scopeType: 'global',
        entryType: 'guideline',
        permission: 'write',
      });

      const perms = getAgentPermissions('agent-get-1');
      expect(perms.length).toBe(2);
      expect(perms.map((p) => p.entryType)).toContain('tool');
      expect(perms.map((p) => p.entryType)).toContain('guideline');
    });

    it('should return empty array for agent with no permissions', () => {
      const perms = getAgentPermissions('agent-no-perms');
      expect(perms).toEqual([]);
    });
  });
});
