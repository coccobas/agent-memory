import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestOrg, createTestProject, createTestTool } from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-tools.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js',
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

import { toolHandlers } from '../../src/mcp/handlers/tools.handler.js';

describe('Tools Integration', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('memory_tool_add', () => {
    it('should add a tool at global scope', () => {
      const result = toolHandlers.add({
        scopeType: 'global',
        name: 'test_tool',
        category: 'cli',
        description: 'A test tool',
      });

      expect(result.success).toBe(true);
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('test_tool');
      expect(result.tool.scopeType).toBe('global');
      expect(result.tool.category).toBe('cli');
    });

    it('should add a tool at project scope', () => {
      const project = createTestProject(db);
      const result = toolHandlers.add({
        scopeType: 'project',
        scopeId: project.id,
        name: 'project_tool',
        category: 'function',
      });

      expect(result.success).toBe(true);
      expect(result.tool.scopeType).toBe('project');
      expect(result.tool.scopeId).toBe(project.id);
    });

    it('should require scopeType', () => {
      expect(() => {
        toolHandlers.add({ name: 'test' });
      }).toThrow('scopeType is required');
    });

    it('should require name', () => {
      expect(() => {
        toolHandlers.add({ scopeType: 'global' });
      }).toThrow('name is required');
    });

    it('should require scopeId for non-global scope', () => {
      expect(() => {
        toolHandlers.add({ scopeType: 'project', name: 'test' });
      }).toThrow('scopeId is required for non-global scope');
    });
  });

  describe('memory_tool_update', () => {
    it('should update tool and create new version', () => {
      const { tool } = createTestTool(db, 'update_test_tool');
      const originalVersionId = tool.currentVersionId;

      const result = toolHandlers.update({
        id: tool.id,
        description: 'Updated description',
        changeReason: 'Testing updates',
      });

      expect(result.success).toBe(true);
      expect(result.tool.currentVersionId).not.toBe(originalVersionId);
    });

    it('should require id', () => {
      expect(() => {
        toolHandlers.update({});
      }).toThrow('id is required');
    });

    it('should throw error when tool not found', () => {
      expect(() => {
        toolHandlers.update({ id: 'non-existent' });
      }).toThrow('Tool not found');
    });
  });

  describe('memory_tool_get', () => {
    it('should get tool by ID', () => {
      const { tool } = createTestTool(db, 'get_by_id_tool');
      const result = toolHandlers.get({ id: tool.id });

      expect(result.tool).toBeDefined();
      expect(result.tool.id).toBe(tool.id);
      expect(result.tool.name).toBe('get_by_id_tool');
    });

    it('should get tool by name and scope', () => {
      const project = createTestProject(db);
      const { tool } = createTestTool(db, 'get_by_name_tool', 'project', project.id);

      const result = toolHandlers.get({
        name: 'get_by_name_tool',
        scopeType: 'project',
        scopeId: project.id,
      });

      expect(result.tool.id).toBe(tool.id);
    });

    it('should require id or name', () => {
      expect(() => {
        toolHandlers.get({});
      }).toThrow('Either id or name is required');
    });
  });

  describe('memory_tool_list', () => {
    it('should list tools with scope filter', () => {
      const project = createTestProject(db);
      createTestTool(db, 'tool1', 'global');
      createTestTool(db, 'tool2', 'project', project.id);
      createTestTool(db, 'tool3', 'project', project.id);

      const result = toolHandlers.list({
        scopeType: 'project',
        scopeId: project.id,
        limit: 10,
      });

      expect(result.tools.length).toBe(2);
      result.tools.forEach((t) => {
        expect(t.scopeType).toBe('project');
        expect(t.scopeId).toBe(project.id);
      });
    });

    it('should list all tools', () => {
      createTestTool(db, 'list_test_1');
      createTestTool(db, 'list_test_2');

      const result = toolHandlers.list({ limit: 10 });
      expect(result.tools.length).toBeGreaterThan(0);
    });

    it('should support pagination', () => {
      createTestTool(db, 'page1');
      createTestTool(db, 'page2');
      createTestTool(db, 'page3');

      const result = toolHandlers.list({ limit: 2, offset: 0 });
      expect(result.tools.length).toBeLessThanOrEqual(2);
    });
  });

  describe('memory_tool_history', () => {
    it('should return version history', () => {
      const { tool } = createTestTool(db, 'history_tool');
      toolHandlers.update({ id: tool.id, description: 'Version 2', changeReason: 'Update' });
      toolHandlers.update({ id: tool.id, description: 'Version 3', changeReason: 'Another update' });

      const result = toolHandlers.history({ id: tool.id });
      expect(result.versions.length).toBeGreaterThanOrEqual(3);
      expect(result.versions[0].versionNum).toBeGreaterThan(result.versions[1].versionNum);
    });

    it('should require id', () => {
      expect(() => {
        toolHandlers.history({});
      }).toThrow('id is required');
    });
  });

  describe('memory_tool_deactivate', () => {
    it('should deactivate a tool', () => {
      const { tool } = createTestTool(db, 'deactivate_test');
      const result = toolHandlers.deactivate({ id: tool.id });

      expect(result.success).toBe(true);
      const fetched = toolHandlers.get({ id: tool.id });
      expect(fetched.tool.isActive).toBe(false);
    });

    it('should require id', () => {
      expect(() => {
        toolHandlers.deactivate({});
      }).toThrow('id is required');
    });
  });
});

