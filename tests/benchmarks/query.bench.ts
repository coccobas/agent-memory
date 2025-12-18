/**
 * Query Performance Benchmarks
 *
 * Measures latency for various query operations.
 * Target metrics: p50 < 5ms, p95 < 20ms, p99 < 50ms
 */

import { describe, bench, beforeAll, afterAll } from 'vitest';
import {
  setupBenchmarkDb,
  cleanupBenchmarkDb,
  getRandomProjectId,
  type BenchDb,
} from './fixtures/benchmark-helpers.js';
import { executeMemoryQuery } from '../../src/services/query.service.js';

let benchDb: BenchDb;
let projectId: string;

describe('Query Performance', () => {
  beforeAll(() => {
    benchDb = setupBenchmarkDb(1000);
    projectId = getRandomProjectId(benchDb.db) ?? '';
  });

  afterAll(() => {
    benchDb.sqlite.close();
    cleanupBenchmarkDb();
  });

  bench(
    'simple query - global scope',
    () => {
      executeMemoryQuery({
        scope: { type: 'global' },
        types: ['guidelines'],
        limit: 20,
      });
    },
    { iterations: 100, warmupIterations: 10 }
  );

  bench(
    'scoped query - project with inheritance',
    () => {
      executeMemoryQuery({
        scope: { type: 'project', id: projectId, inherit: true },
        types: ['guidelines', 'knowledge'],
        limit: 20,
      });
    },
    { iterations: 100, warmupIterations: 10 }
  );

  bench(
    'search query - text matching',
    () => {
      executeMemoryQuery({
        scope: { type: 'global', inherit: true },
        search: 'benchmark',
        types: ['guidelines', 'knowledge', 'tools'],
        limit: 20,
      });
    },
    { iterations: 100, warmupIterations: 10 }
  );

  bench(
    'FTS5 search query',
    () => {
      executeMemoryQuery({
        scope: { type: 'global', inherit: true },
        search: 'performance testing',
        useFts5: true,
        types: ['guidelines', 'knowledge'],
        limit: 20,
      });
    },
    { iterations: 100, warmupIterations: 10 }
  );

  bench(
    'complex query - multiple filters',
    () => {
      executeMemoryQuery({
        scope: { type: 'project', id: projectId, inherit: true },
        search: 'benchmark',
        types: ['guidelines'],
        priority: { min: 25, max: 75 },
        limit: 20,
      });
    },
    { iterations: 50, warmupIterations: 5 }
  );

  bench(
    'query with versions included',
    () => {
      executeMemoryQuery({
        scope: { type: 'global' },
        types: ['guidelines'],
        includeVersions: true,
        limit: 10,
      });
    },
    { iterations: 50, warmupIterations: 5 }
  );

  bench(
    'query with recency scoring - exponential decay',
    () => {
      executeMemoryQuery({
        scope: { type: 'global', inherit: true },
        types: ['guidelines', 'knowledge'],
        recencyWeight: 0.8,
        decayHalfLifeDays: 7,
        decayFunction: 'exponential',
        limit: 20,
      });
    },
    { iterations: 100, warmupIterations: 10 }
  );

  bench(
    'query all types - global scope',
    () => {
      executeMemoryQuery({
        scope: { type: 'global', inherit: true },
        types: ['guidelines', 'knowledge', 'tools'],
        limit: 50,
      });
    },
    { iterations: 50, warmupIterations: 5 }
  );
});
