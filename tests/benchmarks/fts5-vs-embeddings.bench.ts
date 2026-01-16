/**
 * FTS5 vs Local Embeddings Benchmark
 *
 * Compares search strategies to inform whether FTS5 should be deprecated:
 * 1. Simple text match (baseline - substring/LIKE)
 * 2. FTS5 with Porter stemming
 * 3. Local embeddings (Xenova/all-MiniLM-L6-v2)
 *
 * Measures:
 * - Latency (p50, p95, p99)
 * - Cold start vs warm performance
 * - Scaling with data size
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../src/db/schema.js';
import { generateId } from '../../src/db/repositories/base.js';
import { applyMigrations } from '../fixtures/migration-loader.js';
import { cleanupDbFiles, ensureDataDirectory } from '../fixtures/db-utils.js';
import {
  EmbeddingService,
  resetEmbeddingServiceState,
} from '../../src/services/embedding.service.js';
import { calculateStats } from './fixtures/benchmark-helpers.js';

const BENCH_DB_PATH = './data/benchmark/fts5-vs-embeddings.db';

interface BenchResult {
  name: string;
  times: number[];
  stats: ReturnType<typeof calculateStats>;
}

interface SearchResult {
  id: string;
  name: string;
  score?: number;
}

/**
 * Setup benchmark database with configurable entry count
 */
function setupDb(entryCount: number) {
  ensureDataDirectory('benchmark');
  cleanupDbFiles(BENCH_DB_PATH);

  const sqlite = new Database(BENCH_DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });

  applyMigrations(sqlite);
  seedData(db, sqlite, entryCount);

  return { sqlite, db };
}

/**
 * Seed database with realistic content for search testing
 */
function seedData(db: ReturnType<typeof drizzle>, sqlite: Database.Database, count: number): void {
  const topics = [
    'authentication',
    'authorization',
    'database',
    'caching',
    'logging',
    'monitoring',
    'deployment',
    'testing',
    'security',
    'performance',
    'api',
    'frontend',
    'backend',
    'microservices',
    'kubernetes',
  ];

  const contentTemplates = [
    'Best practices for {topic} in production systems',
    'How to implement {topic} with proper error handling',
    '{topic} optimization techniques for high-traffic applications',
    'Security considerations when implementing {topic}',
    'Common pitfalls to avoid with {topic} implementations',
  ];

  const insertKnowledge = sqlite.prepare(`
    INSERT INTO knowledge (id, scope_type, scope_id, title, category, is_active, created_at)
    VALUES (?, 'global', NULL, ?, 'fact', 1, datetime('now'))
  `);

  const insertKnowledgeVersion = sqlite.prepare(`
    INSERT INTO knowledge_versions (id, knowledge_id, version_num, content, created_at)
    VALUES (?, ?, 1, ?, datetime('now'))
  `);

  const updateCurrentVersion = sqlite.prepare(`
    UPDATE knowledge SET current_version_id = ? WHERE id = ?
  `);

  const insertAll = sqlite.transaction(() => {
    for (let i = 0; i < count; i++) {
      const topic = topics[i % topics.length]!;
      const template = contentTemplates[i % contentTemplates.length]!;

      const knowledgeId = generateId();
      const versionId = generateId();
      const title = template.replace('{topic}', topic) + ` (entry ${i})`;
      const content = `Detailed guide on ${topic}. This covers various aspects including implementation details, edge cases, and real-world examples. Keywords: ${topic}, engineering, development, software.`;

      insertKnowledge.run(knowledgeId, title);
      insertKnowledgeVersion.run(versionId, knowledgeId, content);
      updateCurrentVersion.run(versionId, knowledgeId);
    }
  });

  insertAll();
}

/**
 * Simple text match (LIKE/substring) - baseline
 */
function searchLike(sqlite: Database.Database, query: string, limit: number): SearchResult[] {
  const stmt = sqlite.prepare(`
    SELECT k.id, k.title as name
    FROM knowledge k
    WHERE k.is_active = 1
      AND (k.title LIKE '%' || ? || '%')
    ORDER BY k.created_at DESC
    LIMIT ?
  `);
  return stmt.all(query, limit) as SearchResult[];
}

/**
 * FTS5 search with Porter stemming
 */
function searchFts5(sqlite: Database.Database, query: string, limit: number): SearchResult[] {
  const stmt = sqlite.prepare(`
    SELECT k.id, k.title as name, bm25(knowledge_fts) as score
    FROM knowledge_fts
    JOIN knowledge k ON k.id = knowledge_fts.knowledge_id
    WHERE k.is_active = 1
      AND knowledge_fts MATCH ?
    ORDER BY bm25(knowledge_fts)
    LIMIT ?
  `);
  try {
    return stmt.all(query, limit) as SearchResult[];
  } catch {
    // FTS5 syntax error (e.g., special chars), fall back to empty
    return [];
  }
}

/**
 * Embedding-based search with cosine similarity
 */
async function searchEmbeddings(
  sqlite: Database.Database,
  embeddingService: EmbeddingService,
  query: string,
  limit: number,
  precomputedEmbeddings: Map<string, number[]>
): Promise<SearchResult[]> {
  // Generate query embedding
  const queryResult = await embeddingService.embed(query);
  const queryEmb = queryResult.embedding;

  // Compute cosine similarity against all entries
  const results: Array<{ id: string; name: string; score: number }> = [];

  for (const [id, embedding] of precomputedEmbeddings) {
    const score = cosineSimilarity(queryEmb, embedding);
    // Get title from DB (could be optimized with a cache)
    const row = sqlite.prepare('SELECT title FROM knowledge WHERE id = ?').get(id) as
      | { title: string }
      | undefined;
    if (row) {
      results.push({ id, name: row.title, score });
    }
  }

  // Sort by score descending and take top N
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i]!;
    const bVal = b[i]!;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude > 0 ? dotProduct / magnitude : 0;
}

/**
 * Run a benchmark for a single search strategy
 */
async function runBenchmark(
  name: string,
  searchFn: () => Promise<SearchResult[]> | SearchResult[],
  iterations: number,
  warmupIterations: number
): Promise<BenchResult> {
  // Warmup
  for (let i = 0; i < warmupIterations; i++) {
    await searchFn();
  }

  // Measure
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await searchFn();
    times.push(performance.now() - start);
  }

  return {
    name,
    times,
    stats: calculateStats(times),
  };
}

/**
 * Pre-compute embeddings for all entries
 */
async function precomputeEmbeddings(
  sqlite: Database.Database,
  embeddingService: EmbeddingService
): Promise<Map<string, number[]>> {
  const entries = sqlite
    .prepare(
      `
    SELECT k.id, k.title, kv.content
    FROM knowledge k
    JOIN knowledge_versions kv ON k.current_version_id = kv.id
    WHERE k.is_active = 1
  `
    )
    .all() as Array<{ id: string; title: string; content: string }>;

  const embeddings = new Map<string, number[]>();

  console.log(`  Pre-computing embeddings for ${entries.length} entries...`);
  const batchSize = 10;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const texts = batch.map((e) => `${e.title} ${e.content}`);
    const result = await embeddingService.embedBatch(texts);

    batch.forEach((entry, idx) => {
      const embedding = result.embeddings[idx];
      if (embedding) {
        embeddings.set(entry.id, embedding);
      }
    });

    if ((i + batchSize) % 100 === 0) {
      console.log(
        `    Computed ${Math.min(i + batchSize, entries.length)}/${entries.length} embeddings`
      );
    }
  }

  return embeddings;
}

/**
 * Format benchmark results
 */
function formatResults(results: BenchResult[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('BENCHMARK RESULTS');
  console.log('='.repeat(80));

  console.log(
    '\n%-30s %10s %10s %10s %10s',
    'Strategy',
    'p50 (ms)',
    'p95 (ms)',
    'p99 (ms)',
    'Mean (ms)'
  );
  console.log('-'.repeat(70));

  for (const r of results) {
    console.log(
      '%-30s %10.2f %10.2f %10.2f %10.2f',
      r.name,
      r.stats.median,
      r.stats.p95,
      r.stats.p99,
      r.stats.mean
    );
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Main benchmark runner
 */
async function main() {
  const ENTRY_COUNTS = [100, 500, 1000];
  const ITERATIONS = 50;
  const WARMUP = 5;
  const LIMIT = 20;

  const queries = [
    'authentication security',
    'database performance',
    'kubernetes deployment',
    'testing best practices',
    'caching optimization',
  ];

  console.log('FTS5 vs Local Embeddings Benchmark');
  console.log('===================================\n');
  console.log(`Iterations: ${ITERATIONS}, Warmup: ${WARMUP}, Limit: ${LIMIT}`);
  console.log(`Queries: ${queries.join(', ')}\n`);

  resetEmbeddingServiceState();

  // Use local embeddings (no API key needed)
  const embeddingService = new EmbeddingService({
    provider: 'local',
    openaiModel: 'text-embedding-3-small',
  });

  for (const entryCount of ENTRY_COUNTS) {
    console.log(`\n${'#'.repeat(80)}`);
    console.log(`ENTRY COUNT: ${entryCount}`);
    console.log(`${'#'.repeat(80)}`);

    const { sqlite } = setupDb(entryCount);

    // Pre-compute embeddings (one-time cost)
    console.log('\nPre-computing embeddings (one-time setup cost):');
    const precomputeStart = performance.now();
    const embeddings = await precomputeEmbeddings(sqlite, embeddingService);
    const precomputeTime = performance.now() - precomputeStart;
    console.log(
      `  Done in ${precomputeTime.toFixed(0)}ms (${(precomputeTime / entryCount).toFixed(1)}ms/entry)\n`
    );

    const allResults: BenchResult[] = [];

    for (const query of queries) {
      console.log(`\nQuery: "${query}"`);

      // LIKE search
      const likeResult = await runBenchmark(
        `LIKE (${query.split(' ')[0]})`,
        () => searchLike(sqlite, query.split(' ')[0]!, LIMIT),
        ITERATIONS,
        WARMUP
      );
      allResults.push(likeResult);

      // FTS5 search
      const fts5Result = await runBenchmark(
        `FTS5 (${query.split(' ')[0]})`,
        () => searchFts5(sqlite, query, LIMIT),
        ITERATIONS,
        WARMUP
      );
      allResults.push(fts5Result);

      // Embedding search (query embedding only, docs pre-computed)
      const embResult = await runBenchmark(
        `Embeddings (${query.split(' ')[0]})`,
        () => searchEmbeddings(sqlite, embeddingService, query, LIMIT, embeddings),
        ITERATIONS,
        WARMUP
      );
      allResults.push(embResult);

      // Print immediate comparison
      console.log(
        `  LIKE: ${likeResult.stats.median.toFixed(2)}ms | ` +
          `FTS5: ${fts5Result.stats.median.toFixed(2)}ms | ` +
          `Embeddings: ${embResult.stats.median.toFixed(2)}ms`
      );
    }

    // Summary for this entry count
    const likeTimes = allResults.filter((r) => r.name.startsWith('LIKE')).flatMap((r) => r.times);
    const fts5Times = allResults.filter((r) => r.name.startsWith('FTS5')).flatMap((r) => r.times);
    const embTimes = allResults
      .filter((r) => r.name.startsWith('Embeddings'))
      .flatMap((r) => r.times);

    console.log(`\n--- Summary for ${entryCount} entries ---`);
    console.log(
      `LIKE:       p50=${calculateStats(likeTimes).median.toFixed(2)}ms, p95=${calculateStats(likeTimes).p95.toFixed(2)}ms`
    );
    console.log(
      `FTS5:       p50=${calculateStats(fts5Times).median.toFixed(2)}ms, p95=${calculateStats(fts5Times).p95.toFixed(2)}ms`
    );
    console.log(
      `Embeddings: p50=${calculateStats(embTimes).median.toFixed(2)}ms, p95=${calculateStats(embTimes).p95.toFixed(2)}ms`
    );
    console.log(
      `Pre-compute overhead: ${precomputeTime.toFixed(0)}ms total, ${(precomputeTime / entryCount).toFixed(1)}ms/entry`
    );

    sqlite.close();
    cleanupDbFiles(BENCH_DB_PATH);

    // Clear embedding cache between runs
    embeddingService.clearCache();
  }

  // Cleanup
  embeddingService.cleanup();

  console.log('\n\nBENCHMARK COMPLETE');
  console.log('==================');
  console.log('\nKey insights:');
  console.log('- LIKE: Fast but only matches exact substrings');
  console.log('- FTS5: Fast with stemming (run/running/ran match)');
  console.log('- Embeddings: Semantic understanding but requires pre-computation');
  console.log('\nConsider:');
  console.log('- If embedding p50 < 100ms, FTS5 may be redundant');
  console.log('- Pre-computation cost is amortized over many queries');
  console.log('- Embedding quality is superior for semantic queries');
}

main().catch(console.error);
