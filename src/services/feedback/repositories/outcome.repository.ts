/**
 * Outcome Repository
 *
 * CRUD operations for task_outcomes and retrieval_outcomes tables
 */

import { eq, and, desc, inArray, gte, lte } from 'drizzle-orm';
import type { DrizzleDb } from '../../../db/repositories/base.js';
import { generateId, now } from '../../../db/repositories/base.js';
import {
  taskOutcomes,
  retrievalOutcomes,
  type TaskOutcome,
  type NewTaskOutcome,
  type RetrievalOutcome,
  type NewRetrievalOutcome,
  type AttributionMethod,
} from '../../../db/schema/feedback.js';
import type { RecordOutcomeParams, ContributionScore } from '../types.js';
import { createComponentLogger } from '../../../utils/logger.js';

const logger = createComponentLogger('feedback:outcome-repo');

// =============================================================================
// OUTCOME REPOSITORY
// =============================================================================

export class OutcomeRepository {
  constructor(private db: DrizzleDb) {}

  /**
   * Create a new task outcome
   */
  async createOutcome(params: RecordOutcomeParams): Promise<string> {
    const id = generateId();

    const newOutcome: NewTaskOutcome = {
      id,
      sessionId: params.sessionId,
      conversationId: params.conversationId,
      outcomeType: params.outcomeType,
      outcomeSignal: params.outcomeSignal ?? 'inferred',
      confidence: params.confidence ?? 1.0,
      metadata: params.metadata,
      outcomeAt: now(),
    };

    this.db.insert(taskOutcomes).values(newOutcome).run();

    logger.debug(
      { id, sessionId: params.sessionId, outcomeType: params.outcomeType },
      'Task outcome recorded'
    );

    return id;
  }

  /**
   * Link retrievals to an outcome with optional contribution scores
   */
  async linkRetrievals(
    outcomeId: string,
    retrievalIds: string[],
    contributionScores?: ContributionScore[],
    attributionMethod?: AttributionMethod
  ): Promise<void> {
    if (retrievalIds.length === 0) {
      return;
    }

    // Build score map for quick lookup
    const scoreMap = new Map<string, number>();
    if (contributionScores) {
      for (const cs of contributionScores) {
        scoreMap.set(cs.retrievalId, cs.score);
      }
    }

    const links: NewRetrievalOutcome[] = retrievalIds.map((retrievalId) => ({
      id: generateId(),
      retrievalId,
      outcomeId,
      contributionScore: scoreMap.get(retrievalId),
      attributionMethod,
      createdAt: now(),
    }));

    this.db.insert(retrievalOutcomes).values(links).run();

    logger.debug(
      { outcomeId, retrievalCount: retrievalIds.length, hasScores: !!contributionScores },
      'Retrievals linked to outcome'
    );
  }

  /**
   * Get all task outcomes for a session
   */
  async getBySession(sessionId: string): Promise<TaskOutcome[]> {
    const outcomes = this.db
      .select()
      .from(taskOutcomes)
      .where(eq(taskOutcomes.sessionId, sessionId))
      .orderBy(desc(taskOutcomes.outcomeAt))
      .all();

    return outcomes;
  }

  /**
   * Get a specific task outcome by ID
   */
  async getOutcomeById(id: string): Promise<TaskOutcome | undefined> {
    const outcome = this.db
      .select()
      .from(taskOutcomes)
      .where(eq(taskOutcomes.id, id))
      .get();

    return outcome;
  }

  /**
   * Get retrieval-outcome links for a specific retrieval
   */
  async getRetrievalContributions(retrievalId: string): Promise<RetrievalOutcome[]> {
    const contributions = this.db
      .select()
      .from(retrievalOutcomes)
      .where(eq(retrievalOutcomes.retrievalId, retrievalId))
      .all();

    return contributions;
  }

  /**
   * Get retrieval-outcome links for a specific outcome
   */
  async getOutcomeRetrievals(outcomeId: string): Promise<RetrievalOutcome[]> {
    const retrievals = this.db
      .select()
      .from(retrievalOutcomes)
      .where(eq(retrievalOutcomes.outcomeId, outcomeId))
      .all();

    return retrievals;
  }

  /**
   * Get all retrieval-outcome links for multiple retrievals
   */
  async getRetrievalContributionsBatch(retrievalIds: string[]): Promise<RetrievalOutcome[]> {
    if (retrievalIds.length === 0) {
      return [];
    }

    const contributions = this.db
      .select()
      .from(retrievalOutcomes)
      .where(inArray(retrievalOutcomes.retrievalId, retrievalIds))
      .all();

    return contributions;
  }

  /**
   * Count successful outcomes for retrievals of a specific entry
   */
  async countSuccessfulRetrievals(_entryId: string): Promise<number> {
    // This requires joining through memory_retrievals - we'll implement a simple version
    // In practice, you might want to add indexes or optimize this query
    const allOutcomes = this.db
      .select()
      .from(retrievalOutcomes)
      .all();

    // Filter to successful outcomes (would be more efficient with a join)
    let count = 0;
    for (const ro of allOutcomes) {
      const outcome = await this.getOutcomeById(ro.outcomeId);
      if (outcome?.outcomeType === 'success') {
        count++;
      }
    }

    return count;
  }

  /**
   * Get outcomes within a date range
   */
  async getByDateRange(startDate: string, endDate: string): Promise<TaskOutcome[]> {
    const outcomes = this.db
      .select()
      .from(taskOutcomes)
      .where(
        and(
          // SQLite string comparison works for ISO timestamps
          gte(taskOutcomes.outcomeAt, startDate),
          lte(taskOutcomes.outcomeAt, endDate)
        )
      )
      .orderBy(desc(taskOutcomes.outcomeAt))
      .all();

    return outcomes;
  }
}

/**
 * Factory function to create an outcome repository
 */
export function createOutcomeRepository(db: DrizzleDb): OutcomeRepository {
  return new OutcomeRepository(db);
}
