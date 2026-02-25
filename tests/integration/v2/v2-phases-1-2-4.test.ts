import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createSqliteMemoryV2Runtime } from '../../../src/v2/adapters/index.js';
import { handleV2MemoryQuery, handleV2MemoryProjector } from '../../../src/v2/mcp/index.js';
import {
  handleSessionStart,
  handleSessionEnd,
  handleSessionList,
} from '../../../src/v2/mcp/session-handler.js';
import { detectProjectFromCwd, ensureProjectScope } from '../../../src/v2/mcp/context-detection.js';
import { formatHierarchicalContext } from '../../../src/v2/read/hierarchical-formatter.js';
import { embedPending } from '../../../src/v2/indexing/embedding-pipeline.js';
import { SqliteEmbeddingWriter } from '../../../src/v2/adapters/sqlite/indexing.js';
import type { AppContext } from '../../../src/core/context.js';
import type { EntrySnapshot } from '../../../src/v2/contracts/entry.js';

function applyV2Migrations(sqlite: Database.Database): void {
  sqlite.pragma('foreign_keys = ON');
  const base = readFileSync(
    join(process.cwd(), 'src/db/migrations/0044_add_v2_core_schema.sql'),
    'utf8'
  );
  sqlite.exec(base);

  const additions = readFileSync(
    join(process.cwd(), 'src/db/migrations/0045_add_embedding_vector.sql'),
    'utf8'
  );
  sqlite.exec(additions);
}

function idGenerator(prefix: string): () => string {
  let index = 0;
  return () => {
    index += 1;
    return `${prefix}-${index}`;
  };
}

function contextWithSqlite(sqlite: Database.Database): AppContext {
  return { sqlite } as unknown as AppContext;
}

// ==========================================================================
// Phase 1: Hierarchical Context
// ==========================================================================

describe('Phase 1: Hierarchical context in v2 read plane', () => {
  it('formatHierarchicalContext produces correct output shape', () => {
    const entries: EntrySnapshot[] = [
      {
        ref: { type: 'guideline', id: 'g1' },
        scope: { type: 'project', id: 'proj-1' },
        title: 'Always use strict mode',
        content: 'TypeScript strict mode prevents common errors.',
        category: 'code_style',
        confidence: null,
        tags: ['typescript'],
        source: 'remember',
        version: 1,
        priority: 95,
        metadata: {},
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-15T00:00:00Z',
        createdBy: null,
        updatedBy: null,
      },
      {
        ref: { type: 'knowledge', id: 'k1' },
        scope: { type: 'project', id: 'proj-1' },
        title: 'We use Vitest for testing',
        content: 'Testing infrastructure uses Vitest with integration tests.',
        category: 'testing',
        confidence: null,
        tags: ['testing'],
        source: 'remember',
        version: 1,
        priority: null,
        metadata: {},
        createdAt: '2026-02-01T00:00:00Z',
        updatedAt: '2026-02-01T00:00:00Z',
        createdBy: null,
        updatedBy: null,
      },
      {
        ref: { type: 'knowledge', id: 'k2' },
        scope: { type: 'global', id: null },
        title: '[TODO] Add more tests',
        content: 'We need to add more integration tests.',
        category: 'testing',
        confidence: null,
        tags: [],
        source: 'remember',
        version: 1,
        priority: null,
        metadata: {},
        createdAt: '2026-02-10T00:00:00Z',
        updatedAt: '2026-02-10T00:00:00Z',
        createdBy: null,
        updatedBy: null,
      },
    ];

    const result = formatHierarchicalContext(entries, { type: 'project', id: 'proj-1' });

    // Summary
    expect(result.summary.totalEntries).toBe(3);
    expect(result.summary.byType.guideline).toBe(1);
    expect(result.summary.byType.knowledge).toBe(2);
    expect(result.summary.byCategory.code_style).toBe(1);
    expect(result.summary.byCategory.testing).toBe(2);
    expect(result.summary.lastUpdated).toBeTruthy();

    // Critical items (priority >= 90)
    expect(result.critical).toHaveLength(1);
    expect(result.critical[0]!.id).toBe('g1');
    expect(result.critical[0]!.priority).toBe(95);

    // Recent items (sorted by updatedAt desc)
    expect(result.recent).toHaveLength(3);
    expect(result.recent[0]!.id).toBe('k2'); // Feb 10

    // Work items
    expect(result.workItems).toHaveLength(1);
    expect(result.workItems[0]!.id).toBe('k2');
    expect(result.workItems[0]!.title).toBe('[TODO] Add more tests');

    // Categories
    expect(result.categories).toEqual(['code_style', 'testing']);

    // Expand actions
    expect(result.expand.byCategory.tool).toBe('memory_query');
    expect(result.expand.bySearch.tool).toBe('memory_query');
    expect(result.expand.fullContext.tool).toBe('memory_query');

    // Meta
    expect(result.meta.scopeType).toBe('project');
    expect(result.meta.scopeId).toBe('proj-1');
    expect(result.meta.tokenSavings).toContain('90%');
  });

  it('context action via MCP handler returns hierarchical result', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);
    const context = contextWithSqlite(sqlite);

    const runtime = createSqliteMemoryV2Runtime({
      sqlite,
      idGenerator: idGenerator('ctx'),
    });

    // Create entries across global and project scope
    await runtime.memory.write.upsertEntry({
      data: {
        type: 'guideline',
        title: 'Critical security rule',
        content: 'Never expose API keys in client code.',
        source: 'remember',
        scope: { type: 'project', id: 'alpha' },
        priority: 95,
        category: 'security',
      },
    });

    await runtime.memory.write.upsertEntry({
      data: {
        type: 'knowledge',
        title: 'Architecture decision',
        content: 'We chose CQRS for the v2 rewrite.',
        source: 'remember',
        scope: { type: 'global', id: null },
        category: 'architecture',
      },
    });

    await runtime.projectorRunner.runBatch(50);

    const result = (await handleV2MemoryQuery(context, {
      action: 'context',
      scope: { type: 'project', id: 'alpha' },
      hierarchical: true,
    })) as {
      summary: { totalEntries: number; byType: Record<string, number> };
      critical: Array<{ id: string; priority?: number }>;
      recent: unknown[];
      categories: string[];
      meta: { scopeType: string };
    };

    expect(result.summary).toBeDefined();
    expect(result.summary.totalEntries).toBeGreaterThanOrEqual(2);
    expect(result.critical.length).toBeGreaterThanOrEqual(1);
    expect(result.critical[0]!.priority).toBe(95);
    expect(result.categories).toContain('security');
    expect(result.meta.scopeType).toBe('project');

    sqlite.close();
  });

  it('context action with hierarchical=false returns full entries', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);
    const context = contextWithSqlite(sqlite);

    const runtime = createSqliteMemoryV2Runtime({
      sqlite,
      idGenerator: idGenerator('full'),
    });

    await runtime.memory.write.upsertEntry({
      data: {
        type: 'knowledge',
        title: 'Full entry',
        content: 'This should be returned in full.',
        source: 'remember',
        scope: { type: 'project', id: 'beta' },
      },
    });

    await runtime.projectorRunner.runBatch(50);

    const result = (await handleV2MemoryQuery(context, {
      action: 'context',
      scope: { type: 'project', id: 'beta' },
      hierarchical: false,
    })) as { entries: EntrySnapshot[]; totalCount: number };

    expect(result.entries).toBeDefined();
    expect(result.entries.length).toBeGreaterThanOrEqual(1);
    expect(result.totalCount).toBeGreaterThanOrEqual(1);
    expect(result.entries[0]!.title).toBe('Full entry');

    sqlite.close();
  });
});

// ==========================================================================
// Phase 2: Session Lifecycle
// ==========================================================================

describe('Phase 2: Session lifecycle on v2 scopes', () => {
  it('starts a session and creates a v2 scope', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);
    const context = contextWithSqlite(sqlite);

    const result = await handleSessionStart(context, {
      projectId: 'proj-1',
      name: 'Fix auth bug',
      purpose: 'Debug login timeout',
      agentId: 'claude-code',
    });

    expect(result.created).toBe(true);
    expect(result.session.name).toBe('Fix auth bug');
    expect(result.session.scopeId).toContain('session:');
    expect(result.session.projectScopeId).toBe('project:proj-1');
    expect(result.session.metadata.agentId).toBe('claude-code');
    expect(result.session.metadata.purpose).toBe('Debug login timeout');
    expect(result.session.metadata.startedAt).toBeTruthy();

    sqlite.close();
  });

  it('ends a session by archiving the scope', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);
    const context = contextWithSqlite(sqlite);

    const { session } = await handleSessionStart(context, {
      projectId: 'proj-1',
      name: 'Temp session',
    });

    const endResult = await handleSessionEnd(context, {
      sessionScopeId: session.scopeId,
    });

    expect('archived' in endResult && endResult.archived).toBe(true);
    if ('session' in endResult) {
      expect(endResult.session.isArchived).toBe(true);
    }

    sqlite.close();
  });

  it('lists sessions for a project', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);
    const context = contextWithSqlite(sqlite);

    await handleSessionStart(context, { projectId: 'proj-1', name: 'Session A' });
    await handleSessionStart(context, { projectId: 'proj-1', name: 'Session B' });
    await handleSessionStart(context, { projectId: 'proj-2', name: 'Session C' });

    const result = handleSessionList(context, { projectId: 'proj-1' });

    expect(result.total).toBe(2);
    expect(result.sessions).toHaveLength(2);
    const names = result.sessions.map((s) => s.name);
    expect(names).toContain('Session A');
    expect(names).toContain('Session B');

    sqlite.close();
  });

  it('lists all sessions when no projectId filter', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);
    const context = contextWithSqlite(sqlite);

    await handleSessionStart(context, { projectId: 'proj-1', name: 'Session X' });
    await handleSessionStart(context, { projectId: 'proj-2', name: 'Session Y' });

    const result = handleSessionList(context, {});

    expect(result.total).toBe(2);

    sqlite.close();
  });

  it('returns error when ending a non-existent session', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);
    const context = contextWithSqlite(sqlite);

    const result = await handleSessionEnd(context, {
      sessionScopeId: 'session:nonexistent',
    });

    expect('error' in result).toBe(true);

    sqlite.close();
  });

  describe('context detection', () => {
    it('detects project from cwd via metadata.rootPath', () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const now = new Date().toISOString();

      // Ensure global root
      sqlite
        .prepare(
          `INSERT INTO v2_scopes (id, type, parent_scope_id, name, metadata, created_at, updated_at)
           VALUES ('global:__root__', 'global', NULL, 'global', '{}', ?, ?)
           ON CONFLICT(id) DO NOTHING`
        )
        .run(now, now);

      // Create a project scope with rootPath metadata
      sqlite
        .prepare(
          `INSERT INTO v2_scopes (id, type, parent_scope_id, name, label, metadata, is_archived, created_at, updated_at)
           VALUES ('project:abc', 'project', 'global:__root__', 'abc', 'my-project', ?, 0, ?, ?)`
        )
        .run(JSON.stringify({ rootPath: '/Users/dev/my-project' }), now, now);

      const detected = detectProjectFromCwd(sqlite, '/Users/dev/my-project');
      expect(detected.projectScopeId).toBe('project:abc');
      expect(detected.projectLabel).toBe('my-project');

      // Non-matching path
      const noMatch = detectProjectFromCwd(sqlite, '/Users/dev/other-project');
      expect(noMatch.projectScopeId).toBeNull();

      sqlite.close();
    });

    it('ensureProjectScope creates and returns scope key', () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);

      const key = ensureProjectScope(sqlite, 'proj-99', 'My Project', '/home/dev/proj');
      expect(key).toBe('project:proj-99');

      // Verify it was created
      const row = sqlite.prepare('SELECT name, metadata FROM v2_scopes WHERE id = ?').get(key) as {
        name: string;
        metadata: string;
      };

      expect(row.name).toBe('My Project');
      const meta = JSON.parse(row.metadata) as Record<string, unknown>;
      expect(meta.rootPath).toBe('/home/dev/proj');

      // Idempotent
      const key2 = ensureProjectScope(sqlite, 'proj-99');
      expect(key2).toBe('project:proj-99');

      sqlite.close();
    });
  });
});

// ==========================================================================
// Phase 4: Embedding Pipeline
// ==========================================================================

describe('Phase 4: Embedding pipeline', () => {
  it('processes pending embeddings via embedPending()', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);

    const runtime = createSqliteMemoryV2Runtime({
      sqlite,
      idGenerator: idGenerator('emb'),
    });

    // Create entries
    await runtime.memory.write.upsertEntry({
      data: {
        type: 'knowledge',
        title: 'Embed me',
        content: 'This entry needs an embedding.',
        source: 'remember',
        scope: { type: 'project', id: 'alpha' },
      },
    });

    await runtime.memory.write.upsertEntry({
      data: {
        type: 'guideline',
        title: 'Embed me too',
        content: 'Another entry needing an embedding.',
        source: 'remember',
        scope: { type: 'project', id: 'alpha' },
      },
    });

    // Drain outbox so SemanticProjector marks them pending
    await runtime.projectorRunner.runBatch(50);

    const writer = new SqliteEmbeddingWriter({ sqlite });
    const pending = await writer.listPending(10);
    expect(pending.length).toBe(2);

    // Mock embedding service
    const mockService = {
      isAvailable: () => true,
      embed: async (_text: string) => ({
        embedding: [0.1, 0.2, 0.3],
        model: 'mock-model',
      }),
      getEmbeddingDimension: () => 3,
    };

    const result = await embedPending(sqlite, mockService, 10);

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);

    // Verify embeddings are no longer pending
    const afterPending = await writer.listPending(10);
    expect(afterPending.length).toBe(0);

    sqlite.close();
  });

  it('returns skipped when embedding service is unavailable', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);

    const runtime = createSqliteMemoryV2Runtime({
      sqlite,
      idGenerator: idGenerator('unavail'),
    });

    await runtime.memory.write.upsertEntry({
      data: {
        type: 'knowledge',
        title: 'Cannot embed',
        content: 'Service is down.',
        source: 'remember',
        scope: { type: 'project', id: 'alpha' },
      },
    });

    await runtime.projectorRunner.runBatch(50);

    const mockService = {
      isAvailable: () => false,
      embed: async () => ({ embedding: [], model: '' }),
      getEmbeddingDimension: () => 0,
    };

    const result = await embedPending(sqlite, mockService, 10);

    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]!.error).toBe('embedding_service_unavailable');

    sqlite.close();
  });

  it('handles individual embedding failures gracefully', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);

    const runtime = createSqliteMemoryV2Runtime({
      sqlite,
      idGenerator: idGenerator('fail'),
    });

    await runtime.memory.write.upsertEntry({
      data: {
        type: 'knowledge',
        title: 'Will fail',
        content: 'This one will fail to embed.',
        source: 'remember',
        scope: { type: 'project', id: 'alpha' },
      },
    });

    await runtime.projectorRunner.runBatch(50);

    const mockService = {
      isAvailable: () => true,
      embed: async () => {
        throw new Error('API rate limit');
      },
      getEmbeddingDimension: () => 3,
    };

    const result = await embedPending(sqlite, mockService, 10);

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]!.error).toBe('API rate limit');

    sqlite.close();
  });

  it('embed_pending action via projector MCP handler', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);

    const runtime = createSqliteMemoryV2Runtime({
      sqlite,
      idGenerator: idGenerator('proj-emb'),
    });

    await runtime.memory.write.upsertEntry({
      data: {
        type: 'knowledge',
        title: 'MCP embed',
        content: 'Via projector handler.',
        source: 'remember',
        scope: { type: 'project', id: 'alpha' },
      },
    });

    await runtime.projectorRunner.runBatch(50);

    // Without embedding service, returns error
    const context = contextWithSqlite(sqlite);
    const result = (await handleV2MemoryProjector(context, {
      action: 'embed_pending',
      limit: 10,
    })) as { action: string; error?: string };

    expect(result.action).toBe('embed_pending');
    expect(result.error).toBe('no_embedding_service');

    sqlite.close();
  });
});
