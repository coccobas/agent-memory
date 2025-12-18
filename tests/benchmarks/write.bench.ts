/**
 * Write Performance Benchmarks
 *
 * Measures throughput for write operations.
 * Target metrics: Single insert > 100 ops/sec, Bulk insert > 50 ops/sec
 */

import { describe, bench, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupBenchmarkDb,
  cleanupBenchmarkDb,
  getRandomProjectId,
  createBenchmarkGuideline,
  createBenchmarkKnowledge,
  type BenchDb,
  schema,
} from './fixtures/benchmark-helpers.js';
import { generateId } from '../../src/db/repositories/base.js';

let benchDb: BenchDb;
let projectId: string;
let insertCounter = 0;

describe('Write Performance', () => {
  beforeAll(() => {
    benchDb = setupBenchmarkDb(100); // Smaller seed for write tests
    projectId = getRandomProjectId(benchDb.db) ?? '';
  });

  afterAll(() => {
    benchDb.sqlite.close();
    cleanupBenchmarkDb();
  });

  beforeEach(() => {
    insertCounter++;
  });

  bench(
    'single guideline insert',
    () => {
      createBenchmarkGuideline(benchDb.db, projectId, insertCounter);
    },
    { iterations: 100, warmupIterations: 10 }
  );

  bench(
    'single knowledge insert',
    () => {
      createBenchmarkKnowledge(benchDb.db, projectId, insertCounter);
    },
    { iterations: 100, warmupIterations: 10 }
  );

  bench(
    'bulk guideline insert (10 entries)',
    () => {
      for (let i = 0; i < 10; i++) {
        createBenchmarkGuideline(benchDb.db, projectId, insertCounter * 10 + i);
      }
    },
    { iterations: 20, warmupIterations: 5 }
  );

  bench(
    'guideline update (new version)',
    () => {
      // First create a guideline
      const { guidelineId } = createBenchmarkGuideline(benchDb.db, projectId, insertCounter);

      // Then add a new version
      const versionId = generateId();
      benchDb.db
        .insert(schema.guidelineVersions)
        .values({
          id: versionId,
          guidelineId,
          versionNum: 2,
          content: `Updated content ${insertCounter}`,
          changeReason: 'Benchmark update',
        })
        .run();
    },
    { iterations: 50, warmupIterations: 10 }
  );

  bench(
    'tag creation',
    () => {
      const tagId = generateId();
      benchDb.db
        .insert(schema.tags)
        .values({
          id: tagId,
          name: `bench_tag_${insertCounter}_${Date.now()}`,
          category: 'custom',
          isPredefined: false,
        })
        .run();
    },
    { iterations: 100, warmupIterations: 10 }
  );

  bench(
    'tag attachment to entry',
    () => {
      // Create a guideline and a tag
      const { guidelineId } = createBenchmarkGuideline(benchDb.db, projectId, insertCounter);
      const tagId = generateId();
      benchDb.db
        .insert(schema.tags)
        .values({
          id: tagId,
          name: `attach_tag_${insertCounter}_${Date.now()}`,
          category: 'custom',
          isPredefined: false,
        })
        .run();

      // Attach tag
      benchDb.db
        .insert(schema.entryTags)
        .values({
          entryType: 'guideline',
          entryId: guidelineId,
          tagId,
        })
        .run();
    },
    { iterations: 50, warmupIterations: 10 }
  );

  bench(
    'project creation',
    () => {
      const projectId = generateId();
      benchDb.db
        .insert(schema.projects)
        .values({
          id: projectId,
          name: `Benchmark Project ${insertCounter}`,
          description: 'Created during benchmark',
        })
        .run();
    },
    { iterations: 100, warmupIterations: 10 }
  );

  bench(
    'session creation',
    () => {
      const sessionId = generateId();
      benchDb.db
        .insert(schema.sessions)
        .values({
          id: sessionId,
          projectId,
          name: `Benchmark Session ${insertCounter}`,
          status: 'active',
        })
        .run();
    },
    { iterations: 100, warmupIterations: 10 }
  );
});
