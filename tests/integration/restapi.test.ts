import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  cleanupTestDb,
  createTestConversation,
  createTestKnowledge,
  createTestProject,
  createTestTool,
  setupTestDb,
  schema,
} from '../fixtures/test-helpers.js';
import { and, eq } from 'drizzle-orm';

const TEST_DB_PATH = './data/test-restapi.db';

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

import { createServer } from '../../src/restapi/server.js';

describe('REST API Integration', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  it('GET /health returns ok', async () => {
    const app = createServer();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; uptimeSec: number };
    expect(body.ok).toBe(true);
    expect(typeof body.uptimeSec).toBe('number');
    await app.close();
  });

  it('POST /v1/query returns 400 for non-object body', async () => {
    const app = createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/query',
      payload: [],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Request body must be an object' });
    await app.close();
  });

  it('POST /v1/context returns 400 when missing required params', async () => {
    const app = createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/context',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toContain('scopeType is required');
    await app.close();
  });

  it('POST /v1/query can search tools (semanticSearch disabled)', async () => {
    createTestTool(db, 'rest_tool_alpha', 'global', undefined, 'cli', 'Tool for REST search test');

    const app = createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/query',
      payload: {
        types: ['tools'],
        search: 'rest_tool_alpha',
        semanticSearch: false,
        limit: 10,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      results: Array<{ type: string; tool?: { name: string; createdAt?: string } }>;
      meta: { returnedCount: number };
    };
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.some((r) => r.type === 'tool' && r.tool?.name === 'rest_tool_alpha')).toBe(
      true
    );
    expect(typeof body.meta.returnedCount).toBe('number');
    await app.close();
  });

  it('POST /v1/context returns aggregated scope context with inheritance', async () => {
    const project = createTestProject(db, 'REST Context Project');
    createTestTool(db, 'rest_global_tool', 'global');
    createTestKnowledge(db, 'REST Project Knowledge', 'project', project.id);

    const app = createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/context',
      payload: { scopeType: 'project', scopeId: project.id },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      scope: { type: string; id: string | null };
      tools: Array<{ type: string; tool?: { name: string } }>;
      knowledge: Array<{ type: string; knowledge?: { title: string } }>;
    };
    expect(body.scope.type).toBe('project');
    expect(body.scope.id).toBe(project.id);
    expect(body.tools.some((r) => r.type === 'tool' && r.tool?.name === 'rest_global_tool')).toBe(
      true
    );
    expect(
      body.knowledge.some(
        (r) => r.type === 'knowledge' && r.knowledge?.title === 'REST Project Knowledge'
      )
    ).toBe(true);

    await app.close();
  });

  it('POST /v1/query can auto-link results to a conversation', async () => {
    const project = createTestProject(db, 'REST Linking Project');
    const { knowledge } = createTestKnowledge(db, 'REST Linkable Knowledge', 'project', project.id);
    const conversation = createTestConversation(db, undefined, project.id);

    const app = createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/query',
      payload: {
        types: ['knowledge'],
        scope: { type: 'project', id: project.id, inherit: true },
        search: 'REST Linkable Knowledge',
        semanticSearch: false,
        conversationId: conversation.id,
        autoLinkContext: true,
      },
    });

    expect(res.statusCode).toBe(200);

    const links = db
      .select()
      .from(schema.conversationContext)
      .where(
        and(
          eq(schema.conversationContext.conversationId, conversation.id),
          eq(schema.conversationContext.entryId, knowledge.id)
        )
      )
      .all();

    expect(links.length).toBeGreaterThanOrEqual(1);
    await app.close();
  });
});
