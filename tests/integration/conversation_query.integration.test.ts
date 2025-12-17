import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  schema,
  createTestProject,
  createTestKnowledge,
  createTestConversation,
} from '../fixtures/test-helpers.js';
import { eq } from 'drizzle-orm';

const TEST_DB_PATH = './data/test-conversation-query.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

import { queryHandlers } from '../../src/mcp/handlers/query.handler.js';
import { conversationHandlers } from '../../src/mcp/handlers/conversations.handler.js';

describe('Conversation-Query Integration', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  it('should auto-link query results to conversation', async () => {
    const project = createTestProject(db);
    const { knowledge } = createTestKnowledge(db, 'Test Knowledge for Linking');
    const { conversation } = conversationHandlers.start({
      projectId: project.id,
      agentId: 'agent-1',
    });

    // Query with conversationId - should auto-link
    await queryHandlers.query({
      search: 'Test Knowledge',
      conversationId: conversation.id,
      types: ['knowledge'],
    });

    // Check that context was linked
    const contexts = db
      .select()
      .from(schema.conversationContext)
      .where(eq(schema.conversationContext.conversationId, conversation.id))
      .all();

    expect(contexts.length).toBeGreaterThanOrEqual(1);
    expect(contexts.some((c) => c.entryId === knowledge.id)).toBe(true);
  });

  it('should link query results to specific message', async () => {
    const project = createTestProject(db);
    const { knowledge } = createTestKnowledge(db, 'Message-Specific Knowledge');
    const { conversation } = conversationHandlers.start({
      projectId: project.id,
      agentId: 'agent-1',
    });
    const { message } = conversationHandlers.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'What do you know about this?',
    });

    // Query with conversationId and messageId
    await queryHandlers.query({
      search: 'Message-Specific',
      conversationId: conversation.id,
      messageId: message.id,
      types: ['knowledge'],
    });

    // Check that context was linked to the specific message
    const contexts = db
      .select()
      .from(schema.conversationContext)
      .where(eq(schema.conversationContext.messageId, message.id))
      .all();

    expect(contexts.length).toBeGreaterThanOrEqual(1);
    expect(contexts.some((c) => c.entryId === knowledge.id)).toBe(true);
  });

  it('should not link when conversationId not provided', async () => {
    const project = createTestProject(db);
    createTestKnowledge(db, 'Unlinked Knowledge');

    // Query without conversationId
    await queryHandlers.query({
      search: 'Unlinked',
      types: ['knowledge'],
    });

    // Check that no context links were created
    const contexts = db.select().from(schema.conversationContext).all();
    // Should have no new contexts from this query (may have some from other tests)
    const unlinkedContexts = contexts.filter((c) => c.entryId.includes('Unlinked'));
    expect(unlinkedContexts.length).toBe(0);
  });

  it('should skip linking when autoLinkContext is false', async () => {
    const project = createTestProject(db);
    const { knowledge } = createTestKnowledge(db, 'Skip Link Knowledge');
    const { conversation } = conversationHandlers.start({
      projectId: project.id,
      agentId: 'agent-1',
    });

    // Query with conversationId but autoLinkContext=false
    await queryHandlers.query({
      search: 'Skip Link',
      conversationId: conversation.id,
      autoLinkContext: false,
      types: ['knowledge'],
    });

    // Check that context was NOT linked
    const contexts = db
      .select()
      .from(schema.conversationContext)
      .where(eq(schema.conversationContext.conversationId, conversation.id))
      .all();

    // Should not have linked this specific knowledge entry
    expect(contexts.some((c) => c.entryId === knowledge.id)).toBe(false);
  });
});


