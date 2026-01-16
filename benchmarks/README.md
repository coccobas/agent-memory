# Agent Memory Performance Benchmarks

## Running Benchmarks

```bash
# Run all benchmarks
npm run bench

# Run benchmarks once (no watch mode)
npm run bench:run

# Run specific benchmark suites
npm run bench:query   # Query latency benchmarks
npm run bench:write   # Write throughput benchmarks
npm run bench:search  # Search performance comparison
```

## Benchmark Suites

### Query Benchmarks (`query.bench.ts`)

Measures query latency for various operations:

| Benchmark                               | Description                                  |
| --------------------------------------- | -------------------------------------------- |
| Simple query - global scope             | Basic query on global guidelines             |
| Scoped query - project with inheritance | Query with scope chain traversal             |
| Search query - text matching            | Query with text search parameter             |
| FTS5 search query                       | Full-text search using SQLite FTS5           |
| Complex query - multiple filters        | Combined scope, search, and priority filters |
| Query with versions included            | Query with version history                   |
| Query with recency scoring              | Exponential decay recency boost              |
| Query all types                         | Query guidelines, knowledge, and tools       |

### Write Benchmarks (`write.bench.ts`)

Measures write throughput:

| Benchmark                  | Description                             |
| -------------------------- | --------------------------------------- |
| Single guideline insert    | Insert one guideline with version       |
| Single knowledge insert    | Insert one knowledge entry with version |
| Bulk guideline insert (10) | Insert 10 guidelines in sequence        |
| Guideline update           | Add new version to existing guideline   |
| Tag creation               | Create a new tag                        |
| Tag attachment             | Attach tag to entry                     |
| Project creation           | Create new project                      |
| Session creation           | Create new session                      |

### Search Benchmarks (`search.bench.ts`)

Compares search strategies:

| Benchmark              | Description                         |
| ---------------------- | ----------------------------------- |
| LIKE search (baseline) | Standard SQL LIKE pattern matching  |
| FTS5 search            | SQLite full-text search             |
| FTS5 multi-word search | Multi-term FTS5 query               |
| Fuzzy search           | Levenshtein distance matching       |
| Regex search           | Regular expression pattern matching |

## Performance Targets

### Query Latency

| Metric | Target | Notes                         |
| ------ | ------ | ----------------------------- |
| p50    | < 5ms  | Simple global query           |
| p95    | < 20ms | Complex scoped query          |
| p99    | < 50ms | Full-text search with filters |

### Write Throughput

| Operation            | Target        |
| -------------------- | ------------- |
| Single insert        | > 100 ops/sec |
| Bulk insert (10)     | > 50 ops/sec  |
| Update (new version) | > 80 ops/sec  |

## Environment

Benchmarks run with:

- SQLite WAL mode enabled
- 1000 seeded entries per type (guidelines, knowledge, tools)
- Isolated benchmark database (`./data/benchmark/`)
- Dev mode enabled for auto-fixing migrations

## Interpreting Results

Vitest bench outputs:

```
✓ Query Performance (8 tests)
  ✓ simple query - global scope              123.45 ops/s ±1.23%  (100 samples)
  ✓ scoped query - project with inheritance   98.76 ops/s ±2.34%  (100 samples)
  ...
```

- **ops/s**: Operations per second (higher is better)
- **±%**: Relative margin of error
- **samples**: Number of benchmark iterations

## Adding New Benchmarks

1. Create a new `.bench.ts` file in `tests/benchmarks/`
2. Use the `bench()` function from vitest
3. Import helpers from `./fixtures/benchmark-helpers.ts`
4. Add npm script if needed

Example:

```typescript
import { describe, bench, beforeAll, afterAll } from 'vitest';
import {
  setupBenchmarkDb,
  cleanupBenchmarkDb,
  type BenchDb,
} from './fixtures/benchmark-helpers.js';

let benchDb: BenchDb;

describe('My Benchmarks', () => {
  beforeAll(() => {
    benchDb = setupBenchmarkDb(1000);
  });

  afterAll(() => {
    benchDb.sqlite.close();
    cleanupBenchmarkDb();
  });

  bench(
    'my operation',
    () => {
      // Code to benchmark
    },
    { iterations: 100, warmupIterations: 10 }
  );
});
```

## Baseline

Last updated: 2025-12-18
System: Run `npm run bench:run` to establish baseline on your machine

Results will vary based on:

- CPU speed and architecture
- Available memory
- Disk I/O performance
- SQLite version
- Node.js version
