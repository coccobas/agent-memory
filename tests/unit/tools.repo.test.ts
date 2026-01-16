/**
 * Unit tests for tools repository
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestOrg,
  createTestProject,
  createTestRepositories,
  type TestDb,
} from '../fixtures/test-helpers.js';
import type { IToolRepository } from '../../src/core/interfaces/repositories.js';

const TEST_DB_PATH = './data/test-tools-repo.db';
let testDb: TestDb;
let toolRepo: IToolRepository;

describe('toolRepo', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    toolRepo = repos.tools;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('create', () => {
    it('should create a tool with initial version', async () => {
      const tool = await toolRepo.create({
        scopeType: 'global',
        name: 'test-tool',
        description: 'Test description',
        category: 'mcp',
      });

      expect(tool.id).toBeDefined();
      expect(tool.name).toBe('test-tool');
      expect(tool.currentVersion).toBeDefined();
      expect(tool.currentVersion?.description).toBe('Test description');
      expect(tool.currentVersion?.versionNum).toBe(1);
    });

    it('should store parameters and examples', async () => {
      const tool = await toolRepo.create({
        scopeType: 'global',
        name: 'parameterized-tool',
        description: 'Tool with parameters',
        parameters: { input: { type: 'string' } },
        examples: [{ input: 'test', output: 'result' }],
      });

      expect(tool.currentVersion?.parameters).toEqual({ input: { type: 'string' } });
      expect(tool.currentVersion?.examples).toEqual([{ input: 'test', output: 'result' }]);
    });

    it('should create tool at project scope', async () => {
      const org = createTestOrg(testDb.db, 'Test Org');
      const project = createTestProject(testDb.db, 'Test Project', org.id);

      const tool = await toolRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'project-tool',
        description: 'Project tool',
      });

      expect(tool.scopeType).toBe('project');
      expect(tool.scopeId).toBe(project.id);
    });
  });

  describe('getById', () => {
    it('should get tool by ID', async () => {
      const created = await toolRepo.create({
        scopeType: 'global',
        name: 'get-by-id-tool',
        description: 'Description',
      });

      const tool = await toolRepo.getById(created.id);

      expect(tool).toBeDefined();
      expect(tool?.id).toBe(created.id);
      expect(tool?.name).toBe('get-by-id-tool');
    });

    it('should return undefined for non-existent ID', async () => {
      const tool = await toolRepo.getById('non-existent-id');
      expect(tool).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list tools', async () => {
      await toolRepo.create({
        scopeType: 'global',
        name: 'list-tool-1',
        description: 'Description 1',
      });

      await toolRepo.create({
        scopeType: 'global',
        name: 'list-tool-2',
        description: 'Description 2',
      });

      const tools = await toolRepo.list({ scopeType: 'global' }, { limit: 10 });

      expect(tools.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by category', async () => {
      await toolRepo.create({
        scopeType: 'global',
        name: 'cli-tool',
        description: 'Description',
        category: 'cli',
      });

      const tools = await toolRepo.list({ scopeType: 'global', category: 'cli' }, { limit: 10 });

      tools.forEach((t) => {
        expect(t.category).toBe('cli');
      });
    });
  });

  describe('update', () => {
    it('should update tool and create new version', async () => {
      const created = await toolRepo.create({
        scopeType: 'global',
        name: 'update-tool',
        description: 'Original description',
      });

      const originalVersionId = created.currentVersionId;

      const updated = await toolRepo.update(created.id, {
        description: 'Updated description',
        changeReason: 'Test update',
      });

      expect(updated.currentVersionId).not.toBe(originalVersionId);
      expect(updated.currentVersion?.description).toBe('Updated description');
      expect(updated.currentVersion?.versionNum).toBe(2);
    });

    it('should update parameters', async () => {
      const created = await toolRepo.create({
        scopeType: 'global',
        name: 'update-params-tool',
        description: 'Description',
        parameters: { old: 'value' },
      });

      const updated = await toolRepo.update(created.id, {
        parameters: { new: 'value' },
      });

      expect(updated.currentVersion?.parameters).toEqual({ new: 'value' });
    });
  });

  describe('getHistory', () => {
    it('should get version history', async () => {
      const created = await toolRepo.create({
        scopeType: 'global',
        name: 'history-tool',
        description: 'Version 1',
      });

      await toolRepo.update(created.id, {
        description: 'Version 2',
        changeReason: 'Update',
      });

      const history = await toolRepo.getHistory(created.id);

      expect(history.length).toBe(2);
      // History is ordered ascending (oldest first)
      expect(history[0]?.versionNum).toBe(1);
      expect(history[1]?.versionNum).toBe(2);
    });
  });

  describe('deactivate', () => {
    it('should deactivate tool', async () => {
      const created = await toolRepo.create({
        scopeType: 'global',
        name: 'deactivate-tool',
        description: 'Description',
      });

      await toolRepo.deactivate(created.id);

      const tool = await toolRepo.getById(created.id);
      expect(tool?.isActive).toBe(false);
    });

    it('should return false for non-existent tool', async () => {
      const result = await toolRepo.deactivate('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('reactivate', () => {
    it('should reactivate a deactivated tool', async () => {
      const created = await toolRepo.create({
        scopeType: 'global',
        name: 'reactivate-tool',
        description: 'Description',
      });

      await toolRepo.deactivate(created.id);
      const deactivated = await toolRepo.getById(created.id);
      expect(deactivated?.isActive).toBe(false);

      const result = await toolRepo.reactivate(created.id);
      expect(result).toBe(true);

      const reactivated = await toolRepo.getById(created.id);
      expect(reactivated?.isActive).toBe(true);
    });

    it('should return false for non-existent tool', async () => {
      const result = await toolRepo.reactivate('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete tool and its versions', async () => {
      const created = await toolRepo.create({
        scopeType: 'global',
        name: 'delete-tool',
        description: 'Description',
      });

      const result = await toolRepo.delete(created.id);
      expect(result).toBe(true);

      const tool = await toolRepo.getById(created.id);
      expect(tool).toBeUndefined();
    });

    it('should return false for non-existent tool', async () => {
      const result = await toolRepo.delete('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('getByIds', () => {
    it('should get multiple tools by IDs', async () => {
      const tool1 = await toolRepo.create({
        scopeType: 'global',
        name: 'getbyids-tool-1',
        description: 'Description 1',
      });

      const tool2 = await toolRepo.create({
        scopeType: 'global',
        name: 'getbyids-tool-2',
        description: 'Description 2',
      });

      const tools = await toolRepo.getByIds([tool1.id, tool2.id]);

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.id).sort()).toEqual([tool1.id, tool2.id].sort());
    });

    it('should return empty array for empty IDs array', async () => {
      const tools = await toolRepo.getByIds([]);
      expect(tools).toEqual([]);
    });

    it('should handle mix of existing and non-existing IDs', async () => {
      const tool = await toolRepo.create({
        scopeType: 'global',
        name: 'getbyids-mix-tool',
        description: 'Description',
      });

      const tools = await toolRepo.getByIds([tool.id, 'non-existent-id']);

      expect(tools).toHaveLength(1);
      expect(tools[0]?.id).toBe(tool.id);
    });
  });

  describe('getByName', () => {
    it('should get tool by name at exact scope', async () => {
      await toolRepo.create({
        scopeType: 'global',
        name: 'named-tool',
        description: 'Description',
      });

      const tool = await toolRepo.getByName('named-tool', 'global');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('named-tool');
    });

    it('should return undefined for non-existent name', async () => {
      const tool = await toolRepo.getByName('non-existent-name', 'global');
      expect(tool).toBeUndefined();
    });

    it('should inherit from global scope when not found at project scope', async () => {
      const org = createTestOrg(testDb.db, 'Tool Inherit Org');
      const project = createTestProject(testDb.db, 'Tool Inherit Project', org.id);

      // Create tool at global scope
      await toolRepo.create({
        scopeType: 'global',
        name: 'inherited-tool',
        description: 'Global description',
      });

      // Search at project scope with inherit=true (default)
      const tool = await toolRepo.getByName('inherited-tool', 'project', project.id);

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('inherited-tool');
      expect(tool?.scopeType).toBe('global');
    });

    it('should not inherit when inherit=false', async () => {
      const org = createTestOrg(testDb.db, 'Tool No Inherit Org');
      const project = createTestProject(testDb.db, 'Tool No Inherit Project', org.id);

      // Create tool at global scope
      await toolRepo.create({
        scopeType: 'global',
        name: 'no-inherit-tool',
        description: 'Global description',
      });

      // Search at project scope with inherit=false
      const tool = await toolRepo.getByName('no-inherit-tool', 'project', project.id, false);

      expect(tool).toBeUndefined();
    });
  });

  describe('update edge cases', () => {
    it('should return undefined when updating non-existent tool', async () => {
      const result = await toolRepo.update('non-existent-id', {
        description: 'New description',
      });

      expect(result).toBeUndefined();
    });

    it('should update constraints', async () => {
      const created = await toolRepo.create({
        scopeType: 'global',
        name: 'update-constraints-tool',
        description: 'Description',
      });

      const updated = await toolRepo.update(created.id, {
        constraints: 'Use with caution',
      });

      expect(updated?.currentVersion?.constraints).toBe('Use with caution');
    });

    it('should update examples', async () => {
      const created = await toolRepo.create({
        scopeType: 'global',
        name: 'update-examples-tool',
        description: 'Description',
        examples: [{ input: 'old', output: 'old' }],
      });

      const updated = await toolRepo.update(created.id, {
        examples: [{ input: 'new', output: 'new' }],
      });

      expect(updated?.currentVersion?.examples).toEqual([{ input: 'new', output: 'new' }]);
    });
  });
});
