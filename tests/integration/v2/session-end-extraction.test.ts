import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';
import { createSqliteMemoryV2Runtime } from '../../../src/v2/adapters/sqlite/factory.js';
import {
  upsertTranscript,
  appendMessages,
  findByClaudeSessionId,
} from '../../../src/v2/adapters/sqlite/transcript-store.js';
import { deduplicateCandidates, runSessionEndExtraction } from '../../../src/v2/hooks/extractor.js';
import type { ExtractionCandidate } from '../../../src/v2/contracts/extractor.js';

function applyMigrations(sqlite: Database.Database): void {
  sqlite.pragma('foreign_keys = ON');
  for (const file of [
    '0044_add_v2_core_schema.sql',
    '0045_add_embedding_vector.sql',
    '0046_add_v2_transcripts.sql',
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
       VALUES ('project:test', 'project', 'global:__root__', 'test', 'Test Project', '{}', 0, ?, ?)`
    )
    .run(now, now);
}

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `id-${idSeq}`;
}

describe('session-end-extraction', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyMigrations(sqlite);
    ensureScopes(sqlite);
    idSeq = 0;
  });

  describe('deduplicateCandidates', () => {
    it('removes candidates that match existing FTS entries', async () => {
      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: nextId,
      });

      // Store an existing entry
      await runtime.memory.write.upsertEntry({
        data: {
          type: 'guideline',
          title: 'Use TypeScript strict mode',
          content: 'We always use TypeScript strict mode',
          source: 'remember',
          scope: { type: 'project', id: 'test' },
        },
      });

      // Run projector to populate FTS
      await runtime.projectorRunner.runBatch(100);

      const candidates: ExtractionCandidate[] = [
        {
          title: 'Use TypeScript strict mode',
          content: 'We always use TypeScript strict mode',
          entryType: 'guideline',
          category: 'code_style',
          confidence: 0.7,
          source: 'regex',
        },
      ];

      const result = deduplicateCandidates(sqlite, candidates);
      expect(result).toHaveLength(0);
    });

    it('keeps candidates with no FTS match', () => {
      const candidates: ExtractionCandidate[] = [
        {
          title: 'Brand new guideline',
          content: 'Something completely new and original',
          entryType: 'guideline',
          category: 'workflow',
          confidence: 0.7,
          source: 'regex',
        },
      ];

      const result = deduplicateCandidates(sqlite, candidates);
      expect(result).toHaveLength(1);
    });
  });

  describe('runSessionEndExtraction', () => {
    it('loads messages, runs pipeline, deduplicates, stores', async () => {
      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: nextId,
      });

      upsertTranscript(sqlite, {
        id: 'tx-1',
        claudeSessionId: 'sess-1',
        status: 'ended',
        projectScopeId: 'project:test',
      });

      appendMessages(sqlite, {
        transcriptId: 'tx-1',
        messages: [
          {
            id: 'm1',
            role: 'user',
            content: 'We always follow the Airbnb coding style convention for all our projects',
            sequenceNum: 1,
          },
          {
            id: 'm2',
            role: 'assistant',
            content: 'Got it, I will follow Airbnb style.',
            sequenceNum: 2,
          },
        ],
        newByteOffset: 300,
      });

      const result = await runSessionEndExtraction(sqlite, runtime, 'tx-1', {
        projectExternalId: 'test',
      });

      expect(result.stored).toBeGreaterThanOrEqual(1);
    });

    it('creates entries with source="hook_capture"', async () => {
      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: nextId,
      });

      upsertTranscript(sqlite, {
        id: 'tx-1',
        claudeSessionId: 'sess-1',
        status: 'ended',
        projectScopeId: 'project:test',
      });

      appendMessages(sqlite, {
        transcriptId: 'tx-1',
        messages: [
          {
            id: 'm1',
            role: 'user',
            content:
              'We decided to use Redis for caching because of its performance and TTL support',
            sequenceNum: 1,
          },
        ],
        newByteOffset: 200,
      });

      await runSessionEndExtraction(sqlite, runtime, 'tx-1', {
        projectExternalId: 'test',
      });

      const entries = sqlite
        .prepare(`SELECT source FROM v2_entries WHERE source = 'hook_capture'`)
        .all() as { source: string }[];
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });

    it('updates transcript status to "extracted"', async () => {
      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: nextId,
      });

      upsertTranscript(sqlite, {
        id: 'tx-1',
        claudeSessionId: 'sess-1',
        status: 'ended',
        projectScopeId: 'project:test',
      });

      appendMessages(sqlite, {
        transcriptId: 'tx-1',
        messages: [
          {
            id: 'm1',
            role: 'user',
            content: 'The architecture uses microservices design pattern for better scaling',
            sequenceNum: 1,
          },
        ],
        newByteOffset: 200,
      });

      await runSessionEndExtraction(sqlite, runtime, 'tx-1', {
        projectExternalId: 'test',
      });

      const tx = findByClaudeSessionId(sqlite, 'sess-1');
      expect(tx?.status).toBe('extracted');
    });

    it('returns correct extraction result counts', async () => {
      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: nextId,
      });

      upsertTranscript(sqlite, {
        id: 'tx-1',
        claudeSessionId: 'sess-1',
        status: 'ended',
        projectScopeId: 'project:test',
      });

      appendMessages(sqlite, {
        transcriptId: 'tx-1',
        messages: [
          {
            id: 'm1',
            role: 'user',
            content: 'We must always validate security tokens before processing requests',
            sequenceNum: 1,
          },
        ],
        newByteOffset: 200,
      });

      const result = await runSessionEndExtraction(sqlite, runtime, 'tx-1', {
        projectExternalId: 'test',
      });

      expect(result.candidates).toBeGreaterThanOrEqual(0);
      expect(result.stored).toBeGreaterThanOrEqual(0);
      expect(result.duplicatesSkipped).toBeGreaterThanOrEqual(0);
      expect(result.candidates).toBe(result.stored + result.duplicatesSkipped);
    });

    it('handles empty transcript gracefully', async () => {
      const runtime = createSqliteMemoryV2Runtime({
        sqlite,
        idGenerator: nextId,
      });

      upsertTranscript(sqlite, {
        id: 'tx-1',
        claudeSessionId: 'sess-1',
        status: 'ended',
        projectScopeId: 'project:test',
      });

      const result = await runSessionEndExtraction(sqlite, runtime, 'tx-1', {
        projectExternalId: 'test',
      });

      expect(result.candidates).toBe(0);
      expect(result.stored).toBe(0);
      expect(result.duplicatesSkipped).toBe(0);
    });
  });
});
