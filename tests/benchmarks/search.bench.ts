/**
 * Search Performance Benchmarks
 *
 * Compares different search strategies: LIKE, FTS5, fuzzy, regex
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

describe('Search Performance', () => {
  beforeAll(() => {
    benchDb = setupBenchmarkDb(1000);
    projectId = getRandomProjectId(benchDb.db) ?? '';
  });

  afterAll(() => {
    benchDb.sqlite.close();
    cleanupBenchmarkDb();
  });

  describe('Search Strategy Comparison', () => {
    bench(
      'LIKE search (baseline)',
      () => {
        executeMemoryQuery({
          scope: { type: 'global', inherit: true },
          search: 'benchmark',
          useFts5: false,
          types: ['guidelines', 'knowledge'],
          limit: 20,
        });
      },
      { iterations: 50, warmupIterations: 5 }
    );

    bench(
      'FTS5 search',
      () => {
        executeMemoryQuery({
          scope: { type: 'global', inherit: true },
          search: 'benchmark',
          useFts5: true,
          types: ['guidelines', 'knowledge'],
          limit: 20,
        });
      },
      { iterations: 50, warmupIterations: 5 }
    );

    bench(
      'FTS5 multi-word search',
      () => {
        executeMemoryQuery({
          scope: { type: 'global', inherit: true },
          search: 'performance testing benchmark',
          useFts5: true,
          types: ['guidelines', 'knowledge'],
          limit: 20,
        });
      },
      { iterations: 50, warmupIterations: 5 }
    );

    bench(
      'fuzzy search (typo tolerance)',
      () => {
        executeMemoryQuery({
          scope: { type: 'global', inherit: true },
          search: 'benchmrk', // Intentional typo
          fuzzy: true,
          types: ['guidelines', 'knowledge'],
          limit: 20,
        });
      },
      { iterations: 50, warmupIterations: 5 }
    );

    bench(
      'regex search',
      () => {
        executeMemoryQuery({
          scope: { type: 'global', inherit: true },
          search: 'bench.*\\d+', // Regex pattern
          regex: true,
          types: ['guidelines'],
          limit: 20,
        });
      },
      { iterations: 50, warmupIterations: 5 }
    );
  });

  describe('Search with Filters', () => {
    bench(
      'search + scope filter',
      () => {
        executeMemoryQuery({
          scope: { type: 'project', id: projectId, inherit: false },
          search: 'benchmark',
          types: ['guidelines'],
          limit: 20,
        });
      },
      { iterations: 50, warmupIterations: 5 }
    );

    bench(
      'search + priority filter',
      () => {
        executeMemoryQuery({
          scope: { type: 'global', inherit: true },
          search: 'benchmark',
          types: ['guidelines'],
          priority: { min: 50 },
          limit: 20,
        });
      },
      { iterations: 50, warmupIterations: 5 }
    );

    bench(
      'search + date filter',
      () => {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        executeMemoryQuery({
          scope: { type: 'global', inherit: true },
          search: 'benchmark',
          types: ['guidelines'],
          createdAfter: yesterday,
          limit: 20,
        });
      },
      { iterations: 50, warmupIterations: 5 }
    );

    bench(
      'field-specific search',
      () => {
        executeMemoryQuery({
          scope: { type: 'global', inherit: true },
          search: 'benchmark',
          fields: ['name'],
          types: ['guidelines', 'tools'],
          limit: 20,
        });
      },
      { iterations: 50, warmupIterations: 5 }
    );
  });

  describe('Search Result Size Impact', () => {
    bench(
      'small result set (limit 5)',
      () => {
        executeMemoryQuery({
          scope: { type: 'global', inherit: true },
          search: 'benchmark',
          types: ['guidelines'],
          limit: 5,
        });
      },
      { iterations: 100, warmupIterations: 10 }
    );

    bench(
      'medium result set (limit 20)',
      () => {
        executeMemoryQuery({
          scope: { type: 'global', inherit: true },
          search: 'benchmark',
          types: ['guidelines'],
          limit: 20,
        });
      },
      { iterations: 100, warmupIterations: 10 }
    );

    bench(
      'large result set (limit 50)',
      () => {
        executeMemoryQuery({
          scope: { type: 'global', inherit: true },
          search: 'benchmark',
          types: ['guidelines'],
          limit: 50,
        });
      },
      { iterations: 50, warmupIterations: 5 }
    );

    bench(
      'maximum result set (limit 100)',
      () => {
        executeMemoryQuery({
          scope: { type: 'global', inherit: true },
          search: 'benchmark',
          types: ['guidelines'],
          limit: 100,
        });
      },
      { iterations: 25, warmupIterations: 5 }
    );
  });
});
