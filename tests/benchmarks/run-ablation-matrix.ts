#!/usr/bin/env npx tsx
/**
 * Ablation Matrix Runner
 *
 * Systematically tests component combinations to isolate
 * which changes help/hurt MRR performance.
 *
 * Usage:
 *   npx tsx tests/benchmarks/run-ablation-matrix.ts [options]
 *
 * Options:
 *   --primary-only    Run only primary tests (4 configs)
 *   --secondary-only  Run only secondary tests (parameter sweeps)
 *   --sessions N      Number of sessions to run (default: 1)
 *   --dialogues N     Limit dialogues per session (for quick testing)
 *   --debug           Show detailed output
 *   --no-cleanup      Keep test databases for inspection
 *   --help, -h        Show this help
 */

// Load .env file FIRST before any other imports
import 'dotenv/config';

// =============================================================================
// CLI Argument Parsing
// =============================================================================

const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const debugMode = args.includes('--debug');
const noCleanup = args.includes('--no-cleanup');
const primaryOnly = args.includes('--primary-only');
const secondaryOnly = args.includes('--secondary-only');
const verifyOptimal = args.includes('--verify');

// Parse --base-config (for secondary-only mode)
let baseConfigName: string | null = null;
const baseConfigIdx = args.findIndex((a) => a === '--base-config');
if (baseConfigIdx >= 0 && args[baseConfigIdx + 1]) {
  baseConfigName = args[baseConfigIdx + 1];
}

// Parse --sessions N
let maxSessions = 1;
const sessionsIdx = args.findIndex((a) => a === '--sessions');
if (sessionsIdx >= 0 && args[sessionsIdx + 1]) {
  maxSessions = parseInt(args[sessionsIdx + 1], 10) || 1;
}

// Parse --dialogues N
let maxDialogues = Infinity;
const dialoguesIdx = args.findIndex((a) => a === '--dialogues');
if (dialoguesIdx >= 0 && args[dialoguesIdx + 1]) {
  maxDialogues = parseInt(args[dialoguesIdx + 1], 10) || Infinity;
}

if (showHelp) {
  console.log(`
Ablation Matrix Runner

Systematically tests component combinations to isolate
which changes help/hurt MRR performance.

Usage: npx tsx tests/benchmarks/run-ablation-matrix.ts [options]

Options:
  --primary-only    Run only primary tests (4 configs: baseline, prefixes, extraction, both)
  --secondary-only  Run only secondary tests (parameter sweeps on best primary config)
  --base-config X   Specify base config for secondary tests (baseline, extraction, raw+prefixes, extraction+prefixes)
  --sessions N      Number of sessions to run (default: 1)
  --dialogues N     Limit dialogues per session (for quick testing)
  --debug           Show detailed output
  --no-cleanup      Keep test databases for inspection
  --help, -h        Show this help

Examples:
  npx tsx tests/benchmarks/run-ablation-matrix.ts                                      # Run all tests
  npx tsx tests/benchmarks/run-ablation-matrix.ts --primary-only                       # Only primary tests
  npx tsx tests/benchmarks/run-ablation-matrix.ts --secondary-only --base-config extraction  # Secondary on extraction
  npx tsx tests/benchmarks/run-ablation-matrix.ts --sessions 3                         # 3 sessions per config
  npx tsx tests/benchmarks/run-ablation-matrix.ts --dialogues 50                       # Quick test
`);
  process.exit(0);
}

// =============================================================================
// Dynamic Imports (after env vars are set)
// =============================================================================

const Database = (await import('better-sqlite3')).default;
const { drizzle } = await import('drizzle-orm/better-sqlite3');
const schema = await import('../../src/db/schema.js');
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
const { extract: observeExtract } =
  await import('../../src/mcp/handlers/observe/extract.handler.js');
const { getEmbeddingQueueStats, generateEmbeddingAsync } =
  await import('../../src/db/repositories/embedding-hooks.js');
const { LRUCache } = await import('../../src/utils/lru-cache.js');
const pino = (await import('pino')).default;
const { rm } = await import('node:fs/promises');

// Ablation utilities
import type { AblationConfig, AblationResult } from './ablation-utils.js';
const {
  PRIMARY_TESTS,
  OPTIMAL_CONFIG,
  getSecondaryTests,
  ensureAblationDir,
  getIsolatedPaths,
  cleanupIsolatedDb,
  setEnvForConfig,
  calculateMetrics,
  formatResultsTable,
  generateDiagnosis,
  exportResults,
} = await import('./ablation-utils.js');

// LoCoMo imports
const { loadLoCoMoDataset, getDatasetStats } = await import('./locomo-adapter.js');
const { evaluateSession, compileBenchmarkResults } = await import('./locomo-evaluator.js');
import type { LoCoMoDialogue, LoCoMoSession } from './locomo-types.js';
import type { AppContext } from '../../src/core/context.js';

// =============================================================================
// Test Context Setup
// =============================================================================

async function setupTestContext(
  dbPath: string,
  vectorPath: string
): Promise<{
  ctx: AppContext;
  projectId: string;
  sqlite: InstanceType<typeof Database>;
  db: ReturnType<typeof drizzle>;
  cleanup: () => Promise<void>;
}> {
  ensureDataDirectory('ablation');
  cleanupDbFiles(dbPath);
  await rm(vectorPath, { recursive: true, force: true }).catch(() => {});

  // Set vector path for this test
  process.env.AGENT_MEMORY_VECTOR_DB_PATH = vectorPath;

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });

  applyMigrations(sqlite);

  // Create project
  const projectId = generateId();
  db.insert(schema.projects)
    .values({
      id: projectId,
      name: 'Ablation Test',
      description: 'Ablation matrix test project',
      rootPath: '/ablation/test',
    })
    .run();

  // Use config (already loaded with env vars applied)
  const config = appConfig;
  const runtimeConfig = extractRuntimeConfig(config);
  const runtime = createRuntime(runtimeConfig);
  const repos = createRepositories({ db, sqlite });
  const adapters = createAdaptersWithConfig(
    { dbType: 'sqlite', db, sqlite, fileLockRepo: repos.fileLocks },
    config
  );
  const logger = pino({ level: debugMode ? 'debug' : 'warn' });

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

  registerContext(ctx);

  if (ctx.services.vector) {
    await ctx.services.vector.initialize();
  }

  const cleanup = async () => {
    await shutdownRuntime(runtime);
    await adapters.closeRedis();
    sqlite.close();
    if (!noCleanup) {
      cleanupDbFiles(dbPath);
      await rm(vectorPath, { recursive: true, force: true }).catch(() => {});
    }
    resetContainer();
  };

  return { ctx, projectId, sqlite, db, cleanup };
}

// =============================================================================
// Ingestion Functions
// =============================================================================

async function ingestWithExtraction(
  ctx: AppContext,
  dialogues: LoCoMoDialogue[],
  scopeId: string
): Promise<Map<string, string[]>> {
  const entryIdToDiaIds = new Map<string, string[]>();

  for (const dialogue of dialogues) {
    const context = `${dialogue.speaker}: ${dialogue.text}`;

    try {
      const res = await observeExtract(ctx, {
        context,
        contextType: 'conversation',
        scopeType: 'session',
        scopeId,
        autoStore: true,
        focusAreas: ['facts', 'decisions', 'events', 'preferences', 'relationships'],
        agentId: 'ablation-bench',
      });

      const storedEntries = res.stored?.entries ?? [];
      const storedEntities = res.stored?.entities ?? [];

      for (const stored of [...storedEntries, ...storedEntities]) {
        entryIdToDiaIds.set(stored.id, [dialogue.dia_id]);
      }
    } catch {
      // Ignore extraction errors
    }
  }

  // Wait for embeddings
  await waitForEmbeddings();

  return entryIdToDiaIds;
}

async function ingestRawDialogues(
  ctx: AppContext,
  dialogues: LoCoMoDialogue[],
  scopeId: string,
  db: ReturnType<typeof drizzle>
): Promise<Map<string, string[]>> {
  const entryIdToDiaIds = new Map<string, string[]>();

  for (const dialogue of dialogues) {
    const entryId = generateId();
    const versionId = generateId();

    db.insert(schema.knowledge)
      .values({
        id: entryId,
        scopeType: 'session',
        scopeId,
        title: `${dialogue.speaker}: ${dialogue.dia_id}`,
        category: 'fact',
        currentVersionId: versionId,
        isActive: true,
        createdBy: 'ablation-bench',
      })
      .run();

    db.insert(schema.knowledgeVersions)
      .values({
        id: versionId,
        knowledgeId: entryId,
        versionNum: 1,
        content: dialogue.text,
        source: 'locomo-dialogue',
        confidence: 1.0,
        createdBy: 'ablation-bench',
      })
      .run();

    entryIdToDiaIds.set(entryId, [dialogue.dia_id]);

    generateEmbeddingAsync({
      entryType: 'knowledge',
      entryId,
      versionId,
      text: dialogue.text,
    });
  }

  await waitForEmbeddings();

  return entryIdToDiaIds;
}

async function waitForEmbeddings(): Promise<void> {
  const timeoutMs = 10 * 60 * 1000;
  const waitStart = Date.now();

  while (Date.now() - waitStart < timeoutMs) {
    const stats = getEmbeddingQueueStats();
    if (stats.pending === 0 && stats.inFlight === 0) break;
    await new Promise((r) => setTimeout(r, 250));
  }
}

// =============================================================================
// Query Function Factory
// =============================================================================

function createQueryFunction(
  ctx: AppContext,
  sessionId: string,
  sqlite: InstanceType<typeof Database>,
  db: ReturnType<typeof drizzle>
) {
  const logger = pino({ level: 'warn' });
  const queryCache = new LRUCache<unknown>(100, 10 * 1024 * 1024);

  const pipelineDeps = createDependencies({
    getDb: () => db as unknown as ReturnType<typeof drizzle>,
    getSqlite: () => sqlite,
    getPreparedStatement: (sql: string) => sqlite.prepare(sql),
    cache: queryCache as typeof queryCache,
    perfLog: false,
    logger,
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

  return async (question: string) => {
    const result = await executeQueryPipelineAsync(
      {
        search: question,
        scope: { type: 'session' as const, id: sessionId, inherit: true },
        types: ['knowledge'],
        limit: 40,
        useFts5: true,
        semanticSearch: true,
        enableHyDE: false, // Controlled by env vars
        enableExpansion: false,
      },
      pipelineDeps
    );

    return result.results.map((r) => ({
      id: r.id,
      type: r.type,
      score: r.score,
      knowledge:
        r.type === 'knowledge'
          ? { source: (r.knowledge as { source?: string })?.source }
          : undefined,
    }));
  };
}

// =============================================================================
// Single Configuration Runner
// =============================================================================

async function runSingleConfiguration(
  config: AblationConfig,
  sessions: LoCoMoSession[]
): Promise<AblationResult> {
  const startTime = Date.now();

  // Setup environment for this config
  const restoreEnv = setEnvForConfig(config);

  // Create isolated database
  const paths = getIsolatedPaths(config.name);

  console.log(`\n  Setting up: ${config.name}`);
  if (debugMode) {
    console.log(`    Storage: ${config.storage}, Prefixes: ${config.prefixes}`);
    console.log(`    DB: ${paths.dbPath}`);
  }

  let totalMemories = 0;
  const allResults: Awaited<ReturnType<typeof evaluateSession>> = [];

  try {
    await ensureAblationDir();

    for (const session of sessions) {
      const { ctx, projectId, sqlite, db, cleanup } = await setupTestContext(
        paths.dbPath,
        paths.vectorPath
      );

      try {
        // Create session
        await ctx.repos.sessions.create({
          id: session.sessionId,
          projectId,
          name: `Ablation ${config.name} - ${session.sessionId}`,
          purpose: 'Ablation matrix test',
          agentId: 'ablation-bench',
          metadata: { source: 'ablation-matrix' },
        });

        // Ingest based on config
        const entryIdToDiaIds =
          config.storage === 'extraction'
            ? await ingestWithExtraction(ctx, session.dialogues, session.sessionId)
            : await ingestRawDialogues(ctx, session.dialogues, session.sessionId, db);

        totalMemories += entryIdToDiaIds.size;

        // Create query function
        const queryFn = createQueryFunction(ctx, session.sessionId, sqlite, db);

        // Create ingest function (already done, just return mapping)
        const ingestFn = async () => {
          const flatMap = new Map<string, string>();
          for (const [entryId, diaIds] of entryIdToDiaIds) {
            flatMap.set(entryId, diaIds.join(','));
          }
          return flatMap;
        };

        // Evaluate
        const results = await evaluateSession(session, ingestFn, queryFn);
        allResults.push(...results);
      } finally {
        await cleanup();
      }
    }

    // Compile metrics
    const benchmarkResults = compileBenchmarkResults(allResults, {
      useEmbeddings: true,
      sessionsRun: sessions.length,
    });

    const metrics = calculateMetrics(benchmarkResults);

    return {
      config,
      mrr: metrics.mrr,
      recall: metrics.recall,
      perCategory: metrics.perCategory,
      memoryCount: totalMemories,
      durationMs: Date.now() - startTime,
      totalQueries: metrics.totalQueries,
      hitRate: metrics.hitRate,
    };
  } finally {
    // Restore environment
    restoreEnv();

    // Cleanup if enabled
    if (!noCleanup) {
      await cleanupIsolatedDb(paths);
    }
  }
}

// =============================================================================
// Main Runner
// =============================================================================

async function runAblationMatrix() {
  console.log('\n========================================');
  console.log('ABLATION MATRIX RUNNER');
  console.log('========================================');
  console.log(`Sessions per config: ${maxSessions}`);
  if (maxDialogues < Infinity) {
    console.log(`Dialogues limit: ${maxDialogues} per session`);
  }
  console.log(`Mode: ${primaryOnly ? 'Primary only' : secondaryOnly ? 'Secondary only' : 'All'}`);
  console.log('========================================\n');

  // Load dataset
  console.log('Loading LoCoMo dataset...');
  const allSessions = await loadLoCoMoDataset();
  const stats = getDatasetStats(allSessions);
  console.log(
    `Loaded: ${stats.totalSessions} sessions, ${stats.totalDialogues} dialogues, ${stats.totalQAPairs} QA pairs`
  );

  // Limit sessions
  let sessions = allSessions.slice(0, maxSessions);

  // Limit dialogues if requested
  if (maxDialogues < Infinity) {
    sessions = sessions.map((session) => {
      const limitedDialogues = session.dialogues.slice(0, maxDialogues);
      const dialogueIds = new Set(limitedDialogues.map((d) => d.dia_id));

      const filteredQaPairs = session.qaPairs.filter(
        (qa) => qa.evidence.length > 0 && qa.evidence.every((eId) => dialogueIds.has(eId))
      );

      return {
        ...session,
        dialogues: limitedDialogues,
        qaPairs: filteredQaPairs,
      };
    });

    const totalFilteredQa = sessions.reduce((sum, s) => sum + s.qaPairs.length, 0);
    console.log(`Filtering to ${maxDialogues} dialogues/session → ${totalFilteredQa} QA pairs\n`);
  }

  const results: AblationResult[] = [];

  // Run verification test with optimal config only
  if (verifyOptimal) {
    console.log('\n=== VERIFICATION TEST ===');
    console.log('Testing optimal configuration discovered from ablation testing');
    console.log('Config: extraction, no prefixes, topk=100, no HyDE\n');

    console.log(`Running: ${OPTIMAL_CONFIG.name}...`);
    const result = await runSingleConfiguration(OPTIMAL_CONFIG, sessions);
    results.push(result);

    console.log(
      `\n  MRR: ${(result.mrr * 100).toFixed(1)}% | ` +
        `Memories: ${result.memoryCount} | ` +
        `Duration: ${(result.durationMs / 1000).toFixed(1)}s`
    );

    console.log('\n=== VERIFICATION COMPLETE ===');
    console.log(`Optimal config achieved: ${(result.mrr * 100).toFixed(1)}% MRR`);

    // Export and exit
    const exportPath = await exportResults(results);
    console.log(`\nResults exported to: ${exportPath}`);
    return;
  }

  // Run primary tests
  if (!secondaryOnly) {
    console.log('\n=== PRIMARY TESTS ===');
    console.log('Testing: storage mode × prefix mode\n');

    for (const config of PRIMARY_TESTS) {
      console.log(`Running: ${config.name}...`);
      const result = await runSingleConfiguration(config, sessions);
      results.push(result);

      console.log(
        `  MRR: ${(result.mrr * 100).toFixed(1)}% | ` +
          `Memories: ${result.memoryCount} | ` +
          `Duration: ${(result.durationMs / 1000).toFixed(1)}s`
      );
    }
  }

  // Run secondary tests (if best primary is identified or base config specified)
  if (!primaryOnly) {
    let baseConfig: AblationConfig | undefined;
    let baseMRR = 0;

    // If --base-config is specified, use that directly
    if (baseConfigName) {
      const configMap: Record<string, AblationConfig> = {
        baseline: { name: 'baseline', storage: 'raw', prefixes: false },
        'raw+prefixes': { name: 'raw+prefixes', storage: 'raw', prefixes: true },
        extraction: { name: 'extraction', storage: 'extraction', prefixes: false },
        'extraction+prefixes': {
          name: 'extraction+prefixes',
          storage: 'extraction',
          prefixes: true,
        },
      };
      baseConfig = configMap[baseConfigName];
      if (!baseConfig) {
        console.error(`Unknown base config: ${baseConfigName}`);
        console.error('Valid options: baseline, raw+prefixes, extraction, extraction+prefixes');
        process.exit(1);
      }
    } else if (results.length > 0) {
      // Find best primary config from results
      const sortedPrimary = [...results].sort((a, b) => b.mrr - a.mrr);
      const bestPrimary = sortedPrimary[0];
      if (bestPrimary) {
        baseConfig = bestPrimary.config;
        baseMRR = bestPrimary.mrr;
      }
    }

    if (baseConfig) {
      console.log('\n=== SECONDARY TESTS ===');
      console.log(
        `Base config: ${baseConfig.name}${baseMRR ? ` (MRR=${(baseMRR * 100).toFixed(1)}%)` : ''}`
      );
      console.log('Testing: parameter variations\n');

      const secondaryTests = getSecondaryTests(baseConfig);

      // Track base MRR for secondary-only mode (run base config first)
      if (secondaryOnly && !baseMRR) {
        console.log(`Running: ${baseConfig.name} (base)...`);
        const baseResult = await runSingleConfiguration(baseConfig, sessions);
        results.push(baseResult);
        baseMRR = baseResult.mrr;
        console.log(
          `  MRR: ${(baseResult.mrr * 100).toFixed(1)}% | ` +
            `Memories: ${baseResult.memoryCount} | ` +
            `Duration: ${(baseResult.durationMs / 1000).toFixed(1)}s`
        );
      }

      for (const config of secondaryTests) {
        console.log(`Running: ${config.name}...`);
        const result = await runSingleConfiguration(config, sessions);
        results.push(result);

        const delta = result.mrr - baseMRR;
        const deltaStr = `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`;

        console.log(
          `  MRR: ${(result.mrr * 100).toFixed(1)}% (${deltaStr}) | ` +
            `Duration: ${(result.durationMs / 1000).toFixed(1)}s`
        );
      }
    }
  }

  // Print results
  console.log(formatResultsTable(results));
  console.log(generateDiagnosis(results).join('\n'));

  // Export results
  const exportPath = await exportResults(results);
  console.log(`\nResults exported to: ${exportPath}`);
}

// =============================================================================
// Main
// =============================================================================

runAblationMatrix()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
