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
  createTestKnowledge,
  registerTestContext,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-context.db';

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

import { queryHandlers } from '../../src/mcp/handlers/query.handler.js';

describe('memory_context integration', () => {
  const AGENT_ID = 'agent-1';
  let orgId: string;
  let projectId: string;
  let sessionId: string;
  let previousPermMode: string | undefined;

  beforeAll(() => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;

    // Register context for query handler
    context = registerTestContext(testDb);

    seedPredefinedTags(db);

    const org = createTestOrg(db, 'Context Org');
    orgId = org.id;
    const project = createTestProject(db, 'Context Project', orgId);
    projectId = project.id;
    const session = createTestSession(db, projectId, 'Context Session');
    sessionId = session.id;

    // Global entries
    createTestTool(db, 'global_tool', 'global');
    createTestGuideline(db, 'global_guideline', 'global', undefined, 'behavior', 50);
    createTestKnowledge(db, 'global_knowledge', 'global');

    // Project entries
    createTestTool(db, 'project_tool', 'project', projectId);
    createTestGuideline(db, 'project_guideline', 'project', projectId, 'testing', 80);
    createTestKnowledge(db, 'project_knowledge', 'project', projectId);

    // Session entries
    createTestTool(db, 'session_tool', 'session', sessionId);
    createTestGuideline(db, 'session_guideline', 'session', sessionId, 'debug', 70);
    createTestKnowledge(db, 'session_knowledge', 'session', sessionId);
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

  it('returns aggregated context for a session with inheritance', async () => {
    const response = await queryHandlers.context(context, {
      agentId: AGENT_ID,
      scopeType: 'session',
      scopeId: sessionId,
      inherit: true,
      compact: false,
      limitPerType: 50,
    });

    expect(response.scope).toEqual({ type: 'session', id: sessionId });
    expect(response.meta).toBeDefined();

    // Should include entries from session, project, and global scopes
    expect(response.tools.length).toBeGreaterThan(0);
    expect(response.guidelines.length).toBeGreaterThan(0);
    expect(response.knowledge.length).toBeGreaterThan(0);

    const toolNames = response.tools.map((t: any) => t.tool.name);
    expect(toolNames).toContain('global_tool');
    expect(toolNames).toContain('project_tool');
    expect(toolNames).toContain('session_tool');
  });

  it('returns context only for the given scope when inherit is false', async () => {
    const response = await queryHandlers.context(context, {
      agentId: AGENT_ID,
      scopeType: 'project',
      scopeId: projectId,
      inherit: false,
      compact: true,
      limitPerType: 50,
    });

    expect(response.scope).toEqual({ type: 'project', id: projectId });

    // All entries should be project-scope only
    expect(response.tools.length).toBeGreaterThan(0);
    response.tools.forEach((t: any) => {
      expect(t.scopeType).toBe('project');
      expect(t.scopeId).toBe(projectId);
    });
  });

  it('returns hierarchical context format when hierarchical is true', async () => {
    const response = await queryHandlers.context(context, {
      agentId: AGENT_ID,
      scopeType: 'project',
      scopeId: projectId,
      inherit: true,
      hierarchical: true,
    });

    // Should have hierarchical structure instead of full entries
    expect(response.summary).toBeDefined();
    expect(response.summary.totalEntries).toBeGreaterThan(0);
    expect(response.summary.byType).toBeDefined();
    expect(response.summary.byCategory).toBeDefined();
    expect(response.summary.lastUpdated).toBeDefined();

    expect(response.critical).toBeDefined();
    expect(Array.isArray(response.critical)).toBe(true);

    expect(response.recent).toBeDefined();
    expect(Array.isArray(response.recent)).toBe(true);

    expect(response.categories).toBeDefined();
    expect(Array.isArray(response.categories)).toBe(true);

    expect(response.expand).toBeDefined();
    expect(response.expand.byCategory).toBeDefined();
    expect(response.expand.bySearch).toBeDefined();
    expect(response.expand.fullContext).toBeDefined();

    expect(response.meta).toBeDefined();
    expect(response.meta.scopeType).toBe('project');
    expect(response.meta.scopeId).toBe(projectId);
    expect(response.meta.tokenSavings).toBeDefined();

    // Should NOT have the full entry arrays
    expect(response.tools).toBeUndefined();
    expect(response.guidelines).toBeUndefined();
    expect(response.knowledge).toBeUndefined();
  });

  it('hierarchical context items have snippets, not full content', async () => {
    const response = await queryHandlers.context(context, {
      agentId: AGENT_ID,
      scopeType: 'session',
      scopeId: sessionId,
      inherit: true,
      hierarchical: true,
    });

    // Check that recent items have proper structure
    expect(response.recent.length).toBeGreaterThan(0);
    const item = response.recent[0];
    expect(item.id).toBeDefined();
    expect(item.type).toBeDefined();
    expect(item.title).toBeDefined();
    expect(item.snippet).toBeDefined();
    // Snippets should be compact
    expect(item.snippet.length).toBeLessThanOrEqual(160);
    // Snippets should NOT be empty (version content should be populated)
    expect(item.snippet.length).toBeGreaterThan(0);
  });
});
