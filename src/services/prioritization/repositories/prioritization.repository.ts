/**
 * Prioritization Repository
 *
 * Provides data access for the smart prioritization service:
 * - Outcome data aggregation by intent and type
 * - Usefulness metrics for entries
 * - Similar successful query contexts
 */

import { eq, and, gte, sql, inArray } from 'drizzle-orm';
import type { DrizzleDb } from '../../../db/index.js';
import {
  memoryRetrievals,
  taskOutcomes,
  retrievalOutcomes,
  extractionOutcomes,
} from '../../../db/schema/feedback.js';
import type { OutcomeAggregation } from '../calculators/adaptive-weights.calculator.js';
import type { UsefulnessMetrics, SuccessfulContext } from '../types.js';
import type { QueryIntent } from '../../query-rewrite/types.js';
import type { QueryEntryType } from '../../query/pipeline.js';

// =============================================================================
// PRIORITIZATION REPOSITORY
// =============================================================================

/**
 * Repository for prioritization-related data access.
 */
export class PrioritizationRepository {
  constructor(private readonly db: DrizzleDb) {}

  /**
   * Aggregates outcome data by intent and entry type.
   *
   * @param intent - Query intent to filter by
   * @param scopeId - Scope ID to filter by
   * @param lookbackDays - Number of days to look back
   * @returns Aggregated outcome data
   */
  async getOutcomesByIntentAndType(
    _intent: QueryIntent,
    _scopeId: string,
    lookbackDays: number
  ): Promise<OutcomeAggregation> {
    const lookbackDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    // Query outcome data grouped by entry type
    // Note: We join memory_retrievals → retrieval_outcomes → task_outcomes
    // to get the full picture of which entry types succeed in different contexts
    const results = this.db
      .select({
        entryType: memoryRetrievals.entryType,
        totalRetrievals: sql<number>`COUNT(*)`,
        successCount: sql<number>`SUM(CASE WHEN ${taskOutcomes.outcomeType} = 'success' THEN 1 ELSE 0 END)`,
        partialCount: sql<number>`SUM(CASE WHEN ${taskOutcomes.outcomeType} = 'partial' THEN 1 ELSE 0 END)`,
        failureCount: sql<number>`SUM(CASE WHEN ${taskOutcomes.outcomeType} = 'failure' THEN 1 ELSE 0 END)`,
      })
      .from(memoryRetrievals)
      .innerJoin(retrievalOutcomes, eq(retrievalOutcomes.retrievalId, memoryRetrievals.id))
      .innerJoin(taskOutcomes, eq(taskOutcomes.id, retrievalOutcomes.outcomeId))
      .where(gte(memoryRetrievals.retrievedAt, lookbackDate))
      .groupBy(memoryRetrievals.entryType)
      .all();

    // Calculate totals and success rates
    let totalSamples = 0;
    const byType: OutcomeAggregation['byType'] = [];

    for (const row of results) {
      const total = Number(row.totalRetrievals) || 0;
      const success = Number(row.successCount) || 0;
      const partial = Number(row.partialCount) || 0;
      const failure = Number(row.failureCount) || 0;

      totalSamples += total;

      // Success rate includes partial as half
      const successRate = total > 0 ? (success + partial * 0.5) / total : 0;

      byType.push({
        entryType: row.entryType as QueryEntryType,
        totalRetrievals: total,
        successCount: success,
        partialCount: partial,
        failureCount: failure,
        successRate,
      });
    }

    return {
      totalSamples,
      byType,
    };
  }

  /**
   * Gets usefulness metrics for a batch of entries.
   *
   * @param entryIds - Entry IDs to get metrics for
   * @returns Map of entry ID to usefulness metrics
   */
  async getUsefulnessMetrics(entryIds: string[]): Promise<Map<string, UsefulnessMetrics>> {
    if (entryIds.length === 0) {
      return new Map();
    }

    // Query extraction outcomes for retrieval/success metrics
    const results = this.db
      .select({
        entryId: extractionOutcomes.entryId,
        retrievalCount: extractionOutcomes.retrievalCount,
        successCount: extractionOutcomes.successCount,
        lastSuccessAt: extractionOutcomes.lastRetrievedAt,
        lastAccessAt: extractionOutcomes.evaluatedAt,
      })
      .from(extractionOutcomes)
      .where(inArray(extractionOutcomes.entryId, entryIds))
      .all();

    return new Map(
      results.map((row) => [
        row.entryId,
        {
          entryId: row.entryId,
          retrievalCount: row.retrievalCount ?? 0,
          successCount: row.successCount ?? 0,
          lastSuccessAt: row.lastSuccessAt,
          lastAccessAt: row.lastAccessAt,
        },
      ])
    );
  }

  /**
   * Finds similar successful query contexts using vector similarity.
   *
   * @param queryEmbedding - Current query embedding
   * @param similarityThreshold - Minimum similarity score
   * @param maxResults - Maximum number of results
   * @returns Array of successful contexts
   */
  async findSimilarSuccessfulContexts(
    queryEmbedding: number[],
    similarityThreshold: number,
    maxResults: number
  ): Promise<SuccessfulContext[]> {
    if (queryEmbedding.length === 0) {
      return [];
    }

    // Note: This is a simplified implementation. In production, you would:
    // 1. Use a vector database (e.g., vec0, sqlite-vss) for efficient similarity search
    // 2. Or compute cosine similarity in application code for small datasets
    //
    // For now, we query successful retrievals and compute similarity in-memory
    // This works for moderate dataset sizes but should be replaced with vector search

    const results = this.db
      .select({
        queryEmbedding: memoryRetrievals.queryEmbedding,
        entryId: memoryRetrievals.entryId,
        retrievedAt: memoryRetrievals.retrievedAt,
      })
      .from(memoryRetrievals)
      .innerJoin(retrievalOutcomes, eq(retrievalOutcomes.retrievalId, memoryRetrievals.id))
      .innerJoin(taskOutcomes, eq(taskOutcomes.id, retrievalOutcomes.outcomeId))
      .where(
        and(
          eq(taskOutcomes.outcomeType, 'success'),
          sql`${memoryRetrievals.queryEmbedding} IS NOT NULL`
        )
      )
      .limit(maxResults * 10) // Fetch extra to filter by similarity
      .all();

    // Group by query embedding and compute similarity
    const contextMap = new Map<
      string,
      { embedding: number[]; entryIds: string[]; occurredAt: string }
    >();

    for (const row of results) {
      if (!row.queryEmbedding) continue;

      try {
        const embedding = JSON.parse(row.queryEmbedding) as number[];
        const embeddingKey = row.queryEmbedding;

        const existing = contextMap.get(embeddingKey);
        if (existing) {
          existing.entryIds.push(row.entryId);
        } else {
          contextMap.set(embeddingKey, {
            embedding,
            entryIds: [row.entryId],
            occurredAt: row.retrievedAt,
          });
        }
      } catch {
        // Skip invalid embeddings
      }
    }

    // Compute similarity and filter
    const contexts: SuccessfulContext[] = [];

    for (const [, context] of contextMap) {
      const similarity = cosineSimilarity(queryEmbedding, context.embedding);

      if (similarity >= similarityThreshold) {
        contexts.push({
          queryEmbedding: context.embedding,
          successfulEntryIds: context.entryIds,
          similarityScore: similarity,
          occurredAt: context.occurredAt,
        });
      }

      if (contexts.length >= maxResults) {
        break;
      }
    }

    // Sort by similarity descending
    contexts.sort((a, b) => b.similarityScore - a.similarityScore);

    return contexts.slice(0, maxResults);
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Computes cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates a PrioritizationRepository instance.
 *
 * @param db - Drizzle database instance
 * @returns PrioritizationRepository instance
 */
export function createPrioritizationRepository(db: DrizzleDb): PrioritizationRepository {
  return new PrioritizationRepository(db);
}
