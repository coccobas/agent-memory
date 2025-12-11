import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestProject,
  createTestKnowledge,
} from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-knowledge.db';

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

import { knowledgeHandlers } from '../../src/mcp/handlers/knowledge.handler.js';

describe('Knowledge Integration', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('memory_knowledge_add', () => {
    it('should add a knowledge entry with all fields', () => {
      const result = knowledgeHandlers.add({
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

    it('should add knowledge at project scope', () => {
      const project = createTestProject(db);
      const result = knowledgeHandlers.add({
        scopeType: 'project',
        scopeId: project.id,
        title: 'Project Knowledge',
        content: 'Project content',
      });

      expect(result.success).toBe(true);
      expect(result.knowledge.scopeType).toBe('project');
      expect(result.knowledge.scopeId).toBe(project.id);
    });

    it('should require scopeType', () => {
      expect(() => {
        knowledgeHandlers.add({ title: 'test', content: 'content' });
      }).toThrow(/scopeType.*required/i);
    });

    it('should require title', () => {
      expect(() => {
        knowledgeHandlers.add({ scopeType: 'global', content: 'content' });
      }).toThrow(/title.*required/i);
    });

    it('should require content', () => {
      expect(() => {
        knowledgeHandlers.add({ scopeType: 'global', title: 'test' });
      }).toThrow(/content.*required/i);
    });
  });

  describe('memory_knowledge_update', () => {
    it('should update knowledge and create new version', () => {
      const { knowledge } = createTestKnowledge(db, 'update_test');
      const originalVersionId = knowledge.currentVersionId;

      const result = knowledgeHandlers.update({
        id: knowledge.id,
        content: 'Updated content',
        changeReason: 'Testing updates',
      });

      expect(result.success).toBe(true);
      expect(result.knowledge.currentVersionId).not.toBe(originalVersionId);
    });

    it('should require id', () => {
      expect(() => {
        knowledgeHandlers.update({});
      }).toThrow(/id.*required/i);
    });
  });

  describe('memory_knowledge_get', () => {
    it('should get knowledge by ID', () => {
      const { knowledge } = createTestKnowledge(db, 'get_test');
      const result = knowledgeHandlers.get({ id: knowledge.id });

      expect(result.knowledge).toBeDefined();
      expect(result.knowledge.id).toBe(knowledge.id);
    });

    it('should get knowledge by title and scope', () => {
      const project = createTestProject(db);
      const { knowledge } = createTestKnowledge(db, 'get_by_title', 'project', project.id);

      const result = knowledgeHandlers.get({
        title: 'get_by_title',
        scopeType: 'project',
        scopeId: project.id,
      });

      expect(result.knowledge.id).toBe(knowledge.id);
    });
  });

  describe('memory_knowledge_list', () => {
    it('should list knowledge entries with scope filter', () => {
      const project = createTestProject(db);
      createTestKnowledge(db, 'knowledge1', 'global');
      createTestKnowledge(db, 'knowledge2', 'project', project.id);
      createTestKnowledge(db, 'knowledge3', 'project', project.id);

      const result = knowledgeHandlers.list({
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

    it('should filter by category', () => {
      createTestKnowledge(db, 'doc1', 'global', undefined, 'documentation');
      createTestKnowledge(db, 'doc2', 'global', undefined, 'documentation');
      createTestKnowledge(db, 'api1', 'global', undefined, 'api');

      const result = knowledgeHandlers.list({
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
    it('should return version history', () => {
      const { knowledge } = createTestKnowledge(db, 'history_test');
      knowledgeHandlers.update({ id: knowledge.id, content: 'Version 2', changeReason: 'Update' });
      knowledgeHandlers.update({
        id: knowledge.id,
        content: 'Version 3',
        changeReason: 'Another update',
      });

      const result = knowledgeHandlers.history({ id: knowledge.id });
      expect(result.versions.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('memory_knowledge_deactivate', () => {
    it('should deactivate a knowledge entry', () => {
      const { knowledge } = createTestKnowledge(db, 'deactivate_test');
      const result = knowledgeHandlers.deactivate({ id: knowledge.id });

      expect(result.success).toBe(true);
      const fetched = knowledgeHandlers.get({ id: knowledge.id });
      expect(fetched.knowledge.isActive).toBe(false);
    });
  });
});
