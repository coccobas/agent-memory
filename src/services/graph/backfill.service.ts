/**
 * Graph Backfill Service
 *
 * Automatically populates the knowledge graph with nodes and edges for existing
 * memory entries. This service runs as a background process to ensure all entries
 * have corresponding graph representations.
 *
 * Key features:
 * - Idempotent: Safe to re-run (skips existing nodes)
 * - Batch processing: Efficient handling of large datasets
 * - Scope-aware: Can target specific projects or global scope
 * - Scheduled: Runs automatically via cron or on session end
 */

import { randomUUID } from 'node:crypto';
import type { AppDb } from '../../core/types.js';
import type { Repositories } from '../../core/interfaces/repositories.js';
import type { GraphSyncService } from './sync.service.js';
import type {
  GraphBackfillConfig,
  BackfillRequest,
  BackfillResult,
  EntryTypeStats,
  GraphBackfillStatus,
} from './backfill-types.js';
import { DEFAULT_GRAPH_BACKFILL_CONFIG } from './backfill-types.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('graph-backfill');

// =============================================================================
// SERVICE
// =============================================================================

/**
 * Graph Backfill Service
 *
 * Manages automatic population of the knowledge graph from existing entries.
 */
export class GraphBackfillService {
  private repos: Repositories;
  private graphSync: GraphSyncService;
  private config: GraphBackfillConfig;
  private lastResult: BackfillResult | undefined;
  private isRunning = false;

  constructor(
    deps: { db: AppDb; repos: Repositories; graphSync: GraphSyncService },
    config?: Partial<GraphBackfillConfig>
  ) {
    // db is available via deps but not stored as we use repos for all operations
    void deps.db; // Type check only
    this.repos = deps.repos;
    this.graphSync = deps.graphSync;
    this.config = { ...DEFAULT_GRAPH_BACKFILL_CONFIG, ...config };
  }

  /**
   * Get the current configuration
   */
  getConfig(): GraphBackfillConfig {
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
  getLastResult(): BackfillResult | undefined {
    return this.lastResult;
  }

  /**
   * Run the backfill process
   */
  async backfill(request: BackfillRequest = {}): Promise<BackfillResult> {
    if (this.isRunning) {
      logger.warn('Backfill already in progress, skipping');
      throw new Error('Backfill already in progress');
    }

    this.isRunning = true;
    const runId = request.runId ?? randomUUID();
    const startedAt = new Date().toISOString();
    const errors: string[] = [];

    const stats: BackfillResult['stats'] = {
      knowledge: { total: 0, existing: 0, created: 0, failed: 0 },
      guideline: { total: 0, existing: 0, created: 0, failed: 0 },
      tool: { total: 0, existing: 0, created: 0, failed: 0 },
      experience: { total: 0, existing: 0, created: 0, failed: 0 },
      edges: { total: 0, existing: 0, created: 0, failed: 0 },
    };

    const batchSize = request.batchSize ?? this.config.batchSize;
    const maxEntries = request.maxEntries ?? this.config.maxEntriesPerRun;
    const dryRun = request.dryRun ?? false;

    logger.info(
      {
        runId,
        scopeType: request.scopeType,
        scopeId: request.scopeId,
        batchSize,
        maxEntries,
        dryRun,
        initiatedBy: request.initiatedBy,
      },
      'Starting graph backfill'
    );

    try {
      // Backfill each entry type
      let totalProcessed = 0;

      // Knowledge entries
      if (this.repos.knowledge && (maxEntries === 0 || totalProcessed < maxEntries)) {
        const remaining = maxEntries === 0 ? undefined : maxEntries - totalProcessed;
        await this.backfillKnowledge(
          request,
          stats.knowledge,
          batchSize,
          remaining,
          dryRun,
          errors
        );
        totalProcessed +=
          stats.knowledge.created + stats.knowledge.existing + stats.knowledge.failed;
      }

      // Guidelines
      if (this.repos.guidelines && (maxEntries === 0 || totalProcessed < maxEntries)) {
        const remaining = maxEntries === 0 ? undefined : maxEntries - totalProcessed;
        await this.backfillGuidelines(
          request,
          stats.guideline,
          batchSize,
          remaining,
          dryRun,
          errors
        );
        totalProcessed +=
          stats.guideline.created + stats.guideline.existing + stats.guideline.failed;
      }

      // Tools
      if (this.repos.tools && (maxEntries === 0 || totalProcessed < maxEntries)) {
        const remaining = maxEntries === 0 ? undefined : maxEntries - totalProcessed;
        await this.backfillTools(request, stats.tool, batchSize, remaining, dryRun, errors);
        totalProcessed += stats.tool.created + stats.tool.existing + stats.tool.failed;
      }

      // Experiences
      if (this.repos.experiences && (maxEntries === 0 || totalProcessed < maxEntries)) {
        const remaining = maxEntries === 0 ? undefined : maxEntries - totalProcessed;
        await this.backfillExperiences(
          request,
          stats.experience,
          batchSize,
          remaining,
          dryRun,
          errors
        );
        totalProcessed +=
          stats.experience.created + stats.experience.existing + stats.experience.failed;
      }

      // Entry relations → edges
      if (this.repos.entryRelations && (maxEntries === 0 || totalProcessed < maxEntries)) {
        const remaining = maxEntries === 0 ? undefined : maxEntries - totalProcessed;
        await this.backfillEdges(request, stats.edges, batchSize, remaining, dryRun, errors);
      }

      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

      const result: BackfillResult = {
        runId,
        request,
        stats,
        timing: {
          startedAt,
          completedAt,
          durationMs,
        },
        dryRun,
        totalNodesCreated:
          stats.knowledge.created +
          stats.guideline.created +
          stats.tool.created +
          stats.experience.created,
        totalEdgesCreated: stats.edges.created,
        errors: errors.length > 0 ? errors : undefined,
      };

      this.lastResult = result;

      logger.info(
        {
          runId,
          totalNodesCreated: result.totalNodesCreated,
          totalEdgesCreated: result.totalEdgesCreated,
          durationMs,
          errorCount: errors.length,
        },
        'Graph backfill completed'
      );

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Backfill knowledge entries
   */
  private async backfillKnowledge(
    request: BackfillRequest,
    stats: EntryTypeStats,
    batchSize: number,
    maxEntries: number | undefined,
    dryRun: boolean,
    errors: string[]
  ): Promise<void> {
    if (!this.repos.knowledge || !this.repos.graphNodes) return;

    logger.debug('Backfilling knowledge entries');
    let offset = 0;
    let processed = 0;

    while (maxEntries === undefined || processed < maxEntries) {
      const limit =
        maxEntries !== undefined ? Math.min(batchSize, maxEntries - processed) : batchSize;

      const filter: Record<string, unknown> = {};
      if (request.scopeType) filter.scopeType = request.scopeType;
      if (request.scopeId) filter.scopeId = request.scopeId;

      const entries = await this.repos.knowledge.list(filter, { limit, offset });
      if (entries.length === 0) break;

      stats.total += entries.length;

      for (const entry of entries) {
        try {
          // Check if node already exists
          const existing = await this.repos.graphNodes.getByEntry('knowledge', entry.id);
          if (existing) {
            stats.existing++;
            continue;
          }

          // Create node
          if (!dryRun) {
            await this.graphSync.syncEntryToNode({
              entryType: 'knowledge',
              entryId: entry.id,
              name: entry.title,
              scopeType: entry.scopeType,
              scopeId: entry.scopeId ?? undefined,
              properties: {
                category: entry.category,
                source: entry.currentVersion?.source,
                confidence: entry.currentVersion?.confidence,
              },
              createdBy: entry.createdBy ?? undefined,
            });
          }
          stats.created++;
        } catch (error) {
          stats.failed++;
          const msg = `Knowledge ${entry.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(msg);
          logger.warn({ entryId: entry.id, error: msg }, 'Failed to backfill knowledge entry');
        }
      }

      processed += entries.length;
      offset += entries.length;

      if (entries.length < batchSize) break;
    }

    logger.debug(
      { total: stats.total, created: stats.created, existing: stats.existing },
      'Knowledge backfill complete'
    );
  }

  /**
   * Backfill guideline entries
   */
  private async backfillGuidelines(
    request: BackfillRequest,
    stats: EntryTypeStats,
    batchSize: number,
    maxEntries: number | undefined,
    dryRun: boolean,
    errors: string[]
  ): Promise<void> {
    if (!this.repos.guidelines || !this.repos.graphNodes) return;

    logger.debug('Backfilling guideline entries');
    let offset = 0;
    let processed = 0;

    while (maxEntries === undefined || processed < maxEntries) {
      const limit =
        maxEntries !== undefined ? Math.min(batchSize, maxEntries - processed) : batchSize;

      const filter: Record<string, unknown> = {};
      if (request.scopeType) filter.scopeType = request.scopeType;
      if (request.scopeId) filter.scopeId = request.scopeId;

      const entries = await this.repos.guidelines.list(filter, { limit, offset });
      if (entries.length === 0) break;

      stats.total += entries.length;

      for (const entry of entries) {
        try {
          const existing = await this.repos.graphNodes.getByEntry('guideline', entry.id);
          if (existing) {
            stats.existing++;
            continue;
          }

          if (!dryRun) {
            await this.graphSync.syncEntryToNode({
              entryType: 'guideline',
              entryId: entry.id,
              name: entry.name,
              scopeType: entry.scopeType,
              scopeId: entry.scopeId ?? undefined,
              properties: {
                category: entry.category,
                priority: entry.priority,
              },
              createdBy: entry.createdBy ?? undefined,
            });
          }
          stats.created++;
        } catch (error) {
          stats.failed++;
          const msg = `Guideline ${entry.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(msg);
          logger.warn({ entryId: entry.id, error: msg }, 'Failed to backfill guideline entry');
        }
      }

      processed += entries.length;
      offset += entries.length;

      if (entries.length < batchSize) break;
    }

    logger.debug(
      { total: stats.total, created: stats.created, existing: stats.existing },
      'Guideline backfill complete'
    );
  }

  /**
   * Backfill tool entries
   */
  private async backfillTools(
    request: BackfillRequest,
    stats: EntryTypeStats,
    batchSize: number,
    maxEntries: number | undefined,
    dryRun: boolean,
    errors: string[]
  ): Promise<void> {
    if (!this.repos.tools || !this.repos.graphNodes) return;

    logger.debug('Backfilling tool entries');
    let offset = 0;
    let processed = 0;

    while (maxEntries === undefined || processed < maxEntries) {
      const limit =
        maxEntries !== undefined ? Math.min(batchSize, maxEntries - processed) : batchSize;

      const filter: Record<string, unknown> = {};
      if (request.scopeType) filter.scopeType = request.scopeType;
      if (request.scopeId) filter.scopeId = request.scopeId;

      const entries = await this.repos.tools.list(filter, { limit, offset });
      if (entries.length === 0) break;

      stats.total += entries.length;

      for (const entry of entries) {
        try {
          const existing = await this.repos.graphNodes.getByEntry('tool', entry.id);
          if (existing) {
            stats.existing++;
            continue;
          }

          if (!dryRun) {
            await this.graphSync.syncEntryToNode({
              entryType: 'tool',
              entryId: entry.id,
              name: entry.name,
              scopeType: entry.scopeType,
              scopeId: entry.scopeId ?? undefined,
              properties: {
                category: entry.category,
                description: entry.currentVersion?.description,
              },
              createdBy: entry.createdBy ?? undefined,
            });
          }
          stats.created++;
        } catch (error) {
          stats.failed++;
          const msg = `Tool ${entry.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(msg);
          logger.warn({ entryId: entry.id, error: msg }, 'Failed to backfill tool entry');
        }
      }

      processed += entries.length;
      offset += entries.length;

      if (entries.length < batchSize) break;
    }

    logger.debug(
      { total: stats.total, created: stats.created, existing: stats.existing },
      'Tool backfill complete'
    );
  }

  /**
   * Backfill experience entries
   */
  private async backfillExperiences(
    request: BackfillRequest,
    stats: EntryTypeStats,
    batchSize: number,
    maxEntries: number | undefined,
    dryRun: boolean,
    errors: string[]
  ): Promise<void> {
    if (!this.repos.experiences || !this.repos.graphNodes) return;

    logger.debug('Backfilling experience entries');
    let offset = 0;
    let processed = 0;

    while (maxEntries === undefined || processed < maxEntries) {
      const limit =
        maxEntries !== undefined ? Math.min(batchSize, maxEntries - processed) : batchSize;

      const filter: Record<string, unknown> = {};
      if (request.scopeType) filter.scopeType = request.scopeType;
      if (request.scopeId) filter.scopeId = request.scopeId;

      const entries = await this.repos.experiences.list(filter, { limit, offset });
      if (entries.length === 0) break;

      stats.total += entries.length;

      for (const entry of entries) {
        try {
          const existing = await this.repos.graphNodes.getByEntry('experience', entry.id);
          if (existing) {
            stats.existing++;
            continue;
          }

          if (!dryRun) {
            await this.graphSync.syncEntryToNode({
              entryType: 'experience',
              entryId: entry.id,
              name: entry.title,
              scopeType: entry.scopeType,
              scopeId: entry.scopeId ?? undefined,
              properties: {
                level: entry.level,
                category: entry.category,
                source: entry.currentVersion?.source,
                confidence: entry.currentVersion?.confidence,
              },
              createdBy: entry.createdBy ?? undefined,
            });
          }
          stats.created++;
        } catch (error) {
          stats.failed++;
          const msg = `Experience ${entry.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(msg);
          logger.warn({ entryId: entry.id, error: msg }, 'Failed to backfill experience entry');
        }
      }

      processed += entries.length;
      offset += entries.length;

      if (entries.length < batchSize) break;
    }

    logger.debug(
      { total: stats.total, created: stats.created, existing: stats.existing },
      'Experience backfill complete'
    );
  }

  /**
   * Backfill entry relations as edges
   */
  private async backfillEdges(
    _request: BackfillRequest, // Not used yet - relations don't have scope filtering
    stats: EntryTypeStats,
    batchSize: number,
    maxEntries: number | undefined,
    dryRun: boolean,
    errors: string[]
  ): Promise<void> {
    if (!this.repos.entryRelations || !this.repos.graphNodes || !this.repos.graphEdges) return;

    logger.debug('Backfilling edges from entry relations');
    let offset = 0;
    let processed = 0;

    while (maxEntries === undefined || processed < maxEntries) {
      const limit =
        maxEntries !== undefined ? Math.min(batchSize, maxEntries - processed) : batchSize;

      const relations = await this.repos.entryRelations.list({}, { limit, offset });
      if (relations.length === 0) break;

      stats.total += relations.length;

      for (const relation of relations) {
        try {
          // Sync the relation to an edge
          if (!dryRun) {
            const edge = await this.graphSync.syncRelationToEdge({
              relationType: relation.relationType as
                | 'applies_to'
                | 'depends_on'
                | 'conflicts_with'
                | 'related_to'
                | 'parent_task'
                | 'subtask_of',
              sourceEntryId: relation.sourceId,
              sourceEntryType: relation.sourceType as
                | 'knowledge'
                | 'guideline'
                | 'tool'
                | 'experience'
                | 'task',
              targetEntryId: relation.targetId,
              targetEntryType: relation.targetType as
                | 'knowledge'
                | 'guideline'
                | 'tool'
                | 'experience'
                | 'task',
              createdBy: relation.createdBy ?? undefined,
            });

            if (edge) {
              stats.created++;
            } else {
              // Edge already exists or nodes not found
              stats.existing++;
            }
          } else {
            stats.created++;
          }
        } catch (error) {
          stats.failed++;
          const msg = `Relation ${relation.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(msg);
          logger.warn({ relationId: relation.id, error: msg }, 'Failed to backfill relation');
        }
      }

      processed += relations.length;
      offset += relations.length;

      if (relations.length < batchSize) break;
    }

    logger.debug(
      { total: stats.total, created: stats.created, existing: stats.existing },
      'Edge backfill complete'
    );
  }

  /**
   * Get service status
   */
  getStatus(schedulerStatus?: {
    running: boolean;
    schedule: string | null;
    nextRun: string | null;
  }): GraphBackfillStatus {
    return {
      enabled: this.config.enabled,
      schedulerRunning: schedulerStatus?.running ?? false,
      schedule: this.config.schedule,
      nextRun: schedulerStatus?.nextRun ?? undefined,
      lastBackfill: this.lastResult
        ? {
            runId: this.lastResult.runId,
            completedAt: this.lastResult.timing.completedAt,
            totalNodesCreated: this.lastResult.totalNodesCreated,
            totalEdgesCreated: this.lastResult.totalEdgesCreated,
            durationMs: this.lastResult.timing.durationMs,
          }
        : undefined,
      config: this.config,
    };
  }
}

/**
 * Create a GraphBackfillService instance
 */
export function createGraphBackfillService(
  deps: { db: AppDb; repos: Repositories; graphSync: GraphSyncService },
  config?: Partial<GraphBackfillConfig>
): GraphBackfillService {
  return new GraphBackfillService(deps, config);
}
