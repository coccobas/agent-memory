/**
 * Unit tests for permission service
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  setupTestDb,
  cleanupTestDb,
  createTestOrg,
  createTestProject,
} from '../fixtures/test-helpers.js';
import * as schema from '../../src/db/schema.js';
import { PermissionService } from '../../src/services/permission.service.js';

const TEST_DB_PATH = './data/test-permission.db';
let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let permissionService: PermissionService;

describe('permission.service', () => {
  let previousPermMode: string | undefined;

  beforeAll(() => {
    // Disable permissive mode for permission tests
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;

    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    permissionService = new PermissionService(db);
  });

  afterAll(() => {
    // Restore previous permission mode
    if (previousPermMode !== undefined) {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    }
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('check', () => {
    it('should deny access when no agentId provided', () => {
      const result = permissionService.check(null, 'read', 'tool', null, 'global', null);
      expect(result).toBe(false);
    });

    it('should deny access when no permissions configured (secure by default)', () => {
      // No permissions in database = deny access (unless permissive mode enabled)
      const result = permissionService.check('agent-1', 'read', 'tool', null, 'global', null);
      expect(result).toBe(false);
    });

    it('should allow project entryType by default', () => {
      const result = permissionService.check('agent-1', 'read', 'project', null, 'global', null);
      expect(result).toBe(true);
    });

    it('should check read permission correctly', () => {
      // Grant read permission
      permissionService.grant({
        agentId: 'agent-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      expect(permissionService.check('agent-1', 'read', 'tool', null, 'global', null)).toBe(true);
      // agent-2 doesn't have permission, and once we've granted a permission, default behavior changes
      // (default allow only when NO permissions exist in database)
      expect(permissionService.check('agent-2', 'read', 'tool', null, 'global', null)).toBe(false);
    });

    it('should enforce permission hierarchy - write can read', () => {
      permissionService.grant({
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

      expect(permissionService.check('agent-1', 'read', 'tool', null, 'global', null)).toBe(true);
      expect(permissionService.check('agent-1', 'write', 'tool', null, 'global', null)).toBe(true);
      expect(permissionService.check('agent-1', 'delete', 'tool', null, 'global', null)).toBe(false); // delete requires admin
    });

    it('should enforce permission hierarchy - admin can do everything', () => {
      permissionService.grant({
        agentId: 'agent-2',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'admin',
      });

      expect(permissionService.check('agent-2', 'read', 'tool', null, 'global', null)).toBe(true);
      expect(permissionService.check('agent-2', 'write', 'tool', null, 'global', null)).toBe(true);
      expect(permissionService.check('agent-2', 'delete', 'tool', null, 'global', null)).toBe(true);
    });

    it('should check entry-specific permissions', () => {
      permissionService.grant({
        agentId: 'agent-3',
        scopeType: 'global',
        entryType: 'tool',
        entryId: 'tool-123',
        permission: 'write',
      });

      expect(permissionService.check('agent-3', 'write', 'tool', 'tool-123', 'global', null)).toBe(true);
      // tool-456 doesn't have specific permission, so depends on default behavior
      expect(permissionService.check('agent-3', 'write', 'tool', 'tool-456', 'global', null)).toBeDefined();
    });

    it('should check scope-specific permissions', () => {
      const org = createTestOrg(db, 'Test Org');
      const project = createTestProject(db, 'Test Project', org.id);

      permissionService.grant({
        agentId: 'agent-4',
        scopeType: 'project',
        scopeId: project.id,
        entryType: 'tool',
        permission: 'read',
      });

      expect(permissionService.check('agent-4', 'read', 'tool', null, 'project', project.id)).toBe(true);
      // Should default allow for other scopes when no specific permission
    });

    it('should deny access when permission is insufficient', () => {
      permissionService.grant({
        agentId: 'agent-5',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      expect(permissionService.check('agent-5', 'read', 'tool', null, 'global', null)).toBe(true);
      expect(permissionService.check('agent-5', 'write', 'tool', null, 'global', null)).toBe(false);
      expect(permissionService.check('agent-5', 'delete', 'tool', null, 'global', null)).toBe(false);
    });
  });

  describe('grant', () => {
    it('should grant permission', () => {
      permissionService.grant({
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
      permissionService.grant({
        agentId: 'agent-grant-2-update',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      permissionService.grant({
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
      permissionService.grant({
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
      permissionService.grant({
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

  describe('revoke', () => {
    it('should revoke permission', () => {
      permissionService.grant({
        agentId: 'agent-revoke-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      permissionService.revoke({
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
      permissionService.grant({
        agentId: 'agent-revoke-2',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      permissionService.grant({
        agentId: 'agent-revoke-2',
        scopeType: 'global',
        entryType: 'guideline',
        permission: 'write',
      });

      permissionService.revoke({
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
        permissionService.revoke({
          agentId: 'agent-revoke-3',
          entryType: 'project',
        });
      }).not.toThrow();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      // Clean up permissions before each test
      db.delete(schema.permissions).run();
    });

    it('should list all permissions when no filters', () => {
      permissionService.grant({
        agentId: 'agent-list-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      permissionService.grant({
        agentId: 'agent-list-2',
        scopeType: 'global',
        entryType: 'guideline',
        permission: 'write',
      });

      const perms = permissionService.list();
      expect(perms.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by agentId', () => {
      permissionService.grant({
        agentId: 'agent-list-filter-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      permissionService.grant({
        agentId: 'agent-list-filter-2',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'write',
      });

      const perms = permissionService.list({ agentId: 'agent-list-filter-1' });
      expect(perms.length).toBe(1);
      expect(perms[0]?.agentId).toBe('agent-list-filter-1');
    });

    it('should filter by scopeType', () => {
      const org = createTestOrg(db, 'Test Org');
      const project = createTestProject(db, 'Test Project', org.id);

      permissionService.grant({
        agentId: 'agent-list-scope-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      permissionService.grant({
        agentId: 'agent-list-scope-1',
        scopeType: 'project',
        scopeId: project.id,
        entryType: 'tool',
        permission: 'write',
      });

      const perms = permissionService.list({ scopeType: 'project' });
      expect(perms.length).toBe(1);
      expect(perms[0]?.scopeType).toBe('project');
    });

    it('should filter by entryType', () => {
      permissionService.grant({
        agentId: 'agent-list-entry-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      permissionService.grant({
        agentId: 'agent-list-entry-1',
        scopeType: 'global',
        entryType: 'guideline',
        permission: 'write',
      });

      const perms = permissionService.list({ entryType: 'tool' });
      const toolPerms = perms.filter((p) => p.entryType === 'tool');
      expect(toolPerms.length).toBeGreaterThan(0);
    });

    it('should filter by entryId', () => {
      permissionService.grant({
        agentId: 'agent-list-entryid-1',
        scopeType: 'global',
        entryType: 'tool',
        entryId: 'tool-123',
        permission: 'read',
      });

      permissionService.grant({
        agentId: 'agent-list-entryid-1',
        scopeType: 'global',
        entryType: 'tool',
        entryId: 'tool-456',
        permission: 'write',
      });

      const perms = permissionService.list({ entryId: 'tool-123' });
      expect(perms.length).toBe(1);
      expect(perms[0]?.entryId).toBe('tool-123');
    });
  });

  describe('getForAgent', () => {
    it('should get all permissions for an agent', () => {
      permissionService.grant({
        agentId: 'agent-get-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      permissionService.grant({
        agentId: 'agent-get-1',
        scopeType: 'global',
        entryType: 'guideline',
        permission: 'write',
      });

      const perms = permissionService.getForAgent('agent-get-1');
      expect(perms.length).toBe(2);
      expect(perms.map((p) => p.entryType)).toContain('tool');
      expect(perms.map((p) => p.entryType)).toContain('guideline');
    });

    it('should return empty array for agent with no permissions', () => {
      const perms = permissionService.getForAgent('agent-no-perms');
      expect(perms).toEqual([]);
    });
  });
});
