/**
 * Embedding Backfill Service
 *
 * Wraps the existing backfillEmbeddings function in a service class that integrates
 * with the maintenance job system. This enables:
 * - Job tracking and progress monitoring
 * - Scheduled execution via maintenance orchestrator
 * - Consistent status reporting
 *
 * Key features:
 * - Idempotent: Safe to re-run (skips entries with existing embeddings)
 * - Batch processing: Efficient handling of large datasets
 * - Scope-aware: Can target specific projects or global scope
 * - Integrates with maintenance job system for visibility
 */

import { randomUUID } from 'node:crypto';
import type { DbClient } from '../db/connection.js';
import type { IEmbeddingService, IVectorService } from '../core/context.js';
import {
  backfillEmbeddings,
  getBackfillStats,
  type BackfillOptions,
  type BackfillProgress,
  type BackfillServices,
} from './backfill.service.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('embedding-backfill-service');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for the embedding backfill service
 */
export interface EmbeddingBackfillConfig {
  /** Enable embedding backfill during maintenance */
  enabled: boolean;
  /** Batch size for processing entries */
  batchSize: number;
  /** Delay between batches in milliseconds */
  delayMs: number;
  /** Maximum entries to backfill per run (0 = unlimited) */
  maxEntries: number;
  /** Entry types to process */
  entryTypes: Array<'tool' | 'guideline' | 'knowledge'>;
}

/**
 * Default configuration
 */
export const DEFAULT_EMBEDDING_BACKFILL_CONFIG: EmbeddingBackfillConfig = {
  enabled: true,
  batchSize: 50,
  delayMs: 1000,
  maxEntries: 100, // Lower for session-end, higher for scheduled
  entryTypes: ['tool', 'guideline', 'knowledge'],
};

/**
 * Request to run embedding backfill
 */
export interface EmbeddingBackfillRequest {
  /** Unique run ID (auto-generated if not provided) */
  runId?: string;
  /** Target scope type (not used for filtering, just for logging) */
  scopeType?: string;
  /** Target scope ID (not used for filtering, just for logging) */
  scopeId?: string;
  /** Batch size override */
  batchSize?: number;
  /** Delay between batches override */
  delayMs?: number;
  /** Maximum entries to process (0 = unlimited) */
  maxEntries?: number;
  /** Entry types to process */
  entryTypes?: Array<'tool' | 'guideline' | 'knowledge'>;
  /** Dry run - analyze without making changes */
  dryRun?: boolean;
  /** Who initiated this backfill run */
  initiatedBy?: string;
}

/**
 * Stats for a single entry type
 */
export interface EntryTypeStats {
  total: number;
  withEmbeddings: number;
  missing: number;
  processed: number;
  succeeded: number;
  failed: number;
}

/**
 * Result from embedding backfill
 */
export interface EmbeddingBackfillResult {
  /** Unique run ID */
  runId: string;
  /** Request that triggered this run */
  request: EmbeddingBackfillRequest;
  /** Stats by entry type */
  stats: {
    tools: EntryTypeStats;
    guidelines: EntryTypeStats;
    knowledge: EntryTypeStats;
  };
  /** Timing information */
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  /** Was this a dry run? */
  dryRun: boolean;
  /** Total entries processed */
  totalProcessed: number;
  /** Total embeddings created */
  totalCreated: number;
  /** Total failures */
  totalFailed: number;
  /** Any errors encountered */
  errors?: string[];
}

/**
 * Status of the embedding backfill service
 */
export interface EmbeddingBackfillStatus {
  /** Is the service enabled? */
  enabled: boolean;
  /** Is a backfill currently running? */
  isRunning: boolean;
  /** Last backfill result summary */
  lastBackfill?: {
    runId: string;
    completedAt: string;
    totalProcessed: number;
    totalCreated: number;
    totalFailed: number;
    durationMs: number;
  };
  /** Current coverage stats */
  coverage: {
    tools: { total: number; withEmbeddings: number; ratio: number };
    guidelines: { total: number; withEmbeddings: number; ratio: number };
    knowledge: { total: number; withEmbeddings: number; ratio: number };
    overall: { total: number; withEmbeddings: number; percentComplete: string };
  };
  /** Service configuration */
  config: EmbeddingBackfillConfig;
}

// =============================================================================
// SERVICE
// =============================================================================

/**
 * Embedding Backfill Service
 *
 * Manages automatic generation of embeddings for existing entries.
 */
export class EmbeddingBackfillService {
  private db: DbClient;
  private services: BackfillServices;
  private config: EmbeddingBackfillConfig;
  private lastResult: EmbeddingBackfillResult | undefined;
  private isRunning = false;

  constructor(
    deps: { db: DbClient; embedding: IEmbeddingService; vector: IVectorService },
    config?: Partial<EmbeddingBackfillConfig>
  ) {
    this.db = deps.db;
    this.services = {
      embedding: deps.embedding,
      vector: deps.vector,
    };
    this.config = { ...DEFAULT_EMBEDDING_BACKFILL_CONFIG, ...config };
  }

  /**
   * Get the current configuration
   */
  getConfig(): EmbeddingBackfillConfig {
    return { ...this.config };
  }

  /**
   * Check if a backfill is currently running
   */
  isBackfillRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the last backfill result
   */
  getLastResult(): EmbeddingBackfillResult | undefined {
    return this.lastResult;
  }

  /**
   * Check if the service is available (embedding service configured)
   */
  isAvailable(): boolean {
    return this.services.embedding.isAvailable();
  }

  /**
   * Run the backfill process
   */
  async backfill(request: EmbeddingBackfillRequest = {}): Promise<EmbeddingBackfillResult> {
    if (this.isRunning) {
      logger.warn('Embedding backfill already in progress, skipping');
      throw new Error('Embedding backfill already in progress');
    }

    if (!this.isAvailable()) {
      throw new Error('Embedding service not available');
    }

    this.isRunning = true;
    const runId = request.runId ?? randomUUID();
    const startedAt = new Date().toISOString();
    const errors: string[] = [];

    const batchSize = request.batchSize ?? this.config.batchSize;
    const delayMs = request.delayMs ?? this.config.delayMs;
    const entryTypes = request.entryTypes ?? this.config.entryTypes;
    const dryRun = request.dryRun ?? false;

    logger.info(
      {
        runId,
        scopeType: request.scopeType,
        scopeId: request.scopeId,
        batchSize,
        delayMs,
        entryTypes,
        dryRun,
        initiatedBy: request.initiatedBy,
      },
      'Starting embedding backfill'
    );

    const initialStats = getBackfillStats(this.db);

    const stats: EmbeddingBackfillResult['stats'] = {
      tools: {
        total: initialStats.tools.total,
        withEmbeddings: initialStats.tools.withEmbeddings,
        missing: initialStats.tools.total - initialStats.tools.withEmbeddings,
        processed: 0,
        succeeded: 0,
        failed: 0,
      },
      guidelines: {
        total: initialStats.guidelines.total,
        withEmbeddings: initialStats.guidelines.withEmbeddings,
        missing: initialStats.guidelines.total - initialStats.guidelines.withEmbeddings,
        processed: 0,
        succeeded: 0,
        failed: 0,
      },
      knowledge: {
        total: initialStats.knowledge.total,
        withEmbeddings: initialStats.knowledge.withEmbeddings,
        missing: initialStats.knowledge.total - initialStats.knowledge.withEmbeddings,
        processed: 0,
        succeeded: 0,
        failed: 0,
      },
    };

    try {
      if (!dryRun) {
        let lastProgress: BackfillProgress | undefined;

        const options: BackfillOptions = {
          batchSize,
          delayMs,
          entryTypes,
          onProgress: (progress: BackfillProgress) => {
            lastProgress = progress;
            logger.debug(
              {
                runId,
                processed: progress.processed,
                total: progress.total,
                succeeded: progress.succeeded,
                failed: progress.failed,
              },
              'Embedding backfill progress'
            );
          },
        };

        const progress = await backfillEmbeddings(options, this.db, this.services);
        lastProgress = progress;

        const finalStats = getBackfillStats(this.db);

        stats.tools.processed = entryTypes.includes('tool') ? stats.tools.total : 0;
        stats.tools.succeeded = finalStats.tools.withEmbeddings - initialStats.tools.withEmbeddings;
        stats.tools.failed = Math.max(0, stats.tools.missing - stats.tools.succeeded);

        stats.guidelines.processed = entryTypes.includes('guideline') ? stats.guidelines.total : 0;
        stats.guidelines.succeeded =
          finalStats.guidelines.withEmbeddings - initialStats.guidelines.withEmbeddings;
        stats.guidelines.failed = Math.max(
          0,
          stats.guidelines.missing - stats.guidelines.succeeded
        );

        stats.knowledge.processed = entryTypes.includes('knowledge') ? stats.knowledge.total : 0;
        stats.knowledge.succeeded =
          finalStats.knowledge.withEmbeddings - initialStats.knowledge.withEmbeddings;
        stats.knowledge.failed = Math.max(0, stats.knowledge.missing - stats.knowledge.succeeded);

        if (lastProgress?.errors && lastProgress.errors.length > 0) {
          for (const err of lastProgress.errors) {
            errors.push(`${err.entryType} ${err.entryId}: ${err.error}`);
          }
        }
      }

      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

      const result: EmbeddingBackfillResult = {
        runId,
        request,
        stats,
        timing: {
          startedAt,
          completedAt,
          durationMs,
        },
        dryRun,
        totalProcessed:
          stats.tools.processed + stats.guidelines.processed + stats.knowledge.processed,
        totalCreated:
          stats.tools.succeeded + stats.guidelines.succeeded + stats.knowledge.succeeded,
        totalFailed: stats.tools.failed + stats.guidelines.failed + stats.knowledge.failed,
        errors: errors.length > 0 ? errors : undefined,
      };

      this.lastResult = result;

      logger.info(
        {
          runId,
          totalProcessed: result.totalProcessed,
          totalCreated: result.totalCreated,
          totalFailed: result.totalFailed,
          durationMs,
          errorCount: errors.length,
        },
        'Embedding backfill completed'
      );

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get current coverage statistics
   */
  getCoverageStats(): EmbeddingBackfillStatus['coverage'] {
    const stats = getBackfillStats(this.db);

    const totalEntries = stats.tools.total + stats.guidelines.total + stats.knowledge.total;
    const totalWithEmbeddings =
      stats.tools.withEmbeddings + stats.guidelines.withEmbeddings + stats.knowledge.withEmbeddings;

    return {
      tools: {
        total: stats.tools.total,
        withEmbeddings: stats.tools.withEmbeddings,
        ratio: stats.tools.total > 0 ? stats.tools.withEmbeddings / stats.tools.total : 1,
      },
      guidelines: {
        total: stats.guidelines.total,
        withEmbeddings: stats.guidelines.withEmbeddings,
        ratio:
          stats.guidelines.total > 0 ? stats.guidelines.withEmbeddings / stats.guidelines.total : 1,
      },
      knowledge: {
        total: stats.knowledge.total,
        withEmbeddings: stats.knowledge.withEmbeddings,
        ratio:
          stats.knowledge.total > 0 ? stats.knowledge.withEmbeddings / stats.knowledge.total : 1,
      },
      overall: {
        total: totalEntries,
        withEmbeddings: totalWithEmbeddings,
        percentComplete:
          totalEntries > 0
            ? ((totalWithEmbeddings / totalEntries) * 100).toFixed(1) + '%'
            : '100.0%',
      },
    };
  }

  /**
   * Get service status
   */
  getStatus(): EmbeddingBackfillStatus {
    return {
      enabled: this.config.enabled,
      isRunning: this.isRunning,
      lastBackfill: this.lastResult
        ? {
            runId: this.lastResult.runId,
            completedAt: this.lastResult.timing.completedAt,
            totalProcessed: this.lastResult.totalProcessed,
            totalCreated: this.lastResult.totalCreated,
            totalFailed: this.lastResult.totalFailed,
            durationMs: this.lastResult.timing.durationMs,
          }
        : undefined,
      coverage: this.getCoverageStats(),
      config: this.config,
    };
  }
}

/**
 * Create an EmbeddingBackfillService instance
 */
export function createEmbeddingBackfillService(
  deps: { db: DbClient; embedding: IEmbeddingService; vector: IVectorService },
  config?: Partial<EmbeddingBackfillConfig>
): EmbeddingBackfillService {
  return new EmbeddingBackfillService(deps, config);
}
