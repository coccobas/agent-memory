/**
 * Unit tests for entry-access utility
 * Tests permission checking and scope resolution for memory entries
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  registerTestContext,
  resetContainer,
  clearPreparedStatementCache,
  type TestDb,
} from '../fixtures/test-helpers.js';
import {
  getEntryScope,
  requireEntryPermission,
  requireEntryPermissionWithScope,
} from '../../src/utils/entry-access.js';
import type { AppContext } from '../../src/core/context.js';
import type { Repositories } from '../../src/core/interfaces/repositories.js';
import { PermissionService } from '../../src/services/permission.service.js';
import { generateId } from '../../src/db/repositories/base.js';

const TEST_DB_PATH = './data/test-entry-access.db';
let testDb: TestDb;
let repos: Repositories;
let context: AppContext;
let permissionService: PermissionService;

describe('entry-access utility', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    repos = createTestRepositories(testDb);
    context = registerTestContext(testDb);
    permissionService = context.services!.permission;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
    resetContainer();
    clearPreparedStatementCache();
  });

  beforeEach(() => {
    // Clean up entries before each test - using SQL to avoid FK constraints
    testDb.sqlite.exec('DELETE FROM tool_versions');
    testDb.sqlite.exec('DELETE FROM tools');
    testDb.sqlite.exec('DELETE FROM guideline_versions');
    testDb.sqlite.exec('DELETE FROM guidelines');
    testDb.sqlite.exec('DELETE FROM knowledge_versions');
    testDb.sqlite.exec('DELETE FROM knowledge');
    testDb.sqlite.exec('DELETE FROM permissions');
  });

  describe('getEntryScope', () => {
    describe('tool entries', () => {
      it('should return scope for global tool', async () => {
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'global',
          scopeId: null,
        });

        const scope = await getEntryScope(context, 'tool', tool.id);

        expect(scope.scopeType).toBe('global');
        expect(scope.scopeId).toBeNull();
      });

      it('should return scope for project tool', async () => {
        const projectId = generateId();
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'project',
          scopeId: projectId,
        });

        const scope = await getEntryScope(context, 'tool', tool.id);

        expect(scope.scopeType).toBe('project');
        expect(scope.scopeId).toBe(projectId);
      });

      it('should return scope for org tool', async () => {
        const orgId = generateId();
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'org',
          scopeId: orgId,
        });

        const scope = await getEntryScope(context, 'tool', tool.id);

        expect(scope.scopeType).toBe('org');
        expect(scope.scopeId).toBe(orgId);
      });

      it('should return scope for session tool', async () => {
        const sessionId = generateId();
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'session',
          scopeId: sessionId,
        });

        const scope = await getEntryScope(context, 'tool', tool.id);

        expect(scope.scopeType).toBe('session');
        expect(scope.scopeId).toBe(sessionId);
      });

      it('should throw NotFoundError for non-existent tool', async () => {
        const fakeId = generateId();

        await expect(getEntryScope(context, 'tool', fakeId)).rejects.toThrow(
          `tool not found: ${fakeId}`
        );
      });

      it('should throw NotFoundError with correct error code', async () => {
        const fakeId = generateId();

        try {
          await getEntryScope(context, 'tool', fakeId);
          expect.fail('Should have thrown NotFoundError');
        } catch (error: any) {
          expect(error.code).toBe('E2000');
          expect(error.message).toContain('not found');
        }
      });
    });

    describe('guideline entries', () => {
      it('should return scope for global guideline', async () => {
        const guideline = await repos.guidelines.create({
          name: 'test-guideline',
          scopeType: 'global',
          scopeId: null,
          content: 'Test content',
        });

        const scope = await getEntryScope(context, 'guideline', guideline.id);

        expect(scope.scopeType).toBe('global');
        expect(scope.scopeId).toBeNull();
      });

      it('should return scope for project guideline', async () => {
        const projectId = generateId();
        const guideline = await repos.guidelines.create({
          name: 'test-guideline',
          scopeType: 'project',
          scopeId: projectId,
          content: 'Test content',
        });

        const scope = await getEntryScope(context, 'guideline', guideline.id);

        expect(scope.scopeType).toBe('project');
        expect(scope.scopeId).toBe(projectId);
      });

      it('should throw NotFoundError for non-existent guideline', async () => {
        const fakeId = generateId();

        await expect(getEntryScope(context, 'guideline', fakeId)).rejects.toThrow(
          `guideline not found: ${fakeId}`
        );
      });
    });

    describe('knowledge entries', () => {
      it('should return scope for global knowledge', async () => {
        const knowledge = await repos.knowledge.create({
          title: 'test-knowledge',
          scopeType: 'global',
          scopeId: null,
          content: 'Test content',
        });

        const scope = await getEntryScope(context, 'knowledge', knowledge.id);

        expect(scope.scopeType).toBe('global');
        expect(scope.scopeId).toBeNull();
      });

      it('should return scope for project knowledge', async () => {
        const projectId = generateId();
        const knowledge = await repos.knowledge.create({
          title: 'test-knowledge',
          scopeType: 'project',
          scopeId: projectId,
          content: 'Test content',
        });

        const scope = await getEntryScope(context, 'knowledge', knowledge.id);

        expect(scope.scopeType).toBe('project');
        expect(scope.scopeId).toBe(projectId);
      });

      it('should throw NotFoundError for non-existent knowledge', async () => {
        const fakeId = generateId();

        await expect(getEntryScope(context, 'knowledge', fakeId)).rejects.toThrow(
          `knowledge not found: ${fakeId}`
        );
      });
    });

    describe('edge cases', () => {
      it('should handle undefined scopeId (converted to null)', async () => {
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'global',
          scopeId: undefined,
        });

        const scope = await getEntryScope(context, 'tool', tool.id);

        expect(scope.scopeId).toBeNull();
      });

      it('should handle all entry types correctly', async () => {
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'global',
          scopeId: null,
        });
        const guideline = await repos.guidelines.create({
          name: 'test-guideline',
          scopeType: 'global',
          scopeId: null,
          content: 'Test',
        });
        const knowledge = await repos.knowledge.create({
          title: 'test-knowledge',
          scopeType: 'global',
          scopeId: null,
          content: 'Test',
        });

        const toolScope = await getEntryScope(context, 'tool', tool.id);
        const guidelineScope = await getEntryScope(context, 'guideline', guideline.id);
        const knowledgeScope = await getEntryScope(context, 'knowledge', knowledge.id);

        expect(toolScope.scopeType).toBe('global');
        expect(guidelineScope.scopeType).toBe('global');
        expect(knowledgeScope.scopeType).toBe('global');
      });
    });
  });

  describe('requireEntryPermission', () => {
    let previousPermMode: string | undefined;

    beforeAll(() => {
      // Disable permissive mode for permission tests
      previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    });

    afterAll(() => {
      // Restore previous permission mode
      if (previousPermMode !== undefined) {
        process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
      }
    });

    describe('read permissions', () => {
      it('should allow read when agent has read permission', async () => {
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'global',
          scopeId: null,
        });

        permissionService.grant({
          agentId: 'agent-1',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'read',
        });

        await expect(
          requireEntryPermission(context, {
            agentId: 'agent-1',
            action: 'read',
            entryType: 'tool',
            entryId: tool.id,
          })
        ).resolves.toBeUndefined();
      });

      it('should allow read when agent has write permission', async () => {
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'global',
          scopeId: null,
        });

        permissionService.grant({
          agentId: 'agent-2',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'write',
        });

        await expect(
          requireEntryPermission(context, {
            agentId: 'agent-2',
            action: 'read',
            entryType: 'tool',
            entryId: tool.id,
          })
        ).resolves.toBeUndefined();
      });

      it('should allow read when agent has admin permission', async () => {
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'global',
          scopeId: null,
        });

        permissionService.grant({
          agentId: 'agent-3',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'admin',
        });

        await expect(
          requireEntryPermission(context, {
            agentId: 'agent-3',
            action: 'read',
            entryType: 'tool',
            entryId: tool.id,
          })
        ).resolves.toBeUndefined();
      });

      it('should deny read when agent has no permission', async () => {
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'global',
          scopeId: null,
        });

        // Grant permission to another agent to disable default allow
        permissionService.grant({
          agentId: 'other-agent',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'read',
        });

        await expect(
          requireEntryPermission(context, {
            agentId: 'agent-no-perm',
            action: 'read',
            entryType: 'tool',
            entryId: tool.id,
          })
        ).rejects.toThrow('Permission denied');
      });
    });

    describe('write permissions', () => {
      it('should allow write when agent has write permission', async () => {
        const guideline = await repos.guidelines.create({
          name: 'test-guideline',
          scopeType: 'global',
          scopeId: null,
          content: 'Test',
        });

        permissionService.grant({
          agentId: 'agent-4',
          scopeType: 'global',
          entryType: 'guideline',
          permission: 'write',
        });

        await expect(
          requireEntryPermission(context, {
            agentId: 'agent-4',
            action: 'write',
            entryType: 'guideline',
            entryId: guideline.id,
          })
        ).resolves.toBeUndefined();
      });

      it('should allow write when agent has admin permission', async () => {
        const guideline = await repos.guidelines.create({
          name: 'test-guideline',
          scopeType: 'global',
          scopeId: null,
          content: 'Test',
        });

        permissionService.grant({
          agentId: 'agent-5',
          scopeType: 'global',
          entryType: 'guideline',
          permission: 'admin',
        });

        await expect(
          requireEntryPermission(context, {
            agentId: 'agent-5',
            action: 'write',
            entryType: 'guideline',
            entryId: guideline.id,
          })
        ).resolves.toBeUndefined();
      });

      it('should deny write when agent only has read permission', async () => {
        const guideline = await repos.guidelines.create({
          name: 'test-guideline',
          scopeType: 'global',
          scopeId: null,
          content: 'Test',
        });

        permissionService.grant({
          agentId: 'agent-6',
          scopeType: 'global',
          entryType: 'guideline',
          permission: 'read',
        });

        await expect(
          requireEntryPermission(context, {
            agentId: 'agent-6',
            action: 'write',
            entryType: 'guideline',
            entryId: guideline.id,
          })
        ).rejects.toThrow('Permission denied');
      });
    });

    describe('delete permissions', () => {
      it('should allow delete when agent has admin permission', async () => {
        const knowledge = await repos.knowledge.create({
          title: 'test-knowledge',
          scopeType: 'global',
          scopeId: null,
          content: 'Test',
        });

        permissionService.grant({
          agentId: 'agent-7',
          scopeType: 'global',
          entryType: 'knowledge',
          permission: 'admin',
        });

        await expect(
          requireEntryPermission(context, {
            agentId: 'agent-7',
            action: 'delete',
            entryType: 'knowledge',
            entryId: knowledge.id,
          })
        ).resolves.toBeUndefined();
      });

      it('should deny delete when agent only has write permission', async () => {
        const knowledge = await repos.knowledge.create({
          title: 'test-knowledge',
          scopeType: 'global',
          scopeId: null,
          content: 'Test',
        });

        permissionService.grant({
          agentId: 'agent-8',
          scopeType: 'global',
          entryType: 'knowledge',
          permission: 'write',
        });

        await expect(
          requireEntryPermission(context, {
            agentId: 'agent-8',
            action: 'delete',
            entryType: 'knowledge',
            entryId: knowledge.id,
          })
        ).rejects.toThrow('Permission denied');
      });

      it('should deny delete when agent only has read permission', async () => {
        const knowledge = await repos.knowledge.create({
          title: 'test-knowledge',
          scopeType: 'global',
          scopeId: null,
          content: 'Test',
        });

        permissionService.grant({
          agentId: 'agent-9',
          scopeType: 'global',
          entryType: 'knowledge',
          permission: 'read',
        });

        await expect(
          requireEntryPermission(context, {
            agentId: 'agent-9',
            action: 'delete',
            entryType: 'knowledge',
            entryId: knowledge.id,
          })
        ).rejects.toThrow('Permission denied');
      });
    });

    describe('scope-specific permissions', () => {
      it('should check permission for project scope', async () => {
        const projectId = generateId();
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'project',
          scopeId: projectId,
        });

        permissionService.grant({
          agentId: 'agent-10',
          scopeType: 'project',
          scopeId: projectId,
          entryType: 'tool',
          permission: 'write',
        });

        await expect(
          requireEntryPermission(context, {
            agentId: 'agent-10',
            action: 'write',
            entryType: 'tool',
            entryId: tool.id,
          })
        ).resolves.toBeUndefined();
      });

      it('should check permission for org scope', async () => {
        const orgId = generateId();
        const guideline = await repos.guidelines.create({
          name: 'test-guideline',
          scopeType: 'org',
          scopeId: orgId,
          content: 'Test',
        });

        permissionService.grant({
          agentId: 'agent-11',
          scopeType: 'org',
          scopeId: orgId,
          entryType: 'guideline',
          permission: 'read',
        });

        await expect(
          requireEntryPermission(context, {
            agentId: 'agent-11',
            action: 'read',
            entryType: 'guideline',
            entryId: guideline.id,
          })
        ).resolves.toBeUndefined();
      });

      it('should check permission for session scope', async () => {
        const sessionId = generateId();
        const knowledge = await repos.knowledge.create({
          title: 'test-knowledge',
          scopeType: 'session',
          scopeId: sessionId,
          content: 'Test',
        });

        permissionService.grant({
          agentId: 'agent-12',
          scopeType: 'session',
          scopeId: sessionId,
          entryType: 'knowledge',
          permission: 'admin',
        });

        await expect(
          requireEntryPermission(context, {
            agentId: 'agent-12',
            action: 'delete',
            entryType: 'knowledge',
            entryId: knowledge.id,
          })
        ).resolves.toBeUndefined();
      });
    });

    describe('error handling', () => {
      it('should throw NotFoundError for non-existent entry before permission check', async () => {
        const fakeId = generateId();

        permissionService.grant({
          agentId: 'agent-13',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'admin',
        });

        await expect(
          requireEntryPermission(context, {
            agentId: 'agent-13',
            action: 'read',
            entryType: 'tool',
            entryId: fakeId,
          })
        ).rejects.toThrow('not found');
      });

      it('should throw PermissionError with correct error code', async () => {
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'global',
          scopeId: null,
        });

        // Grant permission to another agent to disable default allow
        permissionService.grant({
          agentId: 'other-agent',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'read',
        });

        try {
          await requireEntryPermission(context, {
            agentId: 'agent-no-perm',
            action: 'write',
            entryType: 'tool',
            entryId: tool.id,
          });
          expect.fail('Should have thrown PermissionError');
        } catch (error: any) {
          expect(error.code).toBe('E6000');
          expect(error.message).toContain('Permission denied');
        }
      });
    });

    describe('entry-specific permissions', () => {
      it('should allow access with entry-specific permission', async () => {
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'global',
          scopeId: null,
        });

        permissionService.grant({
          agentId: 'agent-14',
          scopeType: 'global',
          entryType: 'tool',
          entryId: tool.id,
          permission: 'write',
        });

        await expect(
          requireEntryPermission(context, {
            agentId: 'agent-14',
            action: 'write',
            entryType: 'tool',
            entryId: tool.id,
          })
        ).resolves.toBeUndefined();
      });
    });
  });

  describe('requireEntryPermissionWithScope', () => {
    let previousPermMode: string | undefined;

    beforeAll(() => {
      // Disable permissive mode for permission tests
      previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    });

    afterAll(() => {
      // Restore previous permission mode
      if (previousPermMode !== undefined) {
        process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
      }
    });

    describe('successful permission checks', () => {
      it('should return scope when permission is granted', async () => {
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'global',
          scopeId: null,
        });

        permissionService.grant({
          agentId: 'agent-15',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'read',
        });

        const result = await requireEntryPermissionWithScope(context, {
          agentId: 'agent-15',
          action: 'read',
          entryType: 'tool',
          entryId: tool.id,
        });

        expect(result.scopeType).toBe('global');
        expect(result.scopeId).toBeNull();
      });

      it('should return project scope', async () => {
        const projectId = generateId();
        const guideline = await repos.guidelines.create({
          name: 'test-guideline',
          scopeType: 'project',
          scopeId: projectId,
          content: 'Test',
        });

        permissionService.grant({
          agentId: 'agent-16',
          scopeType: 'project',
          scopeId: projectId,
          entryType: 'guideline',
          permission: 'write',
        });

        const result = await requireEntryPermissionWithScope(context, {
          agentId: 'agent-16',
          action: 'write',
          entryType: 'guideline',
          entryId: guideline.id,
        });

        expect(result.scopeType).toBe('project');
        expect(result.scopeId).toBe(projectId);
      });

      it('should return org scope', async () => {
        const orgId = generateId();
        const knowledge = await repos.knowledge.create({
          title: 'test-knowledge',
          scopeType: 'org',
          scopeId: orgId,
          content: 'Test',
        });

        permissionService.grant({
          agentId: 'agent-17',
          scopeType: 'org',
          scopeId: orgId,
          entryType: 'knowledge',
          permission: 'admin',
        });

        const result = await requireEntryPermissionWithScope(context, {
          agentId: 'agent-17',
          action: 'delete',
          entryType: 'knowledge',
          entryId: knowledge.id,
        });

        expect(result.scopeType).toBe('org');
        expect(result.scopeId).toBe(orgId);
      });

      it('should return session scope', async () => {
        const sessionId = generateId();
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'session',
          scopeId: sessionId,
        });

        permissionService.grant({
          agentId: 'agent-18',
          scopeType: 'session',
          scopeId: sessionId,
          entryType: 'tool',
          permission: 'read',
        });

        const result = await requireEntryPermissionWithScope(context, {
          agentId: 'agent-18',
          action: 'read',
          entryType: 'tool',
          entryId: tool.id,
        });

        expect(result.scopeType).toBe('session');
        expect(result.scopeId).toBe(sessionId);
      });
    });

    describe('failed permission checks', () => {
      it('should throw PermissionError when permission is denied', async () => {
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'global',
          scopeId: null,
        });

        // Grant permission to another agent to disable default allow
        permissionService.grant({
          agentId: 'other-agent',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'read',
        });

        await expect(
          requireEntryPermissionWithScope(context, {
            agentId: 'agent-no-perm',
            action: 'write',
            entryType: 'tool',
            entryId: tool.id,
          })
        ).rejects.toThrow('Permission denied');
      });

      it('should throw NotFoundError for non-existent entry', async () => {
        const fakeId = generateId();

        permissionService.grant({
          agentId: 'agent-19',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'admin',
        });

        await expect(
          requireEntryPermissionWithScope(context, {
            agentId: 'agent-19',
            action: 'read',
            entryType: 'tool',
            entryId: fakeId,
          })
        ).rejects.toThrow('not found');
      });
    });

    describe('return value validation', () => {
      it('should return object with scopeType and scopeId properties', async () => {
        const projectId = generateId();
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'project',
          scopeId: projectId,
        });

        permissionService.grant({
          agentId: 'agent-20',
          scopeType: 'project',
          scopeId: projectId,
          entryType: 'tool',
          permission: 'read',
        });

        const result = await requireEntryPermissionWithScope(context, {
          agentId: 'agent-20',
          action: 'read',
          entryType: 'tool',
          entryId: tool.id,
        });

        expect(result).toHaveProperty('scopeType');
        expect(result).toHaveProperty('scopeId');
        expect(typeof result.scopeType).toBe('string');
      });

      it('should handle null scopeId correctly', async () => {
        const guideline = await repos.guidelines.create({
          name: 'test-guideline',
          scopeType: 'global',
          scopeId: null,
          content: 'Test',
        });

        permissionService.grant({
          agentId: 'agent-21',
          scopeType: 'global',
          entryType: 'guideline',
          permission: 'write',
        });

        const result = await requireEntryPermissionWithScope(context, {
          agentId: 'agent-21',
          action: 'write',
          entryType: 'guideline',
          entryId: guideline.id,
        });

        expect(result.scopeId).toBeNull();
      });
    });

    describe('all entry types', () => {
      it('should work with tool entries', async () => {
        const tool = await repos.tools.create({
          name: 'test-tool',
          scopeType: 'global',
          scopeId: null,
        });

        permissionService.grant({
          agentId: 'agent-22',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'admin',
        });

        const result = await requireEntryPermissionWithScope(context, {
          agentId: 'agent-22',
          action: 'delete',
          entryType: 'tool',
          entryId: tool.id,
        });

        expect(result.scopeType).toBe('global');
      });

      it('should work with guideline entries', async () => {
        const guideline = await repos.guidelines.create({
          name: 'test-guideline',
          scopeType: 'global',
          scopeId: null,
          content: 'Test',
        });

        permissionService.grant({
          agentId: 'agent-23',
          scopeType: 'global',
          entryType: 'guideline',
          permission: 'admin',
        });

        const result = await requireEntryPermissionWithScope(context, {
          agentId: 'agent-23',
          action: 'delete',
          entryType: 'guideline',
          entryId: guideline.id,
        });

        expect(result.scopeType).toBe('global');
      });

      it('should work with knowledge entries', async () => {
        const knowledge = await repos.knowledge.create({
          title: 'test-knowledge',
          scopeType: 'global',
          scopeId: null,
          content: 'Test',
        });

        permissionService.grant({
          agentId: 'agent-24',
          scopeType: 'global',
          entryType: 'knowledge',
          permission: 'admin',
        });

        const result = await requireEntryPermissionWithScope(context, {
          agentId: 'agent-24',
          action: 'delete',
          entryType: 'knowledge',
          entryId: knowledge.id,
        });

        expect(result.scopeType).toBe('global');
      });
    });
  });

  describe('integration between functions', () => {
    it('should use getEntryScope internally in requireEntryPermission', async () => {
      const tool = await repos.tools.create({
        name: 'test-tool',
        scopeType: 'global',
        scopeId: null,
      });

      permissionService.grant({
        agentId: 'agent-25',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      // Both should resolve without error
      const scope = await getEntryScope(context, 'tool', tool.id);
      await requireEntryPermission(context, {
        agentId: 'agent-25',
        action: 'read',
        entryType: 'tool',
        entryId: tool.id,
      });

      expect(scope.scopeType).toBe('global');
    });

    it('should use getEntryScope internally in requireEntryPermissionWithScope', async () => {
      const projectId = generateId();
      const guideline = await repos.guidelines.create({
        name: 'test-guideline',
        scopeType: 'project',
        scopeId: projectId,
        content: 'Test',
      });

      permissionService.grant({
        agentId: 'agent-26',
        scopeType: 'project',
        scopeId: projectId,
        entryType: 'guideline',
        permission: 'write',
      });

      const scope = await getEntryScope(context, 'guideline', guideline.id);
      const resultScope = await requireEntryPermissionWithScope(context, {
        agentId: 'agent-26',
        action: 'write',
        entryType: 'guideline',
        entryId: guideline.id,
      });

      expect(scope).toEqual(resultScope);
    });
  });
});
