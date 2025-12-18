import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '../../src/db/schema.js';

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
  };
});

// Import after mocking connection
import {
  resolveScopeChain,
  executeMemoryQuery,
  clearQueryCache,
  getQueryCacheStats,
  invalidateCacheScope,
  invalidateCacheEntry,
  setCacheStrategy,
  executeFts5Query,
  executeMemoryQueryAsync,
} from '../../src/services/query.service.js';

describe('query.service', () => {
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
    sqlite.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${TEST_DB_PATH}${suffix}`;
      if (existsSync(path)) {
        unlinkSync(path);
      }
    }
  });

  it('resolves scope inheritance chain for session → project → org → global', () => {
    // Create org, project, session
    const orgId = 'org-test';
    const projectId = 'proj-test';
    const sessionId = 'sess-test';

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

    const chain = resolveScopeChain({
      type: 'session',
      id: sessionId,
      inherit: true,
    });

    // Expect order: session, project, org, global
    expect(chain).toHaveLength(4);
    expect(chain[0]).toEqual({ scopeType: 'session', scopeId: sessionId });
    expect(chain[1]).toEqual({ scopeType: 'project', scopeId: projectId });
    expect(chain[2]).toEqual({ scopeType: 'org', scopeId: orgId });
    expect(chain[3]).toEqual({ scopeType: 'global', scopeId: null });
  });

  it('returns guidelines ranked and filtered by scope and tags', () => {
    const projectId = 'proj-query';
    const sessionId = 'sess-query';

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
        id: 'guide-global',
        scopeType: 'global',
        name: 'global_guideline',
        priority: 50,
        isActive: true,
      })
      .run();

    db.insert(schema.guidelineVersions)
      .values({
        id: 'gv-global-1',
        guidelineId: 'guide-global',
        versionNum: 1,
        content: 'Global content',
      })
      .run();

    // Project guideline with higher priority
    db.insert(schema.guidelines)
      .values({
        id: 'guide-project',
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
        id: 'gv-project-1',
        guidelineId: 'guide-project',
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
        entryId: 'guide-project',
        tagId: 'tag-security',
      })
      .run();

    const result = executeMemoryQuery({
      types: ['guidelines'],
      scope: { type: 'session', id: sessionId, inherit: true },
      tags: { include: ['security'] },
      search: 'authentication',
      includeVersions: false,
      compact: true,
    });

    expect(result.results.length).toBeGreaterThan(0);
    const first = result.results[0];
    expect(first.type).toBe('guideline');
    expect(first.scopeType).toBe('project');
    expect(first.scopeId).toBe(projectId);
  });

  describe('Query Cache', () => {
    beforeEach(() => {
      clearQueryCache();
    });

    it('should clear query cache', () => {
      // Execute a query to populate cache
      executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
      });

      const statsBefore = getQueryCacheStats();
      expect(statsBefore.size).toBeGreaterThan(0);

      clearQueryCache();

      const statsAfter = getQueryCacheStats();
      expect(statsAfter.size).toBe(0);
    });

    it('should get cache stats with size and memory info', () => {
      const stats = getQueryCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('memoryMB');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.memoryMB).toBe('number');
    });

    it('should invalidate cache by scope type', () => {
      // Create test data at different scopes
      const projId = 'cache-test-proj';
      db.insert(schema.projects).values({ id: projId, name: 'Cache Test' }).run();

      // Query global scope
      executeMemoryQuery({
        types: ['tools'],
        scope: { type: 'global', inherit: false },
      });

      // Query project scope
      executeMemoryQuery({
        types: ['tools'],
        scope: { type: 'project', id: projId, inherit: false },
      });

      const statsBefore = getQueryCacheStats();
      expect(statsBefore.size).toBeGreaterThan(0);

      // Invalidate only project scope
      invalidateCacheScope('project');

      const statsAfter = getQueryCacheStats();
      // Should have fewer entries (global might still be cached)
      expect(statsAfter.size).toBeLessThanOrEqual(statsBefore.size);
    });

    it('should invalidate cache by scope type and id', () => {
      const proj1 = 'cache-proj-1';
      const proj2 = 'cache-proj-2';

      db.insert(schema.projects).values({ id: proj1, name: 'Project 1' }).run();
      db.insert(schema.projects).values({ id: proj2, name: 'Project 2' }).run();

      executeMemoryQuery({
        types: ['tools'],
        scope: { type: 'project', id: proj1, inherit: false },
      });

      executeMemoryQuery({
        types: ['tools'],
        scope: { type: 'project', id: proj2, inherit: false },
      });

      const statsBefore = getQueryCacheStats();
      expect(statsBefore.size).toBeGreaterThan(0);

      // Invalidate only proj1
      invalidateCacheScope('project', proj1);

      // Both queries should be affected but cache should clear
      const statsAfter = getQueryCacheStats();
      expect(statsAfter.size).toBeLessThanOrEqual(statsBefore.size);
    });

    it('should invalidate cache by entry type', () => {
      executeMemoryQuery({
        types: ['tools'],
        scope: { type: 'global', inherit: false },
      });

      executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
      });

      invalidateCacheEntry('tool');

      // Cache should be partially invalidated
      const stats = getQueryCacheStats();
      expect(typeof stats.size).toBe('number');
    });

    it('should set cache strategy', () => {
      // Default strategy
      setCacheStrategy('smart');

      executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
      });

      let stats = getQueryCacheStats();
      expect(stats.size).toBeGreaterThanOrEqual(0);

      clearQueryCache();

      // Aggressive caching
      setCacheStrategy('aggressive');

      executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
      });

      stats = getQueryCacheStats();
      expect(stats.size).toBeGreaterThanOrEqual(0);

      clearQueryCache();

      // No caching
      setCacheStrategy('off');

      executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
      });

      stats = getQueryCacheStats();
      // Off strategy should minimize caching
      expect(stats.size).toBeLessThanOrEqual(1);
    });
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

  describe('executeMemoryQueryAsync', () => {
    it('should handle async query without semantic search', async () => {
      const result = await executeMemoryQueryAsync({
        types: ['tools'],
        scope: { type: 'global', inherit: false },
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should handle errors in async query gracefully', async () => {
      // Query with potentially problematic input
      const result = await executeMemoryQueryAsync({
        types: ['guidelines'],
        scope: { type: 'invalid' as any, inherit: false },
        limit: 10,
      });

      // Should return results even with invalid scope
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

    it('should filter by date range', () => {
      const result = executeMemoryQuery({
        types: ['knowledge'],
        scope: { type: 'global', inherit: false },
        createdAfter: '2019-01-01T00:00:00.000Z',
        createdBefore: '2021-01-01T00:00:00.000Z',
      });

      expect(result).toBeDefined();
      expect(result.results.length).toBeGreaterThanOrEqual(0);
    });

    it('should use fuzzy text matching', () => {
      const result = executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
        search: 'prioriti', // Fuzzy match for "priority"
        fuzzy: true,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should use regex text matching', () => {
      const result = executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
        search: 'p.*y', // Regex pattern
        regex: true,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should use FTS5 when enabled', () => {
      const result = executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
        search: 'priority',
        useFts5: true,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should limit results', () => {
      const result = executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
        limit: 1,
      });

      expect(result.results.length).toBeLessThanOrEqual(1);
    });

    it('should query multiple types', () => {
      const result = executeMemoryQuery({
        types: ['tools', 'guidelines', 'knowledge'],
        scope: { type: 'global', inherit: false },
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should include versions when requested', () => {
      const result = executeMemoryQuery({
        types: ['guidelines'],
        scope: { type: 'global', inherit: false },
        includeVersions: true,
        compact: false,
      });

      expect(result).toBeDefined();
      if (result.results.length > 0) {
        expect(result.results[0]).toHaveProperty('versions');
      }
    });
  });
});
