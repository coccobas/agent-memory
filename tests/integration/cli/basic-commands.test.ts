/**
 * CLI Integration Tests
 *
 * Tests the core CLI command handlers that power the CLI tool.
 * Tests handler functions directly to verify CLI behavior without
 * spawning actual processes.
 *
 * Tests 5 key command areas:
 * - health: Health check output
 * - project: Create/list operations
 * - guideline: Entry management
 * - query: Context and search operations
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestContext,
  createTestKnowledge,
  type TestDb,
} from '../../fixtures/test-helpers.js';
import type { AppContext } from '../../../src/core/context.js';

const TEST_DB_PATH = 'data/test/cli-integration-test.db';

// Setup mocks before imports
let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/db/connection.js')>(
    '../../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

// Import handlers after mocks are set up
import { memoryHealthDescriptor } from '../../../src/mcp/descriptors/memory_health.js';
import { scopeHandlers } from '../../../src/mcp/handlers/scopes.handler.js';
import { guidelineHandlers } from '../../../src/mcp/handlers/guidelines.handler.js';
import { queryHandlers } from '../../../src/mcp/handlers/query.handler.js';

describe('CLI Integration Tests', () => {
  let testDb: TestDb;
  let ctx: AppContext;
  let previousAdminKey: string | undefined;
  let previousPermMode: string | undefined;
  const ADMIN_KEY = 'test-admin-key';
  const AGENT_ID = 'test-agent';

  beforeAll(async () => {
    // Store original env values
    previousAdminKey = process.env.AGENT_MEMORY_ADMIN_KEY;
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;

    // Set permissive mode for tests
    process.env.AGENT_MEMORY_ADMIN_KEY = ADMIN_KEY;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';

    // Setup test database and context
    testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    ctx = await createTestContext(testDb);
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);

    // Restore env values
    if (previousAdminKey === undefined) {
      delete process.env.AGENT_MEMORY_ADMIN_KEY;
    } else {
      process.env.AGENT_MEMORY_ADMIN_KEY = previousAdminKey;
    }
    if (previousPermMode === undefined) {
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    } else {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    }
  });

  // ==========================================================================
  // Health Command Tests
  // ==========================================================================

  describe('health command', () => {
    it('should return healthy status', () => {
      const result = memoryHealthDescriptor.contextHandler!(ctx, {});

      expect(result).toMatchObject({
        status: 'healthy',
        serverVersion: expect.any(String),
        database: expect.objectContaining({
          type: expect.any(String),
        }),
      });
    });

    it('should include cache information', () => {
      const result = memoryHealthDescriptor.contextHandler!(ctx, {});

      expect(result).toHaveProperty('cache');
      expect(result.cache).toHaveProperty('size');
      expect(result.cache).toHaveProperty('memoryMB');
    });

    it('should include table counts', () => {
      const result = memoryHealthDescriptor.contextHandler!(ctx, {});

      // API uses 'tables' not 'tableCounts'
      expect(result).toHaveProperty('tables');
      expect(result.tables).toMatchObject({
        tools: expect.any(Number),
        guidelines: expect.any(Number),
        knowledge: expect.any(Number),
        projects: expect.any(Number),
      });
    });
  });

  // ==========================================================================
  // Project Command Tests
  // ==========================================================================

  describe('project command', () => {
    describe('project create', () => {
      it('should create a new project', async () => {
        const result = await scopeHandlers.projectCreate(ctx, {
          name: 'CLI Test Project',
          description: 'Created via CLI test',
          adminKey: ADMIN_KEY,
        });

        expect(result.success).toBe(true);
        expect(result.project).toBeDefined();
        expect(result.project.name).toBe('CLI Test Project');
        expect(result.project.description).toBe('Created via CLI test');
        expect(result.project.id).toBeDefined();
      });

      it('should create project with rootPath', async () => {
        const result = await scopeHandlers.projectCreate(ctx, {
          name: 'CLI Project With Path',
          rootPath: '/tmp/test-project',
          adminKey: ADMIN_KEY,
        });

        expect(result.success).toBe(true);
        expect(result.project.rootPath).toBe('/tmp/test-project');
      });
    });

    describe('project list', () => {
      it('should list all projects', async () => {
        const result = await scopeHandlers.projectList(ctx, {});

        expect(result.projects).toBeDefined();
        expect(Array.isArray(result.projects)).toBe(true);
        expect(result.meta).toBeDefined();
        expect(result.meta.returnedCount).toBeGreaterThanOrEqual(0);
      });

      it('should support pagination', async () => {
        const result = await scopeHandlers.projectList(ctx, {
          limit: 2,
          offset: 0,
        });

        expect(result.projects).toBeDefined();
        expect(result.projects.length).toBeLessThanOrEqual(2);
      });
    });

    describe('project get', () => {
      it('should get project by ID', async () => {
        // Create a project first
        const createResult = await scopeHandlers.projectCreate(ctx, {
          name: 'Get By ID Test',
          adminKey: ADMIN_KEY,
        });

        const result = await scopeHandlers.projectGet(ctx, {
          id: createResult.project.id,
        });

        expect(result.project).toBeDefined();
        expect(result.project.id).toBe(createResult.project.id);
        expect(result.project.name).toBe('Get By ID Test');
      });

      it('should throw error for non-existent project', async () => {
        await expect(
          scopeHandlers.projectGet(ctx, {
            id: 'non-existent-id',
          })
        ).rejects.toThrow(/not found/i);
      });
    });

    describe('project update', () => {
      it('should update project description', async () => {
        // Create a project first
        const createResult = await scopeHandlers.projectCreate(ctx, {
          name: 'Update Test Project',
          description: 'Original description',
          adminKey: ADMIN_KEY,
        });

        const result = await scopeHandlers.projectUpdate(ctx, {
          id: createResult.project.id,
          description: 'Updated description',
          adminKey: ADMIN_KEY,
        });

        expect(result.success).toBe(true);
        expect(result.project.description).toBe('Updated description');
      });
    });
  });

  // ==========================================================================
  // Guideline Command Tests
  // ==========================================================================

  describe('guideline command', () => {
    let testProjectId: string;

    beforeAll(async () => {
      // Create a project for guideline tests
      const projectResult = await scopeHandlers.projectCreate(ctx, {
        name: 'Guideline Test Project',
        adminKey: ADMIN_KEY,
      });
      testProjectId = projectResult.project.id;
    });

    describe('guideline add', () => {
      it('should add a new guideline', async () => {
        const result = await guidelineHandlers.add(ctx, {
          name: 'test-cli-guideline',
          content: 'Always write tests for CLI commands',
          scopeType: 'project',
          scopeId: testProjectId,
          agentId: AGENT_ID,
        });

        expect(result.success).toBe(true);
        expect(result.guideline).toBeDefined();
        expect(result.guideline.name).toBe('test-cli-guideline');
      });

      it('should add guideline with priority and category', async () => {
        const result = await guidelineHandlers.add(ctx, {
          name: 'high-priority-guideline',
          content: 'This is a high priority guideline',
          scopeType: 'project',
          scopeId: testProjectId,
          category: 'security',
          priority: 90,
          agentId: AGENT_ID,
        });

        expect(result.success).toBe(true);
        expect(result.guideline.priority).toBe(90);
        expect(result.guideline.category).toBe('security');
      });

      it('should add global guideline', async () => {
        const result = await guidelineHandlers.add(ctx, {
          name: 'global-cli-guideline',
          content: 'Global guideline for CLI',
          scopeType: 'global',
          agentId: AGENT_ID,
        });

        expect(result.success).toBe(true);
        expect(result.guideline.scopeType).toBe('global');
      });
    });

    describe('guideline list', () => {
      it('should list guidelines for a project', async () => {
        const result = await guidelineHandlers.list(ctx, {
          scopeType: 'project',
          scopeId: testProjectId,
          agentId: AGENT_ID,
        });

        expect(result.guidelines).toBeDefined();
        expect(Array.isArray(result.guidelines)).toBe(true);
      });

      it('should filter by category', async () => {
        const result = await guidelineHandlers.list(ctx, {
          scopeType: 'project',
          scopeId: testProjectId,
          category: 'security',
          agentId: AGENT_ID,
        });

        // All returned guidelines should have security category
        for (const guideline of result.guidelines) {
          expect(guideline.category).toBe('security');
        }
      });

      it('should support pagination', async () => {
        const result = await guidelineHandlers.list(ctx, {
          scopeType: 'project',
          scopeId: testProjectId,
          limit: 1,
          offset: 0,
          agentId: AGENT_ID,
        });

        expect(result.guidelines.length).toBeLessThanOrEqual(1);
      });
    });

    describe('guideline get', () => {
      let guidelineId: string;

      beforeAll(async () => {
        const result = await guidelineHandlers.add(ctx, {
          name: 'get-test-guideline',
          content: 'Guideline for get test',
          scopeType: 'project',
          scopeId: testProjectId,
          agentId: AGENT_ID,
        });
        guidelineId = result.guideline.id;
      });

      it('should get guideline by ID', async () => {
        const result = await guidelineHandlers.get(ctx, {
          id: guidelineId,
          agentId: AGENT_ID,
        });

        expect(result.guideline).toBeDefined();
        expect(result.guideline.id).toBe(guidelineId);
        expect(result.guideline.name).toBe('get-test-guideline');
      });

      it('should get guideline by name with scope', async () => {
        const result = await guidelineHandlers.get(ctx, {
          name: 'get-test-guideline',
          scopeType: 'project',
          scopeId: testProjectId,
          agentId: AGENT_ID,
        });

        expect(result.guideline).toBeDefined();
        expect(result.guideline.name).toBe('get-test-guideline');
      });

      it('should throw error for non-existent guideline', async () => {
        await expect(
          guidelineHandlers.get(ctx, {
            id: 'non-existent-id',
            agentId: AGENT_ID,
          })
        ).rejects.toThrow(/not found/i);
      });
    });

    describe('guideline update', () => {
      let updateGuidelineId: string;

      beforeAll(async () => {
        const result = await guidelineHandlers.add(ctx, {
          name: 'update-test-guideline',
          content: 'Original content',
          scopeType: 'project',
          scopeId: testProjectId,
          priority: 50,
          agentId: AGENT_ID,
        });
        updateGuidelineId = result.guideline.id;
      });

      it('should update guideline content', async () => {
        const result = await guidelineHandlers.update(ctx, {
          id: updateGuidelineId,
          content: 'Updated content',
          changeReason: 'Testing update',
          agentId: AGENT_ID,
        });

        expect(result.success).toBe(true);
        expect(result.guideline.currentVersionId).toBeDefined();
      });

      it('should update guideline priority with content', async () => {
        const result = await guidelineHandlers.update(ctx, {
          id: updateGuidelineId,
          content: 'Content with new priority', // Content is required
          priority: 80,
          agentId: AGENT_ID,
        });

        expect(result.success).toBe(true);
        expect(result.guideline.priority).toBe(80);
      });
    });

    describe('guideline deactivate', () => {
      it('should soft-delete a guideline', async () => {
        // Create a guideline to deactivate
        const createResult = await guidelineHandlers.add(ctx, {
          name: 'deactivate-test-guideline',
          content: 'This will be deactivated',
          scopeType: 'project',
          scopeId: testProjectId,
          agentId: AGENT_ID,
        });

        const result = await guidelineHandlers.deactivate(ctx, {
          id: createResult.guideline.id,
          agentId: AGENT_ID,
        });

        expect(result.success).toBe(true);

        // Verify it's not returned in list
        const listResult = await guidelineHandlers.list(ctx, {
          scopeType: 'project',
          scopeId: testProjectId,
          agentId: AGENT_ID,
        });

        const found = listResult.guidelines.find(
          (g: { id: string }) => g.id === createResult.guideline.id
        );
        expect(found).toBeUndefined();
      });
    });
  });

  // ==========================================================================
  // Query Command Tests
  // ==========================================================================

  describe('query command', () => {
    let queryProjectId: string;

    beforeAll(async () => {
      // Create project and seed some data
      const projectResult = await scopeHandlers.projectCreate(ctx, {
        name: 'Query Test Project',
        adminKey: ADMIN_KEY,
      });
      queryProjectId = projectResult.project.id;

      // Add some guidelines
      await guidelineHandlers.add(ctx, {
        name: 'query-test-guideline-1',
        content: 'First guideline for query testing',
        scopeType: 'project',
        scopeId: queryProjectId,
        category: 'code_style',
        agentId: AGENT_ID,
      });

      await guidelineHandlers.add(ctx, {
        name: 'query-test-guideline-2',
        content: 'Second guideline about security best practices',
        scopeType: 'project',
        scopeId: queryProjectId,
        category: 'security',
        agentId: AGENT_ID,
      });

      // Add knowledge using test helper (direct DB)
      createTestKnowledge(
        testDb.db,
        'Query Test Knowledge',
        'project',
        queryProjectId,
        'Knowledge content for query testing'
      );
    });

    describe('query context', () => {
      it('should return aggregated context for project scope', async () => {
        const result = await queryHandlers.context(ctx, {
          scopeType: 'project',
          scopeId: queryProjectId,
          inherit: true,
          agentId: AGENT_ID,
        });

        expect(result).toHaveProperty('tools');
        expect(result).toHaveProperty('guidelines');
        expect(result).toHaveProperty('knowledge');
      });

      it('should accept inherit parameter', async () => {
        // Test that inherit parameter is accepted and returns results
        const result = await queryHandlers.context(ctx, {
          scopeType: 'project',
          scopeId: queryProjectId,
          inherit: true,
          agentId: AGENT_ID,
        });

        // Should have valid structure with guidelines array
        expect(result.guidelines).toBeDefined();
        expect(Array.isArray(result.guidelines)).toBe(true);

        // Test that inherit: false also works
        const resultNoInherit = await queryHandlers.context(ctx, {
          scopeType: 'project',
          scopeId: queryProjectId,
          inherit: false,
          agentId: AGENT_ID,
        });
        expect(resultNoInherit.guidelines).toBeDefined();
        expect(Array.isArray(resultNoInherit.guidelines)).toBe(true);
      });

      it('should respect compact option', async () => {
        const result = await queryHandlers.context(ctx, {
          scopeType: 'project',
          scopeId: queryProjectId,
          compact: true,
          agentId: AGENT_ID,
        });

        // Compact results should still have entries
        expect(result).toHaveProperty('guidelines');
      });

      it('should respect limitPerType option', async () => {
        const result = await queryHandlers.context(ctx, {
          scopeType: 'project',
          scopeId: queryProjectId,
          limitPerType: 1,
          agentId: AGENT_ID,
        });

        if (result.guidelines) {
          expect(result.guidelines.length).toBeLessThanOrEqual(1);
        }
      });
    });

    describe('query search', () => {
      it('should search entries by text', async () => {
        const result = await queryHandlers.query(ctx, {
          search: 'security',
          types: ['guidelines'],
          scope: {
            type: 'project',
            id: queryProjectId,
            inherit: true,
          },
          agentId: AGENT_ID,
        });

        expect(result.results).toBeDefined();
      });

      it('should filter by entry types', async () => {
        const result = await queryHandlers.query(ctx, {
          types: ['knowledge'],
          scope: {
            type: 'project',
            id: queryProjectId,
            inherit: true,
          },
          agentId: AGENT_ID,
        });

        // Should have results
        expect(result).toBeDefined();
      });

      it('should support pagination in search', async () => {
        const result = await queryHandlers.query(ctx, {
          types: ['guidelines'],
          scope: {
            type: 'project',
            id: queryProjectId,
          },
          limit: 1,
          offset: 0,
          agentId: AGENT_ID,
        });

        expect(result).toBeDefined();
      });

      it('should return empty results for non-matching search', async () => {
        const result = await queryHandlers.query(ctx, {
          search: 'xyznonexistentquery12345',
          types: ['guidelines', 'knowledge'],
          scope: {
            type: 'project',
            id: queryProjectId,
          },
          agentId: AGENT_ID,
        });

        // Query returns { results: [...], meta: {...} } where results is a flat array
        expect(result).toBeDefined();
        expect(result.results).toBeDefined();
        expect(Array.isArray(result.results)).toBe(true);
        expect(result.results.length).toBe(0);
      });
    });

    describe('query error handling', () => {
      it('should throw error for invalid scope type', async () => {
        await expect(
          queryHandlers.context(ctx, {
            scopeType: 'invalid-scope-type',
            scopeId: queryProjectId,
            agentId: AGENT_ID,
          })
        ).rejects.toThrow();
      });

      it('should handle missing scopeId for non-global scope gracefully', async () => {
        const result = await queryHandlers.context(ctx, {
          scopeType: 'project',
          // Missing scopeId - may return empty or throw
          agentId: AGENT_ID,
        });

        // Should at least return something (empty context)
        expect(result).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Cross-Command Integration Tests
  // ==========================================================================

  describe('cross-command integration', () => {
    it('should create project then add guidelines and query them', async () => {
      // 1. Create a project
      const projectResult = await scopeHandlers.projectCreate(ctx, {
        name: 'Full Integration Test Project',
        description: 'Testing full workflow',
        adminKey: ADMIN_KEY,
      });
      expect(projectResult.success).toBe(true);
      const projectId = projectResult.project.id;

      // 2. Add guidelines to the project
      const guideline1 = await guidelineHandlers.add(ctx, {
        name: 'integration-guideline-1',
        content: 'First integration test guideline',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });
      expect(guideline1.success).toBe(true);

      const guideline2 = await guidelineHandlers.add(ctx, {
        name: 'integration-guideline-2',
        content: 'Second integration test guideline',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });
      expect(guideline2.success).toBe(true);

      // 3. Query the context and verify guidelines are present
      const contextResult = await queryHandlers.context(ctx, {
        scopeType: 'project',
        scopeId: projectId,
        inherit: false, // Only project scope
        agentId: AGENT_ID,
      });
      expect(contextResult.guidelines).toBeDefined();
      expect(contextResult.guidelines.length).toBeGreaterThanOrEqual(2);

      // 4. Search for specific guideline
      const searchResult = await queryHandlers.query(ctx, {
        search: 'integration',
        types: ['guidelines'],
        scope: {
          type: 'project',
          id: projectId,
        },
        agentId: AGENT_ID,
      });
      expect(searchResult.results).toBeDefined();

      // 5. Update a guideline
      const updateResult = await guidelineHandlers.update(ctx, {
        id: guideline1.guideline.id,
        content: 'Updated integration test guideline',
        agentId: AGENT_ID,
      });
      expect(updateResult.success).toBe(true);

      // 6. Deactivate the other guideline
      const deactivateResult = await guidelineHandlers.deactivate(ctx, {
        id: guideline2.guideline.id,
        agentId: AGENT_ID,
      });
      expect(deactivateResult.success).toBe(true);

      // 7. Verify only one active guideline remains in our created set
      const finalListResult = await guidelineHandlers.list(ctx, {
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });
      const integrationGuidelines = finalListResult.guidelines.filter(
        (g: { name: string }) =>
          g.name === 'integration-guideline-1' || g.name === 'integration-guideline-2'
      );
      expect(integrationGuidelines.length).toBe(1);
    });
  });
});
