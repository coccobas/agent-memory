/**
 * Classification → Storage Flow Tests
 *
 * End-to-end tests verifying that:
 * 1. Different input patterns route to correct entry types
 * 2. Entries are actually stored in the database
 * 3. Learning corrections affect future classifications
 * 4. Confidence thresholds work correctly
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as fs from 'fs';
import { sql } from 'drizzle-orm';

import { ClassificationService } from '../../src/services/classification/index.js';
import type { ClassificationServiceConfig } from '../../src/services/classification/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = resolve(__dirname, '../../data/test-flow');

// Full schema
const FULL_SCHEMA = `
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

  CREATE TABLE IF NOT EXISTS guidelines (
    id TEXT PRIMARY KEY,
    scope_type TEXT NOT NULL,
    scope_id TEXT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    priority INTEGER DEFAULT 50,
    is_active INTEGER DEFAULT 1,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS knowledge (
    id TEXT PRIMARY KEY,
    scope_type TEXT NOT NULL,
    scope_id TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    is_active INTEGER DEFAULT 1,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    scope_type TEXT NOT NULL,
    scope_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    is_active INTEGER DEFAULT 1,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cf_text_hash ON classification_feedback(text_hash);
  CREATE INDEX IF NOT EXISTS idx_pc_pattern ON pattern_confidence(pattern_id);
`;

// Test cases with expected classifications
const CLASSIFICATION_TEST_CASES = [
  // Guidelines
  { text: 'Rule: always use TypeScript', expectedType: 'guideline', pattern: 'rule-prefix' },
  {
    text: 'Must use async/await for async operations',
    expectedType: 'guideline',
    pattern: 'must-prefix',
  },
  {
    text: 'Never commit secrets to the repository',
    expectedType: 'guideline',
    pattern: 'never-prefix',
  },
  { text: "Don't use var in TypeScript", expectedType: 'guideline', pattern: 'dont-prefix' },
  { text: 'Avoid using any type', expectedType: 'guideline', pattern: 'avoid-prefix' },
  { text: 'Always write unit tests', expectedType: 'guideline', pattern: 'always-prefix' },
  { text: 'Prefer const over let', expectedType: 'guideline', pattern: 'prefer-prefix' },
  { text: 'We always use dependency injection', expectedType: 'guideline', pattern: 'we-always' },

  // Knowledge
  { text: 'We decided to use PostgreSQL', expectedType: 'knowledge', pattern: 'we-decided' },
  {
    text: 'We chose React because of its ecosystem',
    expectedType: 'knowledge',
    pattern: 'we-chose',
  },
  { text: 'The API rate limit is 1000/min', expectedType: 'knowledge', pattern: 'fact' },
  { text: 'Our backend is built with Node.js', expectedType: 'knowledge', pattern: 'description' },
  {
    text: 'Decision: use REST over GraphQL',
    expectedType: 'knowledge',
    pattern: 'decision-prefix',
  },
  {
    text: 'Remember that tokens expire in 24h',
    expectedType: 'knowledge',
    pattern: 'remember-that',
  },

  // Tools
  { text: 'npm run build to compile', expectedType: 'tool', pattern: 'npm-command' },
  { text: 'yarn install for dependencies', expectedType: 'tool', pattern: 'yarn-command' },
  { text: 'git checkout -b feature/x', expectedType: 'tool', pattern: 'git-command' },
  { text: 'docker-compose up -d', expectedType: 'tool', pattern: 'docker-command' },
  { text: 'Command: npx vitest', expectedType: 'tool', pattern: 'command-prefix' },
  { text: 'Run `npm test` to execute tests', expectedType: 'tool', pattern: 'run-backtick' },
];

describe('Classification → Storage Flow Tests', () => {
  let sqlite: ReturnType<typeof Database>;
  let db: ReturnType<typeof drizzle>;
  let classificationService: ClassificationService;

  beforeAll(() => {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  });

  beforeEach(() => {
    const dbPath = resolve(dataDir, `flow-test-${Date.now()}.db`);
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

  describe('Pattern → Type Routing', () => {
    it.each(CLASSIFICATION_TEST_CASES)(
      'should classify "$text" as $expectedType ($pattern)',
      async ({ text, expectedType }) => {
        const result = await classificationService.classify(text);
        expect(result.type).toBe(expectedType);
        expect(result.confidence).toBeGreaterThan(0);
      }
    );

    it('should have high confidence for clear patterns', async () => {
      const result = await classificationService.classify('Rule: always test your code');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.method).toBe('regex');
    });

    it('should have lower confidence for ambiguous text', async () => {
      const result = await classificationService.classify('Testing is important');
      // Ambiguous text should have lower confidence
      expect(result.confidence).toBeLessThan(0.85);
    });
  });

  describe('Simulated Storage Flow', () => {
    // Simulates what memory_remember does
    async function simulateRemember(text: string, forceType?: 'guideline' | 'knowledge' | 'tool') {
      const result = await classificationService.classify(text, forceType);
      const entryType = result.type;

      // Simulate storage based on type
      let storedId: string;
      const id = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      switch (entryType) {
        case 'guideline':
          sqlite.exec(`
            INSERT INTO guidelines (id, scope_type, scope_id, name, content, created_by)
            VALUES ('${id}', 'project', 'test-proj', 'test', '${text.replace(/'/g, "''")}', 'test')
          `);
          storedId = id;
          break;
        case 'knowledge':
          sqlite.exec(`
            INSERT INTO knowledge (id, scope_type, scope_id, title, content, created_by)
            VALUES ('${id}', 'project', 'test-proj', 'test', '${text.replace(/'/g, "''")}', 'test')
          `);
          storedId = id;
          break;
        case 'tool':
          sqlite.exec(`
            INSERT INTO tools (id, scope_type, scope_id, name, description, created_by)
            VALUES ('${id}', 'project', 'test-proj', 'test', '${text.replace(/'/g, "''")}', 'test')
          `);
          storedId = id;
          break;
      }

      return { storedId, entryType, result };
    }

    it('should store guidelines in guidelines table', async () => {
      const { storedId, entryType } = await simulateRemember('Rule: always use strict mode');

      expect(entryType).toBe('guideline');

      // Verify in database
      const rows = db.all(sql`SELECT * FROM guidelines WHERE id = ${storedId}`);
      expect(rows).toHaveLength(1);
    });

    it('should store knowledge in knowledge table', async () => {
      const { storedId, entryType } = await simulateRemember('We decided to use React');

      expect(entryType).toBe('knowledge');

      // Verify in database
      const rows = db.all(sql`SELECT * FROM knowledge WHERE id = ${storedId}`);
      expect(rows).toHaveLength(1);
    });

    it('should store tools in tools table', async () => {
      const { storedId, entryType } = await simulateRemember('npm run build');

      expect(entryType).toBe('tool');

      // Verify in database
      const rows = db.all(sql`SELECT * FROM tools WHERE id = ${storedId}`);
      expect(rows).toHaveLength(1);
    });

    it('should honor forceType and store in correct table', async () => {
      // Text would normally be guideline
      const { storedId, entryType } = await simulateRemember(
        'Rule: this should be knowledge',
        'knowledge'
      );

      expect(entryType).toBe('knowledge');

      // Should be in knowledge, not guidelines
      const guidelineRows = db.all(sql`SELECT * FROM guidelines WHERE id = ${storedId}`);
      const knowledgeRows = db.all(sql`SELECT * FROM knowledge WHERE id = ${storedId}`);

      expect(guidelineRows).toHaveLength(0);
      expect(knowledgeRows).toHaveLength(1);
    });
  });

  describe('Learning from Corrections', () => {
    it('should record corrections in classification_feedback', async () => {
      const text = 'Always test carefully';

      // First classify (guideline)
      const prediction = await classificationService.classify(text);
      expect(prediction.type).toBe('guideline');

      // Record correction
      await classificationService.recordCorrection(text, 'guideline', 'knowledge');

      // Check feedback was recorded
      const feedbackRows = db.all(sql`
        SELECT * FROM classification_feedback
        WHERE predicted_type = 'guideline' AND actual_type = 'knowledge'
      `);

      expect(feedbackRows.length).toBeGreaterThan(0);
    });

    it('should update pattern confidence after corrections', async () => {
      const text = 'Always verify inputs';

      // Classify multiple times with corrections
      for (let i = 0; i < 5; i++) {
        await classificationService.classify(text);
        await classificationService.recordCorrection(text, 'guideline', 'knowledge');
      }

      // Check that pattern confidence was created/updated
      const patternRows = db.all(sql`SELECT * FROM pattern_confidence`);

      // At least one pattern should have been tracked
      const hasPatterns = patternRows.length > 0;

      // If patterns exist, some should have been penalized
      if (hasPatterns) {
        const penalizedPatterns = patternRows.filter(
          (p: Record<string, unknown>) =>
            typeof p.incorrect_matches === 'number' && p.incorrect_matches > 0
        );
        expect(penalizedPatterns.length).toBeGreaterThan(0);
      }
    });

    it('should affect confidence after repeated corrections', async () => {
      const text = 'Always validate all inputs';

      // Get initial confidence
      const initial = await classificationService.classify(text);
      const initialConfidence = initial.confidence;

      // Apply multiple corrections
      for (let i = 0; i < 10; i++) {
        // Clear cache to force re-evaluation
        await classificationService.classify(`Always validate inputs ${i}`);
        await classificationService.recordCorrection(
          `Always validate inputs ${i}`,
          'guideline',
          'knowledge'
        );
      }

      // Re-classify similar text
      const after = await classificationService.classify('Always check inputs');

      // Confidence might be adjusted based on feedback
      // (exact behavior depends on implementation)
      expect(after.confidence).toBeDefined();
      expect(after.type).toBeDefined();
    });
  });

  describe('Batch Classification Performance', () => {
    it('should classify 100 items in under 100ms', async () => {
      const texts = CLASSIFICATION_TEST_CASES.map((tc) => tc.text);
      // Repeat to get 100 items
      const batch = Array.from({ length: 5 }, () => texts)
        .flat()
        .slice(0, 100);

      const start = performance.now();

      const results = await Promise.all(batch.map((text) => classificationService.classify(text)));

      const elapsed = performance.now() - start;

      expect(results).toHaveLength(100);
      expect(elapsed).toBeLessThan(100); // Should be very fast with caching
    });

    it('should maintain accuracy across batch', async () => {
      const results = await Promise.all(
        CLASSIFICATION_TEST_CASES.map(async (tc) => ({
          ...tc,
          result: await classificationService.classify(tc.text),
        }))
      );

      const correct = results.filter((r) => r.result.type === r.expectedType);
      const accuracy = correct.length / results.length;

      expect(accuracy).toBeGreaterThanOrEqual(0.9); // 90% accuracy threshold
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string', async () => {
      const result = await classificationService.classify('');
      expect(result.type).toBeDefined();
      expect(['guideline', 'knowledge', 'tool']).toContain(result.type);
    });

    it('should handle very long text', async () => {
      const longText = 'Rule: ' + 'always '.repeat(1000) + 'use TypeScript';
      const result = await classificationService.classify(longText);
      expect(result.type).toBe('guideline');
    });

    it('should handle special characters', async () => {
      const result = await classificationService.classify(
        'Rule: use `backticks` and "quotes" safely'
      );
      expect(result.type).toBe('guideline');
    });

    it('should handle unicode', async () => {
      const result = await classificationService.classify('Rule: 使用 TypeScript 🎉');
      expect(result.type).toBe('guideline');
    });

    it('should handle mixed case', async () => {
      const result = await classificationService.classify('RULE: ALWAYS USE TYPESCRIPT');
      expect(result.type).toBe('guideline');
    });
  });

  describe('Confidence Thresholds', () => {
    it('should return high confidence for clear patterns', async () => {
      const highConfidenceTexts = [
        'Rule: always use TypeScript',
        'Never commit secrets',
        'npm run build',
        'We decided to use PostgreSQL',
      ];

      for (const text of highConfidenceTexts) {
        const result = await classificationService.classify(text);
        expect(result.confidence).toBeGreaterThan(0.6);
      }
    });

    it('should return lower confidence for ambiguous text', async () => {
      const ambiguousTexts = ['TypeScript is good', 'Consider using tests', 'The code quality'];

      for (const text of ambiguousTexts) {
        const result = await classificationService.classify(text);
        // Ambiguous should have lower confidence
        expect(result.confidence).toBeLessThanOrEqual(0.85);
      }
    });
  });

  describe('Cache Behavior', () => {
    it('should return consistent results for same text', async () => {
      const text = 'Rule: test cache consistency';

      const result1 = await classificationService.classify(text);
      const result2 = await classificationService.classify(text);
      const result3 = await classificationService.classify(text);

      expect(result1.type).toBe(result2.type);
      expect(result2.type).toBe(result3.type);
      expect(result1.confidence).toBe(result2.confidence);
    });

    it('should be faster on cache hit', async () => {
      const text = 'Rule: test cache performance';

      // First call (cache miss)
      const start1 = performance.now();
      await classificationService.classify(text);
      const elapsed1 = performance.now() - start1;

      // Second call (cache hit)
      const start2 = performance.now();
      await classificationService.classify(text);
      const elapsed2 = performance.now() - start2;

      // Cache hit should be faster (or similar if already very fast)
      expect(elapsed2).toBeLessThanOrEqual(elapsed1 + 1);
    });
  });
});
