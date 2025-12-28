/**
 * LoCoMo Benchmark Evaluator
 *
 * Evaluates Agent Memory retrieval quality against the official LoCoMo dataset.
 * Calculates Recall@k, MRR, and per-category breakdown comparable to Mem0's paper.
 */

import type {
  LoCoMoSession,
  LoCoMoQAPair,
  QAEvaluationResult,
  AggregatedMetrics,
  LoCoMoBenchmarkResults,
} from './locomo-types.js';
import { LOCOMO_CATEGORIES } from './locomo-types.js';
import type { KnowledgeEntry } from './locomo-adapter.js';
import { sessionToKnowledgeEntries } from './locomo-adapter.js';

/**
 * Minimal query result interface
 */
interface QueryResult {
  id: string;
  type: string;
  score: number;
  knowledge?: { source?: string | null };
}

/**
 * Query function signature
 */
type QueryFn = (question: string) => Promise<QueryResult[]>;

/**
 * Ingest function signature
 */
type IngestFn = (entries: KnowledgeEntry[]) => Promise<Map<string, string>>;

/**
 * Calculate Recall@k
 *
 * What fraction of ground truth evidence was retrieved in top-k results?
 */
function calculateRecallAtK(
  retrievedDiaIds: string[],
  groundTruthDiaIds: string[],
  k: number
): number {
  if (groundTruthDiaIds.length === 0) return 0;

  const topK = retrievedDiaIds.slice(0, k);
  const groundTruthSet = new Set(groundTruthDiaIds);
  const found = topK.filter(id => groundTruthSet.has(id)).length;

  return found / groundTruthDiaIds.length;
}

/**
 * Calculate Mean Reciprocal Rank
 *
 * 1 / position of first relevant result (0 if none found)
 */
function calculateMRR(retrievedDiaIds: string[], groundTruthDiaIds: string[]): number {
  const groundTruthSet = new Set(groundTruthDiaIds);

  for (let i = 0; i < retrievedDiaIds.length; i++) {
    if (groundTruthSet.has(retrievedDiaIds[i]!)) {
      return 1 / (i + 1);
    }
  }

  return 0;
}

/**
 * Find the rank of first relevant result
 */
function findFirstRelevantRank(
  retrievedDiaIds: string[],
  groundTruthDiaIds: string[]
): number {
  const groundTruthSet = new Set(groundTruthDiaIds);

  for (let i = 0; i < retrievedDiaIds.length; i++) {
    if (groundTruthSet.has(retrievedDiaIds[i]!)) {
      return i + 1;
    }
  }

  return 0;
}

/**
 * Evaluate a single QA pair
 */
async function evaluateQAPair(
  qa: LoCoMoQAPair,
  sessionId: string,
  queryFn: QueryFn,
  entryIdToDiaId: Map<string, string>
): Promise<QAEvaluationResult> {
  // Query with the question
  const results = await queryFn(qa.question);

  // Map retrieved entry IDs back to dialogue IDs
  // In extraction mode, one entry may map to multiple dialogue IDs (comma-separated)
  const retrievedDiaIds: string[] = [];
  const seenDiaIds = new Set<string>();

  for (const result of results) {
    const diaIdStr = entryIdToDiaId.get(result.id);
    if (diaIdStr) {
      // Split in case of comma-separated IDs (extraction mode)
      for (const diaId of diaIdStr.split(',')) {
        if (!seenDiaIds.has(diaId)) {
          seenDiaIds.add(diaId);
          retrievedDiaIds.push(diaId);
        }
      }
    }
  }

  // Calculate metrics against ground truth evidence
  const groundTruth = qa.evidence;

  return {
    sessionId,
    question: qa.question,
    answer: qa.answer,
    category: qa.category,
    categoryName: LOCOMO_CATEGORIES[qa.category] || `unknown-${qa.category}`,
    groundTruthEvidence: groundTruth,
    retrievedEvidence: retrievedDiaIds.slice(0, 20),
    recallAt5: calculateRecallAtK(retrievedDiaIds, groundTruth, 5),
    recallAt10: calculateRecallAtK(retrievedDiaIds, groundTruth, 10),
    recallAt20: calculateRecallAtK(retrievedDiaIds, groundTruth, 20),
    mrr: calculateMRR(retrievedDiaIds, groundTruth),
    firstRelevantRank: findFirstRelevantRank(retrievedDiaIds, groundTruth),
  };
}

/**
 * Aggregate metrics from individual results
 */
function aggregateMetrics(results: QAEvaluationResult[]): AggregatedMetrics {
  if (results.length === 0) {
    return {
      totalQueries: 0,
      avgRecallAt5: 0,
      avgRecallAt10: 0,
      avgRecallAt20: 0,
      avgMRR: 0,
      hitRateAt5: 0,
      hitRateAt10: 0,
      hitRateAt20: 0,
    };
  }

  const n = results.length;

  return {
    totalQueries: n,
    avgRecallAt5: results.reduce((sum, r) => sum + r.recallAt5, 0) / n,
    avgRecallAt10: results.reduce((sum, r) => sum + r.recallAt10, 0) / n,
    avgRecallAt20: results.reduce((sum, r) => sum + r.recallAt20, 0) / n,
    avgMRR: results.reduce((sum, r) => sum + r.mrr, 0) / n,
    hitRateAt5: results.filter(r => r.firstRelevantRank > 0 && r.firstRelevantRank <= 5).length / n,
    hitRateAt10: results.filter(r => r.firstRelevantRank > 0 && r.firstRelevantRank <= 10).length / n,
    hitRateAt20: results.filter(r => r.firstRelevantRank > 0 && r.firstRelevantRank <= 20).length / n,
  };
}

/**
 * Evaluate a single session
 */
export async function evaluateSession(
  session: LoCoMoSession,
  ingestFn: IngestFn,
  queryFn: QueryFn,
  onProgress?: (completed: number, total: number) => void
): Promise<QAEvaluationResult[]> {
  // Convert dialogues to knowledge entries
  const entries = sessionToKnowledgeEntries(session);

  // Ingest entries and get ID mapping
  const entryIdToDiaId = await ingestFn(entries);

  // Evaluate each QA pair
  const results: QAEvaluationResult[] = [];
  const total = session.qaPairs.length;

  for (let i = 0; i < session.qaPairs.length; i++) {
    const qa = session.qaPairs[i]!;
    const result = await evaluateQAPair(qa, session.sessionId, queryFn, entryIdToDiaId);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return results;
}

/**
 * Compile full benchmark results from all evaluation results
 */
export function compileBenchmarkResults(
  allResults: QAEvaluationResult[],
  config: { useEmbeddings: boolean; sessionsRun: number }
): LoCoMoBenchmarkResults {
  // Group by category
  const byCategory: Record<string, QAEvaluationResult[]> = {};
  for (const result of allResults) {
    const cat = result.categoryName;
    if (!byCategory[cat]) {
      byCategory[cat] = [];
    }
    byCategory[cat].push(result);
  }

  // Group by session
  const bySession: Record<string, QAEvaluationResult[]> = {};
  for (const result of allResults) {
    const sess = result.sessionId;
    if (!bySession[sess]) {
      bySession[sess] = [];
    }
    bySession[sess].push(result);
  }

  // Aggregate
  const categoryMetrics: Record<string, AggregatedMetrics> = {};
  for (const [cat, results] of Object.entries(byCategory)) {
    categoryMetrics[cat] = aggregateMetrics(results);
  }

  const sessionMetrics: Record<string, AggregatedMetrics> = {};
  for (const [sess, results] of Object.entries(bySession)) {
    sessionMetrics[sess] = aggregateMetrics(results);
  }

  return {
    timestamp: new Date().toISOString(),
    config: {
      useEmbeddings: config.useEmbeddings,
      sessionsRun: config.sessionsRun,
      totalQAPairs: allResults.length,
    },
    overall: aggregateMetrics(allResults),
    byCategory: categoryMetrics,
    bySession: sessionMetrics,
  };
}

/**
 * Print benchmark results in a formatted table
 */
export function printBenchmarkResults(results: LoCoMoBenchmarkResults): void {
  console.log('\n========================================');
  console.log('LoCoMo Benchmark Results');
  console.log('========================================');
  console.log(`Sessions: ${results.config.sessionsRun}`);
  console.log(`QA Pairs: ${results.config.totalQAPairs}`);
  console.log(`Embeddings: ${results.config.useEmbeddings ? 'Yes' : 'No'}`);
  console.log('========================================\n');

  // Overall metrics
  const o = results.overall;
  console.log('OVERALL METRICS:');
  console.log(`  Recall@5:  ${(o.avgRecallAt5 * 100).toFixed(1)}%`);
  console.log(`  Recall@10: ${(o.avgRecallAt10 * 100).toFixed(1)}%`);
  console.log(`  Recall@20: ${(o.avgRecallAt20 * 100).toFixed(1)}%`);
  console.log(`  MRR:       ${(o.avgMRR * 100).toFixed(1)}%`);
  console.log(`  Hit@5:     ${(o.hitRateAt5 * 100).toFixed(1)}%`);
  console.log(`  Hit@10:    ${(o.hitRateAt10 * 100).toFixed(1)}%`);

  // Per-category breakdown
  console.log('\nBY CATEGORY:');
  console.log('Category      | Count | R@5    | R@10   | R@20   | MRR    | Hit@10');
  console.log('--------------|-------|--------|--------|--------|--------|-------');

  const categoryOrder = ['single-hop', 'multi-hop', 'temporal', 'commonsense', 'adversarial'];
  for (const cat of categoryOrder) {
    const m = results.byCategory[cat];
    if (m) {
      console.log(
        `${cat.padEnd(13)} | ${m.totalQueries.toString().padStart(5)} | ` +
        `${(m.avgRecallAt5 * 100).toFixed(1).padStart(5)}% | ` +
        `${(m.avgRecallAt10 * 100).toFixed(1).padStart(5)}% | ` +
        `${(m.avgRecallAt20 * 100).toFixed(1).padStart(5)}% | ` +
        `${(m.avgMRR * 100).toFixed(1).padStart(5)}% | ` +
        `${(m.hitRateAt10 * 100).toFixed(1).padStart(5)}%`
      );
    }
  }

  // Comparison to Mem0
  console.log('\n----------------------------------------');
  console.log('COMPARISON (Mem0 reports ~66.9% on LoCoMo):');
  console.log(`  Your MRR: ${(o.avgMRR * 100).toFixed(1)}%`);
  const gap = 66.9 - o.avgMRR * 100;
  if (gap <= 0) {
    console.log('  Status: ✅ MATCHES OR EXCEEDS Mem0');
  } else if (gap < 10) {
    console.log(`  Status: ⚠️  ${gap.toFixed(1)}% below target`);
  } else {
    console.log(`  Status: ❌ ${gap.toFixed(1)}% below target - needs improvement`);
  }
  console.log('----------------------------------------\n');
}
