/**
 * Semantic Edge Inference Service
 *
 * Automatically creates `related_to` edges between semantically similar
 * entries based on embedding cosine similarity. This helps populate the
 * knowledge graph with meaningful relationships discovered from content.
 *
 * Key features:
 * - Compares all entry pairs within a scope
 * - Creates edges for pairs above similarity threshold
 * - Respects max edges per entry to prevent explosion
 * - Idempotent - skips existing edges
 * - Dry run mode for preview
 */

import { v4 as uuidv4 } from 'uuid';
import { createComponentLogger } from '../../utils/logger.js';
import type {
  SemanticEdgeInferenceConfig,
  SemanticEdgeInferenceRequest,
  SemanticEdgeInferenceResult,
  SemanticEdgeInferenceStats,
  EntryWithEmbedding,
  SimilarityPair,
} from './semantic-edge-inference.types.js';
import { DEFAULT_SEMANTIC_EDGE_CONFIG } from './semantic-edge-inference.types.js';

const logger = createComponentLogger('semantic-edge-inference');

// =============================================================================
// DEPENDENCIES INTERFACE
// =============================================================================

export interface SemanticEdgeInferenceDeps {
  /**
   * Get entries with embeddings for a scope
   */
  getEntriesWithEmbeddings: (params: {
    scopeType: string;
    scopeId?: string;
    entryTypes: Array<'tool' | 'guideline' | 'knowledge' | 'experience'>;
    limit?: number;
    offset?: number;
  }) => Promise<EntryWithEmbedding[]>;

  /**
   * Create an edge between two entries
   */
  createEdge: (params: {
    sourceEntryId: string;
    sourceEntryType: string;
    targetEntryId: string;
    targetEntryType: string;
    relationType: string;
    weight?: number;
    createdBy?: string;
  }) => Promise<{ created: boolean; edgeId?: string }>;

  /**
   * Check if an edge already exists
   */
  edgeExists: (params: {
    sourceEntryId: string;
    sourceEntryType: string;
    targetEntryId: string;
    targetEntryType: string;
    relationType: string;
  }) => Promise<boolean>;
}

// =============================================================================
// SERVICE
// =============================================================================

export class SemanticEdgeInferenceService {
  private config: SemanticEdgeInferenceConfig;
  private deps: SemanticEdgeInferenceDeps;

  constructor(deps: SemanticEdgeInferenceDeps, config?: Partial<SemanticEdgeInferenceConfig>) {
    this.deps = deps;
    this.config = { ...DEFAULT_SEMANTIC_EDGE_CONFIG, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SemanticEdgeInferenceConfig {
    return { ...this.config };
  }

  /**
   * Compute cosine similarity between two vectors
   */
  computeSimilarity(v1: number[], v2: number[]): number {
    if (v1.length !== v2.length || v1.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < v1.length; i++) {
      const a = v1[i] ?? 0;
      const b = v2[i] ?? 0;
      dotProduct += a * b;
      mag1 += a * a;
      mag2 += b * b;
    }

    const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
    if (magnitude === 0) {
      return 0;
    }

    return dotProduct / magnitude;
  }

  /**
   * Infer and create edges between semantically similar entries
   */
  async inferEdges(request: SemanticEdgeInferenceRequest): Promise<SemanticEdgeInferenceResult> {
    const runId = request.runId ?? uuidv4();
    const startedAt = new Date().toISOString();
    const effectiveConfig = { ...this.config, ...request.configOverrides };

    const stats: SemanticEdgeInferenceStats = {
      entriesProcessed: 0,
      comparisonsComputed: 0,
      pairsAboveThreshold: 0,
      edgesCreated: 0,
      edgesExisting: 0,
      edgesSkipped: 0,
      edgesFailed: 0,
    };

    const errors: string[] = [];
    const sampleEdges: SemanticEdgeInferenceResult['sampleEdges'] = [];

    // Return early if disabled
    if (!effectiveConfig.enabled) {
      logger.info({ runId }, 'Semantic edge inference is disabled');
      return this.buildResult(
        runId,
        request.dryRun ?? false,
        stats,
        startedAt,
        errors,
        sampleEdges
      );
    }

    logger.info(
      {
        runId,
        scopeType: request.scopeType,
        scopeId: request.scopeId,
        dryRun: request.dryRun,
        threshold: effectiveConfig.similarityThreshold,
        maxEdgesPerEntry: effectiveConfig.maxEdgesPerEntry,
      },
      'Starting semantic edge inference'
    );

    try {
      // Fetch all entries with embeddings
      const entries = await this.deps.getEntriesWithEmbeddings({
        scopeType: request.scopeType,
        scopeId: request.scopeId,
        entryTypes: effectiveConfig.entryTypes,
        limit: effectiveConfig.maxEntriesPerRun > 0 ? effectiveConfig.maxEntriesPerRun : undefined,
      });

      stats.entriesProcessed = entries.length;

      if (entries.length < 2) {
        logger.info({ runId, entriesFound: entries.length }, 'Not enough entries for comparison');
        return this.buildResult(
          runId,
          request.dryRun ?? false,
          stats,
          startedAt,
          errors,
          sampleEdges
        );
      }

      // Find all similar pairs
      const similarPairs = this.findSimilarPairs(entries, effectiveConfig.similarityThreshold);
      stats.comparisonsComputed = (entries.length * (entries.length - 1)) / 2;
      stats.pairsAboveThreshold = similarPairs.length;

      logger.info(
        {
          runId,
          entriesProcessed: entries.length,
          comparisons: stats.comparisonsComputed,
          pairsAboveThreshold: similarPairs.length,
        },
        'Similarity computation complete'
      );

      // If dry run, just return stats
      if (request.dryRun) {
        // Add sample edges for preview
        for (const pair of similarPairs.slice(0, 10)) {
          sampleEdges.push({
            sourceId: pair.sourceId,
            sourceType: pair.sourceType,
            targetId: pair.targetId,
            targetType: pair.targetType,
            similarity: pair.similarity,
          });
        }
        return this.buildResult(runId, true, stats, startedAt, errors, sampleEdges);
      }

      // Track edges per entry to enforce limit
      const edgesPerEntry = new Map<string, number>();

      // Sort by similarity descending to prioritize strongest relationships
      similarPairs.sort((a, b) => b.similarity - a.similarity);

      // Create edges
      for (const pair of similarPairs) {
        const sourceKey = `${pair.sourceType}:${pair.sourceId}`;
        const targetKey = `${pair.targetType}:${pair.targetId}`;

        // Check max edges per entry limit
        const sourceEdges = edgesPerEntry.get(sourceKey) ?? 0;
        const targetEdges = edgesPerEntry.get(targetKey) ?? 0;

        if (
          sourceEdges >= effectiveConfig.maxEdgesPerEntry ||
          targetEdges >= effectiveConfig.maxEdgesPerEntry
        ) {
          stats.edgesSkipped++;
          continue;
        }

        try {
          // Check if edge already exists
          const exists = await this.deps.edgeExists({
            sourceEntryId: pair.sourceId,
            sourceEntryType: pair.sourceType,
            targetEntryId: pair.targetId,
            targetEntryType: pair.targetType,
            relationType: 'related_to',
          });

          if (exists) {
            stats.edgesExisting++;
            continue;
          }

          // Create edge
          const result = await this.deps.createEdge({
            sourceEntryId: pair.sourceId,
            sourceEntryType: pair.sourceType,
            targetEntryId: pair.targetId,
            targetEntryType: pair.targetType,
            relationType: 'related_to',
            weight: pair.similarity,
            createdBy: request.initiatedBy ?? 'semantic-inference',
          });

          if (result.created) {
            stats.edgesCreated++;
            edgesPerEntry.set(sourceKey, sourceEdges + 1);
            edgesPerEntry.set(targetKey, targetEdges + 1);

            // Collect samples
            if (sampleEdges.length < 10) {
              sampleEdges.push({
                sourceId: pair.sourceId,
                sourceType: pair.sourceType,
                targetId: pair.targetId,
                targetType: pair.targetType,
                similarity: pair.similarity,
              });
            }
          }
        } catch (error) {
          stats.edgesFailed++;
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error creating edge';
          errors.push(
            `Failed to create edge ${pair.sourceId} -> ${pair.targetId}: ${errorMessage}`
          );
          logger.warn({ runId, pair, error: errorMessage }, 'Edge creation failed');
        }
      }

      logger.info(
        {
          runId,
          edgesCreated: stats.edgesCreated,
          edgesExisting: stats.edgesExisting,
          edgesSkipped: stats.edgesSkipped,
          edgesFailed: stats.edgesFailed,
        },
        'Semantic edge inference complete'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Inference failed: ${errorMessage}`);
      logger.error({ runId, error: errorMessage }, 'Semantic edge inference failed');
    }

    return this.buildResult(runId, request.dryRun ?? false, stats, startedAt, errors, sampleEdges);
  }

  /**
   * Find all pairs of entries above similarity threshold
   */
  private findSimilarPairs(entries: EntryWithEmbedding[], threshold: number): SimilarityPair[] {
    const pairs: SimilarityPair[] = [];

    for (let i = 0; i < entries.length; i++) {
      const e1 = entries[i];
      if (!e1) continue;

      for (let j = i + 1; j < entries.length; j++) {
        const e2 = entries[j];
        if (!e2) continue;

        const similarity = this.computeSimilarity(e1.embedding, e2.embedding);

        if (similarity >= threshold) {
          pairs.push({
            sourceId: e1.entryId,
            sourceType: e1.entryType,
            targetId: e2.entryId,
            targetType: e2.entryType,
            similarity,
          });
        }
      }
    }

    return pairs;
  }

  /**
   * Build result object
   */
  private buildResult(
    runId: string,
    dryRun: boolean,
    stats: SemanticEdgeInferenceStats,
    startedAt: string,
    errors: string[],
    sampleEdges?: SemanticEdgeInferenceResult['sampleEdges']
  ): SemanticEdgeInferenceResult {
    const completedAt = new Date().toISOString();
    const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

    return {
      runId,
      dryRun,
      stats,
      timing: {
        startedAt,
        completedAt,
        durationMs,
      },
      errors,
      sampleEdges,
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createSemanticEdgeInferenceService(
  deps: SemanticEdgeInferenceDeps,
  config?: Partial<SemanticEdgeInferenceConfig>
): SemanticEdgeInferenceService {
  return new SemanticEdgeInferenceService(deps, config);
}
