#!/usr/bin/env npx tsx
/**
 * Query Quality Benchmark Runner (Production Pipeline)
 *
 * Runs the query quality benchmark using the FULL PRODUCTION pipeline.
 * This uses wireContext() to get all production services including:
 * - QueryRewriteService (HyDE + expansion)
 * - Full embedding/vector services
 * - FTS5 full-text search
 *
 * Usage:
 *   npx tsx tests/benchmarks/run-query-quality.ts [options]
 *
 * Options:
 *   --category CAT    Only run tests in this category
 *   --difficulty D    Only run tests with this difficulty (easy|medium|hard)
 *   --limit N         Limit to first N test cases
 *   --k N             Default K for metrics (default: 10)
 *   --save FILE       Save results to JSON file
 *   --compare FILE    Compare against baseline results file
 *   --embeddings      Enable embeddings (requires OPENAI_API_KEY)
 *   --debug           Show detailed output for each test case
 *   --help, -h        Show this help
 */

// Load .env file FIRST before any other imports
import 'dotenv/config';

// Parse command line args BEFORE imports to set env vars
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const debugMode = args.includes('--debug');
const enableEmbeddings = args.includes('--embeddings') || args.includes('-e');

const getArgValue = (flag: string): string | undefined => {
  const idx = args.findIndex((a) => a === flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : undefined;
};

const category = getArgValue('--category');
const difficulty = getArgValue('--difficulty') as 'easy' | 'medium' | 'hard' | undefined;
const limit = getArgValue('--limit') ? parseInt(getArgValue('--limit')!, 10) : undefined;
const defaultK = getArgValue('--k') ? parseInt(getArgValue('--k')!, 10) : 10;
const saveFile = getArgValue('--save');
const compareFile = getArgValue('--compare');

if (showHelp) {
  console.log(`
Query Quality Benchmark Runner (Production Pipeline)

Uses the FULL PRODUCTION pipeline with all services:
- QueryRewriteService (HyDE + expansion)
- Full embedding/vector services
- FTS5 full-text search

Usage: npx tsx tests/benchmarks/run-query-quality.ts [options]

Options:
  --category CAT    Only run tests in this category
                    Categories: keyword-exact, keyword-partial, keyword-multi,
                    fts5-ranking, semantic-similarity, scope-filtering,
                    scope-inheritance, type-filtering, tag-filtering,
                    priority-filtering, temporal-filtering, relation-traversal,
                    combined-filters, noise-rejection, edge-cases
  --difficulty D    Only run tests with this difficulty (easy|medium|hard)
  --limit N         Limit to first N test cases
  --k N             Default K for metrics (default: 10)
  --save FILE       Save results to JSON file
  --compare FILE    Compare against baseline results file
  --embeddings      Enable embeddings (requires OPENAI_API_KEY)
  --debug           Show detailed output for each test case
  --help, -h        Show this help

Examples:
  npx tsx tests/benchmarks/run-query-quality.ts
  npx tsx tests/benchmarks/run-query-quality.ts --category keyword-exact
  npx tsx tests/benchmarks/run-query-quality.ts --difficulty hard --debug
  npx tsx tests/benchmarks/run-query-quality.ts --embeddings --save baseline.json
`);
  process.exit(0);
}

// Configure embeddings
if (enableEmbeddings) {
  process.env.AGENT_MEMORY_RERANK_ENABLED = 'true';
  process.env.AGENT_MEMORY_RERANK_TOP_K = '20';
}

const QUERY_BENCH_DB_PATH = './data/benchmark/query-quality.db';
const QUERY_BENCH_VECTOR_PATH = './data/benchmark/query-quality-vectors.lance';

// Set vector path to isolate benchmark runs
process.env.AGENT_MEMORY_VECTOR_DB_PATH = QUERY_BENCH_VECTOR_PATH;

// Use dynamic imports so env vars take effect before config is built
const Database = (await import('better-sqlite3')).default;
const { drizzle } = await import('drizzle-orm/better-sqlite3');
const schema = await import('../../src/db/schema/index.js');
const { generateId } = await import('../../src/db/repositories/base.js');
const { applyMigrations } = await import('../fixtures/migration-loader.js');
const { cleanupDbFiles, ensureDataDirectory } = await import('../fixtures/db-utils.js');
const { config: appConfig } = await import('../../src/config/index.js');
const { createRuntime, extractRuntimeConfig, shutdownRuntime } =
  await import('../../src/core/runtime.js');
const { createRepositories } = await import('../../src/core/factory/repositories.js');
const { createAdaptersWithConfig } = await import('../../src/core/adapters/index.js');
const { wireContext } = await import('../../src/core/factory/context-wiring.js');
const { registerContext, resetContainer } = await import('../../src/core/container.js');
const { executeQueryPipelineAsync, createDependencies } =
  await import('../../src/services/query/index.js');
const { LRUCache } = await import('../../src/utils/lru-cache.js');
const pino = (await import('pino')).default;
const { rm } = await import('node:fs/promises');
const { writeFile, readFile } = await import('node:fs/promises');
const { existsSync } = await import('node:fs');

// Benchmark imports
const { QUERY_SEED_DATA, QUERY_TEST_CASES, getQueryDatasetStats } =
  await import('./query-quality-dataset.js');
const { runQueryBenchmark, printQueryBenchmarkResults, compareQueryBenchmarks, createIdMapper } =
  await import('./query-quality-evaluator.js');

import type { QueryTestCase, QueryBenchmarkResults } from './query-quality-types.js';
import type { AppContext } from '../../src/core/context.js';

// =============================================================================
// SETUP FUNCTIONS
// =============================================================================

async function setupProductionContext(): Promise<{
  ctx: AppContext;
  projectId: string;
  orgId: string;
  sqlite: InstanceType<typeof Database>;
  db: ReturnType<typeof drizzle>;
  cleanup: () => Promise<void>;
}> {
  ensureDataDirectory('benchmark');
  cleanupDbFiles(QUERY_BENCH_DB_PATH);
  await rm(QUERY_BENCH_VECTOR_PATH, { recursive: true, force: true }).catch(() => {});

  const sqlite = new Database(QUERY_BENCH_DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });

  applyMigrations(sqlite);

  // Create org
  const orgId = QUERY_SEED_DATA.org?.id || generateId();
  if (QUERY_SEED_DATA.org) {
    db.insert(schema.organizations)
      .values({
        id: orgId,
        name: QUERY_SEED_DATA.org.name,
      })
      .run();
  }

  // Create project
  const projectId = QUERY_SEED_DATA.project?.id || generateId();
  if (QUERY_SEED_DATA.project) {
    db.insert(schema.projects)
      .values({
        id: projectId,
        name: QUERY_SEED_DATA.project.name,
        description: 'Query Quality Benchmark Project',
        rootPath: QUERY_SEED_DATA.project.rootPath || '/query/benchmark',
        orgId: QUERY_SEED_DATA.org ? orgId : undefined,
      })
      .run();
  }

  // Use config (already loaded with env vars applied)
  const config = appConfig;

  if (debugMode) {
    console.log('Production config:', {
      embeddingProvider: config.embedding.provider,
      rerankEnabled: config.rerank.enabled,
      queryRewriteEnabled: config.queryRewrite.enabled,
    });
  }

  // Create runtime
  const runtimeConfig = extractRuntimeConfig(config);
  const runtime = createRuntime(runtimeConfig);

  // Create repositories
  const repos = createRepositories({ db, sqlite });

  // Create adapters
  const adapters = createAdaptersWithConfig(
    { dbType: 'sqlite', db, sqlite, fileLockRepo: repos.fileLocks },
    config
  );

  // Create logger
  const logger = pino({ level: debugMode ? 'debug' : 'warn' });

  // Wire the full production context
  const ctx = await wireContext({
    config,
    runtime,
    db,
    sqlite,
    repos,
    adapters,
    logger,
    dbType: 'sqlite',
  });

  // Register context for utilities that use DI container
  registerContext(ctx);

  // Initialize vector service for semantic search
  if (ctx.services.vector && enableEmbeddings) {
    await ctx.services.vector.initialize();
  }

  const cleanup = async () => {
    await shutdownRuntime(runtime);
    await adapters.closeRedis();
    sqlite.close();
    cleanupDbFiles(QUERY_BENCH_DB_PATH);
    await rm(QUERY_BENCH_VECTOR_PATH, { recursive: true, force: true }).catch(() => {});
    resetContainer();
  };

  return { ctx, projectId, orgId, sqlite, db, cleanup };
}

// =============================================================================
// SEEDING FUNCTIONS
// =============================================================================

async function seedTestData(
  ctx: AppContext,
  projectId: string,
  orgId: string
): Promise<Map<string, string>> {
  const seedToDbIdMap = new Map<string, string>();
  let tagsSeeded = 0;

  console.log('Seeding test data...');

  // Seed entries using repository methods
  for (const entry of QUERY_SEED_DATA.entries) {
    const scopeType = entry.scopeType;
    let scopeId: string | undefined;
    if (scopeType === 'project') {
      scopeId = projectId;
    } else if (scopeType === 'org') {
      scopeId = orgId;
    }

    try {
      let dbId: string;

      if (entry.type === 'guideline') {
        const created = await ctx.repos.guidelines.create({
          scopeType,
          scopeId,
          name: entry.name,
          content: entry.content,
          category: entry.category || 'general',
          priority: entry.priority || 50,
          isActive: entry.isActive !== false,
          createdBy: 'query-bench',
        });
        dbId = created.id;
      } else if (entry.type === 'knowledge') {
        const created = await ctx.repos.knowledge.create({
          scopeType,
          scopeId,
          title: entry.title,
          content: entry.content,
          category: entry.category || 'fact',
          confidence: entry.confidence || 0.8,
          validFrom: entry.validFrom,
          validUntil: entry.validUntil,
          isActive: entry.isActive !== false,
          createdBy: 'query-bench',
        });
        dbId = created.id;
      } else if (entry.type === 'tool') {
        const created = await ctx.repos.tools.create({
          scopeType,
          scopeId,
          name: entry.name,
          description: entry.description,
          category: entry.category || 'cli',
          isActive: entry.isActive !== false,
          createdBy: 'query-bench',
        });
        dbId = created.id;
      } else {
        continue;
      }

      // Map seed ID to actual DB ID
      seedToDbIdMap.set(entry.id, dbId);

      // Attach tags
      if (entry.tags && entry.tags.length > 0) {
        for (const tagName of entry.tags) {
          try {
            await ctx.repos.entryTags.attach({
              entryType: entry.type,
              entryId: dbId,
              tagName: tagName,
            });
            tagsSeeded++;
          } catch (tagErr) {
            // Log tag seeding failures for debugging
            if (debugMode) {
              console.error(
                `  Failed to attach tag '${tagName}' to ${entry.id}: ${tagErr instanceof Error ? tagErr.message : String(tagErr)}`
              );
            }
          }
        }
      }
    } catch (error) {
      if (debugMode) {
        console.error(
          `  Failed to seed ${entry.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  // Seed relations
  let relationsSeeded = 0;
  if (QUERY_SEED_DATA.relations) {
    for (const rel of QUERY_SEED_DATA.relations) {
      const sourceDbId = seedToDbIdMap.get(rel.sourceId);
      const targetDbId = seedToDbIdMap.get(rel.targetId);
      const sourceEntry = QUERY_SEED_DATA.entries.find((e) => e.id === rel.sourceId);
      const targetEntry = QUERY_SEED_DATA.entries.find((e) => e.id === rel.targetId);

      if (sourceDbId && targetDbId && sourceEntry && targetEntry) {
        try {
          await ctx.repos.entryRelations.create({
            sourceType: sourceEntry.type,
            sourceId: sourceDbId,
            targetType: targetEntry.type,
            targetId: targetDbId,
            relationType: rel.relationType,
            createdBy: 'query-bench',
          });
          relationsSeeded++;
        } catch (err) {
          // Log relation seeding failures for debugging
          if (debugMode) {
            console.error(
              `  Failed to seed relation ${rel.sourceId} -> ${rel.targetId}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      } else {
        if (debugMode) {
          console.error(
            `  Skipping relation ${rel.sourceId} -> ${rel.targetId}: missing IDs (source=${!!sourceDbId}, target=${!!targetDbId})`
          );
        }
      }
    }
  }
  if (debugMode) {
    console.log(`  Seeded ${relationsSeeded} relations`);
  }

  console.log(
    `  Seeded ${seedToDbIdMap.size} entries, ${tagsSeeded} tags, ${relationsSeeded} relations`
  );
  return seedToDbIdMap;
}

// =============================================================================
// QUERY FUNCTION
// =============================================================================

function createProductionQueryFunction(
  ctx: AppContext,
  projectId: string,
  orgId: string,
  sqlite: InstanceType<typeof Database>,
  db: ReturnType<typeof drizzle>,
  seedToDbIdMap: Map<string, string>
) {
  const logger = pino({ level: debugMode ? 'debug' : 'warn' });
  const queryCache = new LRUCache<unknown>(100, 10 * 1024 * 1024);

  // Create pipeline dependencies with our LOCAL database
  const pipelineDeps = createDependencies({
    getDb: () => db as unknown as ReturnType<typeof drizzle>,
    getSqlite: () => sqlite,
    getPreparedStatement: (sql: string) => sqlite.prepare(sql),
    cache: queryCache as typeof queryCache,
    perfLog: debugMode,
    logger,
    // Include production services from context
    queryRewriteService: ctx.services.queryRewrite
      ? {
          rewrite: (input) => ctx.services.queryRewrite!.rewrite(input),
          isAvailable: () => ctx.services.queryRewrite!.isAvailable(),
        }
      : undefined,
    embeddingService: ctx.services.embedding
      ? {
          embed: (text) => ctx.services.embedding!.embed(text),
          embedBatch: (texts) => ctx.services.embedding!.embedBatch(texts),
          isAvailable: () => ctx.services.embedding!.isAvailable(),
        }
      : undefined,
    vectorService: ctx.services.vector
      ? {
          searchSimilar: (embedding, entryTypes, limit) =>
            ctx.services.vector!.searchSimilar(embedding, entryTypes, limit),
          isAvailable: () => ctx.services.vector!.isAvailable(),
        }
      : undefined,
  });

  return async (params: QueryTestCase['query']) => {
    const startTime = Date.now();

    // Map scope IDs to actual IDs
    let scopeId = params.scopeId;
    if (params.scopeType === 'project') {
      scopeId = projectId;
    } else if (params.scopeType === 'org') {
      scopeId = orgId;
    }

    // Handle relatedTo - map seed ID to DB ID
    let relatedTo = params.relatedTo;
    if (relatedTo && relatedTo.id) {
      const mappedId = seedToDbIdMap.get(relatedTo.id);
      if (mappedId) {
        relatedTo = { ...relatedTo, id: mappedId };
      } else if (debugMode) {
        console.error(`  Warning: relatedTo.id '${relatedTo.id}' not found in seed map`);
      }
    }

    // Types are already in plural form (guidelines, knowledge, tools) as expected by pipeline
    const types = params.types;

    try {
      const pipelineParams = {
        action: params.action,
        search: params.search,
        scope: scopeId
          ? { type: params.scopeType, id: scopeId, inherit: params.inherit }
          : undefined,
        types,
        tags: params.tags,
        priority: params.priority,
        atTime: params.atTime,
        limit: params.limit || defaultK,
        useFts5: params.useFts5 !== false,
        fuzzy: params.fuzzy,
        regex: params.regex,
        fields: params.fields,
        semanticSearch: enableEmbeddings && params.semanticSearch,
        relatedTo: relatedTo || undefined,
        includeInactive: params.includeInactive,
        createdAfter: params.createdAfter,
        createdBefore: params.createdBefore,
        validDuring: params.validDuring,
      };

      const result = await executeQueryPipelineAsync(pipelineParams, pipelineDeps);

      return {
        results: result.results.map((r) => ({
          id: r.id,
          type: r.type,
          name: r.guideline?.name || r.tool?.name,
          title: r.knowledge?.title,
        })),
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      if (debugMode) {
        console.error(`  Query error: ${error instanceof Error ? error.message : String(error)}`);
      }
      return {
        results: [],
        processingTimeMs: Date.now() - startTime,
      };
    }
  };
}

// =============================================================================
// MAIN BENCHMARK
// =============================================================================

async function runBenchmark() {
  console.log('\n========================================');
  console.log('Query Quality Benchmark (Production Pipeline)');
  console.log('========================================');

  // Get dataset stats
  const stats = getQueryDatasetStats();
  console.log(`Dataset: ${stats.seedEntries} seed entries, ${stats.testCases} test cases`);
  console.log(
    `By difficulty: easy=${stats.byDifficulty.easy}, medium=${stats.byDifficulty.medium}, hard=${stats.byDifficulty.hard}`
  );
  console.log(`Embeddings: ${enableEmbeddings ? 'Enabled' : 'Disabled'}`);

  // Filter test cases
  let testCases = [...QUERY_TEST_CASES];

  if (category) {
    testCases = testCases.filter((tc) => tc.category === category);
    console.log(`Filtering to category: ${category} (${testCases.length} cases)`);
  }

  if (difficulty) {
    testCases = testCases.filter((tc) => tc.difficulty === difficulty);
    console.log(`Filtering to difficulty: ${difficulty} (${testCases.length} cases)`);
  }

  if (limit && limit < testCases.length) {
    testCases = testCases.slice(0, limit);
    console.log(`Limiting to first ${limit} cases`);
  }

  if (testCases.length === 0) {
    console.error('No test cases match the filters');
    process.exit(1);
  }

  console.log(`\nRunning ${testCases.length} test cases...`);
  console.log('========================================\n');

  // Setup production context
  console.log('Setting up production context...');
  const { ctx, projectId, orgId, sqlite, db, cleanup } = await setupProductionContext();

  try {
    // Seed test data
    const seedToDbIdMap = await seedTestData(ctx, projectId, orgId);

    // Create query function and ID mapper
    const queryFn = createProductionQueryFunction(ctx, projectId, orgId, sqlite, db, seedToDbIdMap);
    const idMapper = createIdMapper(seedToDbIdMap);

    // Prepare seed data stats
    const seedDataStats = {
      totalEntries: QUERY_SEED_DATA.entries.length,
      byType: {
        guidelines: QUERY_SEED_DATA.entries.filter((e) => e.type === 'guideline').length,
        knowledge: QUERY_SEED_DATA.entries.filter((e) => e.type === 'knowledge').length,
        tools: QUERY_SEED_DATA.entries.filter((e) => e.type === 'tool').length,
      },
      scopes: [
        'global',
        ...(QUERY_SEED_DATA.org ? [`org:${orgId}`] : []),
        ...(QUERY_SEED_DATA.project ? [`project:${projectId}`] : []),
      ],
    };

    // Run benchmark with progress
    let lastPercent = 0;
    const results = await runQueryBenchmark(
      testCases,
      queryFn,
      idMapper,
      {
        semanticEnabled: enableEmbeddings,
        fts5Enabled: true,
        defaultK,
      },
      seedDataStats,
      (completed, total, current) => {
        const percent = Math.floor((completed / total) * 100);
        if (percent > lastPercent || completed === total) {
          process.stdout.write(
            `\rProgress: ${percent}% (${completed}/${total}) - ${current.substring(0, 40).padEnd(40)}`
          );
          lastPercent = percent;
        }
      }
    );

    console.log('\n');

    // Print detailed results in debug mode
    if (debugMode) {
      console.log('\nDETAILED RESULTS:');
      console.log('=================\n');

      for (const tc of results.testCaseResults) {
        console.log(`[${tc.testCaseId}] ${tc.testCaseName}`);
        console.log(`  Category: ${tc.category}, Difficulty: ${tc.difficulty}`);
        console.log(`  Returned: ${tc.returnedCount}, Relevant: ${tc.relevantCount}`);
        console.log(
          `  P@K: ${(tc.precisionAtK * 100).toFixed(1)}%, R@K: ${(tc.recallAtK * 100).toFixed(1)}%, MRR: ${(tc.mrr * 100).toFixed(1)}%, nDCG: ${(tc.ndcg * 100).toFixed(1)}%`
        );

        if (tc.error) {
          console.log(`  ERROR: ${tc.error}`);
        }
        if (tc.skipped) {
          console.log(`  SKIPPED: ${tc.skipReason}`);
        }
        if (tc.missedIds.length > 0) {
          console.log(`  Missed: ${tc.missedIds.join(', ')}`);
        }
        if (tc.unexpectedIds.length > 0) {
          console.log(`  Unexpected: ${tc.unexpectedIds.join(', ')}`);
        }

        console.log('');
      }
    }

    // Print summary results
    printQueryBenchmarkResults(results);

    // Save results if requested
    if (saveFile) {
      await writeFile(saveFile, JSON.stringify(results, null, 2));
      console.log(`Results saved to: ${saveFile}`);
    }

    // Compare to baseline if requested
    if (compareFile && existsSync(compareFile)) {
      const baselineData = await readFile(compareFile, 'utf-8');
      const baseline = JSON.parse(baselineData) as QueryBenchmarkResults;
      compareQueryBenchmarks(results, baseline);
    }

    // Exit with error if nDCG < 50%
    if (results.overall.avgNdcg < 0.5) {
      console.log('Warning: nDCG score below 50%');
      process.exitCode = 1;
    }
  } finally {
    await cleanup();
  }
}

// =============================================================================
// MAIN
// =============================================================================

runBenchmark().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
