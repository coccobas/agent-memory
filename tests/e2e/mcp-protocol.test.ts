/**
 * E2E tests for MCP Protocol
 *
 * These tests verify the full JSON-RPC message flow through the MCP protocol,
 * testing CallToolRequest → runTool() → CallToolResult format.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestContext,
  createTestProject,
  createTestGuideline,
  createTestTool,
  createTestKnowledge,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-mcp-protocol.db';

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
    getSqlite: () => sqlite,
    getPreparedStatement: (sql: string) => sqlite.prepare(sql),
  };
});

import { runTool } from '../../src/mcp/tool-runner.js';

describe('MCP Protocol E2E', () => {
  const AGENT_ID = 'e2e-agent';
  let projectId: string;
  let guidelineId: string;
  let toolId: string;
  let knowledgeId: string;
  let previousPermMode: string | undefined;

  beforeAll(async () => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';

    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = await createTestContext(testDb);

    // Create test data
    const project = createTestProject(db, 'E2E Protocol Test Project');
    projectId = project.id;

    const guideline = createTestGuideline(
      db,
      'e2e-security-rule',
      'project',
      projectId,
      'security',
      90,
      'Always validate user input before processing'
    );
    guidelineId = guideline.guideline.id;

    const tool = createTestTool(db, 'e2e-cli-tool', 'project', projectId, 'cli', 'A test CLI tool');
    toolId = tool.tool.id;

    const knowledge = createTestKnowledge(
      db,
      'E2E Design Decision',
      'project',
      projectId,
      'decision',
      'We decided to use TypeScript for type safety'
    );
    knowledgeId = knowledge.knowledge.id;
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

  describe('CallToolResult format', () => {
    it('should return proper CallToolResult with content array on success', async () => {
      const result = await runTool(context, 'memory_query', {
        action: 'context',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      expect(result.isError).toBeFalsy();
    });

    it('should return isError flag on unknown tool', async () => {
      const result = await runTool(context, 'nonexistent_tool', {
        action: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text as string);
      // Error format: {error, code, context} - no success field
      expect(parsed.error).toBeDefined();
    });

    it('should return proper error format with error codes', async () => {
      // Try to get a non-existent entry
      const result = await runTool(context, 'memory_guideline', {
        action: 'get',
        id: 'nonexistent-id-12345',
        agentId: AGENT_ID,
      });

      expect(result.isError).toBe(true);

      const parsed = JSON.parse(result.content[0].text as string);
      // Error format: {error, code, context}
      expect(parsed.error).toBeDefined();
      expect(parsed.code).toBeDefined();
    });
  });

  describe('memory_query tool', () => {
    it('should return context for project scope', async () => {
      const result = await runTool(context, 'memory_query', {
        action: 'context',
        scopeType: 'project',
        scopeId: projectId,
        inherit: true,
        agentId: AGENT_ID,
      });

      expect(result.isError).toBeFalsy();

      const parsed = JSON.parse(result.content[0].text as string);
      // Context action returns scope info directly
      expect(parsed.scope).toBeDefined();
      expect(parsed.scope.type).toBe('project');
    });

    it('should search entries by text', async () => {
      const result = await runTool(context, 'memory_query', {
        action: 'search',
        search: 'security',
        types: ['guidelines'],
        scope: { type: 'project', id: projectId, inherit: true },
        agentId: AGENT_ID,
      });

      expect(result.isError).toBeFalsy();

      const parsed = JSON.parse(result.content[0].text as string);
      // Search returns results array
      expect(parsed.results).toBeDefined();
      expect(Array.isArray(parsed.results)).toBe(true);
    });

    it('should search across multiple entry types', async () => {
      const result = await runTool(context, 'memory_query', {
        action: 'search',
        search: 'e2e',
        types: ['guidelines', 'tools', 'knowledge'],
        scope: { type: 'project', id: projectId, inherit: true },
        agentId: AGENT_ID,
      });

      expect(result.isError).toBeFalsy();

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.results).toBeDefined();
      expect(parsed.results.length).toBeGreaterThan(0);

      // Should find multiple types
      const types = new Set(parsed.results.map((r: { type: string }) => r.type));
      expect(types.size).toBeGreaterThan(0);
    });

    it('should return pagination metadata', async () => {
      const result = await runTool(context, 'memory_query', {
        action: 'search',
        types: ['guidelines', 'tools'],
        scope: { type: 'project', id: projectId, inherit: true },
        limit: 5,
        agentId: AGENT_ID,
      });

      expect(result.isError).toBeFalsy();

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.meta).toBeDefined();
      expect(parsed.meta.returnedCount).toBeDefined();
    });
  });

  describe('memory_guideline tool', () => {
    it('should get guideline by id', async () => {
      const result = await runTool(context, 'memory_guideline', {
        action: 'get',
        id: guidelineId,
        agentId: AGENT_ID,
      });

      expect(result.isError).toBeFalsy();

      const parsed = JSON.parse(result.content[0].text as string);
      // Success response has guideline object
      expect(parsed.guideline).toBeDefined();
      expect(parsed.guideline.id).toBe(guidelineId);
      expect(parsed.guideline.name).toBe('e2e-security-rule');
    });

    it('should list guidelines with filters', async () => {
      const result = await runTool(context, 'memory_guideline', {
        action: 'list',
        scopeType: 'project',
        scopeId: projectId,
        category: 'security',
        agentId: AGENT_ID,
      });

      expect(result.isError).toBeFalsy();

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.guidelines).toBeDefined();
      expect(parsed.guidelines.length).toBeGreaterThan(0);
    });

    it('should add a new guideline', async () => {
      const result = await runTool(context, 'memory_guideline', {
        action: 'add',
        scopeType: 'project',
        scopeId: projectId,
        name: 'e2e-new-guideline',
        content: 'A new guideline created via E2E test',
        category: 'testing',
        priority: 50,
        agentId: AGENT_ID,
      });

      expect(result.isError).toBeFalsy();

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.success).toBe(true);
      expect(parsed.guideline).toBeDefined();
      expect(parsed.guideline.name).toBe('e2e-new-guideline');
    });
  });

  describe('memory_tool tool', () => {
    it('should get tool by id', async () => {
      const result = await runTool(context, 'memory_tool', {
        action: 'get',
        id: toolId,
        agentId: AGENT_ID,
      });

      expect(result.isError).toBeFalsy();

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.tool).toBeDefined();
      expect(parsed.tool.id).toBe(toolId);
    });

    it('should list tools', async () => {
      const result = await runTool(context, 'memory_tool', {
        action: 'list',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });

      expect(result.isError).toBeFalsy();

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.tools).toBeDefined();
    });
  });

  describe('memory_knowledge tool', () => {
    it('should get knowledge by id', async () => {
      const result = await runTool(context, 'memory_knowledge', {
        action: 'get',
        id: knowledgeId,
        agentId: AGENT_ID,
      });

      expect(result.isError).toBeFalsy();

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.knowledge).toBeDefined();
      expect(parsed.knowledge.id).toBe(knowledgeId);
    });

    it('should list knowledge entries', async () => {
      const result = await runTool(context, 'memory_knowledge', {
        action: 'list',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });

      expect(result.isError).toBeFalsy();

      const parsed = JSON.parse(result.content[0].text as string);
      // Knowledge list uses 'knowledge' as key (not 'entries')
      expect(parsed.knowledge).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should return validation error for missing required params', async () => {
      const result = await runTool(context, 'memory_guideline', {
        action: 'add',
        // Missing required: scopeType, name, content
        agentId: AGENT_ID,
      });

      expect(result.isError).toBe(true);

      const parsed = JSON.parse(result.content[0].text as string);
      // Error format: {error, code, context} - no success field
      expect(parsed.error).toBeDefined();
    });

    it('should return not found error for missing entries', async () => {
      const result = await runTool(context, 'memory_knowledge', {
        action: 'get',
        id: 'does-not-exist-12345',
        agentId: AGENT_ID,
      });

      expect(result.isError).toBe(true);

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.code).toMatch(/E2/); // E2XXX = Not Found errors
    });

    it('should return invalid action error for unknown actions', async () => {
      const result = await runTool(context, 'memory_guideline', {
        action: 'unknown_action',
        agentId: AGENT_ID,
      });

      expect(result.isError).toBe(true);

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.error).toBeDefined();
    });
  });
});
