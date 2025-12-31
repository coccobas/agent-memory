/**
 * Integration tests for REST API Tools Endpoints
 *
 * Tests the new REST API tools endpoints that expose all 29 MCP tools via HTTP:
 * - GET /v1/tools - List all available tools
 * - POST /v1/tools/:tool - Execute a tool by name
 * - GET /v1/openapi.json - Get OpenAPI specification
 *
 * Created files:
 * - src/restapi/adapters/mcp-rest-adapter.ts
 * - src/restapi/controllers/tools.controller.ts
 * - src/restapi/routes/tools.ts
 * - src/restapi/middleware/tool-validator.ts
 * - src/restapi/openapi/generator.ts
 * - src/restapi/openapi/schema-converter.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AppContext } from '../../src/core/context.js';
import { createServer } from '../../src/restapi/server.js';
import {
  cleanupTestDb,
  createTestContext,
  createTestProject,
  setupTestDb,
} from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-rest-tools.db';
const REST_API_KEY = 'test-rest-tools-api-key';
const REST_AGENT_ID = 'rest-tools-test-agent';
const ADMIN_KEY = 'test-admin-key-12345';

let testDb: ReturnType<typeof setupTestDb>;
let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let context: AppContext;
let previousApiKey: string | undefined;
let previousRestAgentId: string | undefined;
let previousPermMode: string | undefined;
let previousAdminKey: string | undefined;

describe('REST API Tools Endpoints', () => {
  beforeAll(async () => {
    // Save and set environment variables
    previousApiKey = process.env.AGENT_MEMORY_REST_API_KEY;
    previousRestAgentId = process.env.AGENT_MEMORY_REST_AGENT_ID;
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    previousAdminKey = process.env.AGENT_MEMORY_ADMIN_KEY;
    process.env.AGENT_MEMORY_REST_API_KEY = REST_API_KEY;
    process.env.AGENT_MEMORY_REST_AGENT_ID = REST_AGENT_ID;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    process.env.AGENT_MEMORY_ADMIN_KEY = ADMIN_KEY;

    // Setup test database and context
    testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = await createTestContext(testDb);
  });

  afterAll(() => {
    // Cleanup
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);

    // Restore environment variables
    process.env.AGENT_MEMORY_REST_API_KEY = previousApiKey;
    process.env.AGENT_MEMORY_REST_AGENT_ID = previousRestAgentId;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    process.env.AGENT_MEMORY_ADMIN_KEY = previousAdminKey;
  });

  describe('GET /v1/tools - List Tools', () => {
    it('should return list of all MCP tools', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/tools',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
      });

      expect(res.statusCode).toBe(200);

      const body = res.json() as {
        tools: Array<{
          name: string;
          description: string;
          hasActions: boolean;
          actions?: string[];
        }>;
        count: number;
      };

      // Verify response structure
      expect(body.tools).toBeDefined();
      expect(Array.isArray(body.tools)).toBe(true);
      expect(body.count).toBe(42); // Expect all 42 MCP tools (including graph_node, graph_edge, memory_context, memory_remember, memory_suggest, memory_quickstart, memory_task, memory_evidence)

      // Verify specific tools are present
      const toolNames = body.tools.map((t) => t.name);
      expect(toolNames).toContain('memory_health');
      expect(toolNames).toContain('memory_project');
      expect(toolNames).toContain('memory_knowledge');
      expect(toolNames).toContain('memory_guideline');
      expect(toolNames).toContain('memory_query');

      // Verify action-based tool has actions listed
      const projectTool = body.tools.find((t) => t.name === 'memory_project');
      expect(projectTool).toBeDefined();
      expect(projectTool?.hasActions).toBe(true);
      expect(projectTool?.actions).toBeDefined();
      expect(projectTool?.actions).toContain('create');
      expect(projectTool?.actions).toContain('list');
      expect(projectTool?.actions).toContain('get');

      // Verify simple tool has no actions
      const healthTool = body.tools.find((t) => t.name === 'memory_health');
      expect(healthTool).toBeDefined();
      expect(healthTool?.hasActions).toBe(false);
      expect(healthTool?.actions).toBeUndefined();

      await app.close();
    });

    it('should require authentication', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/tools',
        // No authorization header
      });

      expect(res.statusCode).toBe(401);
      const body = res.json() as { error: string; code: string };
      expect(body.code).toBe('UNAUTHORIZED');

      await app.close();
    });

    it('should include all required tool metadata', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/tools',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
      });

      expect(res.statusCode).toBe(200);

      const body = res.json() as {
        tools: Array<{
          name: string;
          description: string;
          hasActions: boolean;
        }>;
      };

      // Every tool should have required fields
      body.tools.forEach((tool) => {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(typeof tool.hasActions).toBe('boolean');
      });

      await app.close();
    });
  });

  describe('POST /v1/tools/:tool - Execute Simple Tool', () => {
    it('should execute memory_health tool (simple tool, no action)', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_health',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {},
      });

      expect(res.statusCode).toBe(200);

      const body = res.json() as {
        success: boolean;
        data: {
          serverVersion: string;
          status: string;
          database: { type: string };
          cache: { size: number };
        };
      };

      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.serverVersion).toBeDefined();
      expect(body.data.status).toBeDefined();
      expect(body.data.database).toBeDefined();
      expect(body.data.cache).toBeDefined();

      await app.close();
    });

    it('should accept empty object payload for simple tools', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_health',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { success: boolean };
      expect(body.success).toBe(true);

      await app.close();
    });
  });

  describe('POST /v1/tools/:tool - Execute Action-Based Tool', () => {
    it('should execute memory_project with action:list', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_project',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          action: 'list',
        },
      });

      expect(res.statusCode).toBe(200);

      const body = res.json() as {
        success: boolean;
        data: { projects: Array<unknown> };
      };

      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data.projects)).toBe(true);

      await app.close();
    });

    it('should execute memory_project with action:create', async () => {
      const app = await createServer(context);

      const projectName = 'REST Tools Test Project';

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_project',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          action: 'create',
          name: projectName,
          description: 'Test project for REST tools',
          adminKey: ADMIN_KEY, // Required for project creation
        },
      });

      expect(res.statusCode).toBe(200);

      const body = res.json() as {
        success: boolean;
        data: { project: { id: string; name: string } };
      };

      expect(body.success).toBe(true);
      expect(body.data.project).toBeDefined();
      expect(body.data.project.name).toBe(projectName);
      expect(body.data.project.id).toBeDefined();

      await app.close();
    });

    it('should accept params object for action-based tools', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_project',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          action: 'list',
          params: {
            limit: 10,
            offset: 0,
          },
        },
      });

      expect(res.statusCode).toBe(200);

      const body = res.json() as { success: boolean };
      expect(body.success).toBe(true);

      await app.close();
    });

    it('should merge body params with params object', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_project',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          action: 'list',
          limit: 5,
          offset: 0,
        },
      });

      expect(res.statusCode).toBe(200);

      const body = res.json() as { success: boolean };
      expect(body.success).toBe(true);

      await app.close();
    });
  });

  describe('POST /v1/tools/:tool - Error Handling', () => {
    it('should return 404 for unknown tool', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/unknown_tool',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {},
      });

      expect(res.statusCode).toBe(404);

      const body = res.json() as {
        success: boolean;
        error: { message: string; code: string };
      };

      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('unknown_tool');
      expect(body.error.message).toContain('not found');

      await app.close();
    });

    it('should return 400 for action-based tool without action', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_project',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          // Missing required 'action' parameter
          name: 'Test',
        },
      });

      expect(res.statusCode).toBe(400);

      const body = res.json() as {
        success: boolean;
        error: {
          message: string;
          code: string;
          details?: { validActions: string[] };
        };
      };

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MISSING_ACTION');
      expect(body.error.message).toContain('action');
      expect(body.error.details).toBeDefined();
      expect(body.error.details?.validActions).toBeDefined();
      expect(Array.isArray(body.error.details?.validActions)).toBe(true);

      await app.close();
    });

    it('should return 400 for action-based tool with invalid action', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_project',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          action: 'invalid_action',
        },
      });

      expect(res.statusCode).toBe(400);

      const body = res.json() as {
        success: boolean;
        error: {
          message: string;
          code: string;
          details?: { providedAction: string; validActions: string[] };
        };
      };

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_ACTION');
      expect(body.error.message).toContain('invalid_action');
      expect(body.error.details).toBeDefined();
      expect(body.error.details?.providedAction).toBe('invalid_action');
      expect(body.error.details?.validActions).toBeDefined();
      expect(Array.isArray(body.error.details?.validActions)).toBe(true);

      await app.close();
    });

    it('should return 415 for non-JSON request body', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_health',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: 'not an object',
      });

      // Fastify returns 415 Unsupported Media Type for non-JSON payloads
      expect(res.statusCode).toBe(415);

      await app.close();
    });

    it('should return 401 without authentication', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_health',
        // No authorization header
        payload: {},
      });

      expect(res.statusCode).toBe(401);

      const body = res.json() as { error: string; code: string };
      expect(body.code).toBe('UNAUTHORIZED');

      await app.close();
    });
  });

  describe('POST /v1/tools/:tool - Complex Tool Execution', () => {
    it('should execute memory_query with search parameters', async () => {
      const app = await createServer(context);

      // Create test data first
      const project = createTestProject(db, 'Query Test Project');

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_query',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          action: 'search',
          search: 'test',
          types: ['knowledge'],
          scope: {
            type: 'project',
            id: project.id,
            inherit: true,
          },
          limit: 10,
        },
      });

      expect(res.statusCode).toBe(200);

      const body = res.json() as {
        success: boolean;
        data: { results: Array<unknown>; meta: { returnedCount: number } };
      };

      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data.results)).toBe(true);
      expect(body.data.meta).toBeDefined();
      expect(typeof body.data.meta.returnedCount).toBe('number');

      await app.close();
    });

    it('should execute memory_knowledge with add action', async () => {
      const app = await createServer(context);

      const project = createTestProject(db, 'Knowledge Test Project');

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_knowledge',
        headers: {
          authorization: `Bearer ${REST_API_KEY}`,
          'x-agent-id': REST_AGENT_ID,
        },
        payload: {
          action: 'add',
          scopeType: 'project',
          scopeId: project.id,
          title: 'REST API Test Knowledge',
          content: 'Test content for REST API',
          agentId: REST_AGENT_ID,
        },
      });

      expect(res.statusCode).toBe(200);

      const body = res.json() as {
        success: boolean;
        data: { knowledge: { id: string; title: string } };
      };

      expect(body.success).toBe(true);
      expect(body.data.knowledge).toBeDefined();
      expect(body.data.knowledge.title).toBe('REST API Test Knowledge');
      expect(body.data.knowledge.id).toBeDefined();

      await app.close();
    });
  });

  describe('GET /v1/openapi.json - OpenAPI Specification', () => {
    it('should return valid OpenAPI 3.0 specification', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/openapi.json',
        // OpenAPI spec is public - no auth required
      });

      expect(res.statusCode).toBe(200);

      const spec = res.json() as {
        openapi: string;
        info: { title: string; version: string };
        paths: Record<string, unknown>;
        components: { securitySchemes: Record<string, unknown> };
      };

      // Verify OpenAPI version
      expect(spec.openapi).toBe('3.0.3');

      // Verify info section
      expect(spec.info).toBeDefined();
      expect(spec.info.title).toBe('Agent Memory REST API');
      expect(spec.info.version).toBeDefined();

      // Verify paths section
      expect(spec.paths).toBeDefined();
      expect(Object.keys(spec.paths).length).toBeGreaterThan(0);

      // Verify security schemes
      expect(spec.components).toBeDefined();
      expect(spec.components.securitySchemes).toBeDefined();
      expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
      expect(spec.components.securitySchemes.apiKey).toBeDefined();

      await app.close();
    });

    it('should include all tool endpoints in OpenAPI spec', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/openapi.json',
      });

      expect(res.statusCode).toBe(200);

      const spec = res.json() as {
        paths: Record<string, unknown>;
      };

      // Verify key endpoints are documented
      expect(spec.paths['/v1/tools']).toBeDefined();
      expect(spec.paths['/v1/openapi.json']).toBeDefined();
      expect(spec.paths['/v1/tools/memory_health']).toBeDefined();
      expect(spec.paths['/v1/tools/memory_project']).toBeDefined();
      expect(spec.paths['/v1/tools/memory_knowledge']).toBeDefined();

      await app.close();
    });

    it('should include proper security definitions', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/openapi.json',
      });

      expect(res.statusCode).toBe(200);

      const spec = res.json() as {
        components: {
          securitySchemes: {
            bearerAuth?: { type: string; scheme?: string };
            apiKey?: { type: string; in?: string; name?: string };
          };
        };
      };

      // Verify bearer auth
      expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
      expect(spec.components.securitySchemes.bearerAuth?.type).toBe('http');
      expect(spec.components.securitySchemes.bearerAuth?.scheme).toBe('bearer');

      // Verify API key auth
      expect(spec.components.securitySchemes.apiKey).toBeDefined();
      expect(spec.components.securitySchemes.apiKey?.type).toBe('apiKey');
      expect(spec.components.securitySchemes.apiKey?.in).toBe('header');
      expect(spec.components.securitySchemes.apiKey?.name).toBe('X-API-Key');

      await app.close();
    });

    it('should return content-type application/json', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/openapi.json',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');

      await app.close();
    });
  });

  describe('Authentication and Authorization', () => {
    it('should accept Bearer token authentication', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_health',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {},
      });

      expect(res.statusCode).toBe(200);

      await app.close();
    });

    it('should accept X-API-Key header authentication', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_health',
        headers: { 'x-api-key': REST_API_KEY },
        payload: {},
      });

      expect(res.statusCode).toBe(200);

      await app.close();
    });

    it('should reject invalid API key', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_health',
        headers: { authorization: 'Bearer invalid-key' },
        payload: {},
      });

      expect(res.statusCode).toBe(401);

      await app.close();
    });

    it('should extract agentId from request context', async () => {
      const app = await createServer(context);

      const project = createTestProject(db, 'Agent ID Test Project');

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_knowledge',
        headers: {
          authorization: `Bearer ${REST_API_KEY}`,
          'x-agent-id': 'custom-agent-id',
        },
        payload: {
          action: 'add',
          scopeType: 'project',
          scopeId: project.id,
          title: 'Agent ID Test',
          content: 'Test content',
        },
      });

      expect(res.statusCode).toBe(200);

      const body = res.json() as {
        success: boolean;
        data: { knowledge: { id: string } };
      };

      expect(body.success).toBe(true);

      await app.close();
    });
  });

  describe('Edge Cases and Validation', () => {
    it('should handle action as null for action-based tool', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_project',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          action: null,
        },
      });

      expect(res.statusCode).toBe(400);

      const body = res.json() as {
        success: boolean;
        error: { message: string; code: string };
      };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MISSING_ACTION');

      await app.close();
    });

    it('should handle action as number for action-based tool', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_project',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          action: 123,
        },
      });

      expect(res.statusCode).toBe(400);

      const body = res.json() as {
        success: boolean;
        error: { message: string; code: string };
      };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_ACTION_TYPE');

      await app.close();
    });

    it('should handle array payload gracefully', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_health',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: [],
      });

      expect(res.statusCode).toBe(400);

      const body = res.json() as {
        success: boolean;
        error: { code: string };
      };

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_PARAMETER');

      await app.close();
    });

    it('should handle deeply nested params object', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_query',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          action: 'search',
          params: {
            search: 'test',
            types: ['knowledge'],
            scope: {
              type: 'global',
              inherit: true,
            },
          },
        },
      });

      expect(res.statusCode).toBe(200);

      const body = res.json() as { success: boolean };
      expect(body.success).toBe(true);

      await app.close();
    });

    it('should handle empty string tool name gracefully', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {},
      });

      // This will likely result in a 404 from Fastify routing
      expect([404, 400]).toContain(res.statusCode);

      await app.close();
    });
  });

  describe('Response Format Consistency', () => {
    it('should return consistent success response format', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_health',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {},
      });

      expect(res.statusCode).toBe(200);

      const body = res.json() as {
        success: boolean;
        data?: unknown;
        error?: unknown;
      };

      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.error).toBeUndefined();

      await app.close();
    });

    it('should return consistent error response format', async () => {
      const app = await createServer(context);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tools/unknown_tool',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {},
      });

      expect(res.statusCode).toBe(404);

      const body = res.json() as {
        success: boolean;
        data?: unknown;
        error?: {
          message: string;
          code: string;
          details?: Record<string, unknown>;
        };
      };

      expect(body.success).toBe(false);
      expect(body.data).toBeUndefined();
      expect(body.error).toBeDefined();
      expect(body.error?.message).toBeDefined();
      expect(body.error?.code).toBeDefined();

      await app.close();
    });
  });
});
