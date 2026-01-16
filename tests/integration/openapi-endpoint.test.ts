/**
 * OpenAPI Endpoint Integration Test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../src/restapi/server.js';
import {
  createTestContext,
  setupTestDb,
  cleanupTestDb,
  type TestDb,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = 'data/test/openapi-endpoint-test.db';

describe('OpenAPI Endpoint', () => {
  let app: FastifyInstance;
  let context: AppContext;
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = setupTestDb(TEST_DB_PATH);
    context = await createTestContext(testDb);
    app = await createServer(context);
  });

  afterAll(async () => {
    await app?.close();
    cleanupTestDb(testDb);
  });

  it('should serve OpenAPI spec at /v1/openapi.json', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/openapi.json',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');

    const spec = JSON.parse(response.body);
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('Agent Memory REST API');
  });

  it('should include all required OpenAPI fields', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/openapi.json',
    });

    const spec = JSON.parse(response.body);

    // Check required top-level fields
    expect(spec).toHaveProperty('openapi');
    expect(spec).toHaveProperty('info');
    expect(spec).toHaveProperty('paths');
    expect(spec).toHaveProperty('components');

    // Check info object
    expect(spec.info).toHaveProperty('title');
    expect(spec.info).toHaveProperty('version');
    expect(spec.info).toHaveProperty('description');

    // Check components
    expect(spec.components).toHaveProperty('securitySchemes');
  });

  it('should include security schemes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/openapi.json',
    });

    const spec = JSON.parse(response.body);

    expect(spec.components.securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });

    expect(spec.components.securitySchemes.apiKey).toEqual({
      type: 'apiKey',
      in: 'header',
      name: 'X-API-Key',
    });
  });

  it('should include tool endpoints', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/openapi.json',
    });

    const spec = JSON.parse(response.body);

    // Check for meta endpoints
    expect(spec.paths['/v1/tools']).toBeDefined();
    expect(spec.paths['/v1/openapi.json']).toBeDefined();

    // Check for some tool endpoints
    expect(spec.paths['/v1/tools/memory_knowledge']).toBeDefined();
    expect(spec.paths['/v1/tools/memory_guideline']).toBeDefined();
    expect(spec.paths['/v1/tools/memory_query']).toBeDefined();

    // Verify structure of a tool endpoint
    const knowledgePath = spec.paths['/v1/tools/memory_knowledge'];
    expect(knowledgePath.post).toBeDefined();
    expect(knowledgePath.post.operationId).toBe('memory_knowledge');
    expect(knowledgePath.post.requestBody).toBeDefined();
    expect(knowledgePath.post.responses).toBeDefined();
  });

  it('should include action parameter for action-based tools', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/openapi.json',
    });

    const spec = JSON.parse(response.body);

    const knowledgePath = spec.paths['/v1/tools/memory_knowledge'];
    const schema = knowledgePath.post.requestBody.content['application/json'].schema;

    expect(schema.properties.action).toBeDefined();
    expect(schema.properties.action.type).toBe('string');
    expect(schema.properties.action.enum).toContain('add');
    expect(schema.properties.action.enum).toContain('list');
    expect(schema.required).toContain('action');
  });

  it('should include standard error responses', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/openapi.json',
    });

    const spec = JSON.parse(response.body);

    const knowledgePath = spec.paths['/v1/tools/memory_knowledge'];
    const responses = knowledgePath.post.responses;

    expect(responses['200']).toBeDefined();
    expect(responses['400']).toBeDefined();
    expect(responses['401']).toBeDefined();
    expect(responses['403']).toBeDefined();
    expect(responses['404']).toBeDefined();
    expect(responses['429']).toBeDefined();
  });

  it('should include tags for grouping', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/openapi.json',
    });

    const spec = JSON.parse(response.body);

    expect(spec.tags).toBeDefined();
    expect(Array.isArray(spec.tags)).toBe(true);
    expect(spec.tags.length).toBeGreaterThan(0);

    const tagNames = spec.tags.map((t: { name: string }) => t.name);
    expect(tagNames).toContain('knowledge');
    expect(tagNames).toContain('guideline');
    expect(tagNames).toContain('query');
  });
});
