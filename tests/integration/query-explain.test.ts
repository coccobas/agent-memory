/**
 * Integration test for query explain flag
 *
 * Tests that the `explain: true` flag on memory_query returns nested explain output
 * with stage-by-stage breakdowns, timing, and score components.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  seedPredefinedTags,
  createTestOrg,
  createTestProject,
  createTestGuideline,
  createTestKnowledge,
  registerTestContext,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';
import {
  registerDatabase,
  clearPreparedStatementCache,
  resetContainer,
} from '../../src/db/connection.js';

const TEST_DB_PATH = './data/test-query-explain.db';

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

describe('memory_query explain flag', () => {
  const AGENT_ID = 'test-agent';
  let orgId: string;
  let projectId: string;
  let previousPermMode: string | undefined;

  beforeAll(() => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    registerDatabase(db, sqlite);

    context = registerTestContext(testDb);

    seedPredefinedTags(db);

    // Create test data
    const org = createTestOrg(db, 'Explain Test Org');
    orgId = org.id;
    const project = createTestProject(db, 'Explain Test Project', orgId);
    projectId = project.id;

    // Create searchable entries
    createTestGuideline(
      db,
      'always-use-typescript',
      'project',
      projectId,
      'coding',
      90,
      'Always use TypeScript for type safety and better developer experience.'
    );
    createTestGuideline(
      db,
      'prefer-explicit-types',
      'project',
      projectId,
      'coding',
      80,
      'Prefer explicit type annotations over inferred types in function signatures.'
    );
    createTestKnowledge(
      db,
      'typescript-strict-mode',
      'project',
      projectId,
      'fact',
      'We use TypeScript strict mode in all projects for maximum type safety.'
    );
  });

  afterAll(() => {
    if (previousPermMode !== undefined) {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    } else {
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    }
    cleanupTestDb(sqlite, TEST_DB_PATH);
    clearPreparedStatementCache();
    resetContainer();
  });

  describe('explain: false (default)', () => {
    it('should NOT include explain output when explain is false', async () => {
      const result = await queryHandlers.query(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: projectId,
        search: 'typescript',
        explain: false,
      });

      expect(result.results).toBeDefined();
      expect(result.meta).toBeDefined();
      // Should NOT have explain output
      expect(result).not.toHaveProperty('explain');
    });

    it('should NOT include explain output when explain is not specified', async () => {
      const result = await queryHandlers.query(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: projectId,
        search: 'typescript',
      });

      expect(result.results).toBeDefined();
      expect(result.meta).toBeDefined();
      // Should NOT have explain output
      expect(result).not.toHaveProperty('explain');
    });
  });

  describe('explain: true', () => {
    it('should include explain output with all required top-level keys', async () => {
      const result = await queryHandlers.query(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: projectId,
        search: 'typescript',
        explain: true,
      });

      expect(result.results).toBeDefined();
      expect(result.meta).toBeDefined();

      // Should have explain output
      expect(result).toHaveProperty('explain');
      const explain = (result as { explain: unknown }).explain as Record<string, unknown>;

      // Check all required top-level keys
      expect(explain).toHaveProperty('summary');
      expect(explain).toHaveProperty('stages');
      expect(explain).toHaveProperty('timing');
      expect(explain).toHaveProperty('cacheHit');
    });

    it('should include stage-by-stage breakdowns', async () => {
      const result = await queryHandlers.query(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: projectId,
        search: 'typescript',
        explain: true,
      });

      const explain = (result as { explain: unknown }).explain as Record<string, unknown>;
      const stages = explain.stages as Record<string, unknown>;

      expect(stages).toBeDefined();
      expect(stages).toHaveProperty('resolve');
      expect(stages).toHaveProperty('fts');
      expect(stages).toHaveProperty('fetch');
      expect(stages).toHaveProperty('filter');
      expect(stages).toHaveProperty('score');
    });

    it('should include resolve stage with scope chain', async () => {
      const result = await queryHandlers.query(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: projectId,
        search: 'typescript',
        explain: true,
      });

      const explain = (result as { explain: unknown }).explain as Record<string, unknown>;
      const stages = explain.stages as Record<string, unknown>;
      const resolve = stages.resolve as Record<string, unknown>;

      expect(resolve).toBeDefined();
      expect(resolve).toHaveProperty('scopeChain');
      expect(resolve).toHaveProperty('types');
      expect(resolve).toHaveProperty('limit');
      expect(Array.isArray(resolve.scopeChain)).toBe(true);
    });

    it('should include timing breakdown with percentages', async () => {
      const result = await queryHandlers.query(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: projectId,
        search: 'typescript',
        explain: true,
      });

      const explain = (result as { explain: unknown }).explain as Record<string, unknown>;
      const timing = explain.timing as Record<string, unknown>;

      expect(timing).toBeDefined();
      expect(timing).toHaveProperty('totalMs');
      expect(timing).toHaveProperty('breakdown');
      expect(Array.isArray(timing.breakdown)).toBe(true);

      const breakdown = timing.breakdown as Array<Record<string, unknown>>;
      if (breakdown.length > 0) {
        const firstStage = breakdown[0];
        expect(firstStage).toHaveProperty('stage');
        expect(firstStage).toHaveProperty('durationMs');
        expect(firstStage).toHaveProperty('percent');
      }
    });

    it('should include score stage with component breakdowns for top entries', async () => {
      const result = await queryHandlers.query(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: projectId,
        search: 'typescript',
        explain: true,
      });

      // Ensure we have results
      expect(result.results.length).toBeGreaterThan(0);

      const explain = (result as { explain: unknown }).explain as Record<string, unknown>;
      const stages = explain.stages as Record<string, unknown>;
      const score = stages.score as Record<string, unknown>;

      expect(score).toBeDefined();
      expect(score).toHaveProperty('factors');
      expect(score).toHaveProperty('scoreRange');
      expect(score).toHaveProperty('topEntries');

      const topEntries = score.topEntries as Array<Record<string, unknown>>;
      if (topEntries.length > 0) {
        const topEntry = topEntries[0];
        expect(topEntry).toHaveProperty('id');
        expect(topEntry).toHaveProperty('type');
        expect(topEntry).toHaveProperty('components');

        const components = topEntry.components as Record<string, unknown>;
        expect(components).toHaveProperty('final');
      }
    });

    it('should include FTS stage info when text search is used', async () => {
      const result = await queryHandlers.query(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: projectId,
        search: 'typescript',
        useFts5: true,
        explain: true,
      });

      const explain = (result as { explain: unknown }).explain as Record<string, unknown>;
      const stages = explain.stages as Record<string, unknown>;
      const fts = stages.fts as Record<string, unknown>;

      expect(fts).toBeDefined();
      expect(fts).toHaveProperty('used');
      expect(fts).toHaveProperty('matchCount');
    });

    it('should generate human-readable summary', async () => {
      const result = await queryHandlers.query(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: projectId,
        search: 'typescript',
        explain: true,
      });

      const explain = (result as { explain: unknown }).explain as Record<string, unknown>;
      expect(typeof explain.summary).toBe('string');
      expect((explain.summary as string).length).toBeGreaterThan(0);
    });

    it('should reflect cache hit status', async () => {
      // First query to warm cache
      await queryHandlers.query(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: projectId,
        search: 'explicit types',
        explain: true,
      });

      // Second query should hit cache
      const result = await queryHandlers.query(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: projectId,
        search: 'explicit types',
        explain: true,
      });

      const explain = (result as { explain: unknown }).explain as Record<string, unknown>;
      expect(typeof explain.cacheHit).toBe('boolean');
    });
  });

  describe('context action with explain', () => {
    it('should include explain output when explain: true on context action', async () => {
      const result = await queryHandlers.context(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: projectId,
        search: 'typescript',
        explain: true,
      });

      // Context action returns grouped results
      expect(result).toHaveProperty('guidelines');
      expect(result).toHaveProperty('knowledge');

      // Should also have explain output
      expect(result).toHaveProperty('explain');
      const explain = (result as { explain: unknown }).explain as Record<string, unknown>;
      expect(explain).toHaveProperty('summary');
      expect(explain).toHaveProperty('stages');
      expect(explain).toHaveProperty('timing');
    });
  });
});
