import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  createTestProject,
  schema,
  type TestDb,
} from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-session-auto-conversation.db';
let testDb: TestDb;
let testProjectId: string;

vi.mock('../../src/core/container.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/core/container.js')>();
  return {
    ...original,
    isContextRegistered: vi.fn(() => true),
    getContext: vi.fn(),
  };
});

vi.mock('../../src/services/librarian/index.js', () => ({
  createLibrarianService: vi.fn(() => null),
}));

import { runSessionStartCommand } from '../../src/commands/hook/session-start-command.js';
import { runUserPromptSubmitCommand } from '../../src/commands/hook/userpromptsubmit-command.js';
import { runPostToolUseCommand } from '../../src/commands/hook/posttooluse-command.js';
import { getContext } from '../../src/core/container.js';

describe('Session auto-conversation lifecycle', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);

    const project = createTestProject(testDb.db, 'Auto-Conversation Test Project');
    testProjectId = project.id;

    vi.mocked(getContext).mockReturnValue({
      db: testDb.sqlite,
      repos,
      services: {},
    } as unknown as ReturnType<typeof getContext>);
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    testDb.db.delete(schema.conversationMessages).run();
    testDb.db.delete(schema.conversations).run();
    testDb.db.delete(schema.sessions).run();
  });

  describe('SessionStart auto-creates conversation', () => {
    it('should create a conversation when session starts', async () => {
      const sessionId = `test-session-${Date.now()}`;

      testDb.db
        .insert(schema.sessions)
        .values({
          id: sessionId,
          projectId: testProjectId,
          name: 'Test Session',
          status: 'active',
        })
        .run();

      await runSessionStartCommand({
        projectId: testProjectId,
        agentId: 'test-agent',
        input: {
          session_id: sessionId,
          source: 'startup',
        },
      });

      const conversations = testDb.db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.sessionId, sessionId))
        .all();

      expect(conversations.length).toBe(1);
      expect(conversations[0]?.sessionId).toBe(sessionId);
      expect(conversations[0]?.status).toBe('active');
    });

    it('should not duplicate conversation on second session start', async () => {
      const sessionId = `test-session-${Date.now()}`;

      testDb.db
        .insert(schema.sessions)
        .values({
          id: sessionId,
          projectId: testProjectId,
          name: 'Test Session',
          status: 'active',
        })
        .run();

      await runSessionStartCommand({
        projectId: testProjectId,
        input: { session_id: sessionId, source: 'startup' },
      });

      await runSessionStartCommand({
        projectId: testProjectId,
        input: { session_id: sessionId, source: 'resume' },
      });

      const conversations = testDb.db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.sessionId, sessionId))
        .all();

      expect(conversations.length).toBe(1);
    });
  });

  describe('UserPromptSubmit captures user messages', () => {
    it('should capture user message to session conversation', async () => {
      const sessionId = `test-session-${Date.now()}`;

      testDb.db
        .insert(schema.sessions)
        .values({
          id: sessionId,
          projectId: testProjectId,
          name: 'Test Session',
          status: 'active',
        })
        .run();

      await runSessionStartCommand({
        projectId: testProjectId,
        input: { session_id: sessionId, source: 'startup' },
      });

      await runUserPromptSubmitCommand({
        projectId: testProjectId,
        input: {
          session_id: sessionId,
          prompt: 'Hello, this is a test message',
        },
      });

      const messages = testDb.db.select().from(schema.conversationMessages).all();

      expect(messages.length).toBe(1);
      expect(messages[0]?.role).toBe('user');
      expect(messages[0]?.content).toBe('Hello, this is a test message');
    });
  });

  describe('PostToolUse captures agent tool usage', () => {
    it('should capture tool use to session conversation', async () => {
      const sessionId = `test-session-${Date.now()}`;

      testDb.db
        .insert(schema.sessions)
        .values({
          id: sessionId,
          projectId: testProjectId,
          name: 'Test Session',
          status: 'active',
        })
        .run();

      await runSessionStartCommand({
        projectId: testProjectId,
        input: { session_id: sessionId, source: 'startup' },
      });

      await runPostToolUseCommand({
        projectId: testProjectId,
        input: {
          session_id: sessionId,
          tool_name: 'Read',
          tool_input: { file_path: '/test/file.ts' },
          tool_response: 'file contents here',
        },
      });

      const messages = testDb.db.select().from(schema.conversationMessages).all();

      expect(messages.length).toBe(1);
      expect(messages[0]?.role).toBe('agent');
      const toolsUsed = messages[0]?.toolsUsed;
      expect(toolsUsed).toBeDefined();
      expect(toolsUsed).toContain('Read');
    });
  });

  describe('Full conversation flow for episode linking', () => {
    it('should have messages ready for episode linking', async () => {
      const sessionId = `test-session-${Date.now()}`;

      testDb.db
        .insert(schema.sessions)
        .values({
          id: sessionId,
          projectId: testProjectId,
          name: 'Full Flow Test',
          status: 'active',
        })
        .run();

      await runSessionStartCommand({
        projectId: testProjectId,
        input: { session_id: sessionId, source: 'startup' },
      });

      await runUserPromptSubmitCommand({
        projectId: testProjectId,
        input: { session_id: sessionId, prompt: 'User message 1' },
      });

      await runPostToolUseCommand({
        projectId: testProjectId,
        input: {
          session_id: sessionId,
          tool_name: 'Edit',
          tool_input: { file: 'test.ts' },
          tool_response: { success: true },
        },
      });

      await runUserPromptSubmitCommand({
        projectId: testProjectId,
        input: { session_id: sessionId, prompt: 'User message 2' },
      });

      const conversations = testDb.db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.sessionId, sessionId))
        .all();

      expect(conversations.length).toBe(1);

      const messages = testDb.db.select().from(schema.conversationMessages).all();

      expect(messages.length).toBe(3);
      expect(messages.filter((m) => m.role === 'user').length).toBe(2);
      expect(messages.filter((m) => m.role === 'agent').length).toBe(1);
    });
  });
});
