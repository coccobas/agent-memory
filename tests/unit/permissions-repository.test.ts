/**
 * Unit tests for permissions repository
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, cleanupTestDb, registerDatabase } from '../fixtures/test-helpers.js';
import { permissionRepo } from '../../src/db/repositories/permissions.js';

const TEST_DB_PATH = './data/test-permissions-repo.db';

describe('Permissions Repository', () => {
  let testDb: ReturnType<typeof setupTestDb>;

  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    registerDatabase(testDb.db, testDb.sqlite);
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    // Clean up permissions table before each test
    testDb.sqlite.exec('DELETE FROM permissions');
  });

  describe('createOrUpdate', () => {
    it('should create a new permission', () => {
      const result = permissionRepo.createOrUpdate({
        agentId: 'agent-1',
        permission: 'read',
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.agentId).toBe('agent-1');
      expect(result.permission).toBe('read');
    });

    it('should create permission with all fields', () => {
      const result = permissionRepo.createOrUpdate({
        agentId: 'agent-2',
        scopeType: 'project',
        scopeId: 'proj-123',
        entryType: 'guideline',
        entryId: 'entry-456',
        permission: 'write',
      });

      expect(result.agentId).toBe('agent-2');
      expect(result.scopeType).toBe('project');
      expect(result.scopeId).toBe('proj-123');
      expect(result.entryType).toBe('guideline');
      expect(result.entryId).toBe('entry-456');
      expect(result.permission).toBe('write');
    });

    it('should update existing permission', () => {
      // Create initial permission
      const created = permissionRepo.createOrUpdate({
        agentId: 'agent-3',
        scopeType: 'global',
        permission: 'read',
      });

      // Update the same permission
      const updated = permissionRepo.createOrUpdate({
        agentId: 'agent-3',
        scopeType: 'global',
        permission: 'write',
      });

      expect(updated.id).toBe(created.id);
      expect(updated.permission).toBe('write');
    });

    it('should handle null scopeType', () => {
      const result = permissionRepo.createOrUpdate({
        agentId: 'agent-4',
        scopeType: null,
        permission: 'read',
      });

      expect(result.scopeType).toBeNull();
    });

    it('should handle null scopeId', () => {
      const result = permissionRepo.createOrUpdate({
        agentId: 'agent-5',
        scopeId: null,
        permission: 'read',
      });

      expect(result.scopeId).toBeNull();
    });

    it('should handle null entryType', () => {
      const result = permissionRepo.createOrUpdate({
        agentId: 'agent-6',
        entryType: null,
        permission: 'read',
      });

      expect(result.entryType).toBeNull();
    });

    it('should handle null entryId', () => {
      const result = permissionRepo.createOrUpdate({
        agentId: 'agent-7',
        entryId: null,
        permission: 'read',
      });

      expect(result.entryId).toBeNull();
    });

    it('should create admin permission', () => {
      const result = permissionRepo.createOrUpdate({
        agentId: 'agent-admin',
        permission: 'admin',
      });

      expect(result.permission).toBe('admin');
    });
  });

  describe('getById', () => {
    it('should get permission by ID', () => {
      const created = permissionRepo.createOrUpdate({
        agentId: 'agent-get',
        permission: 'read',
      });

      const result = permissionRepo.getById(created.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
      expect(result?.agentId).toBe('agent-get');
    });

    it('should return undefined for non-existent ID', () => {
      const result = permissionRepo.getById('non-existent-id');

      expect(result).toBeUndefined();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      // Create some test permissions
      permissionRepo.createOrUpdate({
        agentId: 'agent-list-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });
      permissionRepo.createOrUpdate({
        agentId: 'agent-list-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        entryType: 'guideline',
        permission: 'write',
      });
      permissionRepo.createOrUpdate({
        agentId: 'agent-list-2',
        scopeType: 'global',
        entryType: 'knowledge',
        permission: 'admin',
      });
    });

    it('should list all permissions without filters', () => {
      const result = permissionRepo.list();

      expect(result.length).toBe(3);
    });

    it('should filter by agentId', () => {
      const result = permissionRepo.list({ agentId: 'agent-list-1' });

      expect(result.length).toBe(2);
      result.forEach((perm) => {
        expect(perm.agentId).toBe('agent-list-1');
      });
    });

    it('should filter by scopeType', () => {
      const result = permissionRepo.list({ scopeType: 'global' });

      expect(result.length).toBe(2);
      result.forEach((perm) => {
        expect(perm.scopeType).toBe('global');
      });
    });

    it('should filter by scopeType null', () => {
      permissionRepo.createOrUpdate({
        agentId: 'agent-null-scope',
        scopeType: null,
        permission: 'read',
      });

      const result = permissionRepo.list({ scopeType: null });

      expect(result.length).toBeGreaterThanOrEqual(1);
      result.forEach((perm) => {
        expect(perm.scopeType).toBeNull();
      });
    });

    it('should filter by scopeId', () => {
      const result = permissionRepo.list({ scopeId: 'proj-1' });

      expect(result.length).toBe(1);
      expect(result[0].scopeId).toBe('proj-1');
    });

    it('should filter by scopeId null', () => {
      const result = permissionRepo.list({ scopeId: null });

      expect(result.length).toBeGreaterThanOrEqual(2);
      result.forEach((perm) => {
        expect(perm.scopeId).toBeNull();
      });
    });

    it('should filter by entryType', () => {
      const result = permissionRepo.list({ entryType: 'tool' });

      expect(result.length).toBe(1);
      expect(result[0].entryType).toBe('tool');
    });

    it('should filter by entryType null', () => {
      permissionRepo.createOrUpdate({
        agentId: 'agent-null-entry',
        entryType: null,
        permission: 'read',
      });

      const result = permissionRepo.list({ entryType: null });

      expect(result.length).toBeGreaterThanOrEqual(1);
      result.forEach((perm) => {
        expect(perm.entryType).toBeNull();
      });
    });

    it('should filter by entryId', () => {
      permissionRepo.createOrUpdate({
        agentId: 'agent-entry-id',
        entryId: 'specific-entry',
        permission: 'read',
      });

      const result = permissionRepo.list({ entryId: 'specific-entry' });

      expect(result.length).toBe(1);
      expect(result[0].entryId).toBe('specific-entry');
    });

    it('should filter by entryId null', () => {
      const result = permissionRepo.list({ entryId: null });

      expect(result.length).toBeGreaterThanOrEqual(3);
      result.forEach((perm) => {
        expect(perm.entryId).toBeNull();
      });
    });

    it('should support pagination with limit', () => {
      const result = permissionRepo.list({}, { limit: 2 });

      expect(result.length).toBe(2);
    });

    it('should support pagination with offset', () => {
      const allResults = permissionRepo.list();
      const result = permissionRepo.list({}, { offset: 1 });

      expect(result.length).toBe(allResults.length - 1);
    });

    it('should combine multiple filters', () => {
      const result = permissionRepo.list({
        agentId: 'agent-list-1',
        scopeType: 'global',
      });

      expect(result.length).toBe(1);
      expect(result[0].agentId).toBe('agent-list-1');
      expect(result[0].scopeType).toBe('global');
    });

    it('should respect MAX_LIMIT', () => {
      // Create many permissions
      for (let i = 0; i < 150; i++) {
        permissionRepo.createOrUpdate({
          agentId: `agent-limit-${i}`,
          permission: 'read',
        });
      }

      const result = permissionRepo.list({}, { limit: 200 });

      // MAX_LIMIT is 100
      expect(result.length).toBeLessThanOrEqual(100);
    });
  });

  describe('delete', () => {
    it('should delete permission by ID', () => {
      const created = permissionRepo.createOrUpdate({
        agentId: 'agent-delete',
        permission: 'read',
      });

      permissionRepo.delete(created.id);

      const result = permissionRepo.getById(created.id);
      expect(result).toBeUndefined();
    });

    it('should not throw for non-existent ID', () => {
      expect(() => {
        permissionRepo.delete('non-existent-id');
      }).not.toThrow();
    });
  });

  describe('deleteByFilter', () => {
    beforeEach(() => {
      permissionRepo.createOrUpdate({
        agentId: 'agent-del-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });
      permissionRepo.createOrUpdate({
        agentId: 'agent-del-1',
        scopeType: 'project',
        scopeId: 'proj-del',
        entryType: 'guideline',
        permission: 'write',
      });
      permissionRepo.createOrUpdate({
        agentId: 'agent-del-2',
        scopeType: 'global',
        entryType: 'knowledge',
        permission: 'admin',
      });
    });

    it('should delete by agentId', () => {
      const count = permissionRepo.deleteByFilter({ agentId: 'agent-del-1' });

      expect(count).toBe(2);

      const remaining = permissionRepo.list({ agentId: 'agent-del-1' });
      expect(remaining.length).toBe(0);
    });

    it('should delete by scopeType', () => {
      const count = permissionRepo.deleteByFilter({ scopeType: 'global' });

      expect(count).toBe(2);
    });

    it('should delete by scopeType null', () => {
      permissionRepo.createOrUpdate({
        agentId: 'agent-null',
        scopeType: null,
        permission: 'read',
      });

      const count = permissionRepo.deleteByFilter({ scopeType: null });

      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should delete by scopeId', () => {
      const count = permissionRepo.deleteByFilter({ scopeId: 'proj-del' });

      expect(count).toBe(1);
    });

    it('should delete by scopeId null', () => {
      const initialCount = permissionRepo.list({ scopeId: null }).length;
      const count = permissionRepo.deleteByFilter({ scopeId: null });

      expect(count).toBe(initialCount);
    });

    it('should delete by entryType', () => {
      const count = permissionRepo.deleteByFilter({ entryType: 'tool' });

      expect(count).toBe(1);
    });

    it('should delete by entryType null', () => {
      permissionRepo.createOrUpdate({
        agentId: 'agent-null-type',
        entryType: null,
        permission: 'read',
      });

      const count = permissionRepo.deleteByFilter({ entryType: null });

      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should delete by entryId', () => {
      permissionRepo.createOrUpdate({
        agentId: 'agent-entry',
        entryId: 'entry-to-delete',
        permission: 'read',
      });

      const count = permissionRepo.deleteByFilter({ entryId: 'entry-to-delete' });

      expect(count).toBe(1);
    });

    it('should delete by entryId null', () => {
      const initialCount = permissionRepo.list({ entryId: null }).length;
      const count = permissionRepo.deleteByFilter({ entryId: null });

      expect(count).toBe(initialCount);
    });

    it('should return 0 when no filter provided', () => {
      const count = permissionRepo.deleteByFilter({});

      expect(count).toBe(0);

      // Verify nothing was deleted
      const remaining = permissionRepo.list();
      expect(remaining.length).toBe(3);
    });

    it('should combine multiple filters', () => {
      const count = permissionRepo.deleteByFilter({
        agentId: 'agent-del-1',
        scopeType: 'global',
      });

      expect(count).toBe(1);

      // Verify the project-scoped permission still exists
      const remaining = permissionRepo.list({ agentId: 'agent-del-1' });
      expect(remaining.length).toBe(1);
      expect(remaining[0].scopeType).toBe('project');
    });
  });
});
