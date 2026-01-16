#!/usr/bin/env npx tsx
/**
 * LoCoMo OFFICIAL Benchmark Runner
 *
 * Implements the official LoCoMo evaluation methodology as used by Mem0:
 * 1. Ingest dialogues into memory
 * 2. For each question: retrieve context → generate answer → judge answer
 * 3. Report F1, BLEU-1, and J (LLM-as-Judge) scores
 *
 * This is directly comparable to Mem0's 66.9% J-score.
 *
 * Usage:
 *   npx tsx tests/benchmarks/run-locomo-official.ts [options]
 *
 * Options:
 *   --sessions N        Number of sessions to run (default: 1)
 *   --dialogues N       Limit dialogues per session
 *   --top-k N           Number of retrieved contexts for generation (default: 5)
 *   --model MODEL       Model for answer generation (default: from env or extraction model)
 *   --judge-model MODEL Model for LLM-as-Judge (default: from env or generation model)
 *   --raw               Use raw dialogue ingestion (no LLM extraction)
 *   --debug             Show detailed results
 *   --help              Show this help
 */

import 'dotenv/config';

const args = process.argv.slice(2);
const debugMode = args.includes('--debug');
const showHelp = args.includes('--help') || args.includes('-h');

// Parse arguments
const parseArg = (flag: string, defaultVal: string): string => {
  const idx = args.findIndex((a) => a === flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1]! : defaultVal;
};

const maxSessions = parseInt(parseArg('--sessions', '1'), 10);
const maxDialogues = parseInt(parseArg('--dialogues', 'Infinity'), 10) || Infinity;
const topK = parseInt(parseArg('--top-k', '5'), 10);
// LLM provider and model configuration
const llmProvider = process.env.AGENT_MEMORY_LOCOMO_PROVIDER || 'openai';
const defaultGenerationModel =
  process.env.AGENT_MEMORY_EXTRACTION_OPENAI_MODEL ||
  (llmProvider === 'anthropic' ? 'claude-3-5-haiku-20241022' : 'qwen2.5-7b-instruct');
const defaultJudgeModel = process.env.AGENT_MEMORY_LOCOMO_JUDGE_MODEL || defaultGenerationModel;
const generationModel = parseArg(
  '--model',
  process.env.AGENT_MEMORY_LOCOMO_GENERATION_MODEL || defaultGenerationModel
);
const judgeModel = parseArg(
  '--judge-model',
  process.env.AGENT_MEMORY_LOCOMO_JUDGE_MODEL || defaultJudgeModel
);
const rawIngestionMode = args.includes('--raw');

if (showHelp) {
  console.log(`
LoCoMo OFFICIAL Benchmark Runner

Implements the official Mem0 evaluation methodology:
- Retrieve context for each question
- Generate answer with LLM
- Evaluate with LLM-as-Judge

Usage: npx tsx tests/benchmarks/run-locomo-official.ts [options]

Options:
  --sessions N        Number of sessions to run (default: 1)
  --dialogues N       Limit dialogues per session
  --top-k N           Retrieved contexts for generation (default: 5)
  --model MODEL       Answer generation model
  --judge-model MODEL LLM-as-Judge model
  --raw               Use raw dialogue ingestion (skip LLM extraction)
  --debug             Show detailed per-question results
  --help              Show this help

Environment Variables:
  AGENT_MEMORY_LOCOMO_PROVIDER          LLM provider: 'anthropic' or 'openai' (default: openai)
  AGENT_MEMORY_LOCOMO_GENERATION_MODEL  Model for answer generation (default: EXTRACTION_OPENAI_MODEL)
  AGENT_MEMORY_LOCOMO_JUDGE_MODEL       Model for LLM-as-Judge (default: same as generation)
  AGENT_MEMORY_EXTRACTION_OPENAI_MODEL  Fallback model if LOCOMO models not set
  AGENT_MEMORY_EXTRACTION_OPENAI_BASE_URL  OpenAI-compatible API endpoint
  ANTHROPIC_API_KEY                     Required if using Anthropic provider

Examples:
  # Use Claude (recommended for accurate results):
  AGENT_MEMORY_LOCOMO_PROVIDER=anthropic npx tsx tests/benchmarks/run-locomo-official.ts --sessions 2

  # Use local LLM:
  npx tsx tests/benchmarks/run-locomo-official.ts --sessions 1 --top-k 10
`);
  process.exit(0);
}

// Configure environment before imports
const LOCOMO_VECTOR_PATH = './data/benchmark/locomo-official-vectors.lance';
process.env.AGENT_MEMORY_RERANK_ENABLED = process.env.AGENT_MEMORY_RERANK_ENABLED ?? 'true';
process.env.AGENT_MEMORY_RERANK_TOP_K = process.env.AGENT_MEMORY_RERANK_TOP_K ?? '20';
process.env.AGENT_MEMORY_RERANK_ALPHA = process.env.AGENT_MEMORY_RERANK_ALPHA ?? '0.7';
process.env.AGENT_MEMORY_VECTOR_DB_PATH = LOCOMO_VECTOR_PATH;

// Dynamic imports
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
const { getEmbeddingQueueStats, generateEmbeddingAsync } =
  await import('../../src/db/repositories/embedding-hooks.js');
const { LRUCache } = await import('../../src/utils/lru-cache.js');
const pino = (await import('pino')).default;
const { rm } = await import('node:fs/promises');

const { loadLoCoMoDataset, getDatasetStats } = await import('./locomo-adapter.js');
const { evaluateSessionOfficial, compileOfficialResults, printOfficialResults } =
  await import('./locomo-official-evaluator.js');

import type { LoCoMoDialogue } from './locomo-types.js';
import type { AppContext } from '../../src/core/context.js';

const LOCOMO_DB_PATH = './data/benchmark/locomo-official.db';

// ============================================================================
// Setup
// ============================================================================

async function setupContext(): Promise<{
  ctx: AppContext;
  projectId: string;
  sqlite: InstanceType<typeof Database>;
  db: ReturnType<typeof drizzle>;
  cleanup: () => Promise<void>;
}> {
  ensureDataDirectory('benchmark');
  cleanupDbFiles(LOCOMO_DB_PATH);
  await rm(LOCOMO_VECTOR_PATH, { recursive: true, force: true });

  const sqlite = new Database(LOCOMO_DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });

  applyMigrations(sqlite);

  const projectId = generateId();
  db.insert(schema.projects)
    .values({
      id: projectId,
      name: 'LoCoMo Official Benchmark',
      description: 'Official LoCoMo evaluation with LLM-as-Judge',
      rootPath: '/locomo/official',
    })
    .run();

  const config = appConfig;
  const runtimeConfig = extractRuntimeConfig(config);
  const runtime = createRuntime(runtimeConfig);
  const repos = createRepositories({ db, sqlite });
  const adapters = createAdaptersWithConfig(
    { dbType: 'sqlite', db, sqlite, fileLockRepo: repos.fileLocks },
    config
  );
  const logger = pino({ level: debugMode ? 'debug' : 'info' });

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
    cleanupDbFiles(LOCOMO_DB_PATH);
    await rm(LOCOMO_VECTOR_PATH, { recursive: true, force: true });
    resetContainer();
  };

  return { ctx, projectId, sqlite, db, cleanup };
}

// ============================================================================
// Ingestion (raw dialogues for official benchmark)
// ============================================================================

async function ingestRawDialogues(
  dialogues: LoCoMoDialogue[],
  scopeType: 'project' | 'session',
  scopeId: string,
  db: ReturnType<typeof drizzle>
): Promise<Map<string, string>> {
  const entryIdToContent = new Map<string, string>();

  for (const dialogue of dialogues) {
    const entryId = generateId();
    const versionId = generateId();
    const content = `${dialogue.speaker}: ${dialogue.text}`;

    db.insert(schema.knowledge)
      .values({
        id: entryId,
        scopeType,
        scopeId,
        title: `${dialogue.speaker} (${dialogue.dia_id})`,
        category: 'fact',
        currentVersionId: versionId,
        isActive: true,
        createdBy: 'locomo-official',
      })
      .run();

    db.insert(schema.knowledgeVersions)
      .values({
        id: versionId,
        knowledgeId: entryId,
        versionNum: 1,
        content,
        source: 'locomo-dialogue',
        confidence: 1.0,
        createdBy: 'locomo-official',
      })
      .run();

    entryIdToContent.set(entryId, content);

    generateEmbeddingAsync({
      entryType: 'knowledge',
      entryId,
      versionId,
      text: content,
    });
  }

  // Wait for embeddings
  const waitStart = Date.now();
  const timeoutMs = 10 * 60 * 1000;
  while (Date.now() - waitStart < timeoutMs) {
    const stats = getEmbeddingQueueStats();
    if (stats.pending === 0 && stats.inFlight === 0) break;
    if (debugMode) {
      process.stdout.write(`  Embeddings: pending=${stats.pending} inFlight=${stats.inFlight}\r`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (debugMode) process.stdout.write('\n');

  console.log(`  Ingested ${dialogues.length} dialogues`);
  return entryIdToContent;
}

// ============================================================================
// Query Function with Content Return
// ============================================================================

function createQueryFunction(
  ctx: AppContext,
  sessionId: string,
  sqlite: InstanceType<typeof Database>,
  db: ReturnType<typeof drizzle>,
  entryIdToContent: Map<string, string>
) {
  const logger = pino({ level: debugMode ? 'debug' : 'warn' });
  const queryCache = new LRUCache<unknown>(100, 10 * 1024 * 1024);

  const pipelineDeps = createDependencies({
    getDb: () => db as unknown as ReturnType<typeof drizzle>,
    getSqlite: () => sqlite,
    getPreparedStatement: (sql: string) => sqlite.prepare(sql),
    cache: queryCache as typeof queryCache,
    perfLog: debugMode,
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
        enableHyDE: false,
        enableExpansion: false,
      },
      pipelineDeps
    );

    // Return results with content
    return result.results.map((r) => ({
      id: r.id,
      content: entryIdToContent.get(r.id) || '',
    }));
  };
}

// ============================================================================
// Main Benchmark
// ============================================================================

async function runOfficialBenchmark() {
  console.log('\n========================================');
  console.log('LoCoMo OFFICIAL Benchmark');
  console.log('(Mem0 Methodology: Retrieve → Generate → Judge)');
  console.log('========================================');
  console.log(`Sessions: ${maxSessions}`);
  if (maxDialogues < Infinity) console.log(`Dialogues limit: ${maxDialogues}`);
  console.log(`Top-K retrieval: ${topK}`);
  console.log(`LLM provider: ${llmProvider}`);
  console.log(`Generation model: ${generationModel}`);
  console.log(`Judge model: ${judgeModel}`);
  console.log(`Ingestion: ${rawIngestionMode ? 'raw dialogues' : 'LLM extraction'}`);
  console.log('========================================\n');

  // Load dataset
  console.log('Loading LoCoMo dataset...');
  const sessions = await loadLoCoMoDataset();
  const stats = getDatasetStats(sessions);
  console.log(
    `Loaded: ${stats.totalSessions} sessions, ${stats.totalDialogues} dialogues, ${stats.totalQAPairs} QA pairs\n`
  );

  // Limit sessions
  let sessionsToRun = sessions.slice(0, maxSessions);

  // Limit dialogues if requested
  if (maxDialogues < Infinity) {
    sessionsToRun = sessionsToRun.map((session) => {
      const limitedDialogues = session.dialogues.slice(0, maxDialogues);
      const dialogueIds = new Set(limitedDialogues.map((d) => d.dia_id));

      // Filter QA pairs - exclude adversarial (category 5) and keep only those with evidence in ingested dialogues
      const filteredQaPairs = session.qaPairs.filter(
        (qa) =>
          qa.category !== 5 && // Skip adversarial
          qa.evidence.length > 0 &&
          qa.evidence.every((eId) => dialogueIds.has(eId))
      );

      return {
        ...session,
        dialogues: limitedDialogues,
        qaPairs: filteredQaPairs,
      };
    });

    const totalFilteredQa = sessionsToRun.reduce((sum, s) => sum + s.qaPairs.length, 0);
    console.log(
      `Filtered to ${totalFilteredQa} QA pairs (excluding adversarial, evidence in ingested dialogues)\n`
    );
  }

  // Run each session
  const allResults: Awaited<ReturnType<typeof evaluateSessionOfficial>> = [];

  for (const session of sessionsToRun) {
    // Filter out adversarial questions for this session too
    const nonAdversarialQaPairs = session.qaPairs.filter((qa) => qa.category !== 5);
    console.log(
      `\nSession ${session.sessionId}: ${session.dialogues.length} dialogues, ${nonAdversarialQaPairs.length} QA pairs (excl. adversarial)`
    );

    const { ctx, sqlite, db, cleanup } = await setupContext();

    try {
      // Create session
      await ctx.repos.sessions.create({
        id: session.sessionId,
        projectId: ctx.repos.projects
          ? (await db.select().from(schema.projects).limit(1))[0]?.id || 'default'
          : 'default',
        name: `LoCoMo Session ${session.sessionId}`,
        purpose: 'Official LoCoMo benchmark',
        agentId: 'locomo-official',
        metadata: { source: 'locomo-official' },
      });

      // Ingest dialogues
      const entryIdToContent = await ingestRawDialogues(
        session.dialogues,
        'session',
        session.sessionId,
        db
      );

      // Create query function
      const queryFn = createQueryFunction(ctx, session.sessionId, sqlite, db, entryIdToContent);

      // Evaluate session
      let lastProgress = 0;
      const results = await evaluateSessionOfficial(
        { ...session, qaPairs: nonAdversarialQaPairs },
        queryFn,
        { topK, generationModel, judgeModel },
        (done, total) => {
          const pct = Math.floor((done / total) * 100);
          if (pct >= lastProgress + 10) {
            process.stdout.write(`  Progress: ${pct}%\r`);
            lastProgress = pct;
          }
        }
      );

      // Debug: show sample results
      if (debugMode && results.length > 0) {
        const sample = results.slice(0, 2);
        for (const r of sample) {
          const q = String(r.question || '').substring(0, 60);
          const gold = String(r.goldAnswer || '').substring(0, 60);
          const gen = String(r.generatedAnswer || '').substring(0, 60);
          const reason = String(r.judgeReasoning || '').substring(0, 80);
          console.log(`\n  Q: "${q}..."`);
          console.log(`  Gold: "${gold}..."`);
          console.log(`  Generated: "${gen}..."`);
          console.log(`  Judge: ${r.judgeScore === 1 ? '✅ CORRECT' : '❌ INCORRECT'}`);
          console.log(`  Reasoning: ${reason}...`);
        }
      }

      allResults.push(...results);

      // Session summary
      const sessionJ = results.reduce((sum, r) => sum + r.judgeScore, 0) / results.length;
      console.log(`  J-score: ${(sessionJ * 100).toFixed(1)}%`);
    } finally {
      await cleanup();
    }
  }

  // Compile and print results
  const benchmarkResults = compileOfficialResults(allResults, {
    model: generationModel,
    judgeModel,
    sessionsRun: sessionsToRun.length,
    topK,
  });

  printOfficialResults(benchmarkResults);
}

// ============================================================================
// Run
// ============================================================================

runOfficialBenchmark()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
