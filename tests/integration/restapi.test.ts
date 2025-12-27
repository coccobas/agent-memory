import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  cleanupTestDb,
  createTestContext,
  createTestConversation,
  createTestKnowledge,
  createTestProject,
  createTestTool,
  setupTestDb,
  schema,
} from '../fixtures/test-helpers.js';
import { and, eq } from 'drizzle-orm';
import type { AppContext } from '../../src/core/context.js';
import { createServer } from '../../src/restapi/server.js';

const TEST_DB_PATH = './data/test-restapi.db';
const REST_API_KEY = 'test-rest-api-key';
const REST_AGENT_ID = 'rest-test-agent';

let testDb: ReturnType<typeof setupTestDb>;
let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let context: AppContext;
let previousApiKey: string | undefined;
let previousRestAgentId: string | undefined;
let previousPermMode: string | undefined;

describe('REST API Integration', () => {
  beforeAll(async () => {
    previousApiKey = process.env.AGENT_MEMORY_REST_API_KEY;
    previousRestAgentId = process.env.AGENT_MEMORY_REST_AGENT_ID;
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_REST_API_KEY = REST_API_KEY;
    process.env.AGENT_MEMORY_REST_AGENT_ID = REST_AGENT_ID;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = await createTestContext(testDb);
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
    process.env.AGENT_MEMORY_REST_API_KEY = previousApiKey;
    process.env.AGENT_MEMORY_REST_AGENT_ID = previousRestAgentId;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
  });

  it('GET /health returns ok', async () => {
    const app = await createServer(context);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; uptimeSec: number };
    expect(body.ok).toBe(true);
    expect(typeof body.uptimeSec).toBe('number');
    await app.close();
  });

  it('POST /v1/query rejects unauthorized requests', async () => {
    const app = await createServer(context);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/query',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('POST /v1/query returns 400 for non-object body', async () => {
    const app = await createServer(context);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/query',
      headers: { authorization: `Bearer ${REST_API_KEY}` },
      payload: [],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Request body must be an object' });
    await app.close();
  });

  it('POST /v1/context returns 400 when missing required params', async () => {
    const app = await createServer(context);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/context',
      headers: { authorization: `Bearer ${REST_API_KEY}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toMatch(/scopeType.*is required/);
    await app.close();
  });

  it('POST /v1/query can search tools (semanticSearch disabled)', async () => {
    createTestTool(db, 'rest_tool_alpha', 'global', undefined, 'cli', 'Tool for REST search test');

    const app = await createServer(context);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/query',
      headers: { authorization: `Bearer ${REST_API_KEY}` },
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

    const app = await createServer(context);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/context',
      headers: { authorization: `Bearer ${REST_API_KEY}` },
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

    const app = await createServer(context);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/query',
      headers: { authorization: `Bearer ${REST_API_KEY}` },
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

  describe('Security Headers', () => {
    it('should include helmet security headers in responses', async () => {
      const app = await createServer(context);
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      // Check for helmet security headers
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-xss-protection']).toBeDefined();
      expect(res.headers['strict-transport-security']).toContain('max-age=31536000');

      await app.close();
    });

    it('should include CSP headers', async () => {
      const app = await createServer(context);
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");

      await app.close();
    });
  });

  describe('Rate Limit Headers', () => {
    it('should include rate limit headers in successful authenticated requests', async () => {
      const app = await createServer(context);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/query',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          types: ['knowledge'],
          search: 'test',
          semanticSearch: false,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBeDefined();
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
      expect(res.headers['x-ratelimit-reset']).toBeDefined();

      // Validate that values are numbers
      expect(Number(res.headers['x-ratelimit-limit'])).toBeGreaterThan(0);
      expect(Number(res.headers['x-ratelimit-remaining'])).toBeGreaterThanOrEqual(0);
      expect(Number(res.headers['x-ratelimit-reset'])).toBeGreaterThan(0);

      await app.close();
    });

    it('should include rate limit headers in rate limited responses', async () => {
      const app = await createServer(context);

      // Make many requests to trigger rate limit
      const requests = Array.from({ length: 120 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: '/v1/query',
          headers: { authorization: `Bearer ${REST_API_KEY}` },
          payload: { types: ['knowledge'], search: `test-${i}`, semanticSearch: false },
        })
      );

      const responses = await Promise.all(requests);

      // Find a rate limited response (429)
      const rateLimited = responses.find((r) => r.statusCode === 429);

      if (rateLimited) {
        expect(rateLimited.headers['x-ratelimit-limit']).toBeDefined();
        expect(rateLimited.headers['x-ratelimit-remaining']).toBe('0');
        expect(rateLimited.headers['x-ratelimit-reset']).toBeDefined();
        expect(rateLimited.headers['retry-after']).toBeDefined();
      }

      await app.close();
    });

    it('should declare rate limit headers in CORS configuration', async () => {
      const app = await createServer(context);

      // The CORS configuration is set during server creation
      // We verify the headers are properly exposed by checking actual response headers
      // when CORS is enabled (requires setting AGENT_MEMORY_REST_CORS_ORIGINS)
      const previousCorsOrigins = process.env.AGENT_MEMORY_REST_CORS_ORIGINS;

      try {
        process.env.AGENT_MEMORY_REST_CORS_ORIGINS = 'http://localhost:3000';
        const appWithCors = await createServer(context);

        const res = await appWithCors.inject({
          method: 'OPTIONS',
          url: '/v1/query',
          headers: {
            origin: 'http://localhost:3000',
            'access-control-request-method': 'POST',
          },
        });

        const exposedHeaders = res.headers['access-control-expose-headers'];
        expect(exposedHeaders).toBeDefined();
        if (typeof exposedHeaders === 'string') {
          expect(exposedHeaders).toContain('X-RateLimit-Limit');
          expect(exposedHeaders).toContain('X-RateLimit-Remaining');
          expect(exposedHeaders).toContain('X-RateLimit-Reset');
        }

        await appWithCors.close();
      } finally {
        process.env.AGENT_MEMORY_REST_CORS_ORIGINS = previousCorsOrigins;
      }

      await app.close();
    });
  });
});
