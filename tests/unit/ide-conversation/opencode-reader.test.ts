import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OpenCodeReader } from '../../../src/services/ide-conversation/opencode-reader.js';

describe('OpenCodeReader', () => {
  let testDir: string;
  let reader: OpenCodeReader;

  beforeEach(async () => {
    testDir = join(tmpdir(), `opencode-reader-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    reader = new OpenCodeReader(testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('isAvailable', () => {
    it('should return true when storage directory exists', async () => {
      expect(await reader.isAvailable()).toBe(true);
    });

    it('should return false when storage directory does not exist', async () => {
      const nonExistentReader = new OpenCodeReader('/non/existent/path');
      expect(await nonExistentReader.isAvailable()).toBe(false);
    });
  });

  describe('getDataPath', () => {
    it('should return the configured base path', () => {
      expect(reader.getDataPath()).toBe(testDir);
    });
  });

  describe('listSessions', () => {
    it('should return empty array when no sessions exist', async () => {
      const sessions = await reader.listSessions();
      expect(sessions).toEqual([]);
    });

    it('should list sessions from project directories', async () => {
      const sessionDir = join(testDir, 'session', 'project-hash');
      await mkdir(sessionDir, { recursive: true });

      const sessionData = {
        id: 'session-123',
        slug: 'fix-auth-bug',
        directory: '/Users/test/project',
        time: { created: Date.now(), updated: Date.now() },
      };

      await writeFile(join(sessionDir, 'session-123.json'), JSON.stringify(sessionData));

      const sessions = await reader.listSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        id: 'session-123',
        projectPath: '/Users/test/project',
        title: 'fix-auth-bug',
      });
    });

    it('should filter sessions by project path', async () => {
      const sessionDir = join(testDir, 'session', 'project-hash');
      await mkdir(sessionDir, { recursive: true });

      const session1 = {
        id: 'session-1',
        directory: '/Users/test/project-a',
        time: { created: Date.now() },
      };
      const session2 = {
        id: 'session-2',
        directory: '/Users/test/project-b',
        time: { created: Date.now() },
      };

      await writeFile(join(sessionDir, 'session-1.json'), JSON.stringify(session1));
      await writeFile(join(sessionDir, 'session-2.json'), JSON.stringify(session2));

      const sessions = await reader.listSessions('/Users/test/project-a');

      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.id).toBe('session-1');
    });

    it('should skip global sessions directory', async () => {
      const globalDir = join(testDir, 'session', 'global');
      await mkdir(globalDir, { recursive: true });

      const sessionData = {
        id: 'global-session',
        time: { created: Date.now() },
      };

      await writeFile(join(globalDir, 'global-session.json'), JSON.stringify(sessionData));

      const sessions = await reader.listSessions();
      expect(sessions).toHaveLength(0);
    });

    it('should sort sessions by creation time descending', async () => {
      const sessionDir = join(testDir, 'session', 'project-hash');
      await mkdir(sessionDir, { recursive: true });

      const older = {
        id: 'older',
        directory: '/test',
        time: { created: 1000 },
      };
      const newer = {
        id: 'newer',
        directory: '/test',
        time: { created: 2000 },
      };

      await writeFile(join(sessionDir, 'older.json'), JSON.stringify(older));
      await writeFile(join(sessionDir, 'newer.json'), JSON.stringify(newer));

      const sessions = await reader.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions[0]?.id).toBe('newer');
      expect(sessions[1]?.id).toBe('older');
    });
  });

  describe('getMessages', () => {
    it('should return empty array when message directory does not exist', async () => {
      const messages = await reader.getMessages('nonexistent-session');
      expect(messages).toEqual([]);
    });

    it('should read messages and their parts', async () => {
      const sessionId = 'test-session';
      const messageId = 'msg-1';

      const messageDir = join(testDir, 'message', sessionId);
      const partDir = join(testDir, 'part', messageId);

      await mkdir(messageDir, { recursive: true });
      await mkdir(partDir, { recursive: true });

      const messageData = {
        id: messageId,
        sessionID: sessionId,
        role: 'user',
        time: { created: Date.now() },
      };

      const partData = {
        id: 'part-1',
        sessionID: sessionId,
        messageID: messageId,
        type: 'text',
        text: 'Hello, world!',
      };

      await writeFile(join(messageDir, `${messageId}.json`), JSON.stringify(messageData));
      await writeFile(join(partDir, 'part-1.json'), JSON.stringify(partData));

      const messages = await reader.getMessages(sessionId);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        id: messageId,
        sessionId,
        role: 'user',
        content: 'Hello, world!',
      });
    });

    it('should extract tool calls from parts', async () => {
      const sessionId = 'test-session';
      const messageId = 'msg-1';

      const messageDir = join(testDir, 'message', sessionId);
      const partDir = join(testDir, 'part', messageId);

      await mkdir(messageDir, { recursive: true });
      await mkdir(partDir, { recursive: true });

      const messageData = {
        id: messageId,
        sessionID: sessionId,
        role: 'assistant',
        time: { created: Date.now() },
      };

      const toolPart = {
        id: 'part-1',
        sessionID: sessionId,
        messageID: messageId,
        type: 'tool',
        tool: 'Read',
        state: { status: 'completed', input: { path: '/file.txt' } },
      };

      await writeFile(join(messageDir, `${messageId}.json`), JSON.stringify(messageData));
      await writeFile(join(partDir, 'part-1.json'), JSON.stringify(toolPart));

      const messages = await reader.getMessages(sessionId);

      expect(messages).toHaveLength(1);
      expect(messages[0]?.toolsUsed).toEqual(['Read']);
      expect(messages[0]?.content).toContain('[Tool calls: Read]');
    });

    it('should filter messages by time range', async () => {
      const sessionId = 'test-session';
      const messageDir = join(testDir, 'message', sessionId);
      const partDir = join(testDir, 'part');

      await mkdir(messageDir, { recursive: true });

      const baseTime = Date.now();
      const messages = [
        { id: 'msg-1', sessionID: sessionId, role: 'user', time: { created: baseTime - 2000 } },
        { id: 'msg-2', sessionID: sessionId, role: 'assistant', time: { created: baseTime } },
        { id: 'msg-3', sessionID: sessionId, role: 'user', time: { created: baseTime + 2000 } },
      ];

      for (const msg of messages) {
        await writeFile(join(messageDir, `${msg.id}.json`), JSON.stringify(msg));
        const msgPartDir = join(partDir, msg.id);
        await mkdir(msgPartDir, { recursive: true });
        await writeFile(
          join(msgPartDir, 'part.json'),
          JSON.stringify({ type: 'text', text: `Content for ${msg.id}` })
        );
      }

      const filtered = await reader.getMessages(sessionId, {
        after: new Date(baseTime - 1000),
        before: new Date(baseTime + 1000),
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.id).toBe('msg-2');
    });

    it('should limit number of messages returned', async () => {
      const sessionId = 'test-session';
      const messageDir = join(testDir, 'message', sessionId);
      const partDir = join(testDir, 'part');

      await mkdir(messageDir, { recursive: true });

      for (let i = 0; i < 5; i++) {
        const msgId = `msg-${i}`;
        await writeFile(
          join(messageDir, `${msgId}.json`),
          JSON.stringify({
            id: msgId,
            sessionID: sessionId,
            role: 'user',
            time: { created: Date.now() + i },
          })
        );
        const msgPartDir = join(partDir, msgId);
        await mkdir(msgPartDir, { recursive: true });
        await writeFile(
          join(msgPartDir, 'part.json'),
          JSON.stringify({ type: 'text', text: `Message ${i}` })
        );
      }

      const limited = await reader.getMessages(sessionId, { limit: 2 });

      expect(limited).toHaveLength(2);
    });

    it('should sort messages by timestamp ascending', async () => {
      const sessionId = 'test-session';
      const messageDir = join(testDir, 'message', sessionId);
      const partDir = join(testDir, 'part');

      await mkdir(messageDir, { recursive: true });

      const messages = [
        { id: 'late', time: { created: 2000 } },
        { id: 'early', time: { created: 1000 } },
        { id: 'middle', time: { created: 1500 } },
      ];

      for (const msg of messages) {
        await writeFile(
          join(messageDir, `${msg.id}.json`),
          JSON.stringify({ ...msg, sessionID: sessionId, role: 'user' })
        );
        const msgPartDir = join(partDir, msg.id);
        await mkdir(msgPartDir, { recursive: true });
        await writeFile(
          join(msgPartDir, 'part.json'),
          JSON.stringify({ type: 'text', text: msg.id })
        );
      }

      const result = await reader.getMessages(sessionId);

      expect(result).toHaveLength(3);
      expect(result[0]?.id).toBe('early');
      expect(result[1]?.id).toBe('middle');
      expect(result[2]?.id).toBe('late');
    });

    it('should skip messages with no text content or tool calls', async () => {
      const sessionId = 'test-session';
      const messageDir = join(testDir, 'message', sessionId);
      const partDir = join(testDir, 'part');

      await mkdir(messageDir, { recursive: true });

      const messageData = {
        id: 'empty-msg',
        sessionID: sessionId,
        role: 'assistant',
        time: { created: Date.now() },
      };

      await writeFile(join(messageDir, 'empty-msg.json'), JSON.stringify(messageData));
      const msgPartDir = join(partDir, 'empty-msg');
      await mkdir(msgPartDir, { recursive: true });
      await writeFile(
        join(msgPartDir, 'part.json'),
        JSON.stringify({ type: 'tool-result', toolResult: {} })
      );

      const messages = await reader.getMessages(sessionId);
      expect(messages).toHaveLength(0);
    });
  });

  describe('findSessionByExternalId', () => {
    it('should find session by ID', async () => {
      const sessionDir = join(testDir, 'session', 'project-hash');
      await mkdir(sessionDir, { recursive: true });

      const sessionData = {
        id: 'target-session',
        directory: '/test/project',
        time: { created: Date.now() },
      };

      await writeFile(join(sessionDir, 'target-session.json'), JSON.stringify(sessionData));

      const found = await reader.findSessionByExternalId('target-session');

      expect(found).not.toBeNull();
      expect(found?.id).toBe('target-session');
    });

    it('should return null when session not found', async () => {
      const found = await reader.findSessionByExternalId('nonexistent');
      expect(found).toBeNull();
    });
  });
});
