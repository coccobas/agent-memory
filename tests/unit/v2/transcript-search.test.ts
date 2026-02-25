import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';
import { indexTranscriptMessage } from '../../../src/v2/adapters/sqlite/transcript-fts.js';
import { searchTranscripts } from '../../../src/v2/read/transcript-search.js';

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

function insertTranscript(
  sqlite: Database.Database,
  id: string,
  opts: { projectScopeId?: string } = {}
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO v2_transcripts
         (id, claude_session_id, project_scope_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?)`
    )
    .run(id, `session-${id}`, opts.projectScopeId ?? null, now, now);
}

function insertAndIndexMessage(
  sqlite: Database.Database,
  id: string,
  transcriptId: string,
  seqNum: number,
  content: string,
  role = 'user'
): void {
  sqlite
    .prepare(
      `INSERT INTO v2_transcript_messages
         (id, transcript_id, sequence_num, role, content, metadata)
       VALUES (?, ?, ?, ?, ?, '{}')`
    )
    .run(id, transcriptId, seqNum, role, content);

  indexTranscriptMessage(sqlite, id, transcriptId, content, role);
}

describe('searchTranscripts', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyMigrations(sqlite);
  });

  it('finds messages by keyword', () => {
    insertTranscript(sqlite, 'tx-1');
    insertAndIndexMessage(sqlite, 'msg-1', 'tx-1', 1, 'We use Docker for deployments');
    insertAndIndexMessage(sqlite, 'msg-2', 'tx-1', 2, 'Authentication uses JWT tokens');

    const result = searchTranscripts(sqlite, {
      query: 'Docker',
      limit: 10,
    });

    expect(result.totalCount).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].matchedMessageId).toBe('msg-1');
    expect(result.results[0].transcriptId).toBe('tx-1');
  });

  it('returns context window around matched message', () => {
    insertTranscript(sqlite, 'tx-1');
    insertAndIndexMessage(sqlite, 'msg-1', 'tx-1', 1, 'Hello, starting the project');
    insertAndIndexMessage(
      sqlite,
      'msg-2',
      'tx-1',
      2,
      'Let me set up Docker containers',
      'assistant'
    );
    insertAndIndexMessage(sqlite, 'msg-3', 'tx-1', 3, 'We use Docker compose for local dev');
    insertAndIndexMessage(
      sqlite,
      'msg-4',
      'tx-1',
      4,
      'Good idea, I will configure that',
      'assistant'
    );
    insertAndIndexMessage(sqlite, 'msg-5', 'tx-1', 5, 'Also set up CI pipeline');

    const result = searchTranscripts(sqlite, {
      query: 'Docker compose',
      limit: 10,
      contextWindow: 2,
    });

    expect(result.totalCount).toBeGreaterThanOrEqual(1);

    // Find the snippet matching msg-3
    const snippet = result.results.find((r) => r.matchedMessageId === 'msg-3');
    expect(snippet).toBeDefined();

    // Context window of 2: messages 1-5 (seq 3 +/- 2)
    expect(snippet!.messages.length).toBeGreaterThanOrEqual(3);
    expect(snippet!.messages.length).toBeLessThanOrEqual(5);
  });

  it('returns empty results for no match', () => {
    insertTranscript(sqlite, 'tx-1');
    insertAndIndexMessage(sqlite, 'msg-1', 'tx-1', 1, 'We use React for the frontend');

    const result = searchTranscripts(sqlite, {
      query: 'Kubernetes',
      limit: 10,
    });

    expect(result.totalCount).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('returns empty for empty query', () => {
    const result = searchTranscripts(sqlite, {
      query: '',
      limit: 10,
    });

    expect(result.totalCount).toBe(0);
  });

  it('handles FTS special characters gracefully', () => {
    insertTranscript(sqlite, 'tx-1');
    insertAndIndexMessage(sqlite, 'msg-1', 'tx-1', 1, 'We use React for rendering components');

    // These chars would break FTS5 if not sanitized
    const result = searchTranscripts(sqlite, {
      query: '"React" OR NOT (rendering)',
      limit: 10,
    });

    // Should not throw — sanitizer strips operators, leaving "React rendering"
    // which matches since both words appear in the content
    expect(result.totalCount).toBeGreaterThanOrEqual(1);
  });

  it('filters by scope', () => {
    insertTranscript(sqlite, 'tx-1', { projectScopeId: 'project:alpha' });
    insertTranscript(sqlite, 'tx-2', { projectScopeId: 'project:beta' });
    insertAndIndexMessage(sqlite, 'msg-1', 'tx-1', 1, 'Docker setup for alpha');
    insertAndIndexMessage(sqlite, 'msg-2', 'tx-2', 1, 'Docker setup for beta');

    const result = searchTranscripts(sqlite, {
      query: 'Docker',
      scope: { type: 'project', id: 'alpha' },
      limit: 10,
    });

    expect(result.totalCount).toBe(1);
    expect(result.results[0].transcriptId).toBe('tx-1');
  });

  it('filters by transcriptId', () => {
    insertTranscript(sqlite, 'tx-1');
    insertTranscript(sqlite, 'tx-2');
    insertAndIndexMessage(sqlite, 'msg-1', 'tx-1', 1, 'Docker in first session');
    insertAndIndexMessage(sqlite, 'msg-2', 'tx-2', 1, 'Docker in second session');

    const result = searchTranscripts(sqlite, {
      query: 'Docker',
      transcriptId: 'tx-2',
      limit: 10,
    });

    expect(result.totalCount).toBe(1);
    expect(result.results[0].transcriptId).toBe('tx-2');
  });

  it('includes transcript metadata in results', () => {
    insertTranscript(sqlite, 'tx-1', { projectScopeId: 'project:myproject' });
    insertAndIndexMessage(sqlite, 'msg-1', 'tx-1', 1, 'Authentication uses OAuth');

    const result = searchTranscripts(sqlite, {
      query: 'OAuth',
      limit: 10,
    });

    expect(result.results[0].transcript.claudeSessionId).toBe('session-tx-1');
    expect(result.results[0].transcript.projectScopeId).toBe('project:myproject');
    expect(result.results[0].transcript.createdAt).toBeTruthy();
  });

  it('respects limit and offset', () => {
    insertTranscript(sqlite, 'tx-1');
    for (let i = 1; i <= 5; i++) {
      insertAndIndexMessage(sqlite, `msg-${i}`, 'tx-1', i, `Docker configuration step ${i}`);
    }

    const page1 = searchTranscripts(sqlite, {
      query: 'Docker',
      limit: 2,
      offset: 0,
    });

    const page2 = searchTranscripts(sqlite, {
      query: 'Docker',
      limit: 2,
      offset: 2,
    });

    expect(page1.totalCount).toBe(5);
    expect(page1.results).toHaveLength(2);
    expect(page2.results).toHaveLength(2);

    // Different results on each page
    const page1Ids = page1.results.map((r) => r.matchedMessageId);
    const page2Ids = page2.results.map((r) => r.matchedMessageId);
    expect(page1Ids).not.toEqual(page2Ids);
  });

  it('score is positive (inverted from FTS rank)', () => {
    insertTranscript(sqlite, 'tx-1');
    insertAndIndexMessage(sqlite, 'msg-1', 'tx-1', 1, 'Docker is great for isolation');

    const result = searchTranscripts(sqlite, {
      query: 'Docker',
      limit: 10,
    });

    expect(result.results[0].score).toBeGreaterThan(0);
  });
});
