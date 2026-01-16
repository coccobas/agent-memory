/**
 * Ablation Testing Utilities
 *
 * Shared utilities for the ablation matrix runner:
 * - Type definitions for configurations and results
 * - Database isolation functions
 * - Metrics calculation and aggregation
 * - Results formatting and export
 */

import { rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Configuration for a single ablation test
 */
export interface AblationConfig {
  /** Unique name for this configuration */
  name: string;
  /** Storage mode: raw dialogues or LLM extraction */
  storage: 'raw' | 'extraction';
  /** Whether to use instruction prefixes for asymmetric embedding */
  prefixes: boolean;
  /** Optional: override rerank alpha (0.0-1.0) */
  rerankAlpha?: number;
  /** Optional: override hybrid search alpha (0.0=FTS only, 1.0=semantic only) */
  hybridAlpha?: number;
  /** Optional: enable/disable HyDE */
  hydeEnabled?: boolean;
  /** Optional: override rerank top-K */
  rerankTopK?: number;
  /** Optional: extraction model override */
  extractionModel?: string;
}

/**
 * Recall metrics at various K values
 */
export interface RecallMetrics {
  k1: number;
  k5: number;
  k10: number;
  k20: number;
}

/**
 * Per-category breakdown of MRR scores
 */
export interface CategoryBreakdown {
  singleHop: number;
  multiHop: number;
  commonsense: number;
  temporal?: number;
  adversarial?: number;
}

/**
 * Results from a single ablation test
 */
export interface AblationResult {
  /** Configuration that was tested */
  config: AblationConfig;
  /** Mean Reciprocal Rank (primary metric) */
  mrr: number;
  /** Recall at various K values */
  recall: RecallMetrics;
  /** MRR broken down by question category */
  perCategory: CategoryBreakdown;
  /** Number of memories stored */
  memoryCount: number;
  /** Test duration in milliseconds */
  durationMs: number;
  /** Total QA pairs evaluated */
  totalQueries: number;
  /** Hit rate at K=10 */
  hitRate: number;
}

/**
 * Comparison between two ablation results
 */
export interface AblationComparison {
  config: AblationConfig;
  mrr: number;
  mrrDelta: number;
  mrrDeltaPct: string;
  recall: RecallMetrics;
  memoryCount: number;
}

// =============================================================================
// Database Isolation
// =============================================================================

const ABLATION_DATA_DIR = './data/ablation';

/**
 * Ensure the ablation data directory exists
 */
export async function ensureAblationDir(): Promise<void> {
  if (!existsSync(ABLATION_DATA_DIR)) {
    await mkdir(ABLATION_DATA_DIR, { recursive: true });
  }
}

/**
 * Generate isolated database paths for a test configuration
 */
export function getIsolatedPaths(testName: string): {
  dbPath: string;
  vectorPath: string;
} {
  const timestamp = Date.now();
  const safeName = testName.replace(/[^a-z0-9-]/gi, '-');
  return {
    dbPath: `${ABLATION_DATA_DIR}/${safeName}-${timestamp}.db`,
    vectorPath: `${ABLATION_DATA_DIR}/${safeName}-${timestamp}.lance`,
  };
}

/**
 * Clean up isolated database files
 */
export async function cleanupIsolatedDb(paths: {
  dbPath: string;
  vectorPath: string;
}): Promise<void> {
  try {
    // Remove SQLite files
    const dbFiles = [paths.dbPath, `${paths.dbPath}-shm`, `${paths.dbPath}-wal`];
    for (const file of dbFiles) {
      if (existsSync(file)) {
        await rm(file, { force: true });
      }
    }
    // Remove LanceDB directory
    if (existsSync(paths.vectorPath)) {
      await rm(paths.vectorPath, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

// =============================================================================
// Environment Variable Configuration
// =============================================================================

/**
 * Set environment variables for a test configuration
 * Returns a cleanup function to restore original values
 */
export function setEnvForConfig(config: AblationConfig): () => void {
  const originalEnv: Record<string, string | undefined> = {};

  // Helper to set and track env var
  const setEnv = (key: string, value: string) => {
    originalEnv[key] = process.env[key];
    process.env[key] = value;
  };

  // Toggle instruction prefixes
  setEnv('AGENT_MEMORY_EMBEDDING_DISABLE_INSTRUCTIONS', config.prefixes ? 'false' : 'true');

  // Set rerank alpha if specified
  if (config.rerankAlpha !== undefined) {
    setEnv('AGENT_MEMORY_RERANK_ALPHA', String(config.rerankAlpha));
  }

  // Set hybrid alpha if specified
  if (config.hybridAlpha !== undefined) {
    setEnv('AGENT_MEMORY_SEARCH_HYBRID_ALPHA', String(config.hybridAlpha));
  }

  // Set HyDE if specified
  if (config.hydeEnabled !== undefined) {
    setEnv('AGENT_MEMORY_HYDE_ENABLED', String(config.hydeEnabled));
    setEnv('AGENT_MEMORY_QUERY_REWRITE_ENABLED', String(config.hydeEnabled));
  }

  // Set rerank top-K if specified
  if (config.rerankTopK !== undefined) {
    setEnv('AGENT_MEMORY_RERANK_TOP_K', String(config.rerankTopK));
  }

  // Set extraction model if specified
  if (config.extractionModel !== undefined) {
    setEnv('AGENT_MEMORY_EXTRACTION_OPENAI_MODEL', config.extractionModel);
  }

  // Return cleanup function
  return () => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

// =============================================================================
// Metrics Calculation
// =============================================================================

/**
 * Calculate metrics from benchmark results
 */
export function calculateMetrics(results: {
  overall: {
    avgRecallAt5: number;
    avgRecallAt10: number;
    avgRecallAt20: number;
    avgMRR: number;
    hitRateAt10: number;
    totalQueries: number;
  };
  byCategory: Record<
    string,
    {
      avgMRR: number;
      totalQueries: number;
    }
  >;
}): {
  mrr: number;
  recall: RecallMetrics;
  perCategory: CategoryBreakdown;
  hitRate: number;
  totalQueries: number;
} {
  // Calculate Recall@1 from MRR (approximation: MRR = Recall@1 when most answers are at rank 1)
  // More accurate: Recall@1 ≈ hitRate@1, but we don't have that, so use MRR as proxy
  const recallK1 = results.overall.avgMRR; // MRR is heavily weighted by first result

  return {
    mrr: results.overall.avgMRR,
    recall: {
      k1: recallK1,
      k5: results.overall.avgRecallAt5,
      k10: results.overall.avgRecallAt10,
      k20: results.overall.avgRecallAt20,
    },
    perCategory: {
      singleHop: results.byCategory['single-hop']?.avgMRR ?? 0,
      multiHop: results.byCategory['multi-hop']?.avgMRR ?? 0,
      commonsense: results.byCategory['commonsense']?.avgMRR ?? 0,
      temporal: results.byCategory['temporal']?.avgMRR,
      adversarial: results.byCategory['adversarial']?.avgMRR,
    },
    hitRate: results.overall.hitRateAt10,
    totalQueries: results.overall.totalQueries,
  };
}

// =============================================================================
// Results Formatting
// =============================================================================

/**
 * Format results as an ASCII comparison table
 */
export function formatResultsTable(results: AblationResult[], baselineIndex = 0): string {
  if (results.length === 0) return 'No results to display';

  const baseline = results[baselineIndex];
  if (!baseline) return 'Invalid baseline index';

  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push('ABLATION MATRIX RESULTS');
  lines.push('========================');
  lines.push('');

  // Main metrics table
  lines.push('| Configuration          | MRR    | Δ Baseline | R@1   | R@5   | R@10  | Hit@10 |');
  lines.push('|------------------------|--------|------------|-------|-------|-------|--------|');

  for (const result of results) {
    const delta = result.mrr - baseline.mrr;
    const deltaStr =
      result === baseline ? '-' : `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`;

    lines.push(
      `| ${result.config.name.padEnd(22)} | ` +
        `${(result.mrr * 100).toFixed(1).padStart(5)}% | ` +
        `${deltaStr.padStart(10)} | ` +
        `${(result.recall.k1 * 100).toFixed(1).padStart(4)}% | ` +
        `${(result.recall.k5 * 100).toFixed(1).padStart(4)}% | ` +
        `${(result.recall.k10 * 100).toFixed(1).padStart(4)}% | ` +
        `${(result.hitRate * 100).toFixed(1).padStart(5)}% |`
    );
  }

  // Per-category breakdown
  lines.push('');
  lines.push('PER-CATEGORY BREAKDOWN (MRR)');
  lines.push('| Configuration          | Single-Hop | Multi-Hop | Commonsense |');
  lines.push('|------------------------|------------|-----------|-------------|');

  for (const result of results) {
    lines.push(
      `| ${result.config.name.padEnd(22)} | ` +
        `${(result.perCategory.singleHop * 100).toFixed(1).padStart(9)}% | ` +
        `${(result.perCategory.multiHop * 100).toFixed(1).padStart(8)}% | ` +
        `${(result.perCategory.commonsense * 100).toFixed(1).padStart(10)}% |`
    );
  }

  return lines.join('\n');
}

/**
 * Generate diagnosis based on results pattern
 */
export function generateDiagnosis(results: AblationResult[]): string[] {
  if (results.length < 2) return ['Insufficient data for diagnosis'];

  const lines: string[] = [];
  lines.push('');
  lines.push('DIAGNOSIS:');

  // Find baseline (raw, no prefixes)
  const baseline = results.find((r) => r.config.storage === 'raw' && !r.config.prefixes);
  if (!baseline) {
    lines.push('⚠️  No baseline (raw, no prefixes) found');
    return lines;
  }

  // Find raw+prefixes
  const rawPrefixes = results.find((r) => r.config.storage === 'raw' && r.config.prefixes);
  if (rawPrefixes) {
    const delta = rawPrefixes.mrr - baseline.mrr;
    const pct = (delta * 100).toFixed(1);
    if (delta > 0.02) {
      lines.push(`✓ Prefixes improve raw storage: +${pct}%`);
    } else if (delta < -0.02) {
      lines.push(`✗ Prefixes HURT raw storage: ${pct}%`);
    } else {
      lines.push(`○ Prefixes neutral on raw storage: ${pct}%`);
    }
  }

  // Find extraction only
  const extractionOnly = results.find(
    (r) => r.config.storage === 'extraction' && !r.config.prefixes
  );
  if (extractionOnly) {
    const delta = extractionOnly.mrr - baseline.mrr;
    const pct = (delta * 100).toFixed(1);
    if (delta > 0.02) {
      lines.push(`✓ Extraction improves retrieval: +${pct}%`);
    } else if (delta < -0.02) {
      lines.push(`✗ Extraction HURTS retrieval: ${pct}%`);
    } else {
      lines.push(`○ Extraction neutral: ${pct}%`);
    }
  }

  // Find extraction+prefixes
  const extractionPrefixes = results.find(
    (r) => r.config.storage === 'extraction' && r.config.prefixes
  );
  if (extractionPrefixes && extractionOnly) {
    const delta = extractionPrefixes.mrr - extractionOnly.mrr;
    const pct = (delta * 100).toFixed(1);
    if (delta > 0.02) {
      lines.push(`✓ Prefixes improve extraction: +${pct}%`);
    } else if (delta < -0.02) {
      lines.push(`✗ Prefixes HURT extraction: ${pct}%`);
    } else {
      lines.push(`○ Prefixes neutral on extraction: ${pct}%`);
    }
  }

  // Find best configuration
  const sorted = [...results].sort((a, b) => b.mrr - a.mrr);
  const best = sorted[0];
  if (best) {
    lines.push('');
    lines.push(`→ Best config: ${best.config.name} (MRR=${(best.mrr * 100).toFixed(1)}%)`);
    lines.push(`  Use this as base for secondary parameter tuning`);
  }

  return lines;
}

// =============================================================================
// Results Export
// =============================================================================

/**
 * Export results to JSON file
 */
export async function exportResults(
  results: AblationResult[],
  outputDir = ABLATION_DATA_DIR
): Promise<string> {
  await ensureAblationDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${outputDir}/ablation-results-${timestamp}.json`;

  const exportData = {
    timestamp: new Date().toISOString(),
    results: results.map((r) => ({
      ...r,
      mrrPct: (r.mrr * 100).toFixed(1),
      recallPct: {
        k1: (r.recall.k1 * 100).toFixed(1),
        k5: (r.recall.k5 * 100).toFixed(1),
        k10: (r.recall.k10 * 100).toFixed(1),
        k20: (r.recall.k20 * 100).toFixed(1),
      },
    })),
    diagnosis: generateDiagnosis(results),
  };

  await writeFile(filename, JSON.stringify(exportData, null, 2));
  return filename;
}

// =============================================================================
// Configuration Presets
// =============================================================================

/**
 * Primary ablation tests - isolate main components
 */
export const PRIMARY_TESTS: AblationConfig[] = [
  { name: 'baseline', storage: 'raw', prefixes: false },
  { name: 'raw+prefixes', storage: 'raw', prefixes: true },
  { name: 'extraction', storage: 'extraction', prefixes: false },
  { name: 'extraction+prefixes', storage: 'extraction', prefixes: true },
];

/**
 * Secondary parameter sweep tests
 * Run these on the best primary configuration
 */
export function getSecondaryTests(baseConfig: AblationConfig): AblationConfig[] {
  return [
    { ...baseConfig, name: 'rerank-0.7', rerankAlpha: 0.7 },
    { ...baseConfig, name: 'rerank-0.8', rerankAlpha: 0.8 },
    { ...baseConfig, name: 'rerank-1.0', rerankAlpha: 1.0 },
    { ...baseConfig, name: 'hybrid-0.5', hybridAlpha: 0.5 },
    { ...baseConfig, name: 'hybrid-0.0', hybridAlpha: 0.0 },
    { ...baseConfig, name: 'hyde-enabled', hydeEnabled: true },
    { ...baseConfig, name: 'topk-30', rerankTopK: 30 },
    { ...baseConfig, name: 'topk-100', rerankTopK: 100 },
  ];
}

/**
 * Optimal configuration discovered from ablation testing
 * - extraction mode (LLM-extracted facts)
 * - no instruction prefixes
 * - rerankTopK: 100 (more candidates for reranking)
 * - rerankAlpha: 0.9 (default, optimal)
 * - hydeEnabled: false (HyDE hurts performance)
 */
export const OPTIMAL_CONFIG: AblationConfig = {
  name: 'optimal',
  storage: 'extraction',
  prefixes: false,
  rerankTopK: 100,
  hydeEnabled: false,
};
