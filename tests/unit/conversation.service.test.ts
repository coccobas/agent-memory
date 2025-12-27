import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  schema,
  createTestProject,
  createTestSession,
  createTestConversation,
  createTestMessage,
  createTestContextLink,
  createTestTool,
  createTestKnowledge,
  createTestRepositories,
} from '../fixtures/test-helpers.js';
import {
  createConversationService,
  type ConversationService,
} from '../../src/services/conversation.service.js';
import type { MemoryQueryResult } from '../../src/services/query.service.js';
import type { Repositories } from '../../src/core/interfaces/repositories.js';
import { eq } from 'drizzle-orm';

const TEST_DB_PATH = './data/test-conversation-service.db';

let testDb: ReturnType<typeof setupTestDb>;
let repos: Repositories;
let conversationService: ConversationService;
let testProjectId: string;
let testSessionId: string;

// Helper shortcut to maintain compatibility
let db: ReturnType<typeof setupTestDb>['db'];

// Helper functions to maintain test compatibility
async function autoLinkContextFromQuery(
  ...args: Parameters<ConversationService['autoLinkContextFromQuery']>
) {
  return await conversationService.autoLinkContextFromQuery(...args);
}

async function generateConversationSummary(
  ...args: Parameters<ConversationService['generateConversationSummary']>
) {
  return await conversationService.generateConversationSummary(...args);
}

async function extractKnowledgeFromConversation(
  ...args: Parameters<ConversationService['extractKnowledgeFromConversation']>
) {
  return await conversationService.extractKnowledgeFromConversation(...args);
}

async function getConversationAnalytics(
  ...args: Parameters<ConversationService['getConversationAnalytics']>
) {
  return await conversationService.getConversationAnalytics(...args);
}

describe('Conversation Service', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    db = testDb.db; // For compatibility with existing test helpers
    repos = createTestRepositories(testDb);
    conversationService = createConversationService(repos.conversations);

    const project = createTestProject(db, 'Service Test Project');
    testProjectId = project.id;
    const session = createTestSession(db, testProjectId, 'Service Test Session');
    testSessionId = session.id;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    db.delete(schema.conversationContext).run();
    db.delete(schema.conversationMessages).run();
    db.delete(schema.conversations).run();
  });

  describe('autoLinkContextFromQuery', () => {
    it('should link entries from query result', async () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const { tool } = createTestTool(db, 'test-tool');
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');

      const queryResult: MemoryQueryResult = {
        results: [
          {
            type: 'tool',
            id: tool.id,
            scopeType: 'global',
            scopeId: null,
            tags: [],
            score: 0.95,
            tool: tool,
          },
          {
            type: 'knowledge',
            id: knowledge.id,
            scopeType: 'global',
            scopeId: null,
            tags: [],
            score: 0.88,
            knowledge: knowledge,
          },
        ],
        meta: {
          totalCount: 2,
          returnedCount: 2,
          truncated: false,
          hasMore: false,
        },
      };

      await autoLinkContextFromQuery(conversation.id, undefined, queryResult);

      const contexts = db
        .select()
        .from(schema.conversationContext)
        .where(eq(schema.conversationContext.conversationId, conversation.id))
        .all();

      expect(contexts.length).toBe(2);
      expect(contexts.some((c) => c.entryType === 'tool' && c.entryId === tool.id)).toBe(true);
      expect(contexts.some((c) => c.entryType === 'knowledge' && c.entryId === knowledge.id)).toBe(
        true
      );
    });

    it('should calculate relevance scores from query results', async () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');

      const queryResult: MemoryQueryResult = {
        results: [
          {
            type: 'knowledge',
            id: knowledge.id,
            scopeType: 'global',
            scopeId: null,
            tags: [],
            score: 95, // Score > 1, should be normalized
            knowledge: knowledge,
          },
        ],
        meta: {
          totalCount: 1,
          returnedCount: 1,
          truncated: false,
          hasMore: false,
        },
      };

      await autoLinkContextFromQuery(conversation.id, undefined, queryResult);

      const context = db
        .select()
        .from(schema.conversationContext)
        .where(eq(schema.conversationContext.conversationId, conversation.id))
        .get();

      expect(context?.relevanceScore).toBeCloseTo(0.95, 2);
    });
  });

  describe('generateConversationSummary', () => {
    it('should generate summary', async () => {
      const conversation = createTestConversation(
        db,
        testSessionId,
        testProjectId,
        'agent-1',
        'Test Conversation'
      );
      createTestMessage(db, conversation.id, 'user', 'What is authentication?', 0);
      createTestMessage(db, conversation.id, 'agent', 'Authentication is...', 1);
      createTestMessage(db, conversation.id, 'user', 'Thanks!', 2);

      const summary = await generateConversationSummary(conversation.id);

      expect(summary).toContain('Test Conversation');
      expect(summary).toContain('3 total');
      expect(summary).toContain('2 user');
      expect(summary).toContain('1 agent');
    });

    it('should handle conversation with context', async () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      createTestContextLink(db, conversation.id, 'knowledge', knowledge.id);
      createTestMessage(db, conversation.id, 'user', 'Hello', 0);

      const summary = await generateConversationSummary(conversation.id);

      expect(summary).toContain('Memory entries used: 1');
    });
  });

  describe('extractKnowledgeFromConversation', () => {
    it('should extract knowledge from conversation', async () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      createTestMessage(
        db,
        conversation.id,
        'agent',
        'We decided to use TypeScript for this project',
        0
      );
      createTestMessage(db, conversation.id, 'agent', 'This is a regular message', 1);

      const knowledgeEntries = await extractKnowledgeFromConversation(conversation.id);

      expect(knowledgeEntries.length).toBeGreaterThanOrEqual(1);
      expect(knowledgeEntries[0].category).toBe('decision');
      expect(knowledgeEntries[0].content).toContain('decided');
    });

    it('should return empty array if no decisions found', async () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      createTestMessage(db, conversation.id, 'user', 'Hello', 0);
      createTestMessage(db, conversation.id, 'agent', 'Hi there', 1);

      const knowledgeEntries = await extractKnowledgeFromConversation(conversation.id);

      expect(knowledgeEntries.length).toBe(0);
    });
  });

  describe('getConversationAnalytics', () => {
    it('should calculate analytics', async () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      createTestMessage(db, conversation.id, 'user', 'Message 1', 0);
      createTestMessage(db, conversation.id, 'agent', 'Message 2', 1);
      createTestMessage(db, conversation.id, 'user', 'Message 3', 2);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      createTestContextLink(db, conversation.id, 'knowledge', knowledge.id, undefined, 0.9);

      const analytics = await getConversationAnalytics(conversation.id);

      expect(analytics.messageCount).toBe(3);
      expect(analytics.userMessageCount).toBe(2);
      expect(analytics.agentMessageCount).toBe(1);
      expect(analytics.memoryEntriesUsed.length).toBe(1);
      expect(analytics.averageRelevanceScore).toBeCloseTo(0.9, 1);
    });

    it('should count tools used', async () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      createTestMessage(db, conversation.id, 'agent', 'Response', 0, undefined, [
        'memory_query',
        'memory_knowledge',
      ]);
      createTestMessage(db, conversation.id, 'agent', 'Response 2', 1, undefined, ['memory_query']);

      const analytics = await getConversationAnalytics(conversation.id);

      expect(analytics.toolsUsed.length).toBeGreaterThanOrEqual(1);
      const memoryQueryTool = analytics.toolsUsed.find((t) => t.tool === 'memory_query');
      expect(memoryQueryTool?.count).toBe(2);
    });
  });
});


