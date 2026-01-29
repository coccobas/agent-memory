import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
const { Database } = require('bun:sqlite');
import { createErrorLogRepository } from './error-log.js';
import * as schema from '../schema.js';
import type { DatabaseDeps } from '../../core/types.js';

describe('ErrorLogRepository', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sqlite: any;
  let deps: DatabaseDeps;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join('/tmp', `test-error-log-${Date.now()}.db`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
    sqlite = new Database(testDbPath);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment
    db = drizzle(sqlite, { schema });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS error_log (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        project_id TEXT,
        tool_name TEXT NOT NULL,
        error_type TEXT NOT NULL,
        error_message TEXT,
        error_signature TEXT NOT NULL,
        occurrence_count INTEGER DEFAULT 1,
        first_occurrence TEXT NOT NULL,
        last_occurrence TEXT NOT NULL,
        tool_input_hash TEXT,
        analyzed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(error_signature, session_id)
      );

      CREATE INDEX IF NOT EXISTS idx_error_log_session ON error_log(session_id);
      CREATE INDEX IF NOT EXISTS idx_error_log_project ON error_log(project_id);
      CREATE INDEX IF NOT EXISTS idx_error_log_signature ON error_log(error_signature);
      CREATE INDEX IF NOT EXISTS idx_error_log_analyzed ON error_log(analyzed);
    `);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    deps = { db, sqlite };
  });

  afterEach(() => {
    if (sqlite) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      sqlite.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('record()', () => {
    it('should store a new error', async () => {
      const repo = createErrorLogRepository(deps);

      const error = {
        sessionId: 'sess-123',
        projectId: 'proj-456',
        toolName: 'Edit',
        errorType: 'FileNotFound',
        errorMessage: 'File /path/to/file.ts not found',
        errorSignature: 'hash-abc123',
      };

      const result = await repo.record(error);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.occurrenceCount).toBe(1);
      expect(result.analyzed).toBe(0);
    });

    it('should increment occurrence count on duplicate error signature', async () => {
      const repo = createErrorLogRepository(deps);

      const error = {
        sessionId: 'sess-123',
        projectId: 'proj-456',
        toolName: 'Edit',
        errorType: 'FileNotFound',
        errorMessage: 'File /path/to/file.ts not found',
        errorSignature: 'hash-abc123',
      };

      const first = await repo.record(error);
      expect(first.occurrenceCount).toBe(1);

      const second = await repo.record(error);
      expect(second.id).toBe(first.id);
      expect(second.occurrenceCount).toBe(2);
    });

    it('should update lastOccurrence on duplicate', async () => {
      const repo = createErrorLogRepository(deps);

      const error = {
        sessionId: 'sess-123',
        projectId: 'proj-456',
        toolName: 'Edit',
        errorType: 'FileNotFound',
        errorMessage: 'File /path/to/file.ts not found',
        errorSignature: 'hash-abc123',
      };

      const first = await repo.record(error);
      const firstLastOccurrence = first.lastOccurrence;

      await new Promise((resolve) => setTimeout(resolve, 10));

      const second = await repo.record(error);
      expect(second.lastOccurrence).not.toBe(firstLastOccurrence);
    });

    it('should truncate error message to 2000 chars', async () => {
      const repo = createErrorLogRepository(deps);

      const longMessage = 'x'.repeat(3000);
      const error = {
        sessionId: 'sess-123',
        projectId: 'proj-456',
        toolName: 'Edit',
        errorType: 'LongError',
        errorMessage: longMessage,
        errorSignature: 'hash-long',
      };

      const result = await repo.record(error);
      expect(result.errorMessage?.length).toBeLessThanOrEqual(2000);
    });

    it('should handle errors without projectId', async () => {
      const repo = createErrorLogRepository(deps);

      const error = {
        sessionId: 'sess-123',
        toolName: 'Bash',
        errorType: 'CommandFailed',
        errorMessage: 'Command failed',
        errorSignature: 'hash-bash',
      };

      const result = await repo.record(error);
      expect(result).toBeDefined();
      expect(result.projectId).toBeNull();
    });
  });

  describe('getBySession()', () => {
    it('should retrieve all errors for a session', async () => {
      const repo = createErrorLogRepository(deps);

      await repo.record({
        sessionId: 'sess-123',
        toolName: 'Edit',
        errorType: 'FileNotFound',
        errorMessage: 'Error 1',
        errorSignature: 'hash-1',
      });

      await repo.record({
        sessionId: 'sess-123',
        toolName: 'Bash',
        errorType: 'CommandFailed',
        errorMessage: 'Error 2',
        errorSignature: 'hash-2',
      });

      await repo.record({
        sessionId: 'sess-999',
        toolName: 'Edit',
        errorType: 'FileNotFound',
        errorMessage: 'Error 3',
        errorSignature: 'hash-3',
      });

      const errors = await repo.getBySession('sess-123');
      expect(errors).toHaveLength(2);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      expect(errors.every((e: any) => e.sessionId === 'sess-123')).toBe(true);
    });

    it('should return empty array for non-existent session', async () => {
      const repo = createErrorLogRepository(deps);
      const errors = await repo.getBySession('sess-nonexistent');
      expect(errors).toEqual([]);
    });
  });

  describe('getByProject()', () => {
    it('should retrieve all errors for a project', async () => {
      const repo = createErrorLogRepository(deps);

      await repo.record({
        sessionId: 'sess-1',
        projectId: 'proj-456',
        toolName: 'Edit',
        errorType: 'FileNotFound',
        errorMessage: 'Error 1',
        errorSignature: 'hash-1',
      });

      await repo.record({
        sessionId: 'sess-2',
        projectId: 'proj-456',
        toolName: 'Bash',
        errorType: 'CommandFailed',
        errorMessage: 'Error 2',
        errorSignature: 'hash-2',
      });

      await repo.record({
        sessionId: 'sess-3',
        projectId: 'proj-999',
        toolName: 'Edit',
        errorType: 'FileNotFound',
        errorMessage: 'Error 3',
        errorSignature: 'hash-3',
      });

      const errors = await repo.getByProject('proj-456');
      expect(errors).toHaveLength(2);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      expect(errors.every((e: any) => e.projectId === 'proj-456')).toBe(true);
    });

    it('should filter by days parameter', async () => {
      const repo = createErrorLogRepository(deps);

      await repo.record({
        sessionId: 'sess-1',
        projectId: 'proj-456',
        toolName: 'Edit',
        errorType: 'FileNotFound',
        errorMessage: 'Error 1',
        errorSignature: 'hash-1',
      });

      const errors = await repo.getByProject('proj-456', 1);
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getUnanalyzed()', () => {
    it('should retrieve unanalyzed errors', async () => {
      const repo = createErrorLogRepository(deps);

      const error1 = await repo.record({
        sessionId: 'sess-1',
        toolName: 'Edit',
        errorType: 'FileNotFound',
        errorMessage: 'Error 1',
        errorSignature: 'hash-1',
      });

      const error2 = await repo.record({
        sessionId: 'sess-2',
        toolName: 'Bash',
        errorType: 'CommandFailed',
        errorMessage: 'Error 2',
        errorSignature: 'hash-2',
      });

      await repo.markAnalyzed(error1.id);

      const unanalyzed = await repo.getUnanalyzed();
      expect(unanalyzed).toHaveLength(1);
      expect(unanalyzed[0]?.id).toBe(error2.id);
    });

    it('should respect limit parameter', async () => {
      const repo = createErrorLogRepository(deps);

      for (let i = 0; i < 5; i++) {
        await repo.record({
          sessionId: `sess-${i}`,
          toolName: 'Edit',
          errorType: 'FileNotFound',
          errorMessage: `Error ${i}`,
          errorSignature: `hash-${i}`,
        });
      }

      const unanalyzed = await repo.getUnanalyzed(2);
      expect(unanalyzed.length).toBeLessThanOrEqual(2);
    });
  });

  describe('markAnalyzed()', () => {
    it('should mark error as analyzed', async () => {
      const repo = createErrorLogRepository(deps);

      const error = await repo.record({
        sessionId: 'sess-1',
        toolName: 'Edit',
        errorType: 'FileNotFound',
        errorMessage: 'Error 1',
        errorSignature: 'hash-1',
      });

      expect(error.analyzed).toBe(0);

      await repo.markAnalyzed(error.id);

      const unanalyzed = await repo.getUnanalyzed();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      expect(unanalyzed.find((e: any) => e.id === error.id)).toBeUndefined();
    });
  });

  describe('deduplication edge cases', () => {
    it('should handle different sessions with same error signature', async () => {
      const repo = createErrorLogRepository(deps);

      const error = {
        toolName: 'Edit',
        errorType: 'FileNotFound',
        errorMessage: 'File not found',
        errorSignature: 'hash-same',
      };

      const sess1 = await repo.record({
        ...error,
        sessionId: 'sess-1',
      });

      const sess2 = await repo.record({
        ...error,
        sessionId: 'sess-2',
      });

      expect(sess1.id).not.toBe(sess2.id);
      expect(sess1.occurrenceCount).toBe(1);
      expect(sess2.occurrenceCount).toBe(1);
    });

    it('should handle null projectId in deduplication', async () => {
      const repo = createErrorLogRepository(deps);

      const error = {
        sessionId: 'sess-1',
        toolName: 'Edit',
        errorType: 'FileNotFound',
        errorMessage: 'File not found',
        errorSignature: 'hash-noproj',
      };

      const first = await repo.record(error);
      const second = await repo.record(error);

      expect(first.id).toBe(second.id);
      expect(second.occurrenceCount).toBe(2);
    });
  });
});
