/**
 * Comprehensive UX Flow Tests - End-to-End
 *
 * Tests every MCP tool flow as an end user would experience them.
 * Uses real database and full context to verify complete user journeys.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestContext } from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-ux-flows.db';

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

function parseResponse(result: Awaited<ReturnType<typeof runTool>>) {
  const textContent = result.content.find((c) => c.type === 'text');
  return JSON.parse((textContent as { text: string })?.text ?? '{}');
}

function assertSuccess(response: Record<string, unknown>, context?: string) {
  if (response.error) {
    throw new Error(
      `Expected success but got error: ${response.error}${context ? ` (${context})` : ''}`
    );
  }
}

describe('UX Flow Tests', () => {
  const AGENT_ID = 'ux-test-agent';
  let previousPermMode: string | undefined;

  beforeAll(async () => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';

    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = await createTestContext(testDb);
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

  describe('1. Core Workflow: quickstart → remember → query → status', () => {
    let projectId: string;
    let sessionId: string;

    it('should initialize with quickstart', async () => {
      const result = await runTool(context, 'memory_quickstart', {
        sessionName: 'UX Test Session',
        projectName: 'UX Test Project',
        createProject: true,
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'quickstart');

      expect(response.session?.session?.id).toBeDefined();
      expect(response.quickstart?.projectId).toBeDefined();

      projectId = response.quickstart.projectId;
      sessionId = response.session.session.id;
    });

    it('should remember a guideline', async () => {
      const result = await runTool(context, 'memory_remember', {
        text: 'Rule: Always use TypeScript strict mode in this project',
        projectId,
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'remember guideline');
      expect(response.stored?.type).toBe('guideline');
    });

    it('should remember knowledge', async () => {
      const result = await runTool(context, 'memory_remember', {
        text: 'We decided to use PostgreSQL for the database',
        projectId,
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'remember knowledge');
      expect(response.stored?.type).toBe('knowledge');
    });

    it('should remember a tool', async () => {
      const result = await runTool(context, 'memory_remember', {
        text: 'npm run test:coverage to check test coverage',
        projectId,
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'remember tool');
      expect(response.stored?.type).toBe('tool');
    });

    it('should query context', async () => {
      const result = await runTool(context, 'memory_query', {
        action: 'context',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'query context');
      expect(response.guidelines?.length).toBeGreaterThanOrEqual(1);
      expect(response.knowledge?.length).toBeGreaterThanOrEqual(1);
      expect(response.tools?.length).toBeGreaterThanOrEqual(1);
    });

    it('should get status', async () => {
      const result = await runTool(context, 'memory_status', {
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'status');
      expect(response.project).toBeDefined();
    });
  });

  describe('2. Session Lifecycle: start → work → end → list', () => {
    let projectId: string;
    let sessionId: string;

    it('should create project', async () => {
      const result = await runTool(context, 'memory_project', {
        action: 'create',
        name: 'Session Lifecycle Test',
        rootPath: '/test/session-lifecycle',
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'create project');
      projectId = response.project?.id;
      expect(projectId).toBeDefined();
    });

    it('should start session', async () => {
      const result = await runTool(context, 'memory_session', {
        action: 'start',
        projectId,
        name: 'Feature Development',
        purpose: 'Implement new feature',
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'start session');
      expect(response.session?.status).toBe('active');
      sessionId = response.session?.id;
    });

    it('should work within session', async () => {
      const result = await runTool(context, 'memory_remember', {
        text: 'Rule: Use async/await for all async operations',
        projectId,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'remember in session');
    });

    it('should end session', async () => {
      const result = await runTool(context, 'memory_session', {
        action: 'end',
        id: sessionId,
        status: 'completed',
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'end session');
      expect(response.session?.status).toBe('completed');
    });

    it('should list sessions', async () => {
      const result = await runTool(context, 'memory_session', {
        action: 'list',
        projectId,
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'list sessions');
      expect(response.sessions?.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('3. Episode Tracking: begin → log → complete → what_happened', () => {
    let sessionId: string;
    let episodeId: string;

    beforeAll(async () => {
      const setup = await runTool(context, 'memory_quickstart', {
        sessionName: 'Episode Test Session',
        projectName: 'Episode Test Project',
        createProject: true,
        agentId: AGENT_ID,
      });
      const response = parseResponse(setup);
      sessionId = response.session?.session?.id;
    });

    it('should begin episode', async () => {
      const result = await runTool(context, 'memory_episode', {
        action: 'begin',
        sessionId,
        name: 'Fix authentication bug',
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'begin episode');
      episodeId = response.episode?.id;
      expect(episodeId).toBeDefined();
    });

    it('should log progress', async () => {
      const result1 = await runTool(context, 'memory_episode', {
        action: 'log',
        id: episodeId,
        message: 'Found root cause: token expiry misconfigured',
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result1), 'log 1');

      const result2 = await runTool(context, 'memory_episode', {
        action: 'log',
        id: episodeId,
        message: 'Applied fix to token service',
        eventType: 'decision',
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result2), 'log 2');
    });

    it('should complete episode', async () => {
      const result = await runTool(context, 'memory_episode', {
        action: 'complete',
        id: episodeId,
        outcome: 'Fixed token expiry configuration',
        outcomeType: 'success',
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'complete episode');
      expect(response.episode?.status).toBe('completed');
    });

    it('should query what_happened', async () => {
      const result = await runTool(context, 'memory_episode', {
        action: 'what_happened',
        id: episodeId,
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'what_happened');
      expect(response.episode).toBeDefined();
      expect(response.timeline).toBeDefined();
    });

    it('should get timeline', async () => {
      const result = await runTool(context, 'memory_episode', {
        action: 'get_timeline',
        sessionId,
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'get_timeline');
      expect(response.timeline).toBeDefined();
    });
  });

  describe('4. CRUD Operations', () => {
    let projectId: string;

    beforeAll(async () => {
      const setup = await runTool(context, 'memory_quickstart', {
        sessionName: 'CRUD Test',
        projectName: 'CRUD Project',
        createProject: true,
        agentId: AGENT_ID,
      });
      projectId = parseResponse(setup).quickstart?.projectId;
    });

    describe('4a. Guidelines CRUD', () => {
      let guidelineId: string;

      it('should create guideline', async () => {
        const result = await runTool(context, 'memory_guideline', {
          action: 'add',
          scopeType: 'project',
          scopeId: projectId,
          name: 'Test Guideline',
          content: 'Always write tests first',
          category: 'testing',
          priority: 80,
          agentId: AGENT_ID,
        });
        const response = parseResponse(result);
        assertSuccess(response, 'create guideline');
        guidelineId = response.guideline?.id;
        expect(guidelineId).toBeDefined();
      });

      it('should get guideline', async () => {
        const result = await runTool(context, 'memory_guideline', {
          action: 'get',
          id: guidelineId,
          agentId: AGENT_ID,
        });
        const response = parseResponse(result);
        assertSuccess(response, 'get guideline');
        expect(response.guideline?.name).toBe('Test Guideline');
      });

      it('should update guideline', async () => {
        const result = await runTool(context, 'memory_guideline', {
          action: 'update',
          id: guidelineId,
          content: 'Always write tests first using TDD',
          agentId: AGENT_ID,
        });
        assertSuccess(parseResponse(result), 'update guideline');
      });

      it('should list guidelines', async () => {
        const result = await runTool(context, 'memory_guideline', {
          action: 'list',
          scopeType: 'project',
          scopeId: projectId,
          agentId: AGENT_ID,
        });
        const response = parseResponse(result);
        assertSuccess(response, 'list guidelines');
        expect(response.guidelines?.length).toBeGreaterThanOrEqual(1);
      });

      it('should deactivate guideline', async () => {
        const result = await runTool(context, 'memory_guideline', {
          action: 'deactivate',
          id: guidelineId,
          agentId: AGENT_ID,
        });
        assertSuccess(parseResponse(result), 'deactivate guideline');
      });
    });

    describe('4b. Knowledge CRUD', () => {
      let knowledgeId: string;

      it('should create knowledge', async () => {
        const result = await runTool(context, 'memory_knowledge', {
          action: 'add',
          scopeType: 'project',
          scopeId: projectId,
          title: 'API Architecture',
          content: 'We use REST with JSON:API specification',
          category: 'decision',
          agentId: AGENT_ID,
        });
        const response = parseResponse(result);
        assertSuccess(response, 'create knowledge');
        knowledgeId = response.knowledge?.id;
      });

      it('should get knowledge', async () => {
        const result = await runTool(context, 'memory_knowledge', {
          action: 'get',
          id: knowledgeId,
          agentId: AGENT_ID,
        });
        assertSuccess(parseResponse(result), 'get knowledge');
      });

      it('should update knowledge', async () => {
        const result = await runTool(context, 'memory_knowledge', {
          action: 'update',
          id: knowledgeId,
          content: 'We use REST with JSON:API specification v1.1',
          agentId: AGENT_ID,
        });
        assertSuccess(parseResponse(result), 'update knowledge');
      });

      it('should list knowledge', async () => {
        const result = await runTool(context, 'memory_knowledge', {
          action: 'list',
          scopeType: 'project',
          scopeId: projectId,
          agentId: AGENT_ID,
        });
        assertSuccess(parseResponse(result), 'list knowledge');
      });
    });

    describe('4c. Tools CRUD', () => {
      let toolId: string;

      it('should create tool', async () => {
        const result = await runTool(context, 'memory_tool', {
          action: 'add',
          scopeType: 'project',
          scopeId: projectId,
          name: 'deploy-staging',
          description: 'Deploy to staging environment',
          category: 'cli',
          agentId: AGENT_ID,
        });
        const response = parseResponse(result);
        assertSuccess(response, 'create tool');
        toolId = response.tool?.id;
      });

      it('should get tool', async () => {
        const result = await runTool(context, 'memory_tool', {
          action: 'get',
          id: toolId,
          agentId: AGENT_ID,
        });
        assertSuccess(parseResponse(result), 'get tool');
      });

      it('should list tools', async () => {
        const result = await runTool(context, 'memory_tool', {
          action: 'list',
          scopeType: 'project',
          scopeId: projectId,
          agentId: AGENT_ID,
        });
        assertSuccess(parseResponse(result), 'list tools');
      });
    });

    describe('4d. Tags', () => {
      let guidelineId: string;

      it('should create tag', async () => {
        const result = await runTool(context, 'memory_tag', {
          action: 'create',
          name: 'ux-test-security',
          description: 'Security-related entries',
          category: 'domain',
          agentId: AGENT_ID,
        });
        assertSuccess(parseResponse(result), 'create tag');
      });

      it('should create guideline for tagging', async () => {
        const result = await runTool(context, 'memory_guideline', {
          action: 'add',
          scopeType: 'project',
          scopeId: projectId,
          name: 'Security Rule',
          content: 'Never log sensitive data',
          agentId: AGENT_ID,
        });
        guidelineId = parseResponse(result).guideline?.id;
      });

      it('should attach tag', async () => {
        const result = await runTool(context, 'memory_tag', {
          action: 'attach',
          entryType: 'guideline',
          entryId: guidelineId,
          tagName: 'ux-test-security',
          agentId: AGENT_ID,
        });
        assertSuccess(parseResponse(result), 'attach tag');
      });

      it('should get tags for entry', async () => {
        const result = await runTool(context, 'memory_tag', {
          action: 'for_entry',
          entryType: 'guideline',
          entryId: guidelineId,
          agentId: AGENT_ID,
        });
        const response = parseResponse(result);
        assertSuccess(response, 'for_entry');
        expect(response.tags?.length).toBeGreaterThanOrEqual(1);
      });

      it('should list tags', async () => {
        const result = await runTool(context, 'memory_tag', {
          action: 'list',
          agentId: AGENT_ID,
        });
        assertSuccess(parseResponse(result), 'list tags');
      });
    });

    describe('4e. Relations', () => {
      let id1: string;
      let id2: string;

      it('should create two knowledge entries', async () => {
        const k1 = await runTool(context, 'memory_knowledge', {
          action: 'add',
          scopeType: 'project',
          scopeId: projectId,
          title: 'Database Choice',
          content: 'Using PostgreSQL',
          agentId: AGENT_ID,
        });
        const k2 = await runTool(context, 'memory_knowledge', {
          action: 'add',
          scopeType: 'project',
          scopeId: projectId,
          title: 'ORM Choice',
          content: 'Using Drizzle ORM',
          agentId: AGENT_ID,
        });
        id1 = parseResponse(k1).knowledge?.id;
        id2 = parseResponse(k2).knowledge?.id;
      });

      it('should create relation', async () => {
        const result = await runTool(context, 'memory_relation', {
          action: 'create',
          sourceType: 'knowledge',
          sourceId: id2,
          targetType: 'knowledge',
          targetId: id1,
          relationType: 'depends_on',
          agentId: AGENT_ID,
        });
        assertSuccess(parseResponse(result), 'create relation');
      });

      it('should list relations', async () => {
        const result = await runTool(context, 'memory_relation', {
          action: 'list',
          sourceType: 'knowledge',
          sourceId: id2,
          agentId: AGENT_ID,
        });
        assertSuccess(parseResponse(result), 'list relations');
      });
    });
  });

  describe('5. Advanced Features', () => {
    let projectId: string;
    let sessionId: string;

    beforeAll(async () => {
      const setup = await runTool(context, 'memory_quickstart', {
        sessionName: 'Advanced Test',
        projectName: 'Advanced Project',
        createProject: true,
        agentId: AGENT_ID,
      });
      const response = parseResponse(setup);
      projectId = response.quickstart?.projectId;
      sessionId = response.session?.session?.id;
    });

    it('should learn from experience', async () => {
      const result = await runTool(context, 'memory_experience', {
        action: 'learn',
        text: 'Fixed API timeout by increasing the connection pool size',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'learn experience');
    });

    it('should record case', async () => {
      const result = await runTool(context, 'memory_experience', {
        action: 'record_case',
        scopeType: 'project',
        scopeId: projectId,
        title: 'Debug slow query',
        scenario: 'Dashboard was loading slowly',
        outcome: 'Added index on user_id column',
        level: 'case',
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'record case');
    });

    it('should list experiences', async () => {
      const result = await runTool(context, 'memory_experience', {
        action: 'list',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'list experiences');
      expect(response.experiences?.length).toBeGreaterThanOrEqual(1);
    });

    it('should check librarian status', async () => {
      const result = await runTool(context, 'memory_librarian', {
        action: 'status',
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'librarian status');
    });

    it.skip('should find similar entries (slow - requires embeddings)', async () => {
      const result = await runTool(context, 'memory_consolidate', {
        action: 'find_similar',
        scopeType: 'project',
        scopeId: projectId,
        threshold: 0.8,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'find_similar');
    });

    it('should analyze forgetting candidates', async () => {
      const result = await runTool(context, 'memory_forget', {
        action: 'analyze',
        scopeType: 'project',
        scopeId: projectId,
        strategy: 'recency',
        staleDays: 90,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'analyze forgetting');
    });

    it('should list review candidates', async () => {
      const result = await runTool(context, 'memory_review', {
        action: 'list',
        sessionId,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'list review candidates');
    });
  });

  describe('6. Graph Operations', () => {
    let projectId: string;
    let nodeId1: string;
    let nodeId2: string;

    beforeAll(async () => {
      // Seed builtin graph types (normally done by MCP server on startup)
      if (context.repos.typeRegistry) {
        await context.repos.typeRegistry.seedBuiltinTypes();
      }

      const setup = await runTool(context, 'memory_quickstart', {
        sessionName: 'Graph Test',
        projectName: 'Graph Project',
        createProject: true,
        agentId: AGENT_ID,
      });
      projectId = parseResponse(setup).quickstart?.projectId;
    });

    it('should get graph status', async () => {
      const result = await runTool(context, 'memory_graph_status', {
        action: 'status',
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'graph status');
      expect(response.nodeTypes || response.status).toBeDefined();
    });

    it('should add graph node', async () => {
      const result = await runTool(context, 'graph_node', {
        action: 'add',
        nodeTypeName: 'function',
        scopeType: 'project',
        scopeId: projectId,
        name: 'calculateTotal',
        properties: { signature: 'function calculateTotal(items: Item[]): number' },
        createdBy: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'add node');
      nodeId1 = response.node?.id;
    });

    it('should get graph node', async () => {
      const result = await runTool(context, 'graph_node', {
        action: 'get',
        id: nodeId1,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'get node');
    });

    it('should add second node and create edge', async () => {
      const n1 = await runTool(context, 'graph_node', {
        action: 'add',
        nodeTypeName: 'module',
        scopeType: 'project',
        scopeId: projectId,
        name: 'auth-service',
        createdBy: AGENT_ID,
      });
      const n2 = await runTool(context, 'graph_node', {
        action: 'add',
        nodeTypeName: 'module',
        scopeType: 'project',
        scopeId: projectId,
        name: 'user-service',
        createdBy: AGENT_ID,
      });

      nodeId1 = parseResponse(n1).node?.id;
      nodeId2 = parseResponse(n2).node?.id;

      const edge = await runTool(context, 'graph_edge', {
        action: 'add',
        edgeTypeName: 'imports',
        sourceId: nodeId1,
        targetId: nodeId2,
        createdBy: AGENT_ID,
      });
      assertSuccess(parseResponse(edge), 'add edge');
    });

    it('should get neighbors', async () => {
      const result = await runTool(context, 'graph_edge', {
        action: 'neighbors',
        nodeId: nodeId1,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'neighbors');
    });

    it('should traverse graph', async () => {
      const result = await runTool(context, 'graph_edge', {
        action: 'traverse',
        startNodeId: nodeId1,
        maxDepth: 2,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'traverse');
    });
  });

  describe('7. Task Management', () => {
    let projectId: string;
    let taskId: string;

    beforeAll(async () => {
      const setup = await runTool(context, 'memory_quickstart', {
        sessionName: 'Task Test',
        projectName: 'Task Project',
        createProject: true,
        agentId: AGENT_ID,
      });
      projectId = parseResponse(setup).quickstart?.projectId;
    });

    it('should add task', async () => {
      const result = await runTool(context, 'memory_task', {
        action: 'add',
        scopeType: 'project',
        scopeId: projectId,
        title: 'Implement user authentication',
        description: 'Add JWT-based auth to the API',
        taskType: 'feature',
        severity: 'medium',
        urgency: 'soon',
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'add task');
      taskId = response.task?.id;
    });

    it('should get task', async () => {
      const result = await runTool(context, 'memory_task', {
        action: 'get',
        id: taskId,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'get task');
    });

    it('should update task status to in_progress', async () => {
      const result = await runTool(context, 'memory_task', {
        action: 'update_status',
        id: taskId,
        status: 'in_progress',
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'update status');
    });

    it('should list tasks', async () => {
      const result = await runTool(context, 'memory_task', {
        action: 'list',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'list tasks');
      expect(response.tasks?.length).toBeGreaterThanOrEqual(1);
    });

    it('should complete task', async () => {
      const result = await runTool(context, 'memory_task', {
        action: 'update_status',
        id: taskId,
        status: 'done',
        resolution: 'Implemented JWT auth with refresh tokens',
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'complete task');
    });
  });

  describe('8. Organizational Hierarchy', () => {
    let orgId: string;
    let projectId: string;
    let sessionId: string;

    it('should create organization', async () => {
      const result = await runTool(context, 'memory_org', {
        action: 'create',
        name: 'Acme Corp',
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'create org');
      orgId = response.organization?.id;
    });

    it('should create project under org', async () => {
      const result = await runTool(context, 'memory_project', {
        action: 'create',
        name: 'Backend API',
        orgId,
        rootPath: '/projects/backend-hierarchy',
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'create project');
      projectId = response.project?.id;
    });

    it('should create session under project', async () => {
      const result = await runTool(context, 'memory_session', {
        action: 'start',
        projectId,
        name: 'Sprint 1',
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'create session');
      sessionId = response.session?.id;
    });

    it('should add guidelines at each level', async () => {
      const g1 = await runTool(context, 'memory_guideline', {
        action: 'add',
        scopeType: 'org',
        scopeId: orgId,
        name: 'Org Standard',
        content: 'Use company coding guidelines',
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(g1), 'org guideline');

      const g2 = await runTool(context, 'memory_guideline', {
        action: 'add',
        scopeType: 'project',
        scopeId: projectId,
        name: 'Project Standard',
        content: 'Use TypeScript for backend',
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(g2), 'project guideline');

      const g3 = await runTool(context, 'memory_guideline', {
        action: 'add',
        scopeType: 'session',
        scopeId: sessionId,
        name: 'Session Override',
        content: 'Focus on auth module this sprint',
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(g3), 'session guideline');
    });

    it('should query with inheritance', async () => {
      const result = await runTool(context, 'memory_query', {
        action: 'context',
        scopeType: 'session',
        scopeId: sessionId,
        inherit: true,
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'context with inheritance');
      expect(response.guidelines?.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('9. Evidence & Verification', () => {
    let projectId: string;
    let evidenceId: string;

    beforeAll(async () => {
      const setup = await runTool(context, 'memory_quickstart', {
        sessionName: 'Evidence Test',
        projectName: 'Evidence Project',
        createProject: true,
        agentId: AGENT_ID,
      });
      projectId = parseResponse(setup).quickstart?.projectId;
    });

    it('should add evidence', async () => {
      const result = await runTool(context, 'memory_evidence', {
        action: 'add',
        scopeType: 'project',
        scopeId: projectId,
        title: 'Performance Benchmark',
        evidenceType: 'benchmark',
        content: 'API response time: 45ms p99',
        metric: 'response_time_p99',
        value: 45,
        unit: 'ms',
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'add evidence');
      evidenceId = response.evidence?.id;
    });

    it('should get evidence', async () => {
      const result = await runTool(context, 'memory_evidence', {
        action: 'get',
        id: evidenceId,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'get evidence');
    });

    it('should list evidence', async () => {
      const result = await runTool(context, 'memory_evidence', {
        action: 'list',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'list evidence');
    });
  });

  describe('10. Query & Analytics', () => {
    let projectId: string;

    beforeAll(async () => {
      const setup = await runTool(context, 'memory_quickstart', {
        sessionName: 'Query Test',
        projectName: 'Query Project',
        createProject: true,
        agentId: AGENT_ID,
      });
      projectId = parseResponse(setup).quickstart?.projectId;

      await runTool(context, 'memory_remember', {
        text: 'Rule: Use TypeScript strict mode',
        projectId,
        agentId: AGENT_ID,
      });
    });

    it('should search memory', async () => {
      const result = await runTool(context, 'memory_query', {
        action: 'search',
        search: 'TypeScript',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'search');
      expect(response.results?.length).toBeGreaterThanOrEqual(1);
    });

    it('should get hierarchical context', async () => {
      const result = await runTool(context, 'memory_query', {
        action: 'context',
        scopeType: 'project',
        scopeId: projectId,
        hierarchical: true,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'hierarchical context');
    });

    it('should get analytics stats', async () => {
      const result = await runTool(context, 'memory_analytics', {
        action: 'get_stats',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'get_stats');
    });
  });

  describe('11. Utility Operations', () => {
    let projectId: string;

    beforeAll(async () => {
      const setup = await runTool(context, 'memory_quickstart', {
        sessionName: 'Utility Test',
        projectName: 'Utility Project',
        createProject: true,
        agentId: AGENT_ID,
      });
      projectId = parseResponse(setup).quickstart?.projectId;
    });

    it('should auto-tag content', async () => {
      const result = await runTool(context, 'memory_ops', {
        action: 'auto_tag',
        content: 'Always validate user input to prevent SQL injection attacks',
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'auto_tag');
      expect(response.suggestions).toBeDefined();
    });

    it('should detect red flags', async () => {
      const result = await runTool(context, 'memory_ops', {
        action: 'red_flags',
        content: 'Store the API key in the .env file',
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'red_flags');
    });

    it('should check embedding coverage', async () => {
      const result = await runTool(context, 'memory_ops', {
        action: 'embedding_coverage',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'embedding_coverage');
    });

    it('should discover features', async () => {
      const result = await runTool(context, 'memory_discover', {
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'discover');
      expect(response.categories).toBeDefined();
    });
  });

  describe('12. File Locking (Multi-Agent)', () => {
    let projectId: string;
    const filePath = '/test/src/index.ts';

    beforeAll(async () => {
      const setup = await runTool(context, 'memory_quickstart', {
        sessionName: 'Lock Test',
        projectName: 'Lock Project',
        createProject: true,
        agentId: AGENT_ID,
      });
      projectId = parseResponse(setup).quickstart?.projectId;
    });

    it('should checkout file', async () => {
      const result = await runTool(context, 'memory_file_lock', {
        action: 'checkout',
        file_path: filePath,
        agent_id: AGENT_ID,
        project_id: projectId,
      });
      assertSuccess(parseResponse(result), 'checkout');
    });

    it('should get file status', async () => {
      const result = await runTool(context, 'memory_file_lock', {
        action: 'status',
        file_path: filePath,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'status');
      expect(response.lock?.checkedOutBy).toBe(AGENT_ID);
    });

    it('should checkin file', async () => {
      const result = await runTool(context, 'memory_file_lock', {
        action: 'checkin',
        file_path: filePath,
        agent_id: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'checkin');
    });

    it('should list locks', async () => {
      const result = await runTool(context, 'memory_file_lock', {
        action: 'list',
        project_id: projectId,
      });
      assertSuccess(parseResponse(result), 'list locks');
    });
  });

  describe('13. Health & System', () => {
    it('should check health', async () => {
      const result = await runTool(context, 'memory_health', {
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'health');
      expect(response.status).toBeDefined();
    });
  });

  describe('14. Context Management', () => {
    let projectId: string;

    beforeAll(async () => {
      const setup = await runTool(context, 'memory_quickstart', {
        sessionName: 'Context Test',
        projectName: 'Context Project',
        createProject: true,
        agentId: AGENT_ID,
      });
      projectId = parseResponse(setup).quickstart?.projectId;
    });

    it('should get context for session_start', async () => {
      const result = await runTool(context, 'memory_context', {
        action: 'get',
        purpose: 'session_start',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'session_start context');
    });

    it('should get budget info', async () => {
      const result = await runTool(context, 'memory_context', {
        action: 'budget-info',
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'budget-info');
    });

    it('should get context stats', async () => {
      const result = await runTool(context, 'memory_context', {
        action: 'stats',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'stats');
    });
  });

  describe('15. Observation & Extraction', () => {
    let sessionId: string;

    beforeAll(async () => {
      const setup = await runTool(context, 'memory_quickstart', {
        sessionName: 'Observe Test',
        projectName: 'Observe Project',
        createProject: true,
        agentId: AGENT_ID,
      });
      sessionId = parseResponse(setup).session?.session?.id;
    });

    it('should check extraction status', async () => {
      const result = await runTool(context, 'memory_observe', {
        action: 'status',
        agentId: AGENT_ID,
      });
      assertSuccess(parseResponse(result), 'observe status');
    });

    it('should draft extraction schema', async () => {
      const result = await runTool(context, 'memory_observe', {
        action: 'draft',
        sessionId,
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      assertSuccess(response, 'draft');
      expect(response.draft?.schema).toBeDefined();
    });
  });

  describe('16. Natural Language Interface', () => {
    let projectId: string;

    beforeAll(async () => {
      const setup = await runTool(context, 'memory_quickstart', {
        sessionName: 'NL Test',
        projectName: 'NL Project',
        createProject: true,
        agentId: AGENT_ID,
      });
      projectId = parseResponse(setup).quickstart?.projectId;
    });

    it('should store via natural language', async () => {
      const result = await runTool(context, 'memory', {
        text: 'Remember that we use ESLint for linting',
        projectId,
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      expect(response.error).toBeUndefined();
    });

    it('should retrieve via natural language', async () => {
      const result = await runTool(context, 'memory', {
        text: 'What do we know about linting?',
        projectId,
        agentId: AGENT_ID,
      });
      const response = parseResponse(result);
      expect(response.error).toBeUndefined();
    });
  });
});
