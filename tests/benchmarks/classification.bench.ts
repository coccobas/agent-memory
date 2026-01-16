/**
 * Classification Performance Benchmark
 *
 * Measures latency for classification operations.
 *
 * Targets:
 * - p50 < 1ms (regex-only path)
 * - p95 < 5ms (with pattern confidence lookup)
 * - p99 < 10ms (including cache misses)
 *
 * Run with: npx vitest bench tests/benchmarks/classification.bench.ts
 */

import { bench, describe, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as fs from 'fs';

import { ClassificationService } from '../../src/services/classification/index.js';
import type { ClassificationServiceConfig } from '../../src/services/classification/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = resolve(__dirname, '../../data/benchmark-classification');

// Sample texts for benchmarking
const SAMPLE_TEXTS = {
  // High confidence guideline patterns
  highConfidenceGuideline: 'Rule: always use TypeScript strict mode',
  imperativeGuideline: 'Must use async/await for all async operations',
  prohibitionGuideline: 'Never store secrets in code',
  preferenceGuideline: 'Prefer const over let for variable declarations',

  // High confidence knowledge patterns
  decisionKnowledge: 'We decided to use PostgreSQL for production',
  factKnowledge: 'The API rate limit is 1000 requests per minute',
  systemKnowledge: 'Our backend is built with Node.js and Express',

  // High confidence tool patterns
  cliCommand: 'npm run build to compile the project',
  gitCommand: 'git checkout -b feature/new-feature',
  dockerCommand: 'docker-compose up -d to start all services',

  // Ambiguous texts (harder to classify)
  ambiguous1: 'Testing is important for code quality',
  ambiguous2: 'The team has good code review practices',
  ambiguous3: 'We use TypeScript for type safety',

  // Edge cases
  singleWord: 'PostgreSQL',
  empty: '',
  longText:
    'This is a very long text that describes our system architecture in detail. The backend is built with Node.js and Express, using PostgreSQL for data persistence. We always use TypeScript strict mode and prefer functional programming patterns. The team decided to use REST APIs over GraphQL after careful evaluation.',
};

let sqlite: ReturnType<typeof Database>;
let db: ReturnType<typeof drizzle>;
let classificationService: ClassificationService;

function initBenchmarkDb(dbPath: string) {
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

beforeAll(() => {
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Initialize database
  const dbPath = resolve(dataDir, `bench-${Date.now()}.db`);
  const result = initBenchmarkDb(dbPath);
  sqlite = result.sqlite;
  db = result.db;

  // Create classification service (regex-only mode for pure performance testing)
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
  };

  classificationService = new ClassificationService(db as never, null, config);
});

afterAll(() => {
  if (sqlite) {
    sqlite.close();
  }
});

describe('Classification Latency Benchmarks', () => {
  // High confidence paths (should be fastest)
  describe('High Confidence - Regex Only', () => {
    bench('classify guideline (Rule: prefix)', async () => {
      await classificationService.classify(SAMPLE_TEXTS.highConfidenceGuideline);
    });

    bench('classify guideline (Must prefix)', async () => {
      await classificationService.classify(SAMPLE_TEXTS.imperativeGuideline);
    });

    bench('classify guideline (Never prefix)', async () => {
      await classificationService.classify(SAMPLE_TEXTS.prohibitionGuideline);
    });

    bench('classify guideline (Prefer prefix)', async () => {
      await classificationService.classify(SAMPLE_TEXTS.preferenceGuideline);
    });

    bench('classify knowledge (We decided)', async () => {
      await classificationService.classify(SAMPLE_TEXTS.decisionKnowledge);
    });

    bench('classify knowledge (fact statement)', async () => {
      await classificationService.classify(SAMPLE_TEXTS.factKnowledge);
    });

    bench('classify tool (npm command)', async () => {
      await classificationService.classify(SAMPLE_TEXTS.cliCommand);
    });

    bench('classify tool (git command)', async () => {
      await classificationService.classify(SAMPLE_TEXTS.gitCommand);
    });

    bench('classify tool (docker command)', async () => {
      await classificationService.classify(SAMPLE_TEXTS.dockerCommand);
    });
  });

  // Ambiguous texts (may require more pattern evaluation)
  describe('Ambiguous Texts', () => {
    bench('classify ambiguous text 1', async () => {
      await classificationService.classify(SAMPLE_TEXTS.ambiguous1);
    });

    bench('classify ambiguous text 2', async () => {
      await classificationService.classify(SAMPLE_TEXTS.ambiguous2);
    });

    bench('classify ambiguous text 3', async () => {
      await classificationService.classify(SAMPLE_TEXTS.ambiguous3);
    });
  });

  // Edge cases
  describe('Edge Cases', () => {
    bench('classify single word', async () => {
      await classificationService.classify(SAMPLE_TEXTS.singleWord);
    });

    bench('classify empty string', async () => {
      await classificationService.classify(SAMPLE_TEXTS.empty);
    });

    bench('classify long text (~300 chars)', async () => {
      await classificationService.classify(SAMPLE_TEXTS.longText);
    });
  });

  // Cache performance
  describe('Cache Performance', () => {
    const cacheTestText = 'Rule: cache performance test text';

    bench('classify (cache miss then hit)', async () => {
      // First call populates cache, subsequent calls hit cache
      await classificationService.classify(cacheTestText);
    });
  });

  // Throughput tests
  describe('Throughput', () => {
    bench('classify 100 unique texts sequentially', async () => {
      for (let i = 0; i < 100; i++) {
        await classificationService.classify(`Rule: test rule number ${i}`);
      }
    });

    bench('classify 100 repeated texts (cache hits)', async () => {
      const text = 'Rule: repeated text for cache testing';
      for (let i = 0; i < 100; i++) {
        await classificationService.classify(text);
      }
    });
  });
});

describe('Learning Loop Latency', () => {
  bench('record single correction', async () => {
    await classificationService.recordCorrection(
      'Test text for correction',
      'guideline',
      'knowledge',
      'bench-session'
    );
  });

  bench('record 10 corrections sequentially', async () => {
    for (let i = 0; i < 10; i++) {
      await classificationService.recordCorrection(
        `Test text ${i} for correction`,
        'guideline',
        'knowledge',
        `bench-session-${i}`
      );
    }
  });
});
