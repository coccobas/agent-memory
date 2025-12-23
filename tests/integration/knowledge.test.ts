import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  registerTestContext,
  createTestProject,
  createTestKnowledge,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-knowledge.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let context: AppContext;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

import { knowledgeHandlers } from '../../src/mcp/handlers/knowledge.handler.js';

describe('Knowledge Integration', () => {
  const AGENT_ID = 'agent-1';
  let previousPermMode: string | undefined;
  beforeAll(() => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = registerTestContext(testDb);
  });

  afterAll(() => {
    if (previousPermMode === undefined) {
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    } else {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    }
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('memory_knowledge_add', () => {
    it('should add a knowledge entry with all fields', async () => {
      const result = await knowledgeHandlers.add(context, {
        agentId: AGENT_ID,
        scopeType: 'global',
        title: 'Test Knowledge',
        category: 'documentation',
        content: 'Test content',
        source: 'https://example.com',
        confidence: 0.9,
      });

      expect(result.success).toBe(true);
      expect(result.knowledge).toBeDefined();
      expect(result.knowledge.title).toBe('Test Knowledge');
      // Source is stored on the current version
      expect(result.knowledge.currentVersion?.source).toBe('https://example.com');
    });

    it('should add knowledge at project scope', async () => {
      const project = createTestProject(db);
      const result = await knowledgeHandlers.add(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: project.id,
        title: 'Project Knowledge',
        content: 'Project content',
      });

      expect(result.success).toBe(true);
      expect(result.knowledge.scopeType).toBe('project');
      expect(result.knowledge.scopeId).toBe(project.id);
    });

    it('should require scopeType', async () => {
      await expect(
        knowledgeHandlers.add(context, { agentId: AGENT_ID, title: 'test', content: 'content' })
      ).rejects.toThrow(/scopeType.*required/i);
    });

    it('should require title', async () => {
      await expect(
        knowledgeHandlers.add(context, { agentId: AGENT_ID, scopeType: 'global', content: 'content' })
      ).rejects.toThrow(/title.*required/i);
    });

    it('should require content', async () => {
      await expect(
        knowledgeHandlers.add(context, { agentId: AGENT_ID, scopeType: 'global', title: 'test' })
      ).rejects.toThrow(/content.*required/i);
    });
  });

  describe('memory_knowledge_update', () => {
    it('should update knowledge and create new version', async () => {
      const { knowledge } = createTestKnowledge(db, 'update_test');
      const originalVersionId = knowledge.currentVersionId;

      const result = await knowledgeHandlers.update(context, {
        agentId: AGENT_ID,
        id: knowledge.id,
        content: 'Updated content',
        changeReason: 'Testing updates',
      });

      expect(result.success).toBe(true);
      expect(result.knowledge.currentVersionId).not.toBe(originalVersionId);
    });

    it('should require id', async () => {
      await expect(knowledgeHandlers.update(context, {})).rejects.toThrow(/id.*required/i);
    });
  });

  describe('memory_knowledge_get', () => {
    it('should get knowledge by ID', async () => {
      const { knowledge } = createTestKnowledge(db, 'get_test');
      const result = await knowledgeHandlers.get(context, { agentId: AGENT_ID, id: knowledge.id });

      expect(result.knowledge).toBeDefined();
      expect(result.knowledge.id).toBe(knowledge.id);
    });

    it('should get knowledge by title and scope', async () => {
      const project = createTestProject(db);
      const { knowledge } = createTestKnowledge(db, 'get_by_title', 'project', project.id);

      const result = await knowledgeHandlers.get(context, {
        agentId: AGENT_ID,
        title: 'get_by_title',
        scopeType: 'project',
        scopeId: project.id,
      });

      expect(result.knowledge.id).toBe(knowledge.id);
    });
  });

  describe('memory_knowledge_list', () => {
    it('should list knowledge entries with scope filter', async () => {
      const project = createTestProject(db);
      createTestKnowledge(db, 'knowledge1', 'global');
      createTestKnowledge(db, 'knowledge2', 'project', project.id);
      createTestKnowledge(db, 'knowledge3', 'project', project.id);

      const result = await knowledgeHandlers.list(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: project.id,
        limit: 10,
      });

      expect(result.knowledge.length).toBe(2);
      result.knowledge.forEach((k) => {
        expect(k.scopeType).toBe('project');
        expect(k.scopeId).toBe(project.id);
      });
    });

    it('should filter by category', async () => {
      createTestKnowledge(db, 'doc1', 'global', undefined, 'documentation');
      createTestKnowledge(db, 'doc2', 'global', undefined, 'documentation');
      createTestKnowledge(db, 'api1', 'global', undefined, 'api');

      const result = await knowledgeHandlers.list(context, {
        agentId: AGENT_ID,
        scopeType: 'global',
        category: 'documentation',
        limit: 10,
      });

      expect(result.knowledge.length).toBeGreaterThan(0);
      result.knowledge.forEach((k) => {
        expect(k.category).toBe('documentation');
      });
    });
  });

  describe('memory_knowledge_history', () => {
    it('should return version history', async () => {
      const { knowledge } = createTestKnowledge(db, 'history_test');
      await knowledgeHandlers.update(context, { agentId: AGENT_ID, id: knowledge.id, content: 'Version 2', changeReason: 'Update' });
      await knowledgeHandlers.update(context, {
        agentId: AGENT_ID,
        id: knowledge.id,
        content: 'Version 3',
        changeReason: 'Another update',
      });

      const result = await knowledgeHandlers.history(context, { agentId: AGENT_ID, id: knowledge.id });
      expect(result.versions.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('memory_knowledge_deactivate', () => {
    it('should deactivate a knowledge entry', async () => {
      const { knowledge } = createTestKnowledge(db, 'deactivate_test');
      const result = await knowledgeHandlers.deactivate(context, { agentId: AGENT_ID, id: knowledge.id });

      expect(result.success).toBe(true);
      const fetched = await knowledgeHandlers.get(context, { agentId: AGENT_ID, id: knowledge.id });
      expect(fetched.knowledge.isActive).toBe(false);
    });
  });
});
