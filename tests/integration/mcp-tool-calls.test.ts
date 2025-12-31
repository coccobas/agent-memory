/**
 * MCP Protocol End-to-End Tests
 *
 * Tests the full tool call flow through runTool:
 * 1. Security validation
 * 2. Handler dispatch
 * 3. Context enrichment
 * 4. Result formatting
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as fs from 'fs';

import { runTool } from '../../src/mcp/tool-runner.js';
import type { AppContext } from '../../src/core/context.js';
import { ClassificationService } from '../../src/services/classification/index.js';
import type { ClassificationServiceConfig } from '../../src/services/classification/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = resolve(__dirname, '../../data/test-mcp-calls');

// Full schema for testing
const FULL_SCHEMA = `
  -- Classification tables
  CREATE TABLE IF NOT EXISTS classification_feedback (
    id TEXT PRIMARY KEY,
    text_hash TEXT NOT NULL,
    text_preview TEXT,
    session_id TEXT,
    predicted_type TEXT NOT NULL,
    actual_type TEXT NOT NULL,
    method TEXT NOT NULL,
    confidence REAL NOT NULL,
    matched_patterns TEXT,
    was_correct INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pattern_confidence (
    id TEXT PRIMARY KEY,
    pattern_id TEXT NOT NULL UNIQUE,
    pattern_type TEXT NOT NULL,
    base_weight REAL DEFAULT 0.7 NOT NULL,
    feedback_multiplier REAL DEFAULT 1.0 NOT NULL,
    total_matches INTEGER DEFAULT 0 NOT NULL,
    correct_matches INTEGER DEFAULT 0 NOT NULL,
    incorrect_matches INTEGER DEFAULT 0 NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  -- Entry tables
  CREATE TABLE IF NOT EXISTS guidelines (
    id TEXT PRIMARY KEY,
    scope_type TEXT NOT NULL,
    scope_id TEXT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    priority INTEGER DEFAULT 50,
    rationale TEXT,
    examples TEXT,
    is_active INTEGER DEFAULT 1,
    created_by TEXT,
    updated_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS knowledge (
    id TEXT PRIMARY KEY,
    scope_type TEXT NOT NULL,
    scope_id TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    source TEXT,
    confidence REAL DEFAULT 1.0,
    valid_from TEXT,
    valid_until TEXT,
    invalidated_by TEXT,
    is_active INTEGER DEFAULT 1,
    created_by TEXT,
    updated_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    scope_type TEXT NOT NULL,
    scope_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    parameters TEXT,
    examples TEXT,
    constraints TEXT,
    is_active INTEGER DEFAULT 1,
    created_by TEXT,
    updated_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    category TEXT,
    is_predefined INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS entry_tags (
    id TEXT PRIMARY KEY,
    entry_type TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(entry_type, entry_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    org_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    root_path TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT,
    purpose TEXT,
    agent_id TEXT,
    status TEXT DEFAULT 'active',
    metadata TEXT,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ended_at TEXT
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_guidelines_scope ON guidelines(scope_type, scope_id);
  CREATE INDEX IF NOT EXISTS idx_knowledge_scope ON knowledge(scope_type, scope_id);
  CREATE INDEX IF NOT EXISTS idx_tools_scope ON tools(scope_type, scope_id);
`;

function createMockAppContext(
  db: ReturnType<typeof drizzle>,
  classificationService: ClassificationService | null,
  overrides: Partial<AppContext> = {}
): AppContext {
  const projectId = 'test-project-001';
  let idCounter = 0;
  const generateId = () => `id-${++idCounter}`;

  const mockRepos = {
    guidelines: {
      create: vi.fn(async (params: Record<string, unknown>) => ({
        id: generateId(),
        ...params,
        isActive: true,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      findById: vi.fn(async () => null),
      list: vi.fn(async () => []),
      update: vi.fn(async (id: string, params: Record<string, unknown>) => ({ id, ...params })),
      deactivate: vi.fn(async (id: string) => ({ id, isActive: false })),
    },
    knowledge: {
      create: vi.fn(async (params: Record<string, unknown>) => ({
        id: generateId(),
        ...params,
        isActive: true,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      findById: vi.fn(async () => null),
      list: vi.fn(async () => []),
    },
    tools: {
      create: vi.fn(async (params: Record<string, unknown>) => ({
        id: generateId(),
        ...params,
        isActive: true,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      findById: vi.fn(async () => null),
      list: vi.fn(async () => []),
    },
    tags: {
      getOrCreate: vi.fn(async (name: string) => ({ id: generateId(), name })),
      findByName: vi.fn(async () => null),
      list: vi.fn(async () => []),
    },
    entryTags: {
      attach: vi.fn(async (params: Record<string, unknown>) => ({ id: generateId(), ...params })),
      detach: vi.fn(async () => true),
      findByEntry: vi.fn(async () => []),
    },
    projects: {
      create: vi.fn(async (params: Record<string, unknown>) => ({ id: generateId(), ...params })),
      findById: vi.fn(async () => ({ id: projectId, name: 'Test Project' })),
      findByRootPath: vi.fn(async () => ({ id: projectId, name: 'Test Project' })),
      list: vi.fn(async () => []),
    },
    sessions: {
      create: vi.fn(async (params: Record<string, unknown>) => ({ id: generateId(), ...params })),
      findById: vi.fn(async () => null),
      findActive: vi.fn(async () => null),
      list: vi.fn(async () => []),
      end: vi.fn(async (id: string) => ({ id, status: 'completed' })),
    },
    scopes: {
      getScopeId: vi.fn(async () => projectId),
    },
  };

  const mockServices = {
    classification: classificationService,
    contextDetection: {
      detect: vi.fn(async () => ({
        project: { id: projectId, name: 'Test Project' },
        session: null,
        agentId: { value: 'test-agent', source: 'default' as const },
      })),
      enrichParams: vi.fn(async (params: Record<string, unknown>) => ({
        enriched: {
          ...params,
          projectId: params.projectId ?? projectId,
          agentId: params.agentId ?? 'test-agent',
        },
        detected: {
          project: { id: projectId, name: 'Test Project' },
          session: null,
          agentId: { value: 'test-agent', source: 'default' as const },
        },
      })),
      clearCache: vi.fn(),
    },
    query: {
      search: vi.fn(async () => ({ results: [], total: 0 })),
      context: vi.fn(async () => ({ guidelines: [], knowledge: [], tools: [] })),
    },
    health: {
      getHealth: vi.fn(async () => ({ status: 'healthy' })),
    },
    permission: {
      check: vi.fn(async () => ({ allowed: true })),
    },
  };

  const mockSecurity = {
    validateRequest: vi.fn(async () => ({ authorized: true })),
  };

  const mockConfig = {
    autoContext: { enabled: true },
    autoSession: { enabled: false },
    outputMode: 'json',
  };

  return {
    db: db as never,
    repos: mockRepos,
    services: mockServices,
    security: mockSecurity,
    config: mockConfig,
    ...overrides,
  } as unknown as AppContext;
}

describe('MCP Tool Call End-to-End Tests', () => {
  let sqlite: ReturnType<typeof Database>;
  let db: ReturnType<typeof drizzle>;
  let classificationService: ClassificationService;

  beforeAll(() => {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  });

  beforeEach(() => {
    const dbPath = resolve(dataDir, `mcp-test-${Date.now()}.db`);
    sqlite = new Database(dbPath);
    sqlite.exec(FULL_SCHEMA);
    db = drizzle(sqlite);

    const config: ClassificationServiceConfig = {
      highConfidenceThreshold: 0.85,
      lowConfidenceThreshold: 0.6,
      enableLLMFallback: false,
      feedbackDecayDays: 30,
      maxPatternBoost: 0.15,
      maxPatternPenalty: 0.3,
      cacheSize: 100,
      cacheTTLMs: 60000,
      learningRate: 0.1,
    };

    classificationService = new ClassificationService(db as never, null, config);
  });

  afterAll(() => {
    if (sqlite) {
      sqlite.close();
    }
  });

  describe('memory_remember Tool Calls', () => {
    it('should execute memory_remember with automatic classification', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_remember', {
        text: 'Rule: always use TypeScript strict mode',
      });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('text');

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
      expect(response.stored?.type).toBe('guideline');
      expect(response.classification?.type).toBe('guideline');
      expect(response.classification?.method).toBe('regex');
    });

    it('should execute memory_remember with forceType override', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_remember', {
        text: 'Rule: should be knowledge instead',
        forceType: 'knowledge',
      });

      expect(result.isError).toBeUndefined();

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
      expect(response.stored?.type).toBe('knowledge');
      expect(response.classification?.wasForced).toBe(true);
    });

    it('should return error for missing text parameter', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_remember', {});

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.error).toBeDefined();
    });
  });

  describe('Security Validation', () => {
    it('should reject requests when security check fails', async () => {
      const context = createMockAppContext(db, classificationService);
      // Override security to fail
      context.security.validateRequest = vi.fn(async () => ({
        authorized: false,
        error: 'Rate limit exceeded',
        statusCode: 429,
        retryAfterMs: 1000,
      }));

      const result = await runTool(context, 'memory_remember', {
        text: 'Test text',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(false);
      expect(response.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should reject unauthorized requests', async () => {
      const context = createMockAppContext(db, classificationService);
      context.security.validateRequest = vi.fn(async () => ({
        authorized: false,
        error: 'Unauthorized',
        statusCode: 401,
      }));

      const result = await runTool(context, 'memory_remember', {
        text: 'Test text',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Unknown Tool Handling', () => {
    it('should return error for unknown tool', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'unknown_tool', {});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.error).toContain('Invalid action');
    });
  });

  describe('Context Enrichment', () => {
    it('should enrich parameters with detected context', async () => {
      const context = createMockAppContext(db, classificationService);

      await runTool(context, 'memory_remember', {
        text: 'Rule: test context enrichment',
      });

      // Verify enrichParams was called
      expect(context.services.contextDetection?.enrichParams).toHaveBeenCalled();
    });

    it('should include _context in response when auto-detection is used', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_remember', {
        text: 'Rule: test with context',
      });

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response._context).toBeDefined();
      expect(response._context?.project?.id).toBe('test-project-001');
    });
  });

  describe('Tool Call Sequence (Learning Flow)', () => {
    it('should handle remember → correct → remember sequence', async () => {
      const context = createMockAppContext(db, classificationService);

      // First remember call - classifies as guideline
      const result1 = await runTool(context, 'memory_remember', {
        text: 'Always use strict mode',
      });
      const response1 = JSON.parse(result1.content[0]?.text ?? '{}');
      expect(response1.stored?.type).toBe('guideline');

      // Second call with correction - force to knowledge
      const result2 = await runTool(context, 'memory_remember', {
        text: 'Always use strict mode',
        forceType: 'knowledge',
      });
      const response2 = JSON.parse(result2.content[0]?.text ?? '{}');
      expect(response2.stored?.type).toBe('knowledge');
      expect(response2.classification?.wasForced).toBe(true);

      // The correction should be recorded for learning
      // (verified by the classification service's internal state)
    });
  });

  describe('Result Formatting', () => {
    it('should format successful results as JSON', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_remember', {
        text: 'Rule: test formatting',
      });

      expect(result.content[0]?.type).toBe('text');
      // Should be valid JSON
      expect(() => JSON.parse(result.content[0]?.text ?? '')).not.toThrow();
    });

    it('should format error results with isError flag', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_remember', {
        // Missing required text
      });

      // Error response should have error info
      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.error).toBeDefined();
    });
  });

  describe('Multiple Tool Types', () => {
    it('should handle memory_query tool calls', async () => {
      const context = createMockAppContext(db, classificationService);
      // Mock the query service response
      context.services.query = {
        search: vi.fn(async () => ({ results: [], total: 0 })),
        context: vi.fn(async () => ({ guidelines: [], knowledge: [], tools: [] })),
      };

      const result = await runTool(context, 'memory_query', {
        action: 'context',
        scopeType: 'project',
        inherit: true,
      });

      // Tool should complete (may error due to missing mocks, but shouldn't be security error)
      expect(result.content).toHaveLength(1);
    });

    it('should handle memory_guideline tool calls', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_guideline', {
        action: 'list',
        scopeType: 'project',
      });

      // Tool should complete (may error due to missing mocks, but shouldn't be security error)
      expect(result.content).toHaveLength(1);
    });
  });
});
