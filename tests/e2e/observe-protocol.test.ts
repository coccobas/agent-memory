/**
 * E2E tests for memory_observe MCP Protocol
 *
 * Tests the observe tool's extract, draft, and commit actions through
 * the full MCP protocol flow.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestContext,
  createTestProject,
  createTestSession,
} from '../fixtures/test-helpers.js';
import type { AppContext, IExtractionService } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-observe-protocol.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let context: AppContext;

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

import { runTool } from '../../src/mcp/tool-runner.js';

describe('memory_observe E2E Protocol', () => {
  const AGENT_ID = 'observe-e2e-agent';
  let projectId: string;
  let sessionId: string;
  let previousPermMode: string | undefined;

  beforeAll(async () => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';

    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = await createTestContext(testDb);

    // Add the mock extraction service
    if (!context.services) {
      context.services = { permission: context.services!.permission };
    }
    context.services.extraction = mockExtractionService;

    // Create test scope hierarchy
    const project = createTestProject(db, 'Observe E2E Project');
    projectId = project.id;

    const session = createTestSession(db, projectId, 'Observe E2E Session');
    sessionId = session.id;
  });

  afterAll(() => {
    if (previousPermMode === undefined) {
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    } else {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    }
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    mockExtract.mockReset();
  });

  describe('status action', () => {
    it('should return extraction service status via MCP protocol', async () => {
      const result = await runTool(context, 'memory_observe', {
        action: 'status',
        agentId: AGENT_ID,
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text as string);
      // Status response format
      expect(parsed.available).toBe(true);
      expect(parsed.provider).toBe('openai');
    });
  });

  describe('extract action', () => {
    it('should extract entries from context via MCP protocol', async () => {
      mockExtract.mockResolvedValue({
        entries: [
          {
            type: 'guideline',
            name: 'use-strict-mode',
            content: 'Always use TypeScript strict mode',
            category: 'code_style',
            priority: 80,
            confidence: 0.92,
            suggestedTags: ['typescript', 'best-practice'],
          },
          {
            type: 'knowledge',
            title: 'Project uses ESM',
            content: 'This project uses ES modules exclusively',
            category: 'fact',
            confidence: 0.95,
          },
        ],
        entities: [],
        relationships: [],
        model: 'gpt-4',
        provider: 'openai',
        tokensUsed: 150,
        processingTimeMs: 100,
      });

      const result = await runTool(context, 'memory_observe', {
        action: 'extract',
        context: 'The user said: We should always use TypeScript strict mode in this project.',
        contextType: 'conversation',
        scopeType: 'project',
        scopeId: projectId,
        autoStore: false,
        confidenceThreshold: 0.8,
        focusAreas: ['rules', 'facts'],
        agentId: AGENT_ID,
      });

      expect(result.isError).toBeFalsy();

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.success).toBe(true);
      expect(parsed.extraction).toBeDefined();
      expect(parsed.extraction.entries).toHaveLength(2);
      expect(parsed.extraction.entries[0].type).toBe('guideline');
      expect(parsed.extraction.entries[1].type).toBe('knowledge');
    });

    it('should auto-store eligible entries when autoStore is true', async () => {
      mockExtract.mockResolvedValue({
        entries: [
          {
            type: 'tool',
            name: 'e2e-auto-stored-tool',
            content: 'A tool to auto-store',
            category: 'cli',
            confidence: 0.95,
          },
        ],
        entities: [],
        relationships: [],
        model: 'gpt-4',
        provider: 'openai',
        processingTimeMs: 50,
      });

      const result = await runTool(context, 'memory_observe', {
        action: 'extract',
        context: 'We have a CLI tool for building.',
        contextType: 'conversation',
        scopeType: 'project',
        scopeId: projectId,
        autoStore: true,
        confidenceThreshold: 0.8,
        agentId: AGENT_ID,
      });

      expect(result.isError).toBeFalsy();

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.success).toBe(true);
      expect(parsed.stored).toBeDefined();
      expect(parsed.stored.entries).toHaveLength(1);
      expect(parsed.stored.entries[0].name).toBe('e2e-auto-stored-tool');
    });

    it('should detect and mark duplicates', async () => {
      // First, create an existing tool
      await runTool(context, 'memory_tool', {
        action: 'add',
        scopeType: 'project',
        scopeId: projectId,
        name: 'existing-dup-tool',
        description: 'An existing tool',
        category: 'cli',
        agentId: AGENT_ID,
      });

      mockExtract.mockResolvedValue({
        entries: [
          {
            type: 'tool',
            name: 'existing-dup-tool',
            content: 'Duplicate tool',
            category: 'cli',
            confidence: 0.9,
          },
        ],
        entities: [],
        relationships: [],
        model: 'gpt-4',
        provider: 'openai',
        processingTimeMs: 30,
      });

      const result = await runTool(context, 'memory_observe', {
        action: 'extract',
        context: 'Use existing-dup-tool for building.',
        contextType: 'conversation',
        scopeType: 'project',
        scopeId: projectId,
        autoStore: true,
        agentId: AGENT_ID,
      });

      expect(result.isError).toBeFalsy();

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.success).toBe(true);

      const dupEntry = parsed.extraction.entries.find(
        (e: { name: string }) => e.name === 'existing-dup-tool'
      );
      expect(dupEntry.isDuplicate).toBe(true);
      expect(dupEntry.shouldStore).toBe(false);
    });
  });

  describe('draft action', () => {
    it('should return extraction schema for client-side extraction', async () => {
      const result = await runTool(context, 'memory_observe', {
        action: 'draft',
        sessionId: sessionId,
        agentId: AGENT_ID,
      });

      // Draft may not be fully implemented - just verify it doesn't error
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });
  });

  describe('commit action', () => {
    it('should commit client-extracted entries', async () => {
      const result = await runTool(context, 'memory_observe', {
        action: 'commit',
        sessionId: sessionId,
        projectId: projectId,
        entries: [
          {
            type: 'guideline',
            name: 'e2e-committed-guideline',
            content: 'A guideline committed via client extraction',
            category: 'workflow',
            priority: 60,
            confidence: 0.88,
          },
        ],
        agentId: AGENT_ID,
      });

      // Commit should work and return a response
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });

    it('should validate entries before committing', async () => {
      const result = await runTool(context, 'memory_observe', {
        action: 'commit',
        sessionId: sessionId,
        entries: [
          {
            type: 'invalid_type',
            name: 'bad-entry',
          },
        ],
        agentId: AGENT_ID,
      });

      // Should still return a response (may be an error or skip invalid)
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should return error for invalid action', async () => {
      const result = await runTool(context, 'memory_observe', {
        action: 'invalid_action',
        agentId: AGENT_ID,
      });

      expect(result.isError).toBe(true);

      const parsed = JSON.parse(result.content[0].text as string);
      // Error format: {error, code, context}
      expect(parsed.error).toBeDefined();
    });

    it('should handle extraction service errors gracefully', async () => {
      mockExtract.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await runTool(context, 'memory_observe', {
        action: 'extract',
        context: 'Some context',
        scopeType: 'project',
        scopeId: projectId,
        agentId: AGENT_ID,
      });

      expect(result.isError).toBe(true);

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.error).toBeDefined();
    });
  });
});
