import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';

import {
  cleanupTestDb,
  createTestProject,
  createTestSession,
  createTestTool,
  schema,
  setupTestDb,
} from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-observe-commit.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
    getSqlite: () => sqlite,
    getPreparedStatement: (sql: string) => sqlite.prepare(sql),
  };
});

import { observeHandlers } from '../../src/mcp/handlers/observe.handler.js';

describe('memory_observe.commit integration', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  it('stores high-confidence to project, low-confidence to session, and updates session metadata', () => {
    const project = createTestProject(db, 'Observe Commit Project');
    const session = createTestSession(db, project.id, 'Session', 'Purpose', 'agent-1');

    // Existing tool => should be detected as duplicate at project scope and skipped.
    createTestTool(db, 'dup-tool', 'project', project.id, 'cli', 'Existing tool');

    const result = observeHandlers.commit({
      sessionId: session.id,
      projectId: project.id,
      agentId: 'agent-1',
      autoPromote: true,
      autoPromoteThreshold: 0.85,
      entries: [
        {
          type: 'tool',
          name: 'dup-tool',
          content: 'Duplicate tool should be skipped',
          category: 'cli',
          confidence: 0.95,
          suggestedTags: ['dup'],
        },
        {
          type: 'tool',
          name: 'new-tool',
          content: 'New tool should be stored at project',
          category: 'cli',
          confidence: 0.95,
          suggestedTags: ['new'],
        },
        {
          type: 'knowledge',
          title: 'Decision captured',
          content: 'This is lower confidence so stored at session and needs review',
          category: 'decision',
          confidence: 0.5,
          rationale: 'It was implied but not explicit',
          suggestedTags: ['decision'],
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.meta.storedCount).toBe(2);
    expect(result.meta.storedToProject).toBe(1);
    expect(result.meta.storedToSession).toBe(1);
    expect(result.meta.needsReviewCount).toBe(1);

    const tools = db.select().from(schema.tools).where(eq(schema.tools.scopeId, project.id)).all();
    expect(tools.some((t) => t.name === 'new-tool')).toBe(true);

    const knowledge = db
      .select()
      .from(schema.knowledge)
      .where(eq(schema.knowledge.scopeId, session.id))
      .all();
    expect(knowledge.some((k) => k.title === 'Decision captured')).toBe(true);

    const updatedSession = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, session.id))
      .get();
    expect(updatedSession).toBeTruthy();
    expect(updatedSession?.metadata).toBeTruthy();

    const observe = (updatedSession?.metadata as any)?.observe;
    expect(observe).toBeTruthy();
    expect(observe.committedAt).toBeTruthy();
    expect(observe.needsReviewCount).toBe(1);
    expect(observe.reviewedAt).toBeUndefined();
  });
});

