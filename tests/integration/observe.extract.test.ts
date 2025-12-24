import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import {
  cleanupTestDb,
  createTestProject,
  createTestTool,
  createTestContext,
  schema,
  setupTestDb,
} from '../fixtures/test-helpers.js';
import type { AppContext, IExtractionService } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-observe-extract.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let ctx: AppContext;

const mockExtract = vi.fn();

// Create a mock extraction service
const mockExtractionService: IExtractionService = {
  isAvailable: () => true,
  getProvider: () => 'openai',
  extract: mockExtract,
};

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

describe('memory_observe.extract integration', () => {
  beforeAll(async () => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    ctx = await createTestContext(testDb);

    // Add the mock extraction service to the context
    if (!ctx.services) {
      ctx.services = { permission: ctx.services!.permission };
    }
    ctx.services.extraction = mockExtractionService;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    mockExtract.mockReset();
  });

  it('extracts entries, detects duplicates, and auto-stores eligible results', async () => {
    const project = createTestProject(db, 'Observe Extract Project');
    createTestTool(db, 'dup-tool', 'project', project.id, 'cli', 'Existing tool');

    mockExtract.mockResolvedValue({
      entries: [
        {
          type: 'tool',
          name: 'dup-tool',
          content: 'A duplicate tool should not be stored',
          category: 'cli',
          confidence: 0.95,
          suggestedTags: ['dup'],
        },
        {
          type: 'tool',
          name: 'new-tool',
          content: 'A new tool should be stored',
          category: 'cli',
          confidence: 0.95,
          suggestedTags: ['new'],
        },
        {
          type: 'guideline',
          name: 'bind-localhost-by-default',
          content: 'Bind REST to 127.0.0.1 by default',
          category: 'security',
          priority: 80,
          confidence: 0.9,
          rationale: 'Avoid accidental exposure',
          suggestedTags: ['rest', 'security'],
        },
        {
          type: 'knowledge',
          title: 'Fastify chosen',
          content: 'We chose Fastify for REST adapter',
          category: 'decision',
          confidence: 0.7, // below threshold => should not store
          rationale: 'Good TS ergonomics',
          suggestedTags: ['rest', 'fastify'],
        },
      ],
      entities: [],
      relationships: [],
      model: 'mock-model',
      provider: 'openai',
      tokensUsed: 123,
      processingTimeMs: 5,
    });

    const result = await observeHandlers.extract(ctx, {
      action: 'extract',
      context: 'Some context',
      contextType: 'conversation',
      scopeType: 'project',
      scopeId: project.id,
      autoStore: true,
      confidenceThreshold: 0.8,
      focusAreas: ['decisions', 'rules', 'tools'],
      agentId: 'agent-1',
    });

    expect(result.success).toBe(true);
    expect(result.extraction.entries).toHaveLength(4);

    const dup = result.extraction.entries.find((e) => e.name === 'dup-tool');
    expect(dup?.type).toBe('tool');
    expect(dup?.isDuplicate).toBe(true);
    expect(dup?.shouldStore).toBe(false);

    const newTool = result.extraction.entries.find((e) => e.name === 'new-tool');
    expect(newTool?.type).toBe('tool');
    expect(newTool?.isDuplicate).toBe(false);
    expect(newTool?.shouldStore).toBe(true);

    const guideline = result.extraction.entries.find((e) => e.name === 'bind-localhost-by-default');
    expect(guideline?.type).toBe('guideline');
    expect(guideline?.shouldStore).toBe(true);

    const knowledge = result.extraction.entries.find((e) => e.title === 'Fastify chosen');
    expect(knowledge?.type).toBe('knowledge');
    expect(knowledge?.shouldStore).toBe(false);

    expect(result.stored).toBeDefined();
    expect(result.stored?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool', name: 'new-tool' }),
        expect.objectContaining({ type: 'guideline', name: 'bind-localhost-by-default' }),
      ])
    );
    expect(result.stored?.entries?.some((e) => e.name === 'dup-tool')).toBe(false);
    expect(result.stored?.entries?.some((e) => e.name === 'Fastify chosen')).toBe(false);

    const storedTool = db
      .select()
      .from(schema.tools)
      .where(eq(schema.tools.name, 'new-tool'))
      .get();
    expect(storedTool?.scopeType).toBe('project');
    expect(storedTool?.scopeId).toBe(project.id);

    const storedGuideline = db
      .select()
      .from(schema.guidelines)
      .where(eq(schema.guidelines.name, 'bind-localhost-by-default'))
      .get();
    expect(storedGuideline?.scopeType).toBe('project');
    expect(storedGuideline?.scopeId).toBe(project.id);

    const notStoredKnowledge = db
      .select()
      .from(schema.knowledge)
      .where(eq(schema.knowledge.title, 'Fastify chosen'))
      .get();
    expect(notStoredKnowledge).toBeUndefined();
  });

  it('does not store when autoStore is false, but still returns shouldStore hints', async () => {
    const project = createTestProject(db, 'Observe No Store Project');

    mockExtract.mockResolvedValue({
      entries: [
        {
          type: 'tool',
          name: 'tool-no-store',
          content: 'Should not be written without autoStore',
          category: 'cli',
          confidence: 0.95,
        },
      ],
      entities: [],
      relationships: [],
      model: 'mock-model',
      provider: 'openai',
      processingTimeMs: 1,
    });

    const result = await observeHandlers.extract(ctx, {
      context: 'Some context',
      scopeType: 'project',
      scopeId: project.id,
      autoStore: false,
      confidenceThreshold: 0.8,
    });

    expect(result.success).toBe(true);
    expect(result.extraction.entries).toHaveLength(1);
    expect(result.extraction.entries[0]?.shouldStore).toBe(true);
    expect(result.stored).toBeUndefined();

    const tool = db.select().from(schema.tools).where(eq(schema.tools.name, 'tool-no-store')).get();
    expect(tool).toBeUndefined();
  });
});
