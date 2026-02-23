import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  createSqliteMemoryV2Runtime,
  SqliteEmbeddingWriter,
} from '../../../src/v2/adapters/index.js';
import { cosineSimilarity } from '../../../src/v2/adapters/sqlite/shared.js';
import { ConflictError, NotFoundError } from '../../../src/v2/kernel/errors.js';
import type { ReadTraceEmitter, ReadTraceEvent } from '../../../src/v2/read/index.js';
import type { AppContext } from '../../../src/core/context.js';
import { handleV2MemoryQuery, handleV2MemoryWrite } from '../../../src/v2/mcp/index.js';

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

describe('V2 core additions', () => {
  describe('Vector storage + cosine similarity', () => {
    it('computes cosine similarity correctly for identical vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([1, 0, 0]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
    });

    it('computes cosine similarity correctly for orthogonal vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([0, 1, 0]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
    });

    it('computes cosine similarity correctly for opposite vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([-1, 0, 0]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
    });

    it('returns 0 for empty vectors', () => {
      expect(cosineSimilarity(new Float32Array([]), new Float32Array([]))).toBe(0);
    });

    it('returns 0 for mismatched dimensions', () => {
      const a = new Float32Array([1, 0]);
      const b = new Float32Array([1, 0, 0]);
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('writes embedding and queries via semantic channel with queryEmbedding', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);

      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: idGenerator('vec'),
      });

      const entry = await runtime.memory.write.upsertEntry({
        data: {
          type: 'knowledge',
          title: 'Vector test entry',
          content: 'This entry has an embedding for semantic search',
          source: 'import',
          scope: { type: 'project', id: 'alpha' },
        },
      });

      await runtime.projectorRunner.runBatch(50);

      const embeddingWriter = new SqliteEmbeddingWriter({ sqlite });
      const embedding = new Float32Array([0.5, 0.3, 0.8, 0.1]);
      await embeddingWriter.writeEmbedding(entry.ref.id, 'test-model', 4, embedding);

      const row = sqlite
        .prepare('SELECT status, embedding_model FROM v2_entry_embeddings WHERE entry_id = ?')
        .get(entry.ref.id) as { status: string; embedding_model: string };

      expect(row.status).toBe('ready');
      expect(row.embedding_model).toBe('test-model');

      const response = await runtime.memory.read.execute({
        query: 'semantic search',
        scope: { type: 'project', id: 'alpha' },
        limit: 10,
        queryEmbedding: [0.5, 0.3, 0.8, 0.1],
      });

      const ids = response.results.map((r) => r.entry.ref.id);
      expect(ids).toContain(entry.ref.id);

      const semanticResult = response.results.find((r) => r.entry.ref.id === entry.ref.id);
      expect(semanticResult).toBeDefined();
      expect(semanticResult!.score).toBeGreaterThan(0);

      sqlite.close();
    });

    it('lists pending embeddings and writes them', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);

      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: idGenerator('pending'),
      });

      await runtime.memory.write.upsertEntry({
        data: {
          type: 'knowledge',
          title: 'Pending embed',
          content: 'Needs embedding',
          source: 'import',
          scope: { type: 'project', id: 'alpha' },
        },
      });

      await runtime.projectorRunner.runBatch(50);

      const embeddingWriter = new SqliteEmbeddingWriter({ sqlite });
      const pending = await embeddingWriter.listPending(10);

      expect(pending.length).toBe(1);
      expect(pending[0]!.contentHash).toBeTruthy();

      await embeddingWriter.writeEmbedding(
        pending[0]!.entryId,
        'test-model',
        3,
        new Float32Array([0.1, 0.2, 0.3])
      );

      const afterWrite = await embeddingWriter.listPending(10);
      expect(afterWrite.length).toBe(0);

      sqlite.close();
    });

    it('skips semantic channel when queryEmbedding is absent', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);

      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: idGenerator('skip'),
      });

      await runtime.memory.write.upsertEntry({
        data: {
          type: 'knowledge',
          title: 'No embedding query',
          content: 'Should fall through to other channels',
          source: 'import',
          scope: { type: 'project', id: 'alpha' },
        },
      });

      await runtime.projectorRunner.runBatch(50);

      const response = await runtime.memory.read.execute({
        query: 'embedding query',
        scope: { type: 'project', id: 'alpha' },
        limit: 10,
      });

      expect(response.results.length).toBeGreaterThan(0);

      sqlite.close();
    });
  });

  describe('Token budget truncation', () => {
    it('truncates results to fit within token budget', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);

      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: idGenerator('budget'),
      });

      for (let i = 0; i < 5; i++) {
        await runtime.memory.write.upsertEntry({
          data: {
            type: 'knowledge',
            title: `Entry ${i}`,
            content: 'A'.repeat(400),
            source: 'import',
            scope: { type: 'project', id: 'alpha' },
            tags: ['budget-test'],
          },
        });
      }

      await runtime.projectorRunner.runBatch(100);

      const unbounded = await runtime.memory.read.execute({
        scope: { type: 'project', id: 'alpha' },
        limit: 10,
      });

      const bounded = await runtime.memory.read.execute({
        scope: { type: 'project', id: 'alpha' },
        limit: 10,
        tokenBudget: 200,
      });

      expect(bounded.results.length).toBeLessThan(unbounded.results.length);
      expect(bounded.totalCount).toBeLessThanOrEqual(unbounded.totalCount);

      const budgetTrace = bounded.trace.find((t) => t.name === 'budget_truncate');
      expect(budgetTrace).toBeDefined();
      expect(budgetTrace!.details?.tokenBudget).toBe(200);

      sqlite.close();
    });

    it('includes at least one result even if it exceeds the budget', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);

      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: idGenerator('min-budget'),
      });

      await runtime.memory.write.upsertEntry({
        data: {
          type: 'knowledge',
          title: 'Big entry',
          content: 'X'.repeat(2000),
          source: 'import',
          scope: { type: 'project', id: 'alpha' },
        },
      });

      await runtime.projectorRunner.runBatch(50);

      const result = await runtime.memory.read.execute({
        scope: { type: 'project', id: 'alpha' },
        limit: 10,
        tokenBudget: 10,
      });

      expect(result.results.length).toBe(1);

      sqlite.close();
    });

    it('skips budget_truncate stage when tokenBudget is not set', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);

      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: idGenerator('no-budget'),
      });

      await runtime.memory.write.upsertEntry({
        data: {
          type: 'knowledge',
          title: 'Normal query',
          content: 'No budget',
          source: 'import',
          scope: { type: 'project', id: 'alpha' },
        },
      });

      await runtime.projectorRunner.runBatch(50);

      const result = await runtime.memory.read.execute({
        scope: { type: 'project', id: 'alpha' },
        limit: 10,
      });

      const budgetTrace = result.trace.find((t) => t.name === 'budget_truncate');
      expect(budgetTrace).toBeUndefined();

      sqlite.close();
    });
  });

  describe('Scope admin actions', () => {
    it('creates a scope explicitly and reads it back', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);

      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: idGenerator('scope'),
      });

      const snapshot = await runtime.memory.write.createScope({
        type: 'session',
        id: 'session-123',
        label: 'Debug session',
      });

      expect(snapshot.type).toBe('session');
      expect(snapshot.externalId).toBe('session-123');
      expect(snapshot.label).toBe('Debug session');
      expect(snapshot.isArchived).toBe(false);

      sqlite.close();
    });

    it('archives a scope and verifies entries are still queryable', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);

      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: idGenerator('archive'),
      });

      await runtime.memory.write.createScope({
        type: 'session',
        id: 'ephemeral-1',
        label: 'Temp session',
      });

      const entry = await runtime.memory.write.upsertEntry({
        data: {
          type: 'knowledge',
          title: 'Session entry',
          content: 'Created in ephemeral session',
          source: 'remember',
          scope: { type: 'session', id: 'ephemeral-1' },
        },
      });

      await runtime.projectorRunner.runBatch(50);

      const archived = await runtime.memory.write.archiveScope('session:ephemeral-1');
      expect(archived).not.toBeNull();
      expect(archived!.isArchived).toBe(true);

      const response = await runtime.memory.read.execute({
        query: 'ephemeral session',
        scope: { type: 'session', id: 'ephemeral-1' },
        limit: 10,
      });

      const ids = response.results.map((r) => r.entry.ref.id);
      expect(ids).toContain(entry.ref.id);

      sqlite.close();
    });

    it('returns null when archiving a non-existent scope', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);

      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: idGenerator('no-scope'),
      });

      const result = await runtime.memory.write.archiveScope('session:nonexistent');
      expect(result).toBeNull();

      sqlite.close();
    });

    it('creates scope via MCP handler', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const context = contextWithSqlite(sqlite);

      const result = await handleV2MemoryWrite(context, {
        action: 'create_scope',
        scopeType: 'session',
        scopeId: 'mcp-session',
        label: 'MCP test session',
      });

      const snapshot = result as { type: string; label: string; isArchived: boolean };
      expect(snapshot.type).toBe('session');
      expect(snapshot.label).toBe('MCP test session');
      expect(snapshot.isArchived).toBe(false);

      sqlite.close();
    });

    it('archives scope via MCP handler', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const context = contextWithSqlite(sqlite);

      await handleV2MemoryWrite(context, {
        action: 'create_scope',
        scopeType: 'session',
        scopeId: 'archive-me',
      });

      const result = await handleV2MemoryWrite(context, {
        action: 'archive_scope',
        scopeId: 'session:archive-me',
      });

      const snapshot = result as { isArchived: boolean };
      expect(snapshot.isArchived).toBe(true);

      sqlite.close();
    });
  });

  describe('Typed errors', () => {
    it('throws ConflictError on version mismatch', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);

      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: idGenerator('conflict'),
      });

      const created = await runtime.memory.write.upsertEntry({
        data: {
          type: 'knowledge',
          title: 'Version test',
          content: 'v1',
          source: 'import',
          scope: { type: 'project', id: 'alpha' },
        },
      });

      await expect(
        runtime.memory.write.upsertEntry({
          entryId: created.ref.id,
          expectedVersion: 999,
          data: {
            type: 'knowledge',
            title: 'Version test',
            content: 'v2',
            source: 'import',
            scope: { type: 'project', id: 'alpha' },
          },
        })
      ).rejects.toThrow(ConflictError);

      sqlite.close();
    });

    it('throws NotFoundError when resolving missing entry for relation', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);

      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: idGenerator('notfound'),
      });

      const entry = await runtime.memory.write.upsertEntry({
        data: {
          type: 'knowledge',
          title: 'Exists',
          content: 'This entry exists',
          source: 'import',
          scope: { type: 'project', id: 'alpha' },
        },
      });

      await expect(
        runtime.memory.write.upsertRelation({
          source: entry.ref,
          target: { type: 'knowledge', id: 'nonexistent' },
          relationType: 'related_to',
        })
      ).rejects.toThrow(NotFoundError);

      sqlite.close();
    });
  });

  describe('Read trace emission', () => {
    it('emits trace events through the ReadTraceEmitter port', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);

      const emittedTraces: ReadTraceEvent[] = [];
      const traceEmitter: ReadTraceEmitter = {
        emit(trace) {
          emittedTraces.push(trace);
        },
      };

      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: idGenerator('trace'),
        traceEmitter,
      });

      await runtime.memory.write.upsertEntry({
        data: {
          type: 'knowledge',
          title: 'Trace test',
          content: 'Entry for trace emission testing',
          source: 'import',
          scope: { type: 'project', id: 'alpha' },
        },
      });

      await runtime.projectorRunner.runBatch(50);

      await runtime.memory.read.execute({
        query: 'trace test',
        scope: { type: 'project', id: 'alpha' },
        limit: 10,
      });

      expect(emittedTraces.length).toBe(1);

      const trace = emittedTraces[0]!;
      expect(trace.resultCount).toBeGreaterThan(0);
      expect(trace.entryIdsReturned.length).toBeGreaterThan(0);
      expect(trace.trace.length).toBeGreaterThan(0);
      expect(trace.timestamp).toBeTruthy();
      expect(trace.request.query).toBe('trace test');

      sqlite.close();
    });

    it('swallows errors from trace emitter without affecting results', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);

      const failingEmitter: ReadTraceEmitter = {
        emit() {
          throw new Error('trace_emission_failed');
        },
      };

      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: idGenerator('fail-trace'),
        traceEmitter: failingEmitter,
      });

      await runtime.memory.write.upsertEntry({
        data: {
          type: 'knowledge',
          title: 'Resilient query',
          content: 'Should work despite failing emitter',
          source: 'import',
          scope: { type: 'project', id: 'alpha' },
        },
      });

      await runtime.projectorRunner.runBatch(50);

      const response = await runtime.memory.read.execute({
        query: 'resilient',
        scope: { type: 'project', id: 'alpha' },
        limit: 10,
      });

      expect(response.results.length).toBeGreaterThan(0);

      sqlite.close();
    });
  });

  describe('MCP contract extensions', () => {
    it('parses tokenBudget in query handler', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const context = contextWithSqlite(sqlite);

      for (let i = 0; i < 5; i++) {
        await handleV2MemoryWrite(context, {
          action: 'upsert_entry',
          data: {
            type: 'knowledge',
            title: `Budget MCP entry ${i}`,
            content: 'B'.repeat(400),
            source: 'import',
            scope: { type: 'project', id: 'alpha' },
          },
        });
      }

      const result = (await handleV2MemoryQuery(context, {
        action: 'search',
        scope: { type: 'project', id: 'alpha' },
        limit: 10,
        tokenBudget: 250,
      })) as { results: unknown[]; trace: Array<{ name: string }> };

      expect(result.results.length).toBeLessThan(5);

      const budgetStage = result.trace.find((t) => t.name === 'budget_truncate');
      expect(budgetStage).toBeDefined();

      sqlite.close();
    });

    it('parses queryEmbedding in query handler', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const context = contextWithSqlite(sqlite);

      await handleV2MemoryWrite(context, {
        action: 'upsert_entry',
        data: {
          type: 'knowledge',
          title: 'Embedding MCP',
          content: 'Embedding via MCP handler',
          source: 'import',
          scope: { type: 'project', id: 'alpha' },
        },
      });

      const result = (await handleV2MemoryQuery(context, {
        action: 'search',
        scope: { type: 'project', id: 'alpha' },
        limit: 10,
        queryEmbedding: [0.1, 0.2, 0.3],
      })) as { results: unknown[] };

      expect(result).toBeDefined();

      sqlite.close();
    });
  });
});
