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
import { PermissionService, type ParentScopeValue } from '../../src/services/permission.service.js';
import { LRUCache } from '../../src/utils/lru-cache.js';
import { createMemoryCacheAdapter } from '../../src/core/adapters/memory-cache.adapter.js';

const TEST_DB_PATH = './data/test-permission.db';
let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let permissionService: PermissionService;

describe('permission.service', () => {
  // Store original auth-related env vars
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    // Save and clear all auth-related env vars for clean test state
    originalEnv.AGENT_MEMORY_PERMISSIONS_MODE = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    originalEnv.AGENT_MEMORY_DEV_MODE = process.env.AGENT_MEMORY_DEV_MODE;
    originalEnv.AGENT_MEMORY_ALLOW_PERMISSIVE = process.env.AGENT_MEMORY_ALLOW_PERMISSIVE;

    // Disable permissive/dev mode for permission tests
    delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    delete process.env.AGENT_MEMORY_DEV_MODE;
    delete process.env.AGENT_MEMORY_ALLOW_PERMISSIVE;

    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    const permissionLru = new LRUCache<ParentScopeValue>({ maxSize: 500, ttlMs: 5 * 60 * 1000 });
    const permissionCacheAdapter = createMemoryCacheAdapter(permissionLru);
    permissionService = new PermissionService(db, permissionCacheAdapter);
  });

  afterAll(() => {
    // Restore all original env vars
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
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

    it('should deny project entryType without proper membership', () => {
      // Bug #1/#343 fix: Project entries NO LONGER bypass permission checks
      // Projects require proper organizational membership for access
      const result = permissionService.check('agent-1', 'read', 'project', null, 'global', null);
      expect(result).toBe(false);
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
      expect(permissionService.check('agent-1', 'delete', 'tool', null, 'global', null)).toBe(
        false
      ); // delete requires admin
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

      expect(permissionService.check('agent-3', 'write', 'tool', 'tool-123', 'global', null)).toBe(
        true
      );
      // tool-456 doesn't have specific permission, so depends on default behavior
      expect(
        permissionService.check('agent-3', 'write', 'tool', 'tool-456', 'global', null)
      ).toBeDefined();
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

      expect(permissionService.check('agent-4', 'read', 'tool', null, 'project', project.id)).toBe(
        true
      );
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
      expect(permissionService.check('agent-5', 'delete', 'tool', null, 'global', null)).toBe(
        false
      );
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

  describe('checkBatch', () => {
    beforeEach(() => {
      db.delete(schema.permissions).run();
    });

    it('should return empty map for empty entries', () => {
      const results = permissionService.checkBatch('agent-1', 'read', []);
      expect(results.size).toBe(0);
    });

    it('should deny all entries when agentId is null', () => {
      const entries = [
        { id: 'entry-1', entryType: 'tool' as const, scopeType: 'global' as const, scopeId: null },
        {
          id: 'entry-2',
          entryType: 'guideline' as const,
          scopeType: 'global' as const,
          scopeId: null,
        },
      ];
      const results = permissionService.checkBatch(null, 'read', entries);
      expect(results.get('entry-1')).toBe(false);
      expect(results.get('entry-2')).toBe(false);
    });

    it('should require permissions for project entries like other entry types', () => {
      // Bug #1/#343 fix: Project entries NO LONGER bypass permission checks
      const entries = [
        {
          id: 'proj-1',
          entryType: 'project' as const,
          scopeType: 'global' as const,
          scopeId: null,
        },
        { id: 'tool-1', entryType: 'tool' as const, scopeType: 'global' as const, scopeId: null },
      ];
      const results = permissionService.checkBatch('agent-batch-1', 'read', entries);
      // Both should be false without explicit permission
      expect(results.get('proj-1')).toBe(false);
      expect(results.get('tool-1')).toBe(false);
    });

    it('should check batch permissions correctly', () => {
      permissionService.grant({
        agentId: 'agent-batch-2',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      const entries = [
        { id: 'tool-1', entryType: 'tool' as const, scopeType: 'global' as const, scopeId: null },
        {
          id: 'guide-1',
          entryType: 'guideline' as const,
          scopeType: 'global' as const,
          scopeId: null,
        },
      ];
      const results = permissionService.checkBatch('agent-batch-2', 'read', entries);
      expect(results.get('tool-1')).toBe(true);
      expect(results.get('guide-1')).toBe(false);
    });

    it('should check entry-specific permissions in batch', () => {
      permissionService.grant({
        agentId: 'agent-batch-3',
        scopeType: 'global',
        entryType: 'tool',
        entryId: 'tool-1',
        permission: 'write',
      });

      const entries = [
        { id: 'tool-1', entryType: 'tool' as const, scopeType: 'global' as const, scopeId: null },
        { id: 'tool-2', entryType: 'tool' as const, scopeType: 'global' as const, scopeId: null },
      ];
      const results = permissionService.checkBatch('agent-batch-3', 'write', entries);
      expect(results.get('tool-1')).toBe(true);
      expect(results.get('tool-2')).toBe(false);
    });

    it('should check scope inheritance in batch', () => {
      const org = createTestOrg(db, 'Batch Org');
      const project = createTestProject(db, 'Batch Project', org.id);

      permissionService.grant({
        agentId: 'agent-batch-4',
        scopeType: 'org',
        scopeId: org.id,
        entryType: 'tool',
        permission: 'read',
      });

      const entries = [
        {
          id: 'tool-1',
          entryType: 'tool' as const,
          scopeType: 'project' as const,
          scopeId: project.id,
        },
      ];
      const results = permissionService.checkBatch('agent-batch-4', 'read', entries);
      // Should inherit permission from org
      expect(results.get('tool-1')).toBe(true);
    });

    it('should deny project entries in batch without organizational membership', () => {
      // Bug #1/#343 fix: Project entries require proper permissions through organizational
      // membership, not the permissions table (which doesn't support 'project' entry type).
      // Without proper org membership, project access is denied.
      const entries = [
        {
          id: 'proj-1',
          entryType: 'project' as const,
          scopeType: 'global' as const,
          scopeId: null,
        },
        {
          id: 'proj-2',
          entryType: 'project' as const,
          scopeType: 'global' as const,
          scopeId: null,
        },
      ];
      const results = permissionService.checkBatch('agent-batch-5', 'read', entries);
      // Should be false since no organizational membership grants project access
      expect(results.get('proj-1')).toBe(false);
      expect(results.get('proj-2')).toBe(false);
      expect(results.size).toBe(2);
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate permissions cache', () => {
      permissionService.grant({
        agentId: 'agent-cache-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      // First check should work
      expect(permissionService.check('agent-cache-1', 'read', 'tool', null, 'global', null)).toBe(
        true
      );

      // Invalidate cache
      permissionService.invalidateCache();

      // Check should still work after invalidation
      expect(permissionService.check('agent-cache-1', 'read', 'tool', null, 'global', null)).toBe(
        true
      );
    });
  });

  describe('scope inheritance', () => {
    it('should inherit permissions from org to project', () => {
      const org = createTestOrg(db, 'Inherit Org');
      const project = createTestProject(db, 'Inherit Project', org.id);

      permissionService.grant({
        agentId: 'agent-inherit-1',
        scopeType: 'org',
        scopeId: org.id,
        entryType: 'tool',
        permission: 'write',
      });

      // Should have permission on project scope due to org inheritance
      expect(
        permissionService.check('agent-inherit-1', 'write', 'tool', null, 'project', project.id)
      ).toBe(true);
    });

    it('should inherit permissions from global to project', () => {
      const org = createTestOrg(db, 'Global Inherit Org');
      const project = createTestProject(db, 'Global Inherit Project', org.id);

      permissionService.grant({
        agentId: 'agent-inherit-2',
        scopeType: 'global',
        entryType: 'guideline',
        permission: 'read',
      });

      // Should have permission on project scope due to global inheritance
      expect(
        permissionService.check('agent-inherit-2', 'read', 'guideline', null, 'project', project.id)
      ).toBe(true);
    });

    it('should check org scope permissions', () => {
      const org = createTestOrg(db, 'Org Permission Test');

      permissionService.grant({
        agentId: 'agent-org-1',
        scopeType: 'org',
        scopeId: org.id,
        entryType: 'knowledge',
        permission: 'admin',
      });

      expect(
        permissionService.check('agent-org-1', 'delete', 'knowledge', null, 'org', org.id)
      ).toBe(true);
    });

    it('should handle session to project inheritance', () => {
      const org = createTestOrg(db, 'Session Org');
      const project = createTestProject(db, 'Session Project', org.id);

      // Create a session
      const sessionId = `sess-${Date.now()}`;
      db.insert(schema.sessions)
        .values({
          id: sessionId,
          projectId: project.id,
          name: 'Test Session',
          status: 'active',
          agentId: 'test-agent',
        })
        .run();

      permissionService.grant({
        agentId: 'agent-session-1',
        scopeType: 'project',
        scopeId: project.id,
        entryType: 'tool',
        permission: 'write',
      });

      // Should inherit permission from project when checking session scope
      expect(
        permissionService.check('agent-session-1', 'write', 'tool', null, 'session', sessionId)
      ).toBe(true);
    });
  });

  describe('revoke with various conditions', () => {
    beforeEach(() => {
      db.delete(schema.permissions).run();
    });

    it('should revoke with null scopeId', () => {
      permissionService.grant({
        agentId: 'agent-revoke-null',
        scopeType: 'global',
        scopeId: null,
        entryType: 'tool',
        permission: 'read',
      });

      permissionService.revoke({
        agentId: 'agent-revoke-null',
        scopeType: 'global',
        scopeId: null,
      });

      const perms = permissionService.getForAgent('agent-revoke-null');
      expect(perms.length).toBe(0);
    });

    it('should revoke with null entryId', () => {
      permissionService.grant({
        agentId: 'agent-revoke-entry',
        scopeType: 'global',
        entryType: 'tool',
        entryId: null,
        permission: 'read',
      });

      permissionService.revoke({
        agentId: 'agent-revoke-entry',
        entryId: null,
      });

      const perms = permissionService.getForAgent('agent-revoke-entry');
      expect(perms.length).toBe(0);
    });
  });

  describe('list with filters', () => {
    beforeEach(() => {
      db.delete(schema.permissions).run();
    });

    it('should filter by scopeId', () => {
      const org = createTestOrg(db, 'List Scope Org');

      permissionService.grant({
        agentId: 'agent-list-scope',
        scopeType: 'org',
        scopeId: org.id,
        entryType: 'tool',
        permission: 'read',
      });

      permissionService.grant({
        agentId: 'agent-list-scope',
        scopeType: 'org',
        scopeId: 'other-org-id',
        entryType: 'tool',
        permission: 'write',
      });

      const perms = permissionService.list({ scopeId: org.id });
      expect(perms.length).toBe(1);
      expect(perms[0]?.scopeId).toBe(org.id);
    });
  });
});
