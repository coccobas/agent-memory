/**
 * REST API Tool Endpoints Integration Test
 *
 * Tests the tool listing and execution endpoints:
 * - GET /v1/tools - List all available tools
 * - POST /v1/tools/:tool - Execute a tool
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../src/restapi/server.js';
import {
  createTestContext,
  setupTestDb,
  cleanupTestDb,
  createTestProject,
  type TestDb,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = 'data/test/rest-tool-endpoints-test.db';
const REST_API_KEY = 'test-tool-api-key';
const TEST_ADMIN_KEY = 'test-admin-key';

describe('REST Tool Endpoints', () => {
  let app: FastifyInstance;
  let context: AppContext;
  let testDb: TestDb;
  let previousApiKey: string | undefined;
  let previousPermMode: string | undefined;
  let previousAdminKey: string | undefined;

  beforeAll(async () => {
    // Set up test environment
    previousApiKey = process.env.AGENT_MEMORY_REST_API_KEY;
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    previousAdminKey = process.env.AGENT_MEMORY_ADMIN_KEY;
    process.env.AGENT_MEMORY_REST_API_KEY = REST_API_KEY;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    process.env.AGENT_MEMORY_ADMIN_KEY = TEST_ADMIN_KEY;

    testDb = setupTestDb(TEST_DB_PATH);
    context = await createTestContext(testDb);
    app = await createServer(context);
  });

  afterAll(async () => {
    await app?.close();
    cleanupTestDb(testDb);
    process.env.AGENT_MEMORY_REST_API_KEY = previousApiKey;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    process.env.AGENT_MEMORY_ADMIN_KEY = previousAdminKey;
  });

  describe('GET /v1/tools', () => {
    it('should list all available tools', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/tools',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body).toHaveProperty('tools');
      expect(body).toHaveProperty('count');
      expect(Array.isArray(body.tools)).toBe(true);
      expect(body.tools.length).toBeGreaterThan(0);
    });

    it('should include tool metadata', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/tools',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
      });

      const body = JSON.parse(response.body);
      const knowledgeTool = body.tools.find((t: any) => t.name === 'memory_knowledge');

      expect(knowledgeTool).toBeDefined();
      expect(knowledgeTool.name).toBe('memory_knowledge');
      expect(knowledgeTool.description).toBeDefined();
      expect(knowledgeTool.hasActions).toBe(true);
      expect(Array.isArray(knowledgeTool.actions)).toBe(true);
      expect(knowledgeTool.actions).toContain('add');
      expect(knowledgeTool.actions).toContain('list');
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/tools',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /v1/tools/:tool', () => {
    it('should return 404 for unknown tool', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/tools/nonexistent_tool',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: { action: 'test' },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for missing action on action-based tool', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_knowledge',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: { someParam: 'value' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('Missing required parameter');
      expect(body.error.code).toBe('MISSING_ACTION');
    });

    it('should return 400 for invalid action', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_knowledge',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: { action: 'invalid_action' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('Invalid action');
      expect(body.error.code).toBe('INVALID_ACTION');
    });

    it('should execute memory_project list action', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_project',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: { action: 'list' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data).toHaveProperty('projects');
      expect(Array.isArray(body.data.projects)).toBe(true);
    });

    it('should execute memory_project create and get actions', async () => {
      // Create project
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_project',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          action: 'create',
          name: 'REST Tool Test Project',
          description: 'Project created via REST tool endpoint',
          adminKey: TEST_ADMIN_KEY,
        },
      });

      expect(createResponse.statusCode).toBe(200);
      const createBody = JSON.parse(createResponse.body);
      expect(createBody.success).toBe(true);
      expect(createBody.data).toHaveProperty('project');
      expect(createBody.data.project).toHaveProperty('id');
      expect(createBody.data.project.name).toBe('REST Tool Test Project');

      const projectId = createBody.data.project.id;

      // Get project
      const getResponse = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_project',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          action: 'get',
          id: projectId,
        },
      });

      expect(getResponse.statusCode).toBe(200);
      const getBody = JSON.parse(getResponse.body);
      expect(getBody.success).toBe(true);
      expect(getBody.data).toHaveProperty('project');
      expect(getBody.data.project.id).toBe(projectId);
      expect(getBody.data.project.name).toBe('REST Tool Test Project');
    });

    it('should execute memory_knowledge add action with agentId', async () => {
      const project = createTestProject(testDb.db, 'Knowledge Test Project');

      const response = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_knowledge',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          action: 'add',
          scopeType: 'project',
          scopeId: project.id,
          title: 'REST Tool Knowledge Entry',
          content: 'This knowledge entry was created via REST tool endpoint',
          agentId: 'rest-test-agent',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('knowledge');
      expect(body.data.knowledge).toHaveProperty('id');
      expect(body.data.knowledge.title).toBe('REST Tool Knowledge Entry');
    });

    it('should accept params in nested params object', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_project',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          action: 'list',
          params: {
            limit: 5,
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_project',
        payload: { action: 'list' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should extract agentId from request context', async () => {
      const project = createTestProject(testDb.db, 'Agent ID Test Project');

      // Create knowledge without explicit agentId - should use authenticated agent
      const response = await app.inject({
        method: 'POST',
        url: '/v1/tools/memory_knowledge',
        headers: { authorization: `Bearer ${REST_API_KEY}` },
        payload: {
          action: 'add',
          scopeType: 'project',
          scopeId: project.id,
          title: 'Auto Agent ID Entry',
          content: 'Created without explicit agentId',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });
});
