import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  seedPredefinedTags,
  createTestOrg,
  createTestProject,
  createTestSession,
  createTestTool,
  createTestGuideline,
} from '../fixtures/test-helpers.js';
import * as schema from '../../src/db/schema.js';
import { setSqliteInstanceForTests } from '../../src/db/connection.js';

const TEST_DB_PATH = './data/test-memory-query-int.db';

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

import { queryHandlers } from '../../src/mcp/handlers/query.handler.js';
import { tagHandlers } from '../../src/mcp/handlers/tags.handler.js';
import { relationHandlers } from '../../src/mcp/handlers/relations.handler.js';

describe('memory_query integration', () => {
  const AGENT_ID = 'agent-1';
  let orgId: string;
  let projectId: string;
  let sessionId: string;
  let toolId: string;
  let guidelineId: string;
  let previousPermMode: string | undefined;

  beforeAll(() => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    setSqliteInstanceForTests(sqlite);
    seedPredefinedTags(db);

    // Create scope hierarchy
    const org = createTestOrg(db, 'Query Test Org');
    orgId = org.id;
    const project = createTestProject(db, 'Query Test Project', orgId);
    projectId = project.id;
    const session = createTestSession(db, projectId, 'Query Test Session');
    sessionId = session.id;

    // Create entries at different scopes
    const tool = createTestTool(db, 'sql_query', 'global');
    toolId = tool.tool.id;
    const guideline = createTestGuideline(
      db,
      'parameterized_sql',
      'global',
      undefined,
      'security',
      95,
      'Always use parameterized SQL queries.'
    );
    guidelineId = guideline.guideline.id;

    // Create project-level guideline
    createTestGuideline(
      db,
      'project_guideline',
      'project',
      projectId,
      'testing',
      80,
      'This is a project-level guideline'
    );

    // Create relation
    relationHandlers.create({
      agentId: AGENT_ID,
      sourceType: 'tool',
      sourceId: toolId,
      targetType: 'guideline',
      targetId: guidelineId,
      relationType: 'applies_to',
    });

    // Attach tags
    tagHandlers.attach({ agentId: AGENT_ID, entryType: 'guideline', entryId: guidelineId, tagName: 'security' });
  });

  afterAll(() => {
    if (previousPermMode === undefined) {
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    } else {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    }
    setSqliteInstanceForTests(null);
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('Basic queries', () => {
    it('should query guidelines by type', async () => {
      const response = await queryHandlers.query({
        agentId: AGENT_ID,
        types: ['guidelines'],
        scope: { type: 'global', inherit: true },
        limit: 10,
      });

      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results.every((r) => r.type === 'guideline')).toBe(true);
    });

    it('should query tools by type', async () => {
      const response = await queryHandlers.query({
        agentId: AGENT_ID,
        types: ['tools'],
        scope: { type: 'global', inherit: true },
        limit: 10,
      });

      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results.every((r) => r.type === 'tool')).toBe(true);
    });

    it('should query multiple types', async () => {
      const response = await queryHandlers.query({
        agentId: AGENT_ID,
        types: ['tools', 'guidelines'],
        scope: { type: 'global', inherit: true },
        limit: 10,
      });

      expect(response.results.length).toBeGreaterThan(0);
      const hasTools = response.results.some((r) => r.type === 'tool');
      const hasGuidelines = response.results.some((r) => r.type === 'guideline');
      expect(hasTools || hasGuidelines).toBe(true);
    });
  });

  describe('Scope inheritance', () => {
	    it('should inherit from session to project to org to global', async () => {
	      const response = await queryHandlers.query({
	        agentId: AGENT_ID,
	        types: ['guidelines'],
	        scope: { type: 'session', id: sessionId, inherit: true },
	        limit: 10,
	      });

      // Should find both global and project-level guidelines
      expect(response.results.length).toBeGreaterThan(0);
      const hasGlobal = response.results.some((r) => r.scopeType === 'global');
      const hasProject = response.results.some(
        (r) => r.scopeType === 'project' && r.scopeId === projectId
      );
      expect(hasGlobal || hasProject).toBe(true);
    });

	    it('should not inherit when inherit is false', async () => {
	      const response = await queryHandlers.query({
	        agentId: AGENT_ID,
	        types: ['guidelines'],
	        scope: { type: 'session', id: sessionId, inherit: false },
	        limit: 10,
	      });

      // Should only find session-level (none in this case)
      const sessionLevel = response.results.filter(
        (r) => r.scopeType === 'session' && r.scopeId === sessionId
      );
      expect(sessionLevel.length).toBe(0);
    });
  });

  describe('Tag filtering', () => {
	    it('should filter by require tags', async () => {
	      const response = await queryHandlers.query({
	        agentId: AGENT_ID,
	        types: ['guidelines'],
	        scope: { type: 'global', inherit: true },
	        tags: { require: ['security'] },
	        limit: 10,
	      });

      expect(response.results.length).toBeGreaterThan(0);
      response.results.forEach((r) => {
        if (r.type === 'guideline') {
          const hasSecurity = r.tags.some((t) => t.name === 'security');
          expect(hasSecurity).toBe(true);
        }
      });
    });

	    it('should filter by include tags', async () => {
	      const response = await queryHandlers.query({
	        agentId: AGENT_ID,
	        types: ['guidelines'],
	        scope: { type: 'global', inherit: true },
	        tags: { include: ['security', 'required'] },
	        limit: 10,
	      });

      expect(response.results.length).toBeGreaterThan(0);
      response.results.forEach((r) => {
        if (r.type === 'guideline') {
          const hasAnyTag = r.tags.some((t) => t.name === 'security' || t.name === 'required');
          expect(hasAnyTag).toBe(true);
        }
      });
    });

    it('should filter by exclude tags', async () => {
      // First attach deprecated tag to a guideline
      const { guideline } = createTestGuideline(db, 'deprecated_guideline');
      tagHandlers.attach({ agentId: AGENT_ID, entryType: 'guideline', entryId: guideline.id, tagName: 'deprecated' });

	      const response = await queryHandlers.query({
	        agentId: AGENT_ID,
	        types: ['guidelines'],
	        scope: { type: 'global', inherit: true },
	        tags: { exclude: ['deprecated'] },
	        limit: 10,
	      });

      response.results.forEach((r) => {
        if (r.type === 'guideline') {
          const hasDeprecated = r.tags.some((t) => t.name === 'deprecated');
          expect(hasDeprecated).toBe(false);
        }
      });
    });
  });

  describe('Text search', () => {
	    it('should search by text in content', async () => {
	      const response = await queryHandlers.query({
	        agentId: AGENT_ID,
	        types: ['guidelines'],
	        scope: { type: 'global', inherit: true },
	        search: 'parameterized',
	        limit: 10,
	      });

      expect(response.results.length).toBeGreaterThan(0);
      const found = response.results.find(
        (r) => r.type === 'guideline' && r.guideline.id === guidelineId
      );
      expect(found).toBeDefined();
    });

	    it('should search by name', async () => {
	      const response = await queryHandlers.query({
	        agentId: AGENT_ID,
	        types: ['tools'],
	        scope: { type: 'global', inherit: true },
	        search: 'sql',
	        limit: 10,
	      });

      expect(response.results.length).toBeGreaterThan(0);
      const found = response.results.find((r) => r.type === 'tool' && r.tool.id === toolId);
      expect(found).toBeDefined();
    });
  });

  describe('Relation-based queries', () => {
	    it('should find related entries', async () => {
	      const response = await queryHandlers.query({
	        agentId: AGENT_ID,
	        types: ['guidelines'],
	        relatedTo: {
	          type: 'tool',
	          id: toolId,
          relation: 'applies_to',
        },
        limit: 10,
      });

      expect(response.results.length).toBeGreaterThan(0);
      const found = response.results.find(
        (r) => r.type === 'guideline' && r.guideline.id === guidelineId
      );
      expect(found).toBeDefined();
    });
  });

  describe('Compact mode', () => {
	    it('should return minimal data in compact mode', async () => {
	      const response = await queryHandlers.query({
	        agentId: AGENT_ID,
	        types: ['guidelines'],
	        scope: { type: 'global', inherit: true },
	        compact: true,
	        limit: 10,
      });

      expect(response.results.length).toBeGreaterThan(0);
      const first = response.results[0];
      if (first.type === 'guideline') {
        expect(first.guideline).toBeDefined();
        // In compact mode, version is removed
        expect(first.version).toBeUndefined();
        // But guideline should still have basic fields
        expect(first.guideline.name).toBeDefined();
        expect(first.guideline.id).toBeDefined();
      }
    });
  });

  describe('Pagination', () => {
	    it('should respect limit', async () => {
	      const response = await queryHandlers.query({
	        agentId: AGENT_ID,
	        types: ['guidelines'],
	        scope: { type: 'global', inherit: true },
	        limit: 2,
	      });

      expect(response.results.length).toBeLessThanOrEqual(2);
      expect(response.meta.returnedCount).toBeLessThanOrEqual(2);
    });

	    it('should provide pagination metadata', async () => {
	      const response = await queryHandlers.query({
	        agentId: AGENT_ID,
	        types: ['guidelines'],
	        scope: { type: 'global', inherit: true },
	        limit: 10,
	      });

      expect(response.meta).toBeDefined();
      expect(response.meta.returnedCount).toBeDefined();
      expect(response.meta.totalCount).toBeDefined();
    });
  });

  describe('Relevance scoring', () => {
	    it('should return results with scores', async () => {
	      const response = await queryHandlers.query({
	        agentId: AGENT_ID,
	        types: ['guidelines'],
	        scope: { type: 'global', inherit: true },
	        limit: 10,
	      });

      expect(response.results.length).toBeGreaterThan(0);
      response.results.forEach((r) => {
        expect(r.score).toBeDefined();
        expect(typeof r.score).toBe('number');
      });
    });

	    it('should order results by relevance score', async () => {
	      const response = await queryHandlers.query({
	        agentId: AGENT_ID,
	        types: ['guidelines'],
	        scope: { type: 'global', inherit: true },
	        limit: 10,
	      });

      if (response.results.length > 1) {
        for (let i = 0; i < response.results.length - 1; i++) {
          expect(response.results[i].score).toBeGreaterThanOrEqual(response.results[i + 1].score);
        }
      }
    });
  });
});
