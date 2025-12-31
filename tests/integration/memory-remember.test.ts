/**
 * memory_remember Integration Tests
 *
 * Tests the automatic tool call flow:
 * 1. Text classification (regex + learning)
 * 2. Entry storage in correct repository
 * 3. Learning loop from corrections
 * 4. forceType behavior
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as fs from 'fs';

import { memoryRememberDescriptor } from '../../src/mcp/descriptors/memory_remember.js';
import { ClassificationService } from '../../src/services/classification/index.js';
import type { ClassificationServiceConfig } from '../../src/services/classification/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = resolve(__dirname, '../../data/test-remember');

// Schema for all required tables
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

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_guidelines_scope ON guidelines(scope_type, scope_id);
  CREATE INDEX IF NOT EXISTS idx_knowledge_scope ON knowledge(scope_type, scope_id);
  CREATE INDEX IF NOT EXISTS idx_tools_scope ON tools(scope_type, scope_id);
`;

interface MockRepoResult {
  id: string;
  [key: string]: unknown;
}

function createMockContext(
  db: ReturnType<typeof drizzle>,
  classificationService: ClassificationService | null,
  projectId: string = 'test-project'
) {
  const storedEntries: {
    guidelines: MockRepoResult[];
    knowledge: MockRepoResult[];
    tools: MockRepoResult[];
    tags: Map<string, { id: string; name: string }>;
    entryTags: Array<{ entryType: string; entryId: string; tagId: string }>;
  } = {
    guidelines: [],
    knowledge: [],
    tools: [],
    tags: new Map(),
    entryTags: [],
  };

  let idCounter = 0;
  const generateId = () => `test-${++idCounter}`;

  return {
    ctx: {
      services: {
        classification: classificationService,
        contextDetection: {
          detect: async () => ({
            project: { id: projectId },
            agentId: { value: 'test-agent' },
          }),
        },
      },
      repos: {
        guidelines: {
          create: async (params: Record<string, unknown>) => {
            const entry = { id: generateId(), ...params };
            storedEntries.guidelines.push(entry);
            return entry;
          },
        },
        knowledge: {
          create: async (params: Record<string, unknown>) => {
            const entry = { id: generateId(), ...params };
            storedEntries.knowledge.push(entry);
            return entry;
          },
        },
        tools: {
          create: async (params: Record<string, unknown>) => {
            const entry = { id: generateId(), ...params };
            storedEntries.tools.push(entry);
            return entry;
          },
        },
        tags: {
          getOrCreate: async (name: string) => {
            if (storedEntries.tags.has(name)) {
              return storedEntries.tags.get(name)!;
            }
            const tag = { id: generateId(), name };
            storedEntries.tags.set(name, tag);
            return tag;
          },
        },
        entryTags: {
          attach: async (params: { entryType: string; entryId: string; tagId: string }) => {
            storedEntries.entryTags.push(params);
            return { id: generateId(), ...params };
          },
        },
      },
    },
    storedEntries,
  };
}

describe('memory_remember Integration Tests', () => {
  let sqlite: ReturnType<typeof Database>;
  let db: ReturnType<typeof drizzle>;
  let classificationService: ClassificationService;

  beforeAll(() => {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  });

  beforeEach(() => {
    const dbPath = resolve(dataDir, `remember-test-${Date.now()}.db`);
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

  describe('Classification → Storage Routing', () => {
    it('should classify and store guideline (Rule: prefix)', async () => {
      const { ctx, storedEntries } = createMockContext(db, classificationService);

      const result = await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'Rule: always use TypeScript strict mode',
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('stored.type', 'guideline');
      expect(result).toHaveProperty('classification.type', 'guideline');
      expect(result).toHaveProperty('classification.method', 'regex');

      expect(storedEntries.guidelines).toHaveLength(1);
      expect(storedEntries.knowledge).toHaveLength(0);
      expect(storedEntries.tools).toHaveLength(0);
    });

    it('should classify and store guideline (Must prefix)', async () => {
      const { ctx, storedEntries } = createMockContext(db, classificationService);

      const result = await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'Must use async/await for all async operations',
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('stored.type', 'guideline');
      expect(storedEntries.guidelines).toHaveLength(1);
    });

    it('should classify and store guideline (Never prefix)', async () => {
      const { ctx, storedEntries } = createMockContext(db, classificationService);

      const result = await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'Never commit secrets to the repository',
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('stored.type', 'guideline');
      expect(storedEntries.guidelines).toHaveLength(1);
    });

    it('should classify and store knowledge (We decided)', async () => {
      const { ctx, storedEntries } = createMockContext(db, classificationService);

      const result = await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'We decided to use PostgreSQL for production',
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('stored.type', 'knowledge');
      expect(storedEntries.knowledge).toHaveLength(1);
      expect(storedEntries.guidelines).toHaveLength(0);
    });

    it('should classify and store knowledge (fact statement)', async () => {
      const { ctx, storedEntries } = createMockContext(db, classificationService);

      const result = await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'The API rate limit is 1000 requests per minute',
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('stored.type', 'knowledge');
      expect(storedEntries.knowledge).toHaveLength(1);
    });

    it('should classify and store tool (npm command)', async () => {
      const { ctx, storedEntries } = createMockContext(db, classificationService);

      const result = await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'npm run build to compile the project',
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('stored.type', 'tool');
      expect(storedEntries.tools).toHaveLength(1);
      expect(storedEntries.guidelines).toHaveLength(0);
    });

    it('should classify and store tool (git command)', async () => {
      const { ctx, storedEntries } = createMockContext(db, classificationService);

      const result = await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'git checkout -b feature/new-feature to create a branch',
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('stored.type', 'tool');
      expect(storedEntries.tools).toHaveLength(1);
    });
  });

  describe('forceType Override', () => {
    it('should use forceType instead of classification', async () => {
      const { ctx, storedEntries } = createMockContext(db, classificationService);

      // Text that would normally classify as guideline
      const result = await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'Rule: always use TypeScript',
        forceType: 'knowledge', // Force to knowledge
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('stored.type', 'knowledge');
      expect(result).toHaveProperty('classification.wasForced', true);
      expect(storedEntries.knowledge).toHaveLength(1);
      expect(storedEntries.guidelines).toHaveLength(0);
    });

    it('should have confidence 1.0 when forceType is used', async () => {
      const { ctx } = createMockContext(db, classificationService);

      const result = await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'Some text',
        forceType: 'tool',
      });

      expect(result).toHaveProperty('classification.confidence', 1);
      expect(result).toHaveProperty('classification.method', 'forced');
    });
  });

  describe('Learning from Corrections', () => {
    it('should record correction when forceType differs from prediction', async () => {
      const { ctx } = createMockContext(db, classificationService);

      // Spy on recordCorrection
      const recordCorrectionSpy = vi.spyOn(classificationService, 'recordCorrection');

      // Text that classifies as guideline, force to knowledge
      await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'Always use strict mode',
        forceType: 'knowledge',
      });

      expect(recordCorrectionSpy).toHaveBeenCalledWith(
        'Always use strict mode',
        'guideline',
        'knowledge'
      );

      recordCorrectionSpy.mockRestore();
    });

    it('should NOT record correction when forceType matches prediction', async () => {
      const { ctx } = createMockContext(db, classificationService);

      const recordCorrectionSpy = vi.spyOn(classificationService, 'recordCorrection');

      // Text that classifies as guideline, force to guideline (same)
      await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'Rule: always use strict mode',
        forceType: 'guideline',
      });

      // Should not record because prediction matches forceType
      expect(recordCorrectionSpy).not.toHaveBeenCalled();

      recordCorrectionSpy.mockRestore();
    });
  });

  describe('Tag Attachment', () => {
    it('should attach tags to stored entries', async () => {
      const { ctx, storedEntries } = createMockContext(db, classificationService);

      await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'Rule: use TypeScript for type safety',
        tags: ['typescript', 'best-practice'],
      });

      expect(storedEntries.entryTags).toHaveLength(2);
      expect(storedEntries.entryTags[0]?.entryType).toBe('guideline');
    });
  });

  describe('Category Inference', () => {
    it('should infer security category for security-related guidelines', async () => {
      const { ctx, storedEntries } = createMockContext(db, classificationService);

      await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'Never store passwords in plain text',
      });

      expect(storedEntries.guidelines[0]?.category).toBe('security');
    });

    it('should infer decision category for decision knowledge', async () => {
      const { ctx, storedEntries } = createMockContext(db, classificationService);

      await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'We decided to use React because of its ecosystem',
      });

      expect(storedEntries.knowledge[0]?.category).toBe('decision');
    });

    it('should infer cli category for npm commands', async () => {
      const { ctx, storedEntries } = createMockContext(db, classificationService);

      await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'npm run test to run all tests',
      });

      expect(storedEntries.tools[0]?.category).toBe('cli');
    });
  });

  describe('Error Handling', () => {
    it('should return error for empty text', async () => {
      const { ctx } = createMockContext(db, classificationService);

      const result = await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: '',
      });

      expect(result).toHaveProperty('error');
      expect(result).not.toHaveProperty('success');
    });

    it('should return error for missing text', async () => {
      const { ctx } = createMockContext(db, classificationService);

      const result = await memoryRememberDescriptor.contextHandler!(ctx as never, {});

      expect(result).toHaveProperty('error');
    });

    it('should return error when no project detected', async () => {
      const { ctx } = createMockContext(db, classificationService);
      // Override context detection to return no project
      ctx.services.contextDetection = {
        detect: async () => ({ project: null, agentId: { value: 'test' } }),
      };

      const result = await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'Rule: test',
      });

      expect(result).toHaveProperty('error', 'No project detected');
    });
  });

  describe('Fallback without Classification Service', () => {
    it('should use fallback classification when service not available', async () => {
      const { ctx, storedEntries } = createMockContext(db, null); // No classification service

      const result = await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'Some text without classification service',
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('stored.type', 'knowledge'); // Default fallback
      expect(result).toHaveProperty('classification.method', 'fallback');
      expect(result).toHaveProperty('classification.confidence', 0.5);
      expect(storedEntries.knowledge).toHaveLength(1);
    });

    it('should use forceType even without classification service', async () => {
      const { ctx, storedEntries } = createMockContext(db, null);

      const result = await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'Some text',
        forceType: 'tool',
      });

      expect(result).toHaveProperty('stored.type', 'tool');
      expect(result).toHaveProperty('classification.confidence', 1.0);
      expect(storedEntries.tools).toHaveLength(1);
    });
  });

  describe('Low Confidence Hints', () => {
    it('should include hint for low confidence classifications', async () => {
      const { ctx } = createMockContext(db, classificationService);

      // Ambiguous text that should have lower confidence
      const result = await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'Testing is important',
      });

      // Check if hint is present (depends on confidence level)
      if ((result as { classification?: { confidence: number } }).classification?.confidence ?? 1 < 0.7) {
        expect(result).toHaveProperty('hint');
      }
    });
  });

  describe('Priority Setting', () => {
    it('should use provided priority for guidelines', async () => {
      const { ctx, storedEntries } = createMockContext(db, classificationService);

      await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'Rule: critical security rule',
        priority: 95,
      });

      expect(storedEntries.guidelines[0]?.priority).toBe(95);
    });

    it('should use default priority (50) when not provided', async () => {
      const { ctx, storedEntries } = createMockContext(db, classificationService);

      await memoryRememberDescriptor.contextHandler!(ctx as never, {
        text: 'Rule: normal rule',
      });

      expect(storedEntries.guidelines[0]?.priority).toBe(50);
    });
  });
});
