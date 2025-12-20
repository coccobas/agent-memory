/**
 * Unit tests for tools repository
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestOrg,
  createTestProject,
} from '../fixtures/test-helpers.js';
import { toolRepo } from '../../src/db/repositories/tools.js';

const TEST_DB_PATH = './data/test-tools-repo.db';
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

describe('toolRepo', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('create', () => {
    it('should create a tool with initial version', () => {
      const tool = toolRepo.create({
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

    it('should store parameters and examples', () => {
      const tool = toolRepo.create({
        scopeType: 'global',
        name: 'parameterized-tool',
        description: 'Tool with parameters',
        parameters: { input: { type: 'string' } },
        examples: [{ input: 'test', output: 'result' }],
      });

      expect(tool.currentVersion?.parameters).toEqual({ input: { type: 'string' } });
      expect(tool.currentVersion?.examples).toEqual([{ input: 'test', output: 'result' }]);
    });

    it('should create tool at project scope', () => {
      const org = createTestOrg(db, 'Test Org');
      const project = createTestProject(db, 'Test Project', org.id);

      const tool = toolRepo.create({
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
    it('should get tool by ID', () => {
      const created = toolRepo.create({
        scopeType: 'global',
        name: 'get-by-id-tool',
        description: 'Description',
      });

      const tool = toolRepo.getById(created.id);

      expect(tool).toBeDefined();
      expect(tool?.id).toBe(created.id);
      expect(tool?.name).toBe('get-by-id-tool');
    });

    it('should return undefined for non-existent ID', () => {
      const tool = toolRepo.getById('non-existent-id');
      expect(tool).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list tools', () => {
      toolRepo.create({
        scopeType: 'global',
        name: 'list-tool-1',
        description: 'Description 1',
      });

      toolRepo.create({
        scopeType: 'global',
        name: 'list-tool-2',
        description: 'Description 2',
      });

      const tools = toolRepo.list({ scopeType: 'global' }, { limit: 10 });

      expect(tools.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by category', () => {
      toolRepo.create({
        scopeType: 'global',
        name: 'cli-tool',
        description: 'Description',
        category: 'cli',
      });

      const tools = toolRepo.list({ scopeType: 'global', category: 'cli' }, { limit: 10 });

      tools.forEach((t) => {
        expect(t.category).toBe('cli');
      });
    });
  });

  describe('update', () => {
    it('should update tool and create new version', () => {
      const created = toolRepo.create({
        scopeType: 'global',
        name: 'update-tool',
        description: 'Original description',
      });

      const originalVersionId = created.currentVersionId;

      const updated = toolRepo.update(created.id, {
        description: 'Updated description',
        changeReason: 'Test update',
      });

      expect(updated.currentVersionId).not.toBe(originalVersionId);
      expect(updated.currentVersion?.description).toBe('Updated description');
      expect(updated.currentVersion?.versionNum).toBe(2);
    });

    it('should update parameters', () => {
      const created = toolRepo.create({
        scopeType: 'global',
        name: 'update-params-tool',
        description: 'Description',
        parameters: { old: 'value' },
      });

      const updated = toolRepo.update(created.id, {
        parameters: { new: 'value' },
      });

      expect(updated.currentVersion?.parameters).toEqual({ new: 'value' });
    });
  });

  describe('getHistory', () => {
    it('should get version history', () => {
      const created = toolRepo.create({
        scopeType: 'global',
        name: 'history-tool',
        description: 'Version 1',
      });

      toolRepo.update(created.id, {
        description: 'Version 2',
        changeReason: 'Update',
      });

      const history = toolRepo.getHistory(created.id);

      expect(history.length).toBe(2);
      // History is ordered ascending (oldest first)
      expect(history[0]?.versionNum).toBe(1);
      expect(history[1]?.versionNum).toBe(2);
    });
  });

  describe('deactivate', () => {
    it('should deactivate tool', () => {
      const created = toolRepo.create({
        scopeType: 'global',
        name: 'deactivate-tool',
        description: 'Description',
      });

      toolRepo.deactivate(created.id);

      const tool = toolRepo.getById(created.id);
      expect(tool?.isActive).toBe(false);
    });
  });
});
