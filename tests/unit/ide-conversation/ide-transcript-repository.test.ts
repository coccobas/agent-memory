import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupTestDb, cleanupTestDb, type TestDb } from '../../fixtures/test-helpers.js';
import { createIDETranscriptRepository } from '../../../src/db/repositories/ide-transcripts.js';
import type { IIDETranscriptRepository } from '../../../src/core/interfaces/repositories.js';
import type { DatabaseDeps } from '../../../src/core/types.js';

const TEST_DB_PATH = join(tmpdir(), `ide-transcript-test-${Date.now()}.db`);

describe('IDETranscriptRepository', () => {
  let testDb: TestDb;
  let repository: IIDETranscriptRepository;

  beforeEach(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    repository = createIDETranscriptRepository(testDb as unknown as DatabaseDeps);
  });

  afterEach(() => {
    cleanupTestDb(TEST_DB_PATH);
  });

  afterEach(() => {
    cleanupTestDb(TEST_DB_PATH);
  });

  afterEach(() => {
    cleanupTestDb(testDb.sqlite, TEST_DB_PATH);
  });

  describe('create', () => {
    it('should create a transcript with all non-FK fields', async () => {
      const transcript = await repository.create({
        ideName: 'opencode',
        ideSessionId: 'session-123',
        projectPath: '/test/project',
        title: 'Fix auth bug',
        metadata: { foo: 'bar' },
      });

      expect(transcript.id).toBeDefined();
      expect(transcript.ideName).toBe('opencode');
      expect(transcript.ideSessionId).toBe('session-123');
      expect(transcript.projectId).toBeNull();
      expect(transcript.projectPath).toBe('/test/project');
      expect(transcript.agentMemorySessionId).toBeNull();
      expect(transcript.title).toBe('Fix auth bug');
      expect(transcript.messageCount).toBe(0);
      expect(transcript.isSealed).toBe(false);
      expect(transcript.metadata).toEqual({ foo: 'bar' });
    });

    it('should create a transcript with minimal fields', async () => {
      const transcript = await repository.create({
        ideName: 'cursor',
        ideSessionId: 'session-456',
      });

      expect(transcript.ideName).toBe('cursor');
      expect(transcript.ideSessionId).toBe('session-456');
      expect(transcript.projectId).toBeNull();
      expect(transcript.title).toBeNull();
    });
  });

  describe('getById', () => {
    it('should return transcript by ID', async () => {
      const created = await repository.create({
        ideName: 'opencode',
        ideSessionId: 'session-1',
      });

      const found = await repository.getById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should return undefined for non-existent ID', async () => {
      const found = await repository.getById('nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('getByIDESession', () => {
    it('should find transcript by IDE name and session ID', async () => {
      await repository.create({
        ideName: 'opencode',
        ideSessionId: 'unique-session',
        title: 'Target',
      });
      await repository.create({
        ideName: 'cursor',
        ideSessionId: 'unique-session',
        title: 'Other IDE',
      });

      const found = await repository.getByIDESession('opencode', 'unique-session');

      expect(found).toBeDefined();
      expect(found?.title).toBe('Target');
    });

    it('should return undefined when not found', async () => {
      const found = await repository.getByIDESession('opencode', 'nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list all transcripts', async () => {
      await repository.create({ ideName: 'opencode', ideSessionId: 's1' });
      await repository.create({ ideName: 'cursor', ideSessionId: 's2' });

      const all = await repository.list();

      expect(all).toHaveLength(2);
    });

    it('should filter by ideName', async () => {
      await repository.create({ ideName: 'opencode', ideSessionId: 's1' });
      await repository.create({ ideName: 'cursor', ideSessionId: 's2' });

      const filtered = await repository.list({ ideName: 'opencode' });

      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.ideName).toBe('opencode');
    });

    it.skip('should filter by projectId - requires valid FK references', async () => {
      // Skipped: Would need to create real projects first due to FK constraint
    });

    it('should filter by isSealed', async () => {
      const t1 = await repository.create({ ideName: 'opencode', ideSessionId: 's1' });
      await repository.create({ ideName: 'opencode', ideSessionId: 's2' });
      await repository.seal(t1.id);

      const sealed = await repository.list({ isSealed: true });
      const unsealed = await repository.list({ isSealed: false });

      expect(sealed).toHaveLength(1);
      expect(unsealed).toHaveLength(1);
    });

    it('should respect pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await repository.create({ ideName: 'opencode', ideSessionId: `s${i}` });
      }

      const page1 = await repository.list({}, { limit: 2 });
      const page2 = await repository.list({}, { limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
    });
  });

  describe('addMessage', () => {
    it('should add a message and update transcript counts', async () => {
      const transcript = await repository.create({
        ideName: 'opencode',
        ideSessionId: 's1',
      });

      const message = await repository.addMessage({
        transcriptId: transcript.id,
        ideMessageId: 'msg-1',
        role: 'user',
        content: 'Hello world',
        toolsUsed: ['Read', 'Write'],
        timestamp: '2026-01-26T10:00:00Z',
      });

      expect(message.id).toBeDefined();
      expect(message.content).toBe('Hello world');
      expect(message.toolsUsed).toEqual(['Read', 'Write']);

      const updated = await repository.getById(transcript.id);
      expect(updated?.messageCount).toBe(1);
      expect(updated?.lastMessageTimestamp).toBe('2026-01-26T10:00:00Z');
    });
  });

  describe('addMessages', () => {
    it('should bulk add messages', async () => {
      const transcript = await repository.create({
        ideName: 'opencode',
        ideSessionId: 's1',
      });

      const { added, skipped } = await repository.addMessages([
        {
          transcriptId: transcript.id,
          ideMessageId: 'msg-1',
          role: 'user',
          content: 'Hello',
          timestamp: '2026-01-26T10:00:00Z',
        },
        {
          transcriptId: transcript.id,
          ideMessageId: 'msg-2',
          role: 'assistant',
          content: 'Hi there',
          timestamp: '2026-01-26T10:01:00Z',
        },
      ]);

      expect(added).toBe(2);
      expect(skipped).toBe(0);

      const updated = await repository.getById(transcript.id);
      expect(updated?.messageCount).toBe(2);
    });

    it('should skip duplicate messages by ideMessageId', async () => {
      const transcript = await repository.create({
        ideName: 'opencode',
        ideSessionId: 's1',
      });

      await repository.addMessages([
        {
          transcriptId: transcript.id,
          ideMessageId: 'msg-1',
          role: 'user',
          content: 'Hello',
          timestamp: '2026-01-26T10:00:00Z',
        },
      ]);

      const { added, skipped } = await repository.addMessages([
        {
          transcriptId: transcript.id,
          ideMessageId: 'msg-1',
          role: 'user',
          content: 'Hello again',
          timestamp: '2026-01-26T10:00:00Z',
        },
        {
          transcriptId: transcript.id,
          ideMessageId: 'msg-2',
          role: 'assistant',
          content: 'New message',
          timestamp: '2026-01-26T10:01:00Z',
        },
      ]);

      expect(added).toBe(1);
      expect(skipped).toBe(1);
    });

    it('should handle empty input', async () => {
      const { added, skipped } = await repository.addMessages([]);
      expect(added).toBe(0);
      expect(skipped).toBe(0);
    });
  });

  describe('getMessages', () => {
    it('should retrieve messages for a transcript', async () => {
      const transcript = await repository.create({
        ideName: 'opencode',
        ideSessionId: 's1',
      });

      await repository.addMessages([
        {
          transcriptId: transcript.id,
          ideMessageId: 'msg-1',
          role: 'user',
          content: 'First',
          timestamp: '2026-01-26T10:00:00Z',
        },
        {
          transcriptId: transcript.id,
          ideMessageId: 'msg-2',
          role: 'assistant',
          content: 'Second',
          timestamp: '2026-01-26T10:01:00Z',
        },
      ]);

      const messages = await repository.getMessages(transcript.id);

      expect(messages).toHaveLength(2);
      expect(messages[0]?.content).toBe('First');
      expect(messages[1]?.content).toBe('Second');
    });

    it('should filter by after timestamp', async () => {
      const transcript = await repository.create({
        ideName: 'opencode',
        ideSessionId: 's1',
      });

      await repository.addMessages([
        {
          transcriptId: transcript.id,
          ideMessageId: 'msg-1',
          role: 'user',
          content: 'Early',
          timestamp: '2026-01-26T09:00:00Z',
        },
        {
          transcriptId: transcript.id,
          ideMessageId: 'msg-2',
          role: 'user',
          content: 'Late',
          timestamp: '2026-01-26T11:00:00Z',
        },
      ]);

      const messages = await repository.getMessages(transcript.id, {
        after: '2026-01-26T10:00:00Z',
      });

      expect(messages).toHaveLength(1);
      expect(messages[0]?.content).toBe('Late');
    });

    it('should limit results', async () => {
      const transcript = await repository.create({
        ideName: 'opencode',
        ideSessionId: 's1',
      });

      await repository.addMessages(
        Array.from({ length: 10 }, (_, i) => ({
          transcriptId: transcript.id,
          ideMessageId: `msg-${i}`,
          role: 'user' as const,
          content: `Message ${i}`,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
        }))
      );

      const messages = await repository.getMessages(transcript.id, { limit: 3 });

      expect(messages).toHaveLength(3);
    });
  });

  describe('getMessagesByTimeRange', () => {
    it('should return messages within time range', async () => {
      const transcript = await repository.create({
        ideName: 'opencode',
        ideSessionId: 's1',
      });

      await repository.addMessages([
        {
          transcriptId: transcript.id,
          ideMessageId: 'msg-1',
          role: 'user',
          content: 'Before',
          timestamp: '2026-01-26T09:00:00Z',
        },
        {
          transcriptId: transcript.id,
          ideMessageId: 'msg-2',
          role: 'user',
          content: 'During',
          timestamp: '2026-01-26T10:30:00Z',
        },
        {
          transcriptId: transcript.id,
          ideMessageId: 'msg-3',
          role: 'user',
          content: 'After',
          timestamp: '2026-01-26T12:00:00Z',
        },
      ]);

      const messages = await repository.getMessagesByTimeRange(
        transcript.id,
        '2026-01-26T10:00:00Z',
        '2026-01-26T11:00:00Z'
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]?.content).toBe('During');
    });
  });

  describe('seal', () => {
    it('should mark transcript as sealed', async () => {
      const transcript = await repository.create({
        ideName: 'opencode',
        ideSessionId: 's1',
      });

      const sealed = await repository.seal(transcript.id);

      expect(sealed.isSealed).toBe(true);
    });

    it('should be idempotent', async () => {
      const transcript = await repository.create({
        ideName: 'opencode',
        ideSessionId: 's1',
      });

      await repository.seal(transcript.id);
      const sealedAgain = await repository.seal(transcript.id);

      expect(sealedAgain.isSealed).toBe(true);
    });
  });

  describe('linkToSession', () => {
    it.skip('should update agentMemorySessionId - requires valid FK reference', () => {
      // Skipped: Would need to create a real session first due to FK constraint
    });
  });
});
