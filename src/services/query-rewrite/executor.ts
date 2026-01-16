/**
 * Sub-Query Executor for Multi-Hop Query Processing
 *
 * Executes sub-queries according to a query plan and merges results
 * using Reciprocal Rank Fusion (RRF) or other merge strategies.
 */

import type { SubQuery, QueryPlan } from './types.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('subquery-executor');

/**
 * Configuration for SubQueryExecutor
 */
export interface SubQueryExecutorConfig {
  /** RRF constant k (default 60, higher = less emphasis on top ranks) */
  rrfK: number;
  /** Maximum concurrent sub-queries in parallel mode */
  maxConcurrent: number;
  /** Timeout per sub-query in milliseconds */
  timeoutMs: number;
  /** Merge strategy */
  mergeStrategy: 'rrf' | 'max' | 'sum' | 'weighted';
  /** Whether to deduplicate results */
  deduplicate: boolean;
}

/**
 * Default executor configuration
 */
export const DEFAULT_EXECUTOR_CONFIG: SubQueryExecutorConfig = {
  rrfK: 60,
  maxConcurrent: 5,
  timeoutMs: 10000,
  mergeStrategy: 'rrf',
  deduplicate: true,
};

/**
 * A single result entry with its metadata
 */
export interface ResultEntry {
  /** Unique identifier */
  id: string;
  /** Entry content */
  content: string;
  /** Entry type */
  type: string;
  /** Original score from retrieval */
  score: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result from a single sub-query execution
 */
export interface SubQueryResult {
  /** The sub-query that was executed */
  subQuery: SubQuery;
  /** Retrieved entries */
  entries: ResultEntry[];
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Whether execution succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Merged results from all sub-queries
 */
export interface MergedResults {
  /** Final ranked entries */
  entries: ResultEntry[];
  /** Map of entry ID to merged score */
  scores: Map<string, number>;
  /** Sub-query results for debugging */
  subQueryResults: SubQueryResult[];
  /** Total execution time */
  totalExecutionTimeMs: number;
  /** Merge strategy used */
  mergeStrategy: SubQueryExecutorConfig['mergeStrategy'];
}

/**
 * Query function type for executing a single query
 */
export type QueryFn = (query: string) => Promise<ResultEntry[]>;

/**
 * Sub-Query Executor
 *
 * Executes a query plan's sub-queries and merges results using
 * Reciprocal Rank Fusion or other strategies.
 *
 * @example
 * ```typescript
 * const executor = new SubQueryExecutor({ mergeStrategy: 'rrf' });
 *
 * const results = await executor.execute(queryPlan, async (query) => {
 *   return await searchMemory(query);
 * });
 *
 * // results.entries contains deduplicated, merged results
 * ```
 */
export class SubQueryExecutor {
  private config: SubQueryExecutorConfig;

  constructor(config: Partial<SubQueryExecutorConfig> = {}) {
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config };
  }

  /**
   * Execute sub-queries according to plan
   */
  async execute(plan: QueryPlan, queryFn: QueryFn): Promise<MergedResults> {
    const startTime = Date.now();
    const results: SubQueryResult[] = [];

    logger.debug(
      {
        subQueryCount: plan.subQueries.length,
        executionOrder: plan.executionOrder,
      },
      'Executing query plan'
    );

    switch (plan.executionOrder) {
      case 'parallel':
        await this.executeParallel(plan.subQueries, queryFn, results);
        break;

      case 'sequential':
        await this.executeSequential(plan.subQueries, queryFn, results);
        break;

      case 'dependency':
        await this.executeDependency(plan, queryFn, results);
        break;

      default:
        await this.executeParallel(plan.subQueries, queryFn, results);
    }

    // Merge results
    const merged = this.mergeResults(results);
    merged.totalExecutionTimeMs = Date.now() - startTime;

    logger.debug(
      {
        totalEntries: merged.entries.length,
        executionTimeMs: merged.totalExecutionTimeMs,
        successCount: results.filter((r) => r.success).length,
      },
      'Query plan execution complete'
    );

    return merged;
  }

  /**
   * Execute sub-queries in parallel
   */
  private async executeParallel(
    subQueries: SubQuery[],
    queryFn: QueryFn,
    results: SubQueryResult[]
  ): Promise<void> {
    // Batch into chunks based on maxConcurrent
    const batches: SubQuery[][] = [];
    for (let i = 0; i < subQueries.length; i += this.config.maxConcurrent) {
      batches.push(subQueries.slice(i, i + this.config.maxConcurrent));
    }

    for (const batch of batches) {
      const batchResults = await Promise.all(batch.map((sq) => this.executeOne(sq, queryFn)));
      results.push(...batchResults);
    }
  }

  /**
   * Execute sub-queries sequentially
   */
  private async executeSequential(
    subQueries: SubQuery[],
    queryFn: QueryFn,
    results: SubQueryResult[]
  ): Promise<void> {
    for (const sq of subQueries) {
      const result = await this.executeOne(sq, queryFn);
      results.push(result);
    }
  }

  /**
   * Execute sub-queries respecting dependencies
   */
  private async executeDependency(
    plan: QueryPlan,
    queryFn: QueryFn,
    results: SubQueryResult[]
  ): Promise<void> {
    const completed = new Set<number>();
    const pending = new Map<number, SubQuery>();

    // Initialize pending
    for (const sq of plan.subQueries) {
      pending.set(sq.index, sq);
    }

    while (pending.size > 0) {
      // Find sub-queries whose dependencies are satisfied
      const ready: SubQuery[] = [];
      for (const [index, sq] of pending) {
        const deps = plan.dependencies?.get(index) || [];
        if (deps.every((d) => completed.has(d))) {
          ready.push(sq);
        }
      }

      if (ready.length === 0 && pending.size > 0) {
        // Circular dependency or missing dependencies - execute remaining
        logger.warn('Circular dependency detected, executing remaining queries');
        ready.push(...pending.values());
      }

      // Execute ready queries in parallel
      const batchResults = await Promise.all(ready.map((sq) => this.executeOne(sq, queryFn)));

      for (const result of batchResults) {
        results.push(result);
        completed.add(result.subQuery.index);
        pending.delete(result.subQuery.index);
      }
    }
  }

  /**
   * Execute a single sub-query with timeout
   */
  private async executeOne(subQuery: SubQuery, queryFn: QueryFn): Promise<SubQueryResult> {
    const startTime = Date.now();

    // Bug #247 fix: Clean up timeout timer to prevent memory leak
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      // Execute with timeout
      const entries = await Promise.race([
        queryFn(subQuery.query),
        new Promise<ResultEntry[]>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Timeout')), this.config.timeoutMs);
        }),
      ]);

      return {
        subQuery,
        entries,
        executionTimeMs: Date.now() - startTime,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(
        { query: subQuery.query.slice(0, 100), error: errorMessage },
        'Sub-query execution failed'
      );

      return {
        subQuery,
        entries: [],
        executionTimeMs: Date.now() - startTime,
        success: false,
        error: errorMessage,
      };
    } finally {
      // Bug #247 fix: Always clear timeout to prevent memory leak
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Merge results from all sub-queries
   */
  mergeResults(results: SubQueryResult[]): MergedResults {
    const scores = new Map<string, number>();
    const entryMap = new Map<string, ResultEntry>();

    // Calculate merged scores based on strategy
    switch (this.config.mergeStrategy) {
      case 'rrf':
        this.mergeRRF(results, scores, entryMap);
        break;

      case 'max':
        this.mergeMax(results, scores, entryMap);
        break;

      case 'sum':
        this.mergeSum(results, scores, entryMap);
        break;

      case 'weighted':
        this.mergeWeighted(results, scores, entryMap);
        break;

      default:
        this.mergeRRF(results, scores, entryMap);
    }

    // Sort entries by merged score
    const sortedEntries = Array.from(entryMap.values()).sort((a, b) => {
      const scoreA = scores.get(a.id) || 0;
      const scoreB = scores.get(b.id) || 0;
      return scoreB - scoreA;
    });

    // Update scores in entries
    for (const entry of sortedEntries) {
      entry.score = scores.get(entry.id) || entry.score;
    }

    return {
      entries: sortedEntries,
      scores,
      subQueryResults: results,
      totalExecutionTimeMs: 0, // Set by caller
      mergeStrategy: this.config.mergeStrategy,
    };
  }

  /**
   * Reciprocal Rank Fusion merge
   *
   * RRF(d) = sum(1 / (k + rank_i(d))) for each ranking i
   *
   * This gives higher scores to documents that appear highly ranked
   * across multiple sub-query results.
   */
  private mergeRRF(
    results: SubQueryResult[],
    scores: Map<string, number>,
    entryMap: Map<string, ResultEntry>
  ): void {
    const k = this.config.rrfK;

    for (const result of results) {
      if (!result.success) continue;

      for (let rank = 0; rank < result.entries.length; rank++) {
        const entry = result.entries[rank];
        if (!entry) continue;

        // RRF score contribution
        const contribution = 1 / (k + rank + 1);
        const current = scores.get(entry.id) || 0;
        scores.set(entry.id, current + contribution);

        // Store entry (keep highest-scored version)
        if (!entryMap.has(entry.id)) {
          entryMap.set(entry.id, entry);
        }
      }
    }
  }

  /**
   * Max score merge
   *
   * Uses the maximum score across all sub-query results.
   */
  private mergeMax(
    results: SubQueryResult[],
    scores: Map<string, number>,
    entryMap: Map<string, ResultEntry>
  ): void {
    for (const result of results) {
      if (!result.success) continue;

      for (const entry of result.entries) {
        const current = scores.get(entry.id) || 0;
        if (entry.score > current) {
          scores.set(entry.id, entry.score);
          entryMap.set(entry.id, entry);
        }
      }
    }
  }

  /**
   * Sum score merge
   *
   * Sums scores across all sub-query results.
   */
  private mergeSum(
    results: SubQueryResult[],
    scores: Map<string, number>,
    entryMap: Map<string, ResultEntry>
  ): void {
    for (const result of results) {
      if (!result.success) continue;

      for (const entry of result.entries) {
        const current = scores.get(entry.id) || 0;
        scores.set(entry.id, current + entry.score);

        if (!entryMap.has(entry.id)) {
          entryMap.set(entry.id, entry);
        }
      }
    }
  }

  /**
   * Weighted merge
   *
   * Weights each sub-query's contribution by 1 / (index + 1),
   * giving earlier sub-queries more weight.
   */
  private mergeWeighted(
    results: SubQueryResult[],
    scores: Map<string, number>,
    entryMap: Map<string, ResultEntry>
  ): void {
    for (const result of results) {
      if (!result.success) continue;

      // Weight by sub-query index (lower index = higher weight)
      const weight = 1 / (result.subQuery.index + 1);

      for (const entry of result.entries) {
        const current = scores.get(entry.id) || 0;
        scores.set(entry.id, current + entry.score * weight);

        if (!entryMap.has(entry.id)) {
          entryMap.set(entry.id, entry);
        }
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<SubQueryExecutorConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SubQueryExecutorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Singleton instance
 */
let defaultExecutor: SubQueryExecutor | null = null;

/**
 * Get the default executor instance
 */
export function getSubQueryExecutor(): SubQueryExecutor {
  if (!defaultExecutor) {
    defaultExecutor = new SubQueryExecutor();
  }
  return defaultExecutor;
}

/**
 * Reset the default executor
 */
export function resetSubQueryExecutor(): void {
  defaultExecutor = null;
}
