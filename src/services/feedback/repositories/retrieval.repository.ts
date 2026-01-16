/**
 * Retrieval Repository
 *
 * CRUD operations for memory_retrievals table
 */

import { eq, and, desc, gte, lte, inArray } from 'drizzle-orm';
import type { DrizzleDb } from '../../../db/repositories/base.js';
import { generateId, now } from '../../../db/repositories/base.js';
import {
  memoryRetrievals,
  retrievalOutcomes,
  taskOutcomes,
  type MemoryRetrieval,
  type NewMemoryRetrieval,
} from '../../../db/schema/feedback.js';
import type { RecordRetrievalParams } from '../types.js';
import { createComponentLogger } from '../../../utils/logger.js';

const logger = createComponentLogger('feedback:retrieval-repo');

// =============================================================================
// RETRIEVAL REPOSITORY
// =============================================================================

export class RetrievalRepository {
  constructor(private db: DrizzleDb) {}

  /**
   * Create a new retrieval record
   */
  async create(params: RecordRetrievalParams): Promise<string> {
    const id = generateId();

    const newRetrieval: NewMemoryRetrieval = {
      id,
      sessionId: params.sessionId,
      queryText: params.queryText,
      queryEmbedding: params.queryEmbedding,
      entryType: params.entryType,
      entryId: params.entryId,
      retrievalRank: params.retrievalRank,
      retrievalScore: params.retrievalScore,
      retrievedAt: now(),
    };

    this.db.insert(memoryRetrievals).values(newRetrieval).run();

    logger.debug(
      { id, sessionId: params.sessionId, entryType: params.entryType },
      'Retrieval recorded'
    );

    return id;
  }

  /**
   * Create multiple retrieval records in batch
   */
  async createBatch(params: RecordRetrievalParams[]): Promise<string[]> {
    if (params.length === 0) {
      return [];
    }

    const ids: string[] = [];
    const retrievals: NewMemoryRetrieval[] = params.map((p) => {
      const id = generateId();
      ids.push(id);

      return {
        id,
        sessionId: p.sessionId,
        queryText: p.queryText,
        queryEmbedding: p.queryEmbedding,
        entryType: p.entryType,
        entryId: p.entryId,
        retrievalRank: p.retrievalRank,
        retrievalScore: p.retrievalScore,
        retrievedAt: now(),
      };
    });

    this.db.insert(memoryRetrievals).values(retrievals).run();

    logger.debug(
      { count: ids.length, sessionId: params[0]?.sessionId },
      'Batch retrievals recorded'
    );

    return ids;
  }

  /**
   * Get all retrievals for a session
   */
  async getBySession(sessionId: string): Promise<MemoryRetrieval[]> {
    const retrievals = this.db
      .select()
      .from(memoryRetrievals)
      .where(eq(memoryRetrievals.sessionId, sessionId))
      .orderBy(desc(memoryRetrievals.retrievedAt))
      .all();

    return retrievals;
  }

  /**
   * Get all retrievals for a specific entry
   */
  async getByEntry(
    entryType: MemoryRetrieval['entryType'],
    entryId: string
  ): Promise<MemoryRetrieval[]> {
    const retrievals = this.db
      .select()
      .from(memoryRetrievals)
      .where(and(eq(memoryRetrievals.entryType, entryType), eq(memoryRetrievals.entryId, entryId)))
      .orderBy(desc(memoryRetrievals.retrievedAt))
      .all();

    return retrievals;
  }

  /**
   * Get retrievals not yet linked to outcomes (for a session)
   */
  async getUnlinked(sessionId: string): Promise<MemoryRetrieval[]> {
    // Subquery to get retrieval IDs that are already linked
    const linkedRetrievalIds = this.db
      .select({ retrievalId: retrievalOutcomes.retrievalId })
      .from(retrievalOutcomes)
      .all()
      .map((r) => r.retrievalId);

    // Get retrievals for this session that aren't in the linked set
    const allRetrievals = await this.getBySession(sessionId);
    const unlinked = allRetrievals.filter((r) => !linkedRetrievalIds.includes(r.id));

    return unlinked;
  }

  /**
   * Get a specific retrieval by ID
   */
  async getById(id: string): Promise<MemoryRetrieval | undefined> {
    const retrieval = this.db
      .select()
      .from(memoryRetrievals)
      .where(eq(memoryRetrievals.id, id))
      .get();

    return retrieval;
  }

  /**
   * Count retrievals for an entry
   */
  async countByEntry(entryType: MemoryRetrieval['entryType'], entryId: string): Promise<number> {
    const retrievals = await this.getByEntry(entryType, entryId);
    return retrievals.length;
  }

  /**
   * Get retrievals within a date range
   */
  async getByDateRange(startDate: string, endDate: string): Promise<MemoryRetrieval[]> {
    const retrievals = this.db
      .select()
      .from(memoryRetrievals)
      .where(
        and(
          // SQLite string comparison works for ISO timestamps
          gte(memoryRetrievals.retrievedAt, startDate),
          lte(memoryRetrievals.retrievedAt, endDate)
        )
      )
      .orderBy(desc(memoryRetrievals.retrievedAt))
      .all();

    return retrievals;
  }
}

/**
 * Feedback score for an entry (positive/negative count from task outcomes)
 */
export interface EntryFeedbackScore {
  positiveCount: number;
  negativeCount: number;
  netScore: number;
}

/**
 * Get aggregated feedback scores for a memory entry.
 *
 * This joins through:
 * - memory_retrievals (to find retrievals of this entry)
 * - retrieval_outcomes (to link retrievals to outcomes)
 * - task_outcomes (to get success/failure status)
 *
 * A positive outcome contributes +1, a failure outcome contributes -1.
 * Partial outcomes contribute +0.5.
 */
export async function getEntryFeedback(
  db: DrizzleDb,
  entryType: MemoryRetrieval['entryType'],
  entryId: string
): Promise<EntryFeedbackScore> {
  // Get all retrievals for this entry
  const entryRetrievals = db
    .select({ id: memoryRetrievals.id })
    .from(memoryRetrievals)
    .where(and(eq(memoryRetrievals.entryType, entryType), eq(memoryRetrievals.entryId, entryId)))
    .all();

  if (entryRetrievals.length === 0) {
    return { positiveCount: 0, negativeCount: 0, netScore: 0 };
  }

  const retrievalIds = entryRetrievals.map((r) => r.id);

  // Get all retrieval-outcome links for these retrievals
  const links = db
    .select({
      retrievalId: retrievalOutcomes.retrievalId,
      outcomeId: retrievalOutcomes.outcomeId,
      contributionScore: retrievalOutcomes.contributionScore,
    })
    .from(retrievalOutcomes)
    .where(inArray(retrievalOutcomes.retrievalId, retrievalIds))
    .all();

  if (links.length === 0) {
    return { positiveCount: 0, negativeCount: 0, netScore: 0 };
  }

  // Get unique outcome IDs
  const outcomeIds = [...new Set(links.map((l) => l.outcomeId))];

  // Fetch the outcomes
  const outcomes = db
    .select({
      id: taskOutcomes.id,
      outcomeType: taskOutcomes.outcomeType,
    })
    .from(taskOutcomes)
    .where(inArray(taskOutcomes.id, outcomeIds))
    .all();

  // Build a map of outcome ID -> outcome type
  const outcomeTypeMap = new Map(outcomes.map((o) => [o.id, o.outcomeType]));

  // Count positive and negative outcomes
  let positiveCount = 0;
  let negativeCount = 0;

  for (const link of links) {
    const outcomeType = outcomeTypeMap.get(link.outcomeId);
    if (!outcomeType) continue;

    if (outcomeType === 'success') {
      positiveCount++;
    } else if (outcomeType === 'failure') {
      negativeCount++;
    } else if (outcomeType === 'partial') {
      // Partial counts as 0.5 positive (we'll round at the end)
      positiveCount += 0.5;
    }
    // 'unknown' outcomes don't contribute
  }

  // Round the counts in case of partial contributions
  positiveCount = Math.round(positiveCount);
  negativeCount = Math.round(negativeCount);

  return {
    positiveCount,
    negativeCount,
    netScore: positiveCount - negativeCount,
  };
}

/**
 * Get feedback scores for multiple entries in batch.
 * More efficient than calling getEntryFeedback for each entry.
 */
export async function getEntryFeedbackBatch(
  db: DrizzleDb,
  entries: Array<{ entryType: MemoryRetrieval['entryType']; entryId: string }>
): Promise<Map<string, EntryFeedbackScore>> {
  const result = new Map<string, EntryFeedbackScore>();

  if (entries.length === 0) {
    return result;
  }

  // Initialize all entries with zero scores
  for (const entry of entries) {
    result.set(entry.entryId, { positiveCount: 0, negativeCount: 0, netScore: 0 });
  }

  // Get all entry IDs
  const entryIds = entries.map((e) => e.entryId);

  // Get all retrievals for these entries
  const entryRetrievals = db
    .select({
      id: memoryRetrievals.id,
      entryId: memoryRetrievals.entryId,
    })
    .from(memoryRetrievals)
    .where(inArray(memoryRetrievals.entryId, entryIds))
    .all();

  if (entryRetrievals.length === 0) {
    return result;
  }

  // Build a map of retrieval ID -> entry ID
  const retrievalToEntry = new Map(entryRetrievals.map((r) => [r.id, r.entryId]));
  const retrievalIds = entryRetrievals.map((r) => r.id);

  // Get all retrieval-outcome links
  const links = db
    .select({
      retrievalId: retrievalOutcomes.retrievalId,
      outcomeId: retrievalOutcomes.outcomeId,
    })
    .from(retrievalOutcomes)
    .where(inArray(retrievalOutcomes.retrievalId, retrievalIds))
    .all();

  if (links.length === 0) {
    return result;
  }

  // Get unique outcome IDs
  const outcomeIds = [...new Set(links.map((l) => l.outcomeId))];

  // Fetch the outcomes
  const outcomes = db
    .select({
      id: taskOutcomes.id,
      outcomeType: taskOutcomes.outcomeType,
    })
    .from(taskOutcomes)
    .where(inArray(taskOutcomes.id, outcomeIds))
    .all();

  // Build a map of outcome ID -> outcome type
  const outcomeTypeMap = new Map(outcomes.map((o) => [o.id, o.outcomeType]));

  // Accumulate scores per entry
  const scoreAccumulator = new Map<string, { positive: number; negative: number }>();
  for (const entryId of entryIds) {
    scoreAccumulator.set(entryId, { positive: 0, negative: 0 });
  }

  for (const link of links) {
    const entryId = retrievalToEntry.get(link.retrievalId);
    if (!entryId) continue;

    const outcomeType = outcomeTypeMap.get(link.outcomeId);
    if (!outcomeType) continue;

    const acc = scoreAccumulator.get(entryId);
    if (!acc) continue;

    if (outcomeType === 'success') {
      acc.positive++;
    } else if (outcomeType === 'failure') {
      acc.negative++;
    } else if (outcomeType === 'partial') {
      acc.positive += 0.5;
    }
  }

  // Convert to final result
  for (const [entryId, acc] of scoreAccumulator) {
    const positiveCount = Math.round(acc.positive);
    const negativeCount = Math.round(acc.negative);
    result.set(entryId, {
      positiveCount,
      negativeCount,
      netScore: positiveCount - negativeCount,
    });
  }

  return result;
}

/**
 * Factory function to create a retrieval repository
 */
export function createRetrievalRepository(db: DrizzleDb): RetrievalRepository {
  return new RetrievalRepository(db);
}
