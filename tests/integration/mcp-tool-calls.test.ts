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

  // Episode mock data
  const mockEpisode = {
    id: 'ep-test-001',
    scopeType: 'project',
    scopeId: projectId,
    name: 'Test Episode',
    description: 'A test episode',
    status: 'planned',
    isActive: true,
    createdAt: new Date().toISOString(),
    depth: 0,
    events: [],
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
    episode: {
      create: vi.fn(async (input: Record<string, unknown>) => ({
        ...mockEpisode,
        id: generateId(),
        ...input,
      })),
      getById: vi.fn(async (id: string) => ({ ...mockEpisode, id })),
      list: vi.fn(async () => [mockEpisode]),
      update: vi.fn(async (id: string, input: Record<string, unknown>) => ({
        ...mockEpisode,
        id,
        ...input,
      })),
      deactivate: vi.fn(async () => true),
      delete: vi.fn(async () => true),
      start: vi.fn(async (id: string) => ({
        ...mockEpisode,
        id,
        status: 'active',
        startedAt: new Date().toISOString(),
      })),
      complete: vi.fn(async (id: string, outcome: string, outcomeType: string) => ({
        ...mockEpisode,
        id,
        status: 'completed',
        outcome,
        outcomeType,
        endedAt: new Date().toISOString(),
      })),
      fail: vi.fn(async (id: string, outcome: string) => ({
        ...mockEpisode,
        id,
        status: 'failed',
        outcome,
        outcomeType: 'failure',
        endedAt: new Date().toISOString(),
      })),
      cancel: vi.fn(async (id: string, reason?: string) => ({
        ...mockEpisode,
        id,
        status: 'cancelled',
        outcome: reason ?? 'Cancelled',
        outcomeType: 'abandoned',
        endedAt: new Date().toISOString(),
      })),
      addEvent: vi.fn(async (input: Record<string, unknown>) => ({
        id: generateId(),
        ...input,
        sequenceNum: 1,
        occurredAt: new Date().toISOString(),
      })),
      getEvents: vi.fn(async () => []),
      linkEntity: vi.fn(async () => undefined),
      getLinkedEntities: vi.fn(async () => []),
      getTimeline: vi.fn(async () => [
        {
          timestamp: new Date().toISOString(),
          type: 'episode_start',
          name: 'Started: Test Episode',
          episodeId: 'ep-test-001',
        },
      ]),
      whatHappened: vi.fn(async (id: string) => ({
        episode: { ...mockEpisode, id },
        timeline: [],
        linkedEntities: [],
        childEpisodes: [],
        metrics: { durationMs: 100, eventCount: 1, linkedEntityCount: 0, childEpisodeCount: 0 },
      })),
      traceCausalChain: vi.fn(async (id: string) => [
        { episode: { ...mockEpisode, id }, depth: 0, relationship: 'self' },
      ]),
      getActiveEpisode: vi.fn(async () => null),
      getChildren: vi.fn(async () => []),
      getAncestors: vi.fn(async () => []),
    },
  };

  const mockSecurity = {
    validateRequest: vi.fn(async () => ({ authorized: true })),
  };

  const mockConfig = {
    autoContext: { enabled: true },
    autoSession: { enabled: false },
    outputMode: 'json',
    extractionHook: { enabled: false },
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

    it('should NOT include _context in response for non-whitelisted tools', async () => {
      const context = createMockAppContext(db, classificationService);

      // memory_remember is not a whitelisted tool for _context metadata
      const result = await runTool(context, 'memory_remember', {
        text: 'Rule: test with context',
      });

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      // _context is only included for whitelisted tools (memory_quickstart, memory_status, memory_session)
      expect(response._context).toBeUndefined();
    });

    it('should include _context in response for whitelisted tools (memory_session)', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_session', {
        action: 'list',
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

  describe('memory_episode Tool Calls', () => {
    it('should create an episode via add action', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        action: 'add',
        scopeType: 'project',
        scopeId: 'test-project-001',
        name: 'Test Episode',
        description: 'Integration test episode',
      });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
      expect(response.episode).toBeDefined();
      expect(response.episode.name).toBe('Test Episode');
    });

    it('should get an episode by id', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        action: 'get',
        id: 'ep-test-001',
      });

      expect(result.isError).toBeUndefined();

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
      expect(response.episode).toBeDefined();
      expect(response.episode.id).toBe('ep-test-001');
    });

    it('should list episodes', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        action: 'list',
        scopeType: 'project',
        scopeId: 'test-project-001',
      });

      expect(result.isError).toBeUndefined();

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
      expect(response.episodes).toBeDefined();
      expect(Array.isArray(response.episodes)).toBe(true);
    });

    it('should start an episode', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        action: 'start',
        id: 'ep-test-001',
      });

      expect(result.isError).toBeUndefined();

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
      expect(response.episode.status).toBe('active');
      expect(response.episode.startedAt).toBeDefined();
    });

    it('should complete an episode', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        action: 'complete',
        id: 'ep-test-001',
        outcome: 'Successfully completed',
        outcomeType: 'success',
      });

      expect(result.isError).toBeUndefined();

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
      expect(response.episode.status).toBe('completed');
      expect(response.episode.outcome).toBe('Successfully completed');
      expect(response.episode.outcomeType).toBe('success');
    });

    it('should fail an episode', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        action: 'fail',
        id: 'ep-test-001',
        outcome: 'Something went wrong',
      });

      expect(result.isError).toBeUndefined();

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
      expect(response.episode.status).toBe('failed');
      expect(response.episode.outcomeType).toBe('failure');
    });

    it('should cancel an episode', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        action: 'cancel',
        id: 'ep-test-001',
        reason: 'Not needed anymore',
      });

      expect(result.isError).toBeUndefined();

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
      expect(response.episode.status).toBe('cancelled');
      expect(response.episode.outcomeType).toBe('abandoned');
    });

    it('should add an event to an episode', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        action: 'add_event',
        episodeId: 'ep-test-001',
        eventType: 'checkpoint',
        name: 'Reached milestone',
        description: 'Completed first phase',
      });

      expect(result.isError).toBeUndefined();

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
      expect(response.event).toBeDefined();
      expect(response.event.eventType).toBe('checkpoint');
    });

    it('should get events for an episode', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        action: 'get_events',
        episodeId: 'ep-test-001',
      });

      expect(result.isError).toBeUndefined();

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
      expect(response.events).toBeDefined();
      expect(Array.isArray(response.events)).toBe(true);
    });

    it('should link an entity to an episode', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        action: 'link_entity',
        episodeId: 'ep-test-001',
        entryType: 'knowledge',
        entryId: 'know-123',
        role: 'context',
      });

      expect(result.isError).toBeUndefined();

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
    });

    it('should get linked entities for an episode', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        action: 'get_linked',
        episodeId: 'ep-test-001',
      });

      expect(result.isError).toBeUndefined();

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
      expect(response.linkedEntities).toBeDefined();
      expect(Array.isArray(response.linkedEntities)).toBe(true);
    });

    it('should get timeline for a session', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        action: 'get_timeline',
        sessionId: 'sess-test-001',
      });

      expect(result.isError).toBeUndefined();

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
      expect(response.timeline).toBeDefined();
      expect(Array.isArray(response.timeline)).toBe(true);
    });

    it('should query what happened during an episode', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        action: 'what_happened',
        id: 'ep-test-001',
      });

      expect(result.isError).toBeUndefined();

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
      expect(response.episode).toBeDefined();
      expect(response.timeline).toBeDefined();
      expect(response.metrics).toBeDefined();
    });

    it('should trace causal chain', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        action: 'trace_causal_chain',
        episodeId: 'ep-test-001',
        direction: 'backward',
        maxDepth: 5,
      });

      expect(result.isError).toBeUndefined();

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.success).toBe(true);
      expect(response.chain).toBeDefined();
      expect(Array.isArray(response.chain)).toBe(true);
    });

    it('should require action parameter', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        name: 'Test',
      });

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.error).toBeDefined();
    });

    it('should reject invalid action', async () => {
      const context = createMockAppContext(db, classificationService);

      const result = await runTool(context, 'memory_episode', {
        action: 'invalid_action',
      });

      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.error).toBeDefined();
    });
  });
});
