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
  });
});
