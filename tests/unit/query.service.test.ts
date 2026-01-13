import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '../../src/db/schema.js';
import {
  registerDatabase,
  resetContainer,
  clearPreparedStatementCache,
} from '../../src/db/connection.js';
import {
  ensureTestRuntime,
  getTestQueryCache,
  clearTestQueryCache,
  createTestQueryDeps,
} from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-memory-query.db';

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle>;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
    getSqlite: () => sqlite,
  };
});

// Import after mocking connection
import {
  resolveScopeChain,
  executeFts5Query,
  type MemoryQueryResult,
} from '../../src/services/query.service.js';
import { executeQueryPipeline } from '../../src/services/query/index.js';
import { wireQueryCache } from '../../src/core/factory/query-pipeline.js';
import { createLocalEventAdapter } from '../../src/core/adapters/local-event.adapter.js';
import { createComponentLogger } from '../../src/utils/logger.js';
import { getRuntime } from '../../src/core/container.js';
import { emitEntryChanged } from '../../src/utils/events.js';

// Helper to execute query with pipeline (replaces legacy executeMemoryQuery)
async function executeMemoryQuery(
  params: Parameters<typeof executeQueryPipeline>[0]
): Promise<MemoryQueryResult> {
  return executeQueryPipeline(params, createTestQueryDeps()) as Promise<MemoryQueryResult>;
}

// Valid UUIDs for testing (Task 4 added UUID validation)
// UUID format requires version (1-5 at position 15) and variant (8/9/a/b at position 20)
const TEST_ORG_1 = '00000001-0000-4000-8000-000000000001';
const TEST_PROJECT_1 = '00000002-0000-4000-8000-000000000001';
const TEST_SESSION_1 = '00000003-0000-4000-8000-000000000001';
const TEST_PROJECT_QUERY = '00000002-0000-4000-8000-000000000002';
const TEST_SESSION_QUERY = '00000003-0000-4000-8000-000000000002';
const TEST_GUIDE_GLOBAL = '00000004-0000-4000-8000-000000000001';
const TEST_GUIDE_PROJECT = '00000004-0000-4000-8000-000000000002';
const TEST_GUIDE_SESSION = '00000004-0000-4000-8000-000000000003';
const TEST_GV_GLOBAL = '00000005-0000-4000-8000-000000000001';
const TEST_GV_PROJECT = '00000005-0000-4000-8000-000000000002';
const TEST_GV_SESSION = '00000005-0000-4000-8000-000000000003';
const TEST_PROJECT_CACHE = '00000002-0000-4000-8000-000000000003';
const TEST_SESSION_CACHE = '00000003-0000-4000-8000-000000000003';
const TEST_GUIDE_CACHE_PROJECT = '00000004-0000-4000-8000-000000000004';
const TEST_GV_CACHE_PROJECT = '00000005-0000-4000-8000-000000000004';

describe('query.service', () => {
  let unsubscribeCacheInvalidation: (() => void) | undefined;
  let testEventAdapter: ReturnType<typeof createLocalEventAdapter>;

  beforeAll(() => {
    // Ensure data directory exists
    if (!existsSync('./data')) {
      mkdirSync('./data', { recursive: true });
    }

    // Clean up any existing test database
    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${TEST_DB_PATH}${suffix}`;
      if (existsSync(path)) {
        unlinkSync(path);
      }
    }

    // Create test database
    sqlite = new Database(TEST_DB_PATH);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    db = drizzle(sqlite, { schema });

    // Ensure runtime is registered (for query cache)
    ensureTestRuntime();

    // Register with container so getSqlite()/getDb() work
    registerDatabase(db, sqlite);

    // Wire up cache invalidation - requires event adapter and runtime
    testEventAdapter = createLocalEventAdapter();
    const runtime = getRuntime();
    wireQueryCache(testEventAdapter, runtime, createComponentLogger('test-query-cache'));
    unsubscribeCacheInvalidation = runtime.queryCache.unsubscribe ?? undefined;

    // Run all migrations
    const migrations = [
      '0000_lying_the_hand.sql',
      '0001_add_file_locks.sql',
      '0002_add_embeddings_tracking.sql',
      '0003_add_fts5_tables.sql',
      '0004_add_permissions.sql',
      '0005_add_task_decomposition.sql',
      '0006_add_audit_log.sql',
      '0007_add_execution_tracking.sql',
      '0008_add_agent_votes.sql',
      '0009_add_conversation_history.sql',
      '0010_add_verification_rules.sql',
      '0011_add_performance_indexes.sql',
      '0012_add_experiences.sql',
      '0013_migrate_promotions_to_relations.sql',
      '0014_add_experiences_fts.sql',
      '0015_add_recommendations.sql',
      '0016_add_access_tracking.sql',
      '0017_add_temporal_knowledge.sql',
    ];
    for (const migrationFile of migrations) {
      const migrationPath = join(process.cwd(), 'src/db/migrations', migrationFile);
      if (existsSync(migrationPath)) {
        const migrationSql = readFileSync(migrationPath, 'utf-8');
        const statements = migrationSql.split('--> statement-breakpoint');
        for (const statement of statements) {
          const trimmed = statement.trim();
          if (trimmed) {
            sqlite.exec(trimmed);
          }
        }
      }
    }
  });

  afterAll(() => {
    // Unsubscribe cache invalidation
    if (unsubscribeCacheInvalidation) {
      unsubscribeCacheInvalidation();
    }
    clearPreparedStatementCache();
    resetContainer();
    sqlite.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${TEST_DB_PATH}${suffix}`;
      if (existsSync(path)) {
        unlinkSync(path);
      }
    }
  });

  it('resolves scope inheritance chain for session → project → org → global', () => {
    // Create org, project, session using valid UUIDs
    const orgId = TEST_ORG_1;
    const projectId = TEST_PROJECT_1;
    const sessionId = TEST_SESSION_1;

    db.insert(schema.organizations)
      .values({
        id: orgId,
        name: 'Test Org',
      })
      .run();

    db.insert(schema.projects)
      .values({
        id: projectId,
        orgId,
        name: 'Test Project',
      })
      .run();

    db.insert(schema.sessions)
      .values({
        id: sessionId,
        projectId,
        name: 'Test Session',
        status: 'active',
      })
      .run();

    const chain = resolveScopeChain(
      {
        type: 'session',
        id: sessionId,
        inherit: true,
      },
      db
    );

    // Expect order: session, project, org, global
    expect(chain).toHaveLength(4);
    expect(chain[0]).toEqual({ scopeType: 'session', scopeId: sessionId });
    expect(chain[1]).toEqual({ scopeType: 'project', scopeId: projectId });
    expect(chain[2]).toEqual({ scopeType: 'org', scopeId: orgId });
    expect(chain[3]).toEqual({ scopeType: 'global', scopeId: null });
  });

  it('returns guidelines ranked and filtered by scope and tags', async () => {
    const projectId = TEST_PROJECT_QUERY;
    const sessionId = TEST_SESSION_QUERY;

    db.insert(schema.projects)
      .values({
        id: projectId,
        name: 'Query Project',
      })
      .run();

    db.insert(schema.sessions)
      .values({
        id: sessionId,
        projectId,
        name: 'Query Session',
        status: 'active',
      })
      .run();

    // Global guideline
    db.insert(schema.guidelines)
      .values({
        id: TEST_GUIDE_GLOBAL,
        scopeType: 'global',
        name: 'global_guideline',
        priority: 50,
        isActive: true,
      })
      .run();

    db.insert(schema.guidelineVersions)
      .values({
        id: TEST_GV_GLOBAL,
        guidelineId: TEST_GUIDE_GLOBAL,
        versionNum: 1,
        content: 'Global content',
      })
      .run();

    // Project guideline with higher priority
    db.insert(schema.guidelines)
      .values({
        id: TEST_GUIDE_PROJECT,
        scopeType: 'project',
        scopeId: projectId,
        name: 'project_guideline',
        category: 'security',
        priority: 90,
        isActive: true,
      })
      .run();

    db.insert(schema.guidelineVersions)
      .values({
        id: TEST_GV_PROJECT,
        guidelineId: TEST_GUIDE_PROJECT,
        versionNum: 1,
        content: 'Project-specific content about authentication',
      })
      .run();

    // Tag the project guideline as security
    db.insert(schema.tags)
      .values({
        id: 'tag-security',
        name: 'security',
        category: 'domain',
        isPredefined: false,
      })
      .run();

    db.insert(schema.entryTags)
      .values({
        id: 'et-guide-project-security',
        entryType: 'guideline',
        entryId: TEST_GUIDE_PROJECT,
        tagId: 'tag-security',
      })
      .run();

    // Query guidelines with security tag
    const result = await executeMemoryQuery({
      types: ['guidelines'],
      scope: { type: 'session', id: sessionId, inherit: true },
      tags: { include: ['security'] },
      compact: true,
    });

    expect(result.results.length).toBeGreaterThan(0);
    const first = result.results[0];
    expect(first.type).toBe('guideline');
    expect(first.scopeType).toBe('project');
    expect(first.scopeId).toBe(projectId);
  });

  describe('FTS5 Query', () => {
    beforeAll(() => {
      // Create a guideline for FTS5 testing
      db.insert(schema.guidelines)
        .values({
          id: 'fts5-guide-1',
          scopeType: 'global',
          name: 'fts5_test_guideline',
          priority: 50,
          isActive: true,
        })
        .run();

      db.insert(schema.guidelineVersions)
        .values({
          id: 'fts5-gv-1',
          guidelineId: 'fts5-guide-1',
          versionNum: 1,
          content: 'Testing FTS5 full-text search capabilities',
        })
        .run();
    });

    it('should execute FTS5 query and return rowids', () => {
      const result = executeFts5Query('guideline', 'testing');

      expect(result).toBeDefined();
      expect(result instanceof Set).toBe(true);
    });

    it('should handle FTS5 query with specific fields', () => {
      const result = executeFts5Query('guideline', 'testing', ['content']);

      expect(result).toBeDefined();
      expect(result instanceof Set).toBe(true);
    });

    it('should handle FTS5 query with multiple fields', () => {
      const result = executeFts5Query('guideline', 'FTS5', ['content', 'name']);

      expect(result).toBeDefined();
      expect(result instanceof Set).toBe(true);
    });

    it('should handle empty FTS5 search text', () => {
      const result = executeFts5Query('guideline', '');

      expect(result).toBeDefined();
      expect(result instanceof Set).toBe(true);
    });
  });

  describe('Async Query', () => {
    it('should handle async query without semantic search', async () => {
      const result = await executeMemoryQuery({
        types: ['tools'],
        scope: { type: 'global', inherit: false },
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should handle errors in async query gracefully', async () => {
      // Query with potentially problematic input - pipeline should handle this
      const result = await executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
        limit: 10,
      });

      // Should return results
      expect(result).toBeDefined();
    });
  });

  describe('Advanced Query Filters', () => {
    beforeAll(() => {
      // Create test data for date/priority filtering
      db.insert(schema.knowledge)
        .values({
          id: 'kb-filter-1',
          scopeType: 'global',
          title: 'Old Knowledge',
          isActive: true,
        })
        .run();

      db.insert(schema.knowledgeVersions)
        .values({
          id: 'kbv-filter-1',
          knowledgeId: 'kb-filter-1',
          versionNum: 1,
          content: 'Old content',
          createdAt: '2020-01-01T00:00:00.000Z',
        })
        .run();

      db.insert(schema.guidelines)
        .values({
          id: 'guide-priority-low',
          scopeType: 'global',
          name: 'low_priority',
          priority: 10,
          isActive: true,
        })
        .run();

      db.insert(schema.guidelineVersions)
        .values({
          id: 'gv-priority-low',
          guidelineId: 'guide-priority-low',
          versionNum: 1,
          content: 'Low priority guideline',
        })
        .run();

      db.insert(schema.guidelines)
        .values({
          id: 'guide-priority-high',
          scopeType: 'global',
          name: 'high_priority',
          priority: 95,
          isActive: true,
        })
        .run();

      db.insert(schema.guidelineVersions)
        .values({
          id: 'gv-priority-high',
          guidelineId: 'guide-priority-high',
          versionNum: 1,
          content: 'High priority guideline',
        })
        .run();
    });

    it('should filter by date range', async () => {
      const result = await executeMemoryQuery({
        types: ['knowledge'],
        scope: { type: 'global', inherit: false },
        createdAfter: '2019-01-01T00:00:00.000Z',
        createdBefore: '2021-01-01T00:00:00.000Z',
      });

      expect(result).toBeDefined();
      expect(result.results.length).toBeGreaterThanOrEqual(0);
    });

    it('should use fuzzy text matching', async () => {
      const result = await executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
        search: 'prioriti', // Fuzzy match for "priority"
        fuzzy: true,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should use regex text matching', async () => {
      const result = await executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
        search: 'p.*y', // Regex pattern
        regex: true,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should use FTS5 when enabled', async () => {
      const result = await executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
        search: 'priority',
        useFts5: true,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should limit results', async () => {
      const result = await executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
        limit: 1,
      });

      expect(result.results.length).toBeLessThanOrEqual(1);
    });

    it('should query multiple types', async () => {
      const result = await executeMemoryQuery({
        types: ['tools', 'guidelines', 'knowledge'],
        scope: { type: 'global', inherit: false },
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should return results with proper structure', async () => {
      const result = await executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
        compact: false,
      });

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
      if (result.results.length > 0) {
        // All results should have required properties
        expect(result.results[0]).toHaveProperty('type');
        expect(result.results[0]).toHaveProperty('id');
        expect(result.results[0]).toHaveProperty('score');
      }
    });
  });

  describe('Pipeline cache invalidation', () => {
    beforeEach(() => {
      clearTestQueryCache();
    });

    it('invalidates session-scoped pipeline cache when a project entry changes (inheritance)', async () => {
      const projectId = TEST_PROJECT_CACHE;
      const sessionId = TEST_SESSION_CACHE;

      db.insert(schema.projects)
        .values({
          id: projectId,
          name: 'Cache Project',
        })
        .run();

      db.insert(schema.sessions)
        .values({
          id: sessionId,
          projectId,
          name: 'Cache Session',
          status: 'active',
        })
        .run();

      // Project guideline
      db.insert(schema.guidelines)
        .values({
          id: TEST_GUIDE_CACHE_PROJECT,
          scopeType: 'project',
          scopeId: projectId,
          name: 'cache_project_guideline',
          priority: 90,
          isActive: true,
        })
        .run();

      db.insert(schema.guidelineVersions)
        .values({
          id: TEST_GV_CACHE_PROJECT,
          guidelineId: TEST_GUIDE_CACHE_PROJECT,
          versionNum: 1,
          content: 'Project cache guideline content',
        })
        .run();

      // Populate pipeline cache with a session query (inherits project)
      await executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'session', id: sessionId, inherit: true },
        compact: true,
      });

      expect(getTestQueryCache().size).toBeGreaterThan(0);

      // Emit a project-scoped change; session queries inheriting from project must be invalidated.
      testEventAdapter.emit({
        entryType: 'guideline',
        entryId: TEST_GUIDE_CACHE_PROJECT,
        scopeType: 'project',
        scopeId: projectId,
        action: 'update',
      });

      expect(getTestQueryCache().size).toBe(0);
    });
  });
});
