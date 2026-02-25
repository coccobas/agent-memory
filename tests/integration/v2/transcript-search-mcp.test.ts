import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';
import { createSqliteMemoryV2Runtime } from '../../../src/v2/adapters/sqlite/factory.js';
import { ingest } from '../../../src/v2/hooks/ingest.js';
import { handleV2TranscriptSearch } from '../../../src/v2/mcp/transcript-search-handler.js';
import type { AppContext } from '../../../src/core/context.js';

function applyMigrations(sqlite: Database.Database): void {
  sqlite.pragma('foreign_keys = ON');
  for (const file of [
    '0044_add_v2_core_schema.sql',
    '0045_add_embedding_vector.sql',
    '0046_add_v2_transcripts.sql',
    '0047_add_transcript_fts_and_provenance.sql',
  ]) {
    sqlite.exec(readFileSync(join(process.cwd(), `src/db/migrations/${file}`), 'utf8'));
  }
}

function ensureScopes(sqlite: Database.Database): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO v2_scopes (id, type, parent_scope_id, name, metadata, created_at, updated_at)
       VALUES ('global:__root__', 'global', NULL, 'global', '{}', ?, ?)`
    )
    .run(now, now);
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO v2_scopes (id, type, parent_scope_id, name, label, metadata, is_archived, created_at, updated_at)
       VALUES ('project:test', 'project', 'global:__root__', 'test', 'Test', '{}', 0, ?, ?)`
    )
    .run(now, now);
}

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `id-${idSeq}`;
}

describe('handleV2TranscriptSearch MCP handler', () => {
  let sqlite: Database.Database;
  let context: AppContext;

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    applyMigrations(sqlite);
    ensureScopes(sqlite);
    idSeq = 0;

    context = { sqlite } as AppContext;

    // Seed a transcript with messages
    const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });
    await ingest(
      { sqlite, runtime },
      {
        claudeSessionId: 'sess-1',
        projectScopeId: 'project:test',
        messages: [
          { role: 'user', content: 'We need to configure Docker for the staging environment' },
          { role: 'assistant', content: 'I will set up a Docker compose file for staging' },
          {
            role: 'user',
            content: 'We always use multi-stage builds for production Docker images',
          },
        ],
      }
    );
  });

  describe('action: search', () => {
    it('returns transcript snippets for matching query', async () => {
      const result = (await handleV2TranscriptSearch(context, {
        action: 'search',
        query: 'Docker',
      })) as { results: unknown[]; totalCount: number; _display: string };

      expect(result.totalCount).toBeGreaterThanOrEqual(1);
      expect(result.results.length).toBeGreaterThanOrEqual(1);
      expect(result._display).toContain('Docker');
    });

    it('returns empty for non-matching query', async () => {
      const result = (await handleV2TranscriptSearch(context, {
        action: 'search',
        query: 'Kubernetes',
      })) as { results: unknown[]; totalCount: number; _display: string };

      expect(result.totalCount).toBe(0);
      expect(result.results).toEqual([]);
      expect(result._display).toContain('No transcript matches');
    });

    it('respects limit parameter', async () => {
      const result = (await handleV2TranscriptSearch(context, {
        action: 'search',
        query: 'Docker',
        limit: 1,
      })) as { results: unknown[]; totalCount: number };

      expect(result.results.length).toBeLessThanOrEqual(1);
    });

    it('throws on missing query', async () => {
      await expect(handleV2TranscriptSearch(context, { action: 'search' })).rejects.toThrow(
        'invalid_query'
      );
    });
  });

  describe('action: provenance', () => {
    it('returns provenance for an extracted entry', async () => {
      // Create a transcript with extraction
      const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });
      await ingest(
        { sqlite, runtime },
        {
          claudeSessionId: 'sess-extract',
          projectScopeId: 'project:test',
          messages: [
            {
              role: 'user',
              content:
                'We always use TypeScript strict mode in all projects for safety and correctness',
            },
          ],
          isFinal: true,
        }
      );

      // Find the extracted entry
      const entries = sqlite
        .prepare(`SELECT id FROM v2_entries WHERE source = 'hook_capture' AND is_active = 1`)
        .all() as { id: string }[];

      if (entries.length > 0) {
        const result = (await handleV2TranscriptSearch(context, {
          action: 'provenance',
          entryId: entries[0].id,
        })) as { entryId: string; provenance: { messages: unknown[] }[] };

        expect(result.entryId).toBe(entries[0].id);
        expect(result.provenance.length).toBeGreaterThan(0);
        expect(result.provenance[0].messages.length).toBeGreaterThan(0);
      }
    });

    it('returns empty provenance for entry without it', async () => {
      const result = (await handleV2TranscriptSearch(context, {
        action: 'provenance',
        entryId: 'nonexistent-entry',
      })) as { provenance: unknown[]; _display: string };

      expect(result.provenance).toEqual([]);
      expect(result._display).toContain('No provenance');
    });

    it('throws on missing entryId', async () => {
      await expect(handleV2TranscriptSearch(context, { action: 'provenance' })).rejects.toThrow(
        'invalid_entryId'
      );
    });
  });

  describe('invalid action', () => {
    it('throws on unknown action', async () => {
      await expect(handleV2TranscriptSearch(context, { action: 'unknown' })).rejects.toThrow(
        'invalid_action'
      );
    });
  });
});
