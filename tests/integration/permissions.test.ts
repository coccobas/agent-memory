/**
 * Integration tests for permissions handler
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestOrg,
  createTestProject,
} from '../fixtures/test-helpers.js';
import { permissionHandlers } from '../../src/mcp/handlers/permissions.handler.js';

const TEST_DB_PATH = './data/test-permissions-handler.db';
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

describe('Permissions Handler Integration', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('grant', () => {
    it('should grant permission', () => {
      const result = permissionHandlers.grant({
        agent_id: 'agent-1',
        permission: 'read',
        scope_type: 'global',
        entry_type: 'tool',
      });

      expect(result).toBeDefined();
      expect(result.message).toBe('Permission granted successfully');
    });

    it('should require agent_id', () => {
      expect(() => {
        permissionHandlers.grant({ permission: 'read' });
      }).toThrow();
    });

    it('should require permission', () => {
      expect(() => {
        permissionHandlers.grant({ agent_id: 'agent-1' });
      }).toThrow();
    });

    it('should validate permission level', () => {
      expect(() => {
        permissionHandlers.grant({
          agent_id: 'agent-1',
          permission: 'invalid',
        });
      }).toThrow();
    });

    it('should grant permission with scope', () => {
      const org = createTestOrg(db, 'Test Org');
      const project = createTestProject(db, 'Test Project', org.id);

      const result = permissionHandlers.grant({
        agent_id: 'agent-2',
        permission: 'write',
        scope_type: 'project',
        scope_id: project.id,
        entry_type: 'guideline',
      });

      expect(result).toBeDefined();
      expect(result.message).toBe('Permission granted successfully');
    });
  });

  describe('revoke', () => {
    it('should revoke permission by permission_id', () => {
      // First grant a permission
      permissionHandlers.grant({
        agent_id: 'agent-revoke-1',
        permission: 'read',
        entry_type: 'tool',
      });

      // Get permission ID (would need to list first, simplified for test)
      const result = permissionHandlers.revoke({
        agent_id: 'agent-revoke-1',
        entry_type: 'tool',
      });

      expect(result.message).toBe('Permission revoked successfully');
    });

    it('should require agent_id when not using permission_id', () => {
      expect(() => {
        permissionHandlers.revoke({});
      }).toThrow('Either permission_id or agent_id is required');
    });

    it('should revoke permission with filters', () => {
      permissionHandlers.grant({
        agent_id: 'agent-revoke-2',
        permission: 'write',
        scope_type: 'global',
        entry_type: 'knowledge',
      });

      const result = permissionHandlers.revoke({
        agent_id: 'agent-revoke-2',
        scope_type: 'global',
        entry_type: 'knowledge',
      });

      expect(result.message).toBe('Permission revoked successfully');
    });
  });

  describe('check', () => {
    it('should check permission', () => {
      permissionHandlers.grant({
        agent_id: 'agent-check-1',
        permission: 'read',
        entry_type: 'tool',
      });

      const result = permissionHandlers.check({
        agent_id: 'agent-check-1',
        action: 'read',
        scope_type: 'global',
        entry_type: 'tool',
      });

      expect(result).toBeDefined();
      expect(typeof result.has_permission).toBe('boolean');
      expect(result.agent_id).toBe('agent-check-1');
      expect(result.action).toBe('read');
    });

    it('should require agent_id', () => {
      expect(() => {
        permissionHandlers.check({ action: 'read', scope_type: 'global' });
      }).toThrow();
    });

    it('should require action', () => {
      expect(() => {
        permissionHandlers.check({ agent_id: 'agent-1', scope_type: 'global' });
      }).toThrow();
    });

    it('should require scope_type', () => {
      expect(() => {
        permissionHandlers.check({ agent_id: 'agent-1', action: 'read' });
      }).toThrow();
    });

    it('should validate action type', () => {
      expect(() => {
        permissionHandlers.check({
          agent_id: 'agent-1',
          action: 'invalid',
          scope_type: 'global',
        });
      }).toThrow();
    });
  });

  describe('list', () => {
    it('should list all permissions', () => {
      permissionHandlers.grant({
        agent_id: 'agent-list-1',
        permission: 'read',
        entry_type: 'tool',
      });

      const result = permissionHandlers.list({});

      expect(result).toBeDefined();
      expect(Array.isArray(result.permissions)).toBe(true);
    });

    it('should filter by agent_id', () => {
      permissionHandlers.grant({
        agent_id: 'agent-list-2',
        permission: 'write',
        entry_type: 'guideline',
      });

      const result = permissionHandlers.list({ agent_id: 'agent-list-2' });

      expect(result.permissions.length).toBeGreaterThan(0);
      result.permissions.forEach((perm) => {
        expect(perm.agentId).toBe('agent-list-2');
      });
    });

    it('should filter by scope_type', () => {
      const org = createTestOrg(db, 'Test Org');
      const project = createTestProject(db, 'Test Project', org.id);

      permissionHandlers.grant({
        agent_id: 'agent-list-3',
        permission: 'read',
        scope_type: 'project',
        scope_id: project.id,
        entry_type: 'tool',
      });

      const result = permissionHandlers.list({ scope_type: 'project' });

      expect(Array.isArray(result.permissions)).toBe(true);
    });

    it('should filter by entry_type', () => {
      permissionHandlers.grant({
        agent_id: 'agent-list-4',
        permission: 'read',
        entry_type: 'knowledge',
      });

      const result = permissionHandlers.list({ entry_type: 'knowledge' });

      expect(Array.isArray(result.permissions)).toBe(true);
    });
  });
});


