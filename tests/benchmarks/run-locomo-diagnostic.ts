#!/usr/bin/env npx tsx
/**
 * LoCoMo Diagnostic Benchmark
 *
 * Combines retrieval metrics (MRR, Recall@K) with official J-score evaluation
 * to diagnose where the pipeline is failing.
 */

import 'dotenv/config';

const args = process.argv.slice(2);
const maxDialogues = parseInt(args.find((_, i, a) => a[i - 1] === '--dialogues') || '50', 10);
const topK = parseInt(args.find((_, i, a) => a[i - 1] === '--top-k') || '5', 10);

// Configure environment
process.env.AGENT_MEMORY_RERANK_ENABLED = 'true';
process.env.AGENT_MEMORY_VECTOR_DB_PATH = './data/benchmark/locomo-diagnostic-vectors.lance';

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

const { loadLoCoMoDataset } = await import('./locomo-adapter.js');
const { generateAnswer, judgeAnswer } = await import('./locomo-official-evaluator.js');

import type { LoCoMoDialogue, LoCoMoQAPair } from './locomo-types.js';

const DB_PATH = './data/benchmark/locomo-diagnostic.db';
const VECTOR_PATH = './data/benchmark/locomo-diagnostic-vectors.lance';

console.log('\n========================================');
console.log('LoCoMo DIAGNOSTIC Benchmark');
console.log('========================================');
console.log(`Dialogues: ${maxDialogues}, Top-K: ${topK}`);
console.log('========================================\n');

// Setup
ensureDataDirectory('benchmark');
cleanupDbFiles(DB_PATH);
await rm(VECTOR_PATH, { recursive: true, force: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
const db = drizzle(sqlite, { schema });
applyMigrations(sqlite);

const projectId = generateId();
db.insert(schema.projects)
  .values({
    id: projectId,
    name: 'Diagnostic',
    rootPath: '/diagnostic',
  })
  .run();

const config = appConfig;
const runtime = createRuntime(extractRuntimeConfig(config));
const repos = createRepositories({ db, sqlite });
const adapters = createAdaptersWithConfig(
  { dbType: 'sqlite', db, sqlite, fileLockRepo: repos.fileLocks },
  config
);
const logger = pino({ level: 'warn' });

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
if (ctx.services.vector) await ctx.services.vector.initialize();

// Load dataset
const sessions = await loadLoCoMoDataset();
const session = sessions[0]!;
const dialogues = session.dialogues.slice(0, maxDialogues);
const dialogueIds = new Set(dialogues.map((d) => d.dia_id));

// Filter QA pairs - exclude adversarial, keep only those with evidence in our dialogues
const qaPairs = session.qaPairs.filter(
  (qa) =>
    qa.category !== 5 && qa.evidence.length > 0 && qa.evidence.every((eId) => dialogueIds.has(eId))
);

console.log(`Dialogues: ${dialogues.length}, QA pairs: ${qaPairs.length}\n`);

// Create session
const sessionId = 'diag-session';
await repos.sessions.create({
  id: sessionId,
  projectId,
  name: 'Diagnostic Session',
  purpose: 'diagnostic',
  agentId: 'diagnostic',
});

// Ingest dialogues with 1:1 mapping
const entryIdToDiaId = new Map<string, string>();
const diaIdToEntryId = new Map<string, string>();
const entryIdToContent = new Map<string, string>();

for (const dialogue of dialogues) {
  const entryId = generateId();
  const versionId = generateId();
  const content = `${dialogue.speaker}: ${dialogue.text}`;

  db.insert(schema.knowledge)
    .values({
      id: entryId,
      scopeType: 'session',
      scopeId: sessionId,
      title: `${dialogue.speaker} (${dialogue.dia_id})`,
      category: 'fact',
      currentVersionId: versionId,
      isActive: true,
      createdBy: 'diagnostic',
    })
    .run();

  db.insert(schema.knowledgeVersions)
    .values({
      id: versionId,
      knowledgeId: entryId,
      versionNum: 1,
      content,
      source: 'locomo',
      confidence: 1.0,
      createdBy: 'diagnostic',
    })
    .run();

  entryIdToDiaId.set(entryId, dialogue.dia_id);
  diaIdToEntryId.set(dialogue.dia_id, entryId);
  entryIdToContent.set(entryId, content);

  generateEmbeddingAsync({
    entryType: 'knowledge',
    entryId,
    versionId,
    content,
    title: dialogue.dia_id,
  });
}

// Wait for embeddings
while (true) {
  const stats = getEmbeddingQueueStats();
  if (stats.pending === 0 && stats.inFlight === 0) break;
  await new Promise((r) => setTimeout(r, 100));
}

console.log('Ingestion complete. Running evaluation...\n');

// Create query function
const queryCache = new LRUCache<unknown>(100, 10 * 1024 * 1024);
const pipelineDeps = createDependencies({
  getDb: () => db as any,
  getSqlite: () => sqlite,
  getPreparedStatement: (sql: string) => sqlite.prepare(sql),
  cache: queryCache as any,
  perfLog: false,
  logger,
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

// Evaluate
interface DiagResult {
  question: string;
  category: number;
  groundTruth: string[];
  retrieved: string[];
  mrr: number;
  recallAtK: number;
  jScore: number;
  generatedAnswer: string;
  goldAnswer: string;
}

const results: DiagResult[] = [];

for (let i = 0; i < qaPairs.length; i++) {
  const qa = qaPairs[i]!;

  // Query
  const queryResult = await executeQueryPipelineAsync(
    {
      search: qa.question,
      scope: { type: 'session', id: sessionId, inherit: true },
      types: ['knowledge'],
      limit: 40,
      useFts5: true,
      semanticSearch: true,
    },
    pipelineDeps
  );

  // Map to dia_ids
  const retrievedDiaIds: string[] = [];
  for (const r of queryResult.results) {
    const diaId = entryIdToDiaId.get(r.id);
    if (diaId && !retrievedDiaIds.includes(diaId)) {
      retrievedDiaIds.push(diaId);
    }
  }

  // Calculate retrieval metrics
  const groundTruthSet = new Set(qa.evidence);
  let mrr = 0;
  for (let j = 0; j < retrievedDiaIds.length; j++) {
    if (groundTruthSet.has(retrievedDiaIds[j]!)) {
      mrr = 1 / (j + 1);
      break;
    }
  }

  const topKRetrieved = retrievedDiaIds.slice(0, topK);
  const recallAtK =
    topKRetrieved.filter((id) => groundTruthSet.has(id)).length / qa.evidence.length;

  // Get context for generation
  const context = queryResult.results
    .slice(0, topK)
    .map((r) => entryIdToContent.get(r.id) || '')
    .filter((c) => c.length > 0);

  // Generate and judge
  let jScore = 0;
  let generatedAnswer = '';
  try {
    generatedAnswer = await generateAnswer(qa.question, context);
    const judge = await judgeAnswer(qa.question, qa.answer, generatedAnswer);
    jScore = judge.score;
  } catch (e) {
    // Skip on error
  }

  results.push({
    question: qa.question,
    category: qa.category,
    groundTruth: qa.evidence,
    retrieved: topKRetrieved,
    mrr,
    recallAtK,
    jScore,
    generatedAnswer,
    goldAnswer: qa.answer,
  });

  // Progress
  if ((i + 1) % 5 === 0 || i === qaPairs.length - 1) {
    process.stdout.write(`\rProgress: ${i + 1}/${qaPairs.length}`);
  }
}

console.log('\n');

// Aggregate
const avgMRR = results.reduce((s, r) => s + r.mrr, 0) / results.length;
const avgRecall = results.reduce((s, r) => s + r.recallAtK, 0) / results.length;
const avgJ = results.reduce((s, r) => s + r.jScore, 0) / results.length;

console.log('========================================');
console.log('DIAGNOSTIC RESULTS');
console.log('========================================');
console.log(`Retrieval MRR:     ${(avgMRR * 100).toFixed(1)}%`);
console.log(`Recall@${topK}:        ${(avgRecall * 100).toFixed(1)}%`);
console.log(`J-score:           ${(avgJ * 100).toFixed(1)}%`);
console.log('========================================\n');

// Show samples where retrieval failed vs succeeded
const retrievalFailed = results.filter((r) => r.recallAtK === 0);
const retrievalSucceeded = results.filter((r) => r.recallAtK > 0);

console.log(
  `Retrieval failed (0% recall): ${retrievalFailed.length}/${results.length} (${((retrievalFailed.length / results.length) * 100).toFixed(0)}%)`
);
console.log(`Retrieval succeeded (>0% recall): ${retrievalSucceeded.length}/${results.length}`);

// J-score breakdown by retrieval success
const jWhenRetrievalFailed =
  retrievalFailed.length > 0
    ? retrievalFailed.reduce((s, r) => s + r.jScore, 0) / retrievalFailed.length
    : 0;
const jWhenRetrievalSucceeded =
  retrievalSucceeded.length > 0
    ? retrievalSucceeded.reduce((s, r) => s + r.jScore, 0) / retrievalSucceeded.length
    : 0;

console.log(`\nJ-score when retrieval failed: ${(jWhenRetrievalFailed * 100).toFixed(1)}%`);
console.log(`J-score when retrieval succeeded: ${(jWhenRetrievalSucceeded * 100).toFixed(1)}%`);

// Show some examples
console.log('\n--- SAMPLE FAILURES (retrieval failed) ---');
for (const r of retrievalFailed.slice(0, 3)) {
  console.log(`\nQ: ${r.question.substring(0, 80)}...`);
  console.log(`Ground truth: ${r.groundTruth.join(', ')}`);
  console.log(`Retrieved: ${r.retrieved.length > 0 ? r.retrieved.join(', ') : '(none matched)'}`);
  console.log(`Gold: ${String(r.goldAnswer || '').substring(0, 60)}...`);
}

console.log('\n--- SAMPLE SUCCESSES (retrieval worked but J failed) ---');
const retrievalWorkedJFailed = retrievalSucceeded.filter((r) => r.jScore === 0);
for (const r of retrievalWorkedJFailed.slice(0, 3)) {
  console.log(`\nQ: ${r.question.substring(0, 80)}...`);
  console.log(`Ground truth: ${r.groundTruth.join(', ')}`);
  console.log(`Retrieved: ${r.retrieved.join(', ')}`);
  console.log(`Recall@${topK}: ${(r.recallAtK * 100).toFixed(0)}%`);
  console.log(`Gold: ${String(r.goldAnswer || '').substring(0, 60)}...`);
  console.log(`Generated: ${String(r.generatedAnswer || '').substring(0, 60)}...`);
}

// Cleanup
await shutdownRuntime(runtime);
await adapters.closeRedis();
sqlite.close();
cleanupDbFiles(DB_PATH);
await rm(VECTOR_PATH, { recursive: true, force: true });
resetContainer();

console.log('\n✓ Diagnostic complete');
