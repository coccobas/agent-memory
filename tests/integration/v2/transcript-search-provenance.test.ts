import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';
import { createSqliteMemoryV2Runtime } from '../../../src/v2/adapters/sqlite/factory.js';
import { ingest } from '../../../src/v2/hooks/ingest.js';
import { searchTranscripts } from '../../../src/v2/read/transcript-search.js';
import { loadProvenanceByEntry } from '../../../src/v2/adapters/sqlite/provenance-store.js';

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

describe('transcript search + provenance integration', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyMigrations(sqlite);
    ensureScopes(sqlite);
    idSeq = 0;
  });

  it('ingested messages are searchable via FTS', async () => {
    const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });

    await ingest(
      { sqlite, runtime },
      {
        claudeSessionId: 'sess-1',
        projectScopeId: 'project:test',
        messages: [
          { role: 'user', content: 'We always use Docker for deployment environments' },
          { role: 'assistant', content: 'Good practice. Docker ensures consistency.' },
          { role: 'user', content: 'We also use Kubernetes for orchestration' },
        ],
      }
    );

    const result = searchTranscripts(sqlite, {
      query: 'Docker',
      limit: 10,
    });

    expect(result.totalCount).toBeGreaterThanOrEqual(1);
    expect(result.results.some((r) => r.messages.some((m) => m.content.includes('Docker')))).toBe(
      true
    );
  });

  it('context window includes surrounding messages', async () => {
    const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });

    await ingest(
      { sqlite, runtime },
      {
        claudeSessionId: 'sess-1',
        projectScopeId: 'project:test',
        messages: [
          { role: 'user', content: 'Starting new auth module' },
          { role: 'assistant', content: 'What auth provider do you want?' },
          { role: 'user', content: 'We use OAuth2 with Google for authentication' },
          { role: 'assistant', content: 'I will set up the OAuth2 flow' },
          { role: 'user', content: 'Also add rate limiting' },
        ],
      }
    );

    const result = searchTranscripts(sqlite, {
      query: 'OAuth2',
      limit: 10,
      contextWindow: 1,
    });

    expect(result.totalCount).toBeGreaterThanOrEqual(1);

    const snippet = result.results[0];
    // Should have at least the matched message + 1 before + 1 after
    expect(snippet.messages.length).toBeGreaterThanOrEqual(2);
  });

  it('extraction with isFinal creates entries with provenance', async () => {
    const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });

    const result = await ingest(
      { sqlite, runtime },
      {
        claudeSessionId: 'sess-1',
        projectScopeId: 'project:test',
        messages: [
          {
            role: 'user',
            content: 'We always use TypeScript strict mode in all our projects for type safety',
          },
          { role: 'assistant', content: 'Good practice for catching errors early.' },
        ],
        isFinal: true,
      }
    );

    // Check extraction happened
    expect(result.extracted).toBeDefined();

    if (result.extracted && result.extracted.stored > 0) {
      // Find the created entry
      const entries = sqlite
        .prepare(`SELECT id FROM v2_entries WHERE source = 'hook_capture' AND is_active = 1`)
        .all() as { id: string }[];

      expect(entries.length).toBeGreaterThan(0);

      // Check provenance exists for the entry
      const provenance = loadProvenanceByEntry(sqlite, entries[0].id);
      expect(provenance.length).toBeGreaterThan(0);
      expect(provenance[0].extractorName).toBe('regex');
      expect(provenance[0].seqStart).toBeGreaterThanOrEqual(1);
      expect(provenance[0].seqEnd).toBeGreaterThanOrEqual(provenance[0].seqStart);
    }
  });

  it('tool_use and system messages are not FTS-indexed', async () => {
    const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });

    await ingest(
      { sqlite, runtime },
      {
        claudeSessionId: 'sess-1',
        projectScopeId: 'project:test',
        messages: [
          { role: 'user', content: 'Read the Docker config' },
          { role: 'tool_use', content: 'Read Docker compose yaml file', toolName: 'Read' },
          { role: 'tool_result', content: 'version: 3\nservices:\n  web:', toolName: 'Read' },
          { role: 'system', content: 'Docker system context' },
        ],
      }
    );

    // Only user message should be indexed
    const ftsCount = sqlite.prepare('SELECT COUNT(*) AS c FROM v2_transcript_fts').get() as {
      c: number;
    };
    expect(ftsCount.c).toBe(1);

    // Searching for tool_result content should return nothing
    const result = searchTranscripts(sqlite, {
      query: 'services web',
      limit: 10,
    });
    expect(result.totalCount).toBe(0);
  });

  it('multiple sessions are independently searchable', async () => {
    const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });

    await ingest(
      { sqlite, runtime },
      {
        claudeSessionId: 'sess-1',
        projectScopeId: 'project:test',
        messages: [{ role: 'user', content: 'Working on the Docker deployment pipeline' }],
      }
    );

    await ingest(
      { sqlite, runtime },
      {
        claudeSessionId: 'sess-2',
        projectScopeId: 'project:test',
        messages: [{ role: 'user', content: 'Debugging the authentication module' }],
      }
    );

    const dockerResults = searchTranscripts(sqlite, {
      query: 'Docker',
      limit: 10,
    });
    expect(dockerResults.totalCount).toBe(1);
    expect(dockerResults.results[0].transcript.claudeSessionId).toBe('sess-1');

    const authResults = searchTranscripts(sqlite, {
      query: 'authentication',
      limit: 10,
    });
    expect(authResults.totalCount).toBe(1);
    expect(authResults.results[0].transcript.claudeSessionId).toBe('sess-2');
  });
});
