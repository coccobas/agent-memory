/**
 * Maintenance Orchestrator
 *
 * Coordinates all memory maintenance tasks (consolidation, forgetting, graph backfill)
 * into a unified pipeline. Each task is executed independently and results are aggregated.
 */

import { v4 as uuidv4 } from 'uuid';
import { createComponentLogger } from '../../../utils/logger.js';
import type { AppDb } from '../../../core/types.js';
import type { Repositories } from '../../../core/interfaces/repositories.js';
import type { GraphBackfillService } from '../../graph/backfill.service.js';
import type { IEmbeddingService, IVectorService } from '../../../core/context.js';
import type { LatentMemoryService } from '../../latent-memory/latent-memory.service.js';
import type {
  MaintenanceConfig,
  MaintenanceRequest,
  MaintenanceResult,
  ConsolidationResult,
  ForgettingResult,
  GraphBackfillResult,
  LatentPopulationResult,
  TagRefinementResult,
  SemanticEdgeInferenceResult,
  ToolTagAssignmentResult,
  EmbeddingCleanupResult,
  MemoryHealth,
} from './types.js';
import { DEFAULT_MAINTENANCE_CONFIG, computeHealthGrade } from './types.js';
import type { SemanticEdgeInferenceService } from '../../graph/semantic-edge-inference.service.js';
import type { IExtractionService } from '../../../core/context.js';

const logger = createComponentLogger('maintenance-orchestrator');

// =============================================================================
// DEPENDENCIES
// =============================================================================

export interface MaintenanceOrchestratorDeps {
  db: AppDb;
  repos: Repositories;
  graphBackfill?: GraphBackfillService;
  embedding?: IEmbeddingService;
  vector?: IVectorService;
  latentMemory?: LatentMemoryService;
  semanticEdgeInference?: SemanticEdgeInferenceService;
  extraction?: IExtractionService;
}

export type TaskProgressCallback = (
  taskName: string,
  status: 'running' | 'completed' | 'failed' | 'skipped',
  result?: unknown
) => void;

// =============================================================================
// ORCHESTRATOR
// =============================================================================

export class MaintenanceOrchestrator {
  private deps: MaintenanceOrchestratorDeps;
  private config: MaintenanceConfig;

  constructor(deps: MaintenanceOrchestratorDeps, config?: Partial<MaintenanceConfig>) {
    this.deps = deps;
    this.config = { ...DEFAULT_MAINTENANCE_CONFIG, ...config };
  }

  /**
   * Run maintenance tasks
   */
  async runMaintenance(
    request: MaintenanceRequest,
    onProgress?: TaskProgressCallback
  ): Promise<MaintenanceResult> {
    const runId = uuidv4();
    const startedAt = new Date().toISOString();
    const effectiveConfig = this.mergeConfig(request.configOverrides);

    logger.info(
      {
        runId,
        scopeType: request.scopeType,
        scopeId: request.scopeId,
        tasks: request.tasks,
        dryRun: request.dryRun,
        initiatedBy: request.initiatedBy,
      },
      'Starting maintenance run'
    );

    const tasksToRun = request.tasks ?? [
      'consolidation',
      'forgetting',
      'graphBackfill',
      'latentPopulation',
      'tagRefinement',
      'semanticEdgeInference',
      'toolTagAssignment',
      'embeddingCleanup',
    ];
    const results: MaintenanceResult = {
      runId,
      request,
      dryRun: request.dryRun ?? false,
      timing: {
        startedAt,
        completedAt: '',
        durationMs: 0,
      },
    };

    // Run consolidation if requested and enabled
    if (tasksToRun.includes('consolidation') && effectiveConfig.consolidation.enabled) {
      onProgress?.('consolidation', 'running');
      results.consolidation = await this.runConsolidation(request, effectiveConfig);
      onProgress?.(
        'consolidation',
        results.consolidation.executed ? 'completed' : 'skipped',
        results.consolidation
      );
    }

    // Run forgetting if requested and enabled
    if (tasksToRun.includes('forgetting') && effectiveConfig.forgetting.enabled) {
      onProgress?.('forgetting', 'running');
      results.forgetting = await this.runForgetting(request, effectiveConfig);
      onProgress?.(
        'forgetting',
        results.forgetting.executed ? 'completed' : 'skipped',
        results.forgetting
      );
    }

    // Run graph backfill if requested and enabled
    if (tasksToRun.includes('graphBackfill') && effectiveConfig.graphBackfill.enabled) {
      onProgress?.('graphBackfill', 'running');
      results.graphBackfill = await this.runGraphBackfill(request, effectiveConfig);
      onProgress?.(
        'graphBackfill',
        results.graphBackfill.executed ? 'completed' : 'skipped',
        results.graphBackfill
      );
    }

    // Run latent memory population if requested and enabled
    if (tasksToRun.includes('latentPopulation') && effectiveConfig.latentPopulation.enabled) {
      onProgress?.('latentPopulation', 'running');
      results.latentPopulation = await this.runLatentPopulation(request, effectiveConfig);
      onProgress?.(
        'latentPopulation',
        results.latentPopulation.executed ? 'completed' : 'skipped',
        results.latentPopulation
      );
    }

    // Run tag refinement if requested and enabled
    if (tasksToRun.includes('tagRefinement') && effectiveConfig.tagRefinement.enabled) {
      onProgress?.('tagRefinement', 'running');
      results.tagRefinement = await this.runTagRefinement(request, effectiveConfig);
      onProgress?.(
        'tagRefinement',
        results.tagRefinement.executed ? 'completed' : 'skipped',
        results.tagRefinement
      );
    }

    // Run semantic edge inference if requested and enabled
    if (
      tasksToRun.includes('semanticEdgeInference') &&
      effectiveConfig.semanticEdgeInference.enabled
    ) {
      onProgress?.('semanticEdgeInference', 'running');
      results.semanticEdgeInference = await this.runSemanticEdgeInference(request, effectiveConfig);
      onProgress?.(
        'semanticEdgeInference',
        results.semanticEdgeInference.executed ? 'completed' : 'skipped',
        results.semanticEdgeInference
      );
    }

    // Run tool tag assignment if requested and enabled
    if (tasksToRun.includes('toolTagAssignment') && effectiveConfig.toolTagAssignment.enabled) {
      onProgress?.('toolTagAssignment', 'running');
      results.toolTagAssignment = await this.runToolTagAssignment(request, effectiveConfig);
      onProgress?.(
        'toolTagAssignment',
        results.toolTagAssignment.executed ? 'completed' : 'skipped',
        results.toolTagAssignment
      );
    }

    // Run embedding cleanup if requested and enabled
    if (tasksToRun.includes('embeddingCleanup') && effectiveConfig.embeddingCleanup.enabled) {
      onProgress?.('embeddingCleanup', 'running');
      results.embeddingCleanup = await this.runEmbeddingCleanup(request, effectiveConfig);
      onProgress?.(
        'embeddingCleanup',
        results.embeddingCleanup.executed ? 'completed' : 'skipped',
        results.embeddingCleanup
      );
    }

    // Compute health after maintenance
    if (!request.dryRun) {
      results.healthAfter = await this.computeHealth(request.scopeType, request.scopeId);
    }

    const completedAt = new Date().toISOString();
    results.timing.completedAt = completedAt;
    results.timing.durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

    logger.info(
      {
        runId,
        durationMs: results.timing.durationMs,
        consolidation: results.consolidation?.executed,
        forgetting: results.forgetting?.executed,
        graphBackfill: results.graphBackfill?.executed,
        latentPopulation: results.latentPopulation?.executed,
        tagRefinement: results.tagRefinement?.executed,
        semanticEdgeInference: results.semanticEdgeInference?.executed,
        toolTagAssignment: results.toolTagAssignment?.executed,
        embeddingCleanup: results.embeddingCleanup?.executed,
      },
      'Maintenance run completed'
    );

    return results;
  }

  /**
   * Compute memory health for a scope
   */
  async computeHealth(scopeType: string, scopeId?: string): Promise<MemoryHealth> {
    const computedAt = new Date().toISOString();

    // Calculate component scores
    const freshness = await this.computeFreshnessScore(scopeType, scopeId);
    const diversity = await this.computeDiversityScore(scopeType, scopeId);
    const connectivity = await this.computeConnectivityScore(scopeType, scopeId);
    const quality = await this.computeQualityScore(scopeType, scopeId);

    // Weighted average for overall score
    const score = Math.round(
      freshness * 0.25 + diversity * 0.25 + connectivity * 0.25 + quality * 0.25
    );

    // Generate recommendations
    const recommendations: string[] = [];
    if (freshness < 50) {
      recommendations.push(
        'Many entries have not been accessed recently. Consider reviewing stale content.'
      );
    }
    if (diversity < 50) {
      recommendations.push('Memory is concentrated in few categories. Consider broader coverage.');
    }
    if (connectivity < 50) {
      recommendations.push('Knowledge graph has low connectivity. Run graph backfill to improve.');
    }
    if (quality < 50) {
      recommendations.push(
        'Some entries have low confidence scores. Consider reviewing and validating.'
      );
    }

    return {
      score,
      grade: computeHealthGrade(score),
      components: {
        freshness,
        diversity,
        connectivity,
        quality,
      },
      recommendations,
      computedAt,
    };
  }

  // ===========================================================================
  // PRIVATE TASK RUNNERS
  // ===========================================================================

  private async runConsolidation(
    request: MaintenanceRequest,
    config: MaintenanceConfig
  ): Promise<ConsolidationResult> {
    const startTime = Date.now();
    const result: ConsolidationResult = {
      executed: true,
      groupsFound: 0,
      entriesDeduped: 0,
      entriesMerged: 0,
      durationMs: 0,
    };

    try {
      // Check if vector service is available for similarity search
      if (!this.deps.vector || !this.deps.embedding) {
        logger.debug('Consolidation skipped: vector/embedding service not available');
        result.executed = false;
        result.durationMs = Date.now() - startTime;
        return result;
      }

      // Use consolidation service directly
      const { findSimilarGroups, consolidate } =
        await import('../../../services/consolidation.service.js');

      // Build the services object required by consolidation
      const services = {
        embedding: this.deps.embedding,
        vector: this.deps.vector,
      };

      // Find similar entries
      const groups = await findSimilarGroups({
        scopeType: request.scopeType as 'global' | 'org' | 'project' | 'session',
        scopeId: request.scopeId,
        threshold: config.consolidation.similarityThreshold,
        entryTypes: config.consolidation.entryTypes,
        limit: config.consolidation.maxGroups,
        db: this.deps.db,
        services,
      });

      result.groupsFound = groups.length;

      // If not dry run, process duplicates
      if (!request.dryRun && result.groupsFound > 0) {
        const consolidationResult = await consolidate({
          scopeType: request.scopeType as 'global' | 'org' | 'project' | 'session',
          scopeId: request.scopeId,
          entryTypes: config.consolidation.entryTypes,
          strategy: 'dedupe',
          threshold: config.consolidation.similarityThreshold,
          dryRun: false,
          limit: config.consolidation.maxGroups,
          consolidatedBy: request.initiatedBy ?? 'maintenance-orchestrator',
          db: this.deps.db,
          services,
        });

        result.entriesDeduped = consolidationResult.entriesDeactivated;
        result.entriesMerged = consolidationResult.entriesMerged;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ error: errorMsg }, 'Consolidation task failed');
      result.errors = [errorMsg];
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  private async runForgetting(
    request: MaintenanceRequest,
    config: MaintenanceConfig
  ): Promise<ForgettingResult> {
    const startTime = Date.now();
    const result: ForgettingResult = {
      executed: true,
      candidatesFound: 0,
      entriesForgotten: 0,
      byType: {},
      durationMs: 0,
    };

    try {
      const { createForgettingService } = await import('../../../services/forgetting/index.js');
      const forgettingService = createForgettingService({ db: this.deps.db });

      // Analyze candidates first
      const analyzeResult = await forgettingService.analyze({
        scopeType: request.scopeType as 'global' | 'org' | 'project' | 'session',
        scopeId: request.scopeId,
        strategy: config.forgetting.strategy,
        staleDays: config.forgetting.staleDays,
        minAccessCount: config.forgetting.minAccessCount,
        importanceThreshold: config.forgetting.importanceThreshold,
        limit: config.forgetting.maxEntries,
      });

      result.candidatesFound = analyzeResult.candidates.length;

      // Group by type
      for (const candidate of analyzeResult.candidates) {
        const type = candidate.entryType ?? 'unknown';
        result.byType[type] = (result.byType[type] ?? 0) + 1;
      }

      // If not dry run, execute forgetting
      if (!request.dryRun && result.candidatesFound > 0) {
        const forgetResult = await forgettingService.forget({
          scopeType: request.scopeType as 'global' | 'org' | 'project' | 'session',
          scopeId: request.scopeId,
          strategy: config.forgetting.strategy,
          staleDays: config.forgetting.staleDays,
          minAccessCount: config.forgetting.minAccessCount,
          importanceThreshold: config.forgetting.importanceThreshold,
          limit: config.forgetting.maxEntries,
          dryRun: false,
          agentId: request.initiatedBy ?? 'maintenance-orchestrator',
        });

        result.entriesForgotten = forgetResult.stats.forgotten;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ error: errorMsg }, 'Forgetting task failed');
      result.errors = [errorMsg];
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  private async runGraphBackfill(
    request: MaintenanceRequest,
    config: MaintenanceConfig
  ): Promise<GraphBackfillResult> {
    const startTime = Date.now();
    const result: GraphBackfillResult = {
      executed: true,
      entriesProcessed: 0,
      nodesCreated: 0,
      edgesCreated: 0,
      durationMs: 0,
    };

    try {
      if (!this.deps.graphBackfill) {
        logger.debug('Graph backfill skipped: service not available');
        result.executed = false;
        result.durationMs = Date.now() - startTime;
        return result;
      }

      if (request.dryRun) {
        // For dry run, just report what would be processed
        // Could add analysis logic here in future
        result.executed = false;
        result.durationMs = Date.now() - startTime;
        return result;
      }

      const backfillResult = await this.deps.graphBackfill.backfill({
        scopeType: request.scopeType,
        scopeId: request.scopeId,
        maxEntries: config.graphBackfill.maxEntries,
        batchSize: config.graphBackfill.batchSize,
        initiatedBy: request.initiatedBy ?? 'maintenance-orchestrator',
      });

      // Calculate total entries processed from stats
      const stats = backfillResult.stats;
      result.entriesProcessed =
        stats.knowledge.total + stats.guideline.total + stats.tool.total + stats.experience.total;
      result.nodesCreated = backfillResult.totalNodesCreated;
      result.edgesCreated = backfillResult.totalEdgesCreated;

      if (backfillResult.errors && backfillResult.errors.length > 0) {
        result.errors = backfillResult.errors;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ error: errorMsg }, 'Graph backfill task failed');
      result.errors = [errorMsg];
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  private async runLatentPopulation(
    request: MaintenanceRequest,
    config: MaintenanceConfig
  ): Promise<LatentPopulationResult> {
    const startTime = Date.now();
    const result: LatentPopulationResult = {
      executed: true,
      entriesScanned: 0,
      latentMemoriesCreated: 0,
      alreadyPopulated: 0,
      byType: {},
      durationMs: 0,
    };

    try {
      // Check if latent memory service is available
      if (!this.deps.latentMemory || !this.deps.latentMemory.isAvailable()) {
        logger.debug('Latent population skipped: latent memory service not available');
        result.executed = false;
        result.durationMs = Date.now() - startTime;
        return result;
      }

      const latentConfig = config.latentPopulation;
      const scopeType = request.scopeType as 'global' | 'org' | 'project' | 'session';
      const scopeId = request.scopeId;

      // Process each entry type
      for (const entryType of latentConfig.entryTypes) {
        const typeStats = { scanned: 0, created: 0 };

        try {
          // Get entries of this type
          let entries: Array<{ id: string; name?: string; title?: string; content?: string }> = [];

          if (entryType === 'guideline') {
            const guidelines = await this.deps.repos.guidelines.list({ scopeType, scopeId });
            entries = guidelines.slice(0, latentConfig.maxEntries).map((g) => ({
              id: g.id,
              name: g.name,
              content: g.currentVersion?.content ?? undefined,
            }));
          } else if (entryType === 'knowledge') {
            const knowledge = await this.deps.repos.knowledge.list({ scopeType, scopeId });
            entries = knowledge.slice(0, latentConfig.maxEntries).map((k) => ({
              id: k.id,
              title: k.title,
              content: k.currentVersion?.content ?? undefined,
            }));
          } else if (entryType === 'tool') {
            const tools = await this.deps.repos.tools.list({ scopeType, scopeId });
            entries = tools.slice(0, latentConfig.maxEntries).map((t) => ({
              id: t.id,
              name: t.name,
              content: t.currentVersion?.description ?? undefined,
            }));
          }

          // Process entries in batches
          for (let i = 0; i < entries.length; i += latentConfig.batchSize) {
            const batch = entries.slice(i, i + latentConfig.batchSize);

            for (const entry of batch) {
              typeStats.scanned++;
              result.entriesScanned++;

              // Check if latent memory already exists
              const existing = await this.deps.latentMemory.getLatentMemory(entryType, entry.id);
              if (existing) {
                result.alreadyPopulated++;
                continue;
              }

              // Build text for embedding
              const text = entry.content ?? entry.name ?? entry.title ?? '';
              if (!text || text.length < 10) {
                logger.debug(
                  { entryType, entryId: entry.id },
                  'Skipping entry with insufficient text'
                );
                continue;
              }

              // Create latent memory (skip on dry run)
              if (!request.dryRun) {
                try {
                  await this.deps.latentMemory.createLatentMemory({
                    sourceType: entryType as 'tool' | 'guideline' | 'knowledge' | 'experience',
                    sourceId: entry.id,
                    text,
                    importanceScore: latentConfig.defaultImportance,
                  });
                  typeStats.created++;
                  result.latentMemoriesCreated++;
                } catch (createError) {
                  logger.debug(
                    {
                      entryType,
                      entryId: entry.id,
                      error:
                        createError instanceof Error ? createError.message : String(createError),
                    },
                    'Failed to create latent memory for entry'
                  );
                }
              } else {
                // Dry run - just count what would be created
                typeStats.created++;
                result.latentMemoriesCreated++;
              }
            }
          }
        } catch (typeError) {
          const errorMsg = `Failed to process ${entryType}: ${typeError instanceof Error ? typeError.message : String(typeError)}`;
          logger.warn({ entryType, error: errorMsg }, 'Entry type processing failed');
          result.errors = result.errors ?? [];
          result.errors.push(errorMsg);
        }

        result.byType[entryType] = typeStats;
      }

      logger.info(
        {
          scopeType,
          scopeId,
          entriesScanned: result.entriesScanned,
          latentMemoriesCreated: result.latentMemoriesCreated,
          alreadyPopulated: result.alreadyPopulated,
          dryRun: request.dryRun,
        },
        'Latent memory population completed'
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ error: errorMsg }, 'Latent population task failed');
      result.errors = [errorMsg];
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  private async runTagRefinement(
    request: MaintenanceRequest,
    config: MaintenanceConfig
  ): Promise<TagRefinementResult> {
    const startTime = Date.now();
    const result: TagRefinementResult = {
      executed: true,
      entriesScanned: 0,
      entriesTagged: 0,
      tagsAdded: 0,
      alreadyTagged: 0,
      byType: {},
      durationMs: 0,
    };

    try {
      // Check if vector service is available for similarity search
      if (!this.deps.vector || !this.deps.embedding) {
        logger.debug('Tag refinement skipped: vector/embedding service not available');
        result.executed = false;
        result.durationMs = Date.now() - startTime;
        return result;
      }

      const tagConfig = config.tagRefinement;
      const scopeType = request.scopeType as 'global' | 'org' | 'project' | 'session';
      const scopeId = request.scopeId;

      // Process each entry type
      for (const entryType of tagConfig.entryTypes) {
        const typeStats = { scanned: 0, tagged: 0, tagsAdded: 0 };

        try {
          // Get entries of this type
          let entries: Array<{ id: string; name?: string; title?: string; content?: string }> = [];

          if (entryType === 'guideline') {
            const guidelines = await this.deps.repos.guidelines.list({ scopeType, scopeId });
            entries = guidelines.slice(0, tagConfig.maxEntries).map((g) => ({
              id: g.id,
              name: g.name,
              content: g.currentVersion?.content ?? undefined,
            }));
          } else if (entryType === 'knowledge') {
            const knowledge = await this.deps.repos.knowledge.list({ scopeType, scopeId });
            entries = knowledge.slice(0, tagConfig.maxEntries).map((k) => ({
              id: k.id,
              title: k.title,
              content: k.currentVersion?.content ?? undefined,
            }));
          } else if (entryType === 'tool') {
            const tools = await this.deps.repos.tools.list({ scopeType, scopeId });
            entries = tools.slice(0, tagConfig.maxEntries).map((t) => ({
              id: t.id,
              name: t.name,
              content: t.currentVersion?.description ?? undefined,
            }));
          }

          // For each entry, check if it needs tagging
          for (const entry of entries) {
            typeStats.scanned++;
            result.entriesScanned++;

            // Get current tags for this entry
            const currentTags = await this.deps.repos.entryTags.getTagsForEntry(
              entryType,
              entry.id
            );

            // Skip if already well-tagged
            if (currentTags.length >= tagConfig.minTagsThreshold) {
              result.alreadyTagged++;
              continue;
            }

            // Build text for embedding
            const text = entry.content ?? entry.name ?? entry.title ?? '';
            if (!text || text.length < 10) {
              continue;
            }

            // Find similar entries using vector search
            const { embedding: queryEmbedding } = await this.deps.embedding.embed(text);
            const similarResults = await this.deps.vector.searchSimilar(
              queryEmbedding,
              [entryType],
              10 // Get top 10 similar entries
            );

            // Collect tags from similar entries (excluding self)
            const tagCandidates = new Map<string, { count: number; totalScore: number }>();

            for (const similar of similarResults) {
              if (similar.entryId === entry.id) continue; // Skip self
              if (similar.score < tagConfig.similarityThreshold) continue;

              // Get tags from this similar entry
              const similarTags = await this.deps.repos.entryTags.getTagsForEntry(
                entryType,
                similar.entryId
              );

              for (const tag of similarTags) {
                const existing = tagCandidates.get(tag.name);
                if (existing) {
                  existing.count++;
                  existing.totalScore += similar.score;
                } else {
                  tagCandidates.set(tag.name, { count: 1, totalScore: similar.score });
                }
              }
            }

            // Rank tags by combined score (frequency * average similarity)
            const rankedTags = Array.from(tagCandidates.entries())
              .map(([name, stats]) => ({
                name,
                score: stats.count * (stats.totalScore / stats.count),
                avgSimilarity: stats.totalScore / stats.count,
              }))
              .filter((t) => t.avgSimilarity >= tagConfig.minConfidence)
              .sort((a, b) => b.score - a.score)
              .slice(0, tagConfig.maxTagsPerEntry);

            // Apply tags (skip if dry run)
            if (!request.dryRun && rankedTags.length > 0) {
              let tagsAddedForEntry = 0;
              for (const tagCandidate of rankedTags) {
                try {
                  // Get or create tag
                  const tag = await this.deps.repos.tags.getOrCreate(tagCandidate.name);

                  // Check if already attached
                  const existingTags = currentTags.map((t) => t.id);
                  if (existingTags.includes(tag.id)) continue;

                  // Attach tag
                  await this.deps.repos.entryTags.attach({
                    entryType,
                    entryId: entry.id,
                    tagId: tag.id,
                  });

                  tagsAddedForEntry++;
                  typeStats.tagsAdded++;
                  result.tagsAdded++;
                } catch (tagError) {
                  logger.debug(
                    {
                      entryType,
                      entryId: entry.id,
                      tagName: tagCandidate.name,
                      error: tagError instanceof Error ? tagError.message : String(tagError),
                    },
                    'Failed to attach tag'
                  );
                }
              }

              if (tagsAddedForEntry > 0) {
                typeStats.tagged++;
                result.entriesTagged++;
              }
            } else if (request.dryRun && rankedTags.length > 0) {
              // Dry run - just count what would be done
              typeStats.tagged++;
              typeStats.tagsAdded += rankedTags.length;
              result.entriesTagged++;
              result.tagsAdded += rankedTags.length;
            }
          }
        } catch (typeError) {
          const errorMsg = `Failed to process ${entryType}: ${typeError instanceof Error ? typeError.message : String(typeError)}`;
          logger.warn({ entryType, error: errorMsg }, 'Entry type processing failed');
          result.errors = result.errors ?? [];
          result.errors.push(errorMsg);
        }

        result.byType[entryType] = typeStats;
      }

      logger.info(
        {
          scopeType,
          scopeId,
          entriesScanned: result.entriesScanned,
          entriesTagged: result.entriesTagged,
          tagsAdded: result.tagsAdded,
          alreadyTagged: result.alreadyTagged,
          dryRun: request.dryRun,
        },
        'Tag refinement completed'
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ error: errorMsg }, 'Tag refinement task failed');
      result.errors = [errorMsg];
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  private async runSemanticEdgeInference(
    request: MaintenanceRequest,
    config: MaintenanceConfig
  ): Promise<SemanticEdgeInferenceResult> {
    const startTime = Date.now();
    const result: SemanticEdgeInferenceResult = {
      executed: true,
      entriesProcessed: 0,
      comparisonsComputed: 0,
      pairsAboveThreshold: 0,
      edgesCreated: 0,
      edgesExisting: 0,
      edgesSkipped: 0,
      durationMs: 0,
    };

    try {
      // Check if semantic edge inference service is available
      if (!this.deps.semanticEdgeInference) {
        logger.debug('Semantic edge inference skipped: service not available');
        result.executed = false;
        result.durationMs = Date.now() - startTime;
        return result;
      }

      // Run inference
      const inferenceResult = await this.deps.semanticEdgeInference.inferEdges({
        scopeType: request.scopeType,
        scopeId: request.scopeId,
        dryRun: request.dryRun,
        initiatedBy: request.initiatedBy ?? 'maintenance-orchestrator',
        configOverrides: {
          enabled: config.semanticEdgeInference.enabled,
          similarityThreshold: config.semanticEdgeInference.similarityThreshold,
          maxEdgesPerEntry: config.semanticEdgeInference.maxEdgesPerEntry,
          entryTypes: config.semanticEdgeInference.entryTypes,
          maxEntriesPerRun: config.semanticEdgeInference.maxEntries,
        },
      });

      // Map results
      result.entriesProcessed = inferenceResult.stats.entriesProcessed;
      result.comparisonsComputed = inferenceResult.stats.comparisonsComputed;
      result.pairsAboveThreshold = inferenceResult.stats.pairsAboveThreshold;
      result.edgesCreated = inferenceResult.stats.edgesCreated;
      result.edgesExisting = inferenceResult.stats.edgesExisting;
      result.edgesSkipped = inferenceResult.stats.edgesSkipped;

      if (inferenceResult.errors && inferenceResult.errors.length > 0) {
        result.errors = inferenceResult.errors;
      }

      logger.info(
        {
          scopeType: request.scopeType,
          scopeId: request.scopeId,
          entriesProcessed: result.entriesProcessed,
          comparisonsComputed: result.comparisonsComputed,
          pairsAboveThreshold: result.pairsAboveThreshold,
          edgesCreated: result.edgesCreated,
          edgesExisting: result.edgesExisting,
          edgesSkipped: result.edgesSkipped,
          dryRun: request.dryRun,
        },
        'Semantic edge inference completed'
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ error: errorMsg }, 'Semantic edge inference task failed');
      result.errors = [errorMsg];
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  private async runToolTagAssignment(
    request: MaintenanceRequest,
    config: MaintenanceConfig
  ): Promise<ToolTagAssignmentResult> {
    const startTime = Date.now();
    const result: ToolTagAssignmentResult = {
      executed: true,
      entriesScanned: 0,
      entriesTagged: 0,
      tagsAdded: 0,
      entriesSkipped: 0,
      byType: {},
      durationMs: 0,
    };

    try {
      if (!this.deps.extraction) {
        logger.debug('Tool tag assignment skipped: extraction service not available');
        result.executed = false;
        result.durationMs = Date.now() - startTime;
        return result;
      }

      const { runToolTagAssignment } = await import('./tool-tag-assignment.js');

      const taskResult = await runToolTagAssignment(
        {
          repos: this.deps.repos,
          extractionService: this.deps.extraction,
        },
        {
          scopeType: request.scopeType,
          scopeId: request.scopeId,
          dryRun: request.dryRun,
          initiatedBy: request.initiatedBy,
        },
        config.toolTagAssignment
      );

      return taskResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ error: errorMsg }, 'Tool tag assignment task failed');
      result.errors = [errorMsg];
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  private async runEmbeddingCleanup(
    request: MaintenanceRequest,
    config: MaintenanceConfig
  ): Promise<EmbeddingCleanupResult> {
    const startTime = Date.now();
    const result: EmbeddingCleanupResult = {
      executed: true,
      orphansFound: 0,
      recordsDeleted: 0,
      vectorsRemoved: 0,
      byType: {},
      durationMs: 0,
    };

    try {
      const { runEmbeddingCleanup: executeCleanup } = await import('./embedding-cleanup.js');

      const cleanupResult = await executeCleanup(
        {
          db: this.deps.db,
          vector: this.deps.vector,
        },
        {
          scopeType: request.scopeType,
          scopeId: request.scopeId,
          dryRun: request.dryRun,
          initiatedBy: request.initiatedBy,
        },
        config.embeddingCleanup
      );

      return cleanupResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ error: errorMsg }, 'Embedding cleanup task failed');
      result.errors = [errorMsg];
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  // ===========================================================================
  // HEALTH SCORE COMPUTATION
  // ===========================================================================

  private async computeFreshnessScore(_scopeType: string, _scopeId?: string): Promise<number> {
    // Calculate based on last access times
    // Score higher if entries have been accessed recently
    try {
      // Simple heuristic: count entries accessed in last 30 days vs total
      // Full implementation would query access logs
      return 70; // Placeholder - implement with actual data
    } catch {
      return 50;
    }
  }

  private async computeDiversityScore(scopeType: string, scopeId?: string): Promise<number> {
    // Calculate based on entry type and category distribution
    try {
      const counts = {
        guidelines: 0,
        knowledge: 0,
        tools: 0,
        experiences: 0,
      };

      // Count entries by type (filters don't support limit, but that's ok for counts)
      const guidelines = await this.deps.repos.guidelines.list({
        scopeType: scopeType as 'global' | 'org' | 'project' | 'session',
        scopeId,
      });
      counts.guidelines = guidelines.length;

      const knowledge = await this.deps.repos.knowledge.list({
        scopeType: scopeType as 'global' | 'org' | 'project' | 'session',
        scopeId,
      });
      counts.knowledge = knowledge.length;

      const tools = await this.deps.repos.tools.list({
        scopeType: scopeType as 'global' | 'org' | 'project' | 'session',
        scopeId,
      });
      counts.tools = tools.length;

      const total = counts.guidelines + counts.knowledge + counts.tools;
      if (total === 0) return 0;

      // Calculate entropy-based diversity
      const types = Object.values(counts).filter((c) => c > 0);
      if (types.length <= 1) return 30; // Low diversity if only one type

      const entropy = types.reduce((sum, count) => {
        const p = count / total;
        return sum - p * Math.log2(p);
      }, 0);

      // Normalize to 0-100 (max entropy for 4 types is 2)
      return Math.round((entropy / 2) * 100);
    } catch {
      return 50;
    }
  }

  private async computeConnectivityScore(scopeType: string, scopeId?: string): Promise<number> {
    // Calculate based on graph edge coverage within the scope
    try {
      if (!this.deps.repos.graphNodes || !this.deps.repos.graphEdges) {
        return 0; // No graph service
      }

      // Use high limit to get all nodes/edges for accurate connectivity scoring
      // (default pagination of 20 would give incorrect results)
      const paginationOverride = { limit: 10000, offset: 0 };

      const nodes = await this.deps.repos.graphNodes.list(
        {
          scopeType: scopeType as 'global' | 'org' | 'project' | 'session',
          scopeId,
        },
        paginationOverride
      );

      if (nodes.length === 0) return 0;

      // Build set of node IDs in this scope for efficient lookup
      const scopeNodeIds = new Set(nodes.map((n) => n.id));

      // Get all edges and filter based on connectivity mode
      const allEdges = await this.deps.repos.graphEdges.list({}, paginationOverride);
      const connectivityMode = this.config.health?.connectivityMode ?? 'inclusive';

      const scopeEdges = allEdges.filter((e) => {
        const sourceInScope = scopeNodeIds.has(e.sourceId);
        const targetInScope = scopeNodeIds.has(e.targetId);

        if (connectivityMode === 'strict') {
          // Strict: both endpoints must be in scope
          return sourceInScope && targetInScope;
        } else {
          // Inclusive (default): at least one endpoint in scope
          return sourceInScope || targetInScope;
        }
      });

      // Ratio of edges to nodes (ideal is ~2-3 edges per node)
      const ratio = scopeEdges.length / nodes.length;
      const normalizedScore = Math.min(100, Math.round(ratio * 40));

      return normalizedScore;
    } catch {
      return 0;
    }
  }

  private async computeQualityScore(scopeType: string, scopeId?: string): Promise<number> {
    // Calculate based on confidence scores and validation
    try {
      let totalConfidence = 0;
      let count = 0;

      // Get knowledge entries for confidence scores
      const knowledge = await this.deps.repos.knowledge.list({
        scopeType: scopeType as 'global' | 'org' | 'project' | 'session',
        scopeId,
      });

      // Sample first 100 for performance
      const sample = knowledge.slice(0, 100);
      for (const entry of sample) {
        if (entry.currentVersion?.confidence) {
          totalConfidence += entry.currentVersion.confidence;
          count++;
        }
      }

      if (count === 0) return 70; // Default if no confidence data

      return Math.round((totalConfidence / count) * 100);
    } catch {
      return 50;
    }
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private mergeConfig(overrides?: Partial<MaintenanceConfig>): MaintenanceConfig {
    if (!overrides) return this.config;

    return {
      ...this.config,
      ...overrides,
      consolidation: {
        ...this.config.consolidation,
        ...overrides.consolidation,
      },
      forgetting: {
        ...this.config.forgetting,
        ...overrides.forgetting,
      },
      graphBackfill: {
        ...this.config.graphBackfill,
        ...overrides.graphBackfill,
      },
      latentPopulation: {
        ...this.config.latentPopulation,
        ...overrides.latentPopulation,
      },
      tagRefinement: {
        ...this.config.tagRefinement,
        ...overrides.tagRefinement,
      },
      semanticEdgeInference: {
        ...this.config.semanticEdgeInference,
        ...overrides.semanticEdgeInference,
      },
      toolTagAssignment: {
        ...this.config.toolTagAssignment,
        ...overrides.toolTagAssignment,
      },
      embeddingCleanup: {
        ...this.config.embeddingCleanup,
        ...overrides.embeddingCleanup,
      },
    };
  }
}

/**
 * Create a maintenance orchestrator
 */
export function createMaintenanceOrchestrator(
  deps: MaintenanceOrchestratorDeps,
  config?: Partial<MaintenanceConfig>
): MaintenanceOrchestrator {
  return new MaintenanceOrchestrator(deps, config);
}
