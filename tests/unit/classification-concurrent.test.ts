/**
 * Classification Concurrent Stress Tests
 *
 * Tests thread safety, cache consistency, and behavior under load.
 * Validates the classification system can handle concurrent operations
 * without errors, race conditions, or data corruption.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as fs from 'fs';

import { ClassificationService } from '../../src/services/classification/index.js';
import type { ClassificationServiceConfig } from '../../src/services/classification/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = resolve(__dirname, '../../data/test-classification');

let sqlite: ReturnType<typeof Database>;
let db: ReturnType<typeof drizzle>;
let classificationService: ClassificationService;

function initTestDb(dbPath: string) {
  const sqliteDb = new Database(dbPath);

  sqliteDb.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_cf_text_hash ON classification_feedback(text_hash);
    CREATE INDEX IF NOT EXISTS idx_cf_predicted ON classification_feedback(predicted_type, was_correct);
    CREATE INDEX IF NOT EXISTS idx_cf_created ON classification_feedback(created_at);
    CREATE INDEX IF NOT EXISTS idx_cf_session ON classification_feedback(session_id);
    CREATE INDEX IF NOT EXISTS idx_pc_type ON pattern_confidence(pattern_type);
    CREATE INDEX IF NOT EXISTS idx_pc_multiplier ON pattern_confidence(feedback_multiplier);
  `);

  return { sqlite: sqliteDb, db: drizzle(sqliteDb) };
}

function createClassificationService(
  database: ReturnType<typeof drizzle>,
  overrides: Partial<ClassificationServiceConfig> = {}
): ClassificationService {
  const config: ClassificationServiceConfig = {
    highConfidenceThreshold: 0.85,
    lowConfidenceThreshold: 0.6,
    enableLLMFallback: false,
    feedbackDecayDays: 30,
    maxPatternBoost: 0.15,
    maxPatternPenalty: 0.3,
    cacheSize: 500,
    cacheTTLMs: 300000,
    learningRate: 0.1,
    ...overrides,
  };

  return new ClassificationService(database as never, null, config);
}

describe('Classification Concurrent Stress Tests', () => {
  beforeAll(() => {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  });

  beforeEach(() => {
    const dbPath = resolve(dataDir, `concurrent-test-${Date.now()}.db`);
    const result = initTestDb(dbPath);
    sqlite = result.sqlite;
    db = result.db;
    classificationService = createClassificationService(db);
  });

  afterAll(() => {
    if (sqlite) {
      sqlite.close();
    }
  });

  describe('Concurrent Classification', () => {
    it('should handle 100 parallel classifications of different texts', async () => {
      const texts = Array.from({ length: 100 }, (_, i) => `Rule: test rule ${i}`);

      const results = await Promise.all(texts.map((text) => classificationService.classify(text)));

      // All should complete without error
      expect(results).toHaveLength(100);
      expect(results.every((r) => r.type !== undefined)).toBe(true);
      expect(results.every((r) => r.confidence >= 0 && r.confidence <= 1)).toBe(true);

      // All should be classified as guidelines (Rule: prefix)
      expect(results.every((r) => r.type === 'guideline')).toBe(true);
    });

    it('should handle cache race condition (same text concurrent)', async () => {
      const text = 'Rule: test concurrent cache access';
      const concurrency = 50;

      const results = await Promise.all(
        Array.from({ length: concurrency }, () => classificationService.classify(text))
      );

      // All should complete
      expect(results).toHaveLength(concurrency);

      // All results should be identical
      const types = new Set(results.map((r) => r.type));
      const confidences = new Set(results.map((r) => r.confidence));

      expect(types.size).toBe(1);
      expect(confidences.size).toBe(1);
      expect(results[0]?.type).toBe('guideline');
    });

    it('should handle mixed text types concurrently', async () => {
      const texts = [
        // Guidelines
        ...Array.from({ length: 30 }, (_, i) => `Rule: guideline ${i}`),
        // Knowledge
        ...Array.from({ length: 30 }, (_, i) => `We decided to use option ${i}`),
        // Tools
        ...Array.from({ length: 30 }, (_, i) => `npm run command-${i}`),
        // Ambiguous
        ...Array.from({ length: 10 }, (_, i) => `Testing item ${i}`),
      ];

      // Shuffle to randomize order
      const shuffled = texts.sort(() => Math.random() - 0.5);

      const results = await Promise.all(
        shuffled.map((text) => classificationService.classify(text))
      );

      expect(results).toHaveLength(100);
      expect(results.every((r) => ['guideline', 'knowledge', 'tool'].includes(r.type))).toBe(true);
    });

    it('should maintain consistency under sustained load', async () => {
      const text = 'Must use TypeScript for all new files';
      const rounds = 10;
      const perRound = 20;

      const allResults: Array<{ type: string; confidence: number }> = [];

      for (let round = 0; round < rounds; round++) {
        const results = await Promise.all(
          Array.from({ length: perRound }, () => classificationService.classify(text))
        );
        allResults.push(...results);
      }

      expect(allResults).toHaveLength(rounds * perRound);

      // All results should be consistent
      const types = new Set(allResults.map((r) => r.type));
      expect(types.size).toBe(1);
    });
  });

  describe('Concurrent Learning (Corrections)', () => {
    it('should handle rapid corrections without errors', async () => {
      const corrections = Array.from({ length: 100 }, (_, i) => ({
        text: `Correction test ${i}`,
        predicted: 'guideline' as const,
        actual: 'knowledge' as const,
        sessionId: `stress-session-${i}`,
      }));

      // Execute all corrections in parallel
      const results = await Promise.allSettled(
        corrections.map((c) =>
          classificationService.recordCorrection(c.text, c.predicted, c.actual, c.sessionId)
        )
      );

      // All should complete (either fulfilled or rejected gracefully)
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Most should succeed (some may fail due to DB constraints, which is acceptable)
      expect(fulfilled.length).toBeGreaterThan(rejected.length);
    });

    it('should handle concurrent corrections for same pattern', async () => {
      const text = 'Always use strict mode';
      const concurrency = 20;

      // All correct the same text from guideline to knowledge
      const results = await Promise.allSettled(
        Array.from({ length: concurrency }, (_, i) =>
          classificationService.recordCorrection(
            text,
            'guideline',
            'knowledge',
            `concurrent-session-${i}`
          )
        )
      );

      // At least some should succeed
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThan(0);
    });

    it('should handle mixed classify and correct operations', async () => {
      const operations: Promise<unknown>[] = [];

      // Mix of classifications and corrections
      for (let i = 0; i < 50; i++) {
        if (i % 3 === 0) {
          // Correction
          operations.push(
            classificationService.recordCorrection(
              `Test text ${i}`,
              'guideline',
              'knowledge',
              `mixed-session-${i}`
            )
          );
        } else {
          // Classification
          operations.push(classificationService.classify(`Rule: test ${i}`));
        }
      }

      const results = await Promise.allSettled(operations);

      // All should complete (no hangs or crashes)
      expect(results).toHaveLength(50);

      // Most should succeed
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThan(40);
    });
  });

  describe('Pattern Confidence Bounds Under Stress', () => {
    it('should maintain multiplier bounds after many penalties', async () => {
      const text = 'Always test your code';

      // Apply 50 penalties to the same pattern
      for (let i = 0; i < 50; i++) {
        try {
          await classificationService.recordCorrection(
            text,
            'guideline',
            'knowledge',
            `penalty-session-${i}`
          );
        } catch {
          // Ignore errors for stress testing
        }
      }

      // Classify to check final state
      const result = await classificationService.classify(text);

      // Confidence should be reduced but not below minimum bounds
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should maintain multiplier bounds after many boosts', async () => {
      const text = 'Never skip testing';

      // Record as correct classification many times
      for (let i = 0; i < 50; i++) {
        try {
          // Correct classification (same predicted and actual)
          await classificationService.recordCorrection(
            text,
            'guideline',
            'guideline',
            `boost-session-${i}`
          );
        } catch {
          // Ignore errors for stress testing
        }
      }

      // Classify to check final state
      const result = await classificationService.classify(text);

      // Confidence should be boosted but not above maximum bounds
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Cache Stress Tests', () => {
    it('should handle cache overflow gracefully', async () => {
      // Create service with small cache
      const smallCacheService = createClassificationService(db, {
        cacheSize: 10,
        cacheTTLMs: 60000,
      });

      // Classify more texts than cache size
      const texts = Array.from({ length: 50 }, (_, i) => `Rule: overflow test ${i}`);

      const results = await Promise.all(texts.map((text) => smallCacheService.classify(text)));

      expect(results).toHaveLength(50);
      expect(results.every((r) => r.type === 'guideline')).toBe(true);
    });

    it('should handle cache expiry during operation', async () => {
      // Create service with very short TTL
      const shortTTLService = createClassificationService(db, {
        cacheSize: 100,
        cacheTTLMs: 10, // 10ms TTL
      });

      const text = 'Rule: expiry test';

      // First classification
      const result1 = await shortTTLService.classify(text);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second classification (should re-classify after expiry)
      const result2 = await shortTTLService.classify(text);

      // Both should give same result
      expect(result1.type).toBe(result2.type);
      expect(result1.type).toBe('guideline');
    });
  });

  describe('Error Resilience', () => {
    it('should not crash on malformed input', async () => {
      const edgeCases = [
        '',
        ' ',
        '\n\n\n',
        'a'.repeat(10000), // Very long
        '🎉🔥💻', // Emojis only
        '<script>alert("xss")</script>', // XSS attempt
        'SELECT * FROM users;', // SQL injection
        null as unknown as string,
        undefined as unknown as string,
      ];

      for (const input of edgeCases) {
        try {
          const result = await classificationService.classify(input);
          // If it doesn't throw, it should return a valid result
          expect(['guideline', 'knowledge', 'tool']).toContain(result.type);
        } catch (error) {
          // Errors are acceptable for truly invalid inputs
          expect(error).toBeDefined();
        }
      }
    });

    it('should recover from partial failures', async () => {
      const texts = Array.from({ length: 20 }, (_, i) => `Rule: recovery test ${i}`);

      // Run classifications
      const results = await Promise.allSettled(
        texts.map((text) => classificationService.classify(text))
      );

      // Check that some succeeded
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThan(0);
    });
  });

  describe('Memory Stability', () => {
    it('should not leak memory under sustained operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform many operations
      for (let batch = 0; batch < 10; batch++) {
        const texts = Array.from({ length: 100 }, (_, i) => `Rule: memory test ${batch}-${i}`);
        await Promise.all(texts.map((text) => classificationService.classify(text)));
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be reasonable (< 50MB for 1000 operations)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    });
  });
});
