/**
 * Decision Repository
 *
 * CRUD operations for extraction_decisions, extraction_outcomes,
 * consolidation_decisions, and consolidation_outcomes tables
 */

import { eq, and, desc, gte, lte } from 'drizzle-orm';
import type { DrizzleDb } from '../../../db/repositories/base.js';
import { generateId, now } from '../../../db/repositories/base.js';
import {
  extractionDecisions,
  extractionOutcomes,
  consolidationDecisions,
  consolidationOutcomes,
  type ExtractionDecision,
  type NewExtractionDecision,
  type ExtractionOutcome,
  type NewExtractionOutcome,
  type ConsolidationDecision,
  type NewConsolidationDecision,
  type ConsolidationOutcome,
  type NewConsolidationOutcome,
} from '../../../db/schema/feedback.js';
import type { ScopeType } from '../../../db/schema/types.js';
import type {
  RecordExtractionDecisionParams,
  RecordConsolidationDecisionParams,
} from '../types.js';
import { createComponentLogger } from '../../../utils/logger.js';

const logger = createComponentLogger('feedback:decision-repo');

// =============================================================================
// DECISION REPOSITORY
// =============================================================================

export class DecisionRepository {
  constructor(private db: DrizzleDb) {}

  // ===========================================================================
  // EXTRACTION DECISIONS
  // ===========================================================================

  /**
   * Create a new extraction decision
   */
  async createExtractionDecision(params: RecordExtractionDecisionParams): Promise<string> {
    const id = generateId();

    const newDecision: NewExtractionDecision = {
      id,
      sessionId: params.sessionId,
      turnNumber: params.turnNumber,
      decision: params.decision,
      entryType: params.entryType,
      entryId: params.entryId,
      contextHash: params.contextHash,
      confidence: params.confidence,
      decidedAt: now(),
    };

    this.db.insert(extractionDecisions).values(newDecision).run();

    logger.debug(
      { id, sessionId: params.sessionId, decision: params.decision },
      'Extraction decision recorded'
    );

    return id;
  }

  /**
   * Get extraction decisions for a session
   */
  async getExtractionDecisions(sessionId: string): Promise<ExtractionDecision[]> {
    const decisions = this.db
      .select()
      .from(extractionDecisions)
      .where(eq(extractionDecisions.sessionId, sessionId))
      .orderBy(desc(extractionDecisions.decidedAt))
      .all();

    return decisions;
  }

  /**
   * Get extraction decision by ID
   */
  async getExtractionDecisionById(id: string): Promise<ExtractionDecision | undefined> {
    const decision = this.db
      .select()
      .from(extractionDecisions)
      .where(eq(extractionDecisions.id, id))
      .get();

    return decision;
  }

  /**
   * Get extraction decisions for a specific entry
   */
  async getExtractionDecisionsByEntry(entryId: string): Promise<ExtractionDecision[]> {
    const decisions = this.db
      .select()
      .from(extractionDecisions)
      .where(eq(extractionDecisions.entryId, entryId))
      .orderBy(desc(extractionDecisions.decidedAt))
      .all();

    return decisions;
  }

  /**
   * Create or update extraction outcome
   */
  async upsertExtractionOutcome(
    decisionId: string,
    entryId: string,
    retrievalCount: number,
    successCount: number,
    lastRetrievedAt: string | null,
    outcomeScore: number
  ): Promise<string> {
    // Check if outcome exists
    const existing = this.db
      .select()
      .from(extractionOutcomes)
      .where(eq(extractionOutcomes.decisionId, decisionId))
      .get();

    if (existing) {
      // Update existing
      this.db
        .update(extractionOutcomes)
        .set({
          retrievalCount,
          successCount,
          lastRetrievedAt: lastRetrievedAt ?? undefined,
          outcomeScore,
          evaluatedAt: now(),
        })
        .where(eq(extractionOutcomes.id, existing.id))
        .run();

      logger.debug({ decisionId, outcomeScore }, 'Extraction outcome updated');
      return existing.id;
    } else {
      // Create new
      const id = generateId();

      const newOutcome: NewExtractionOutcome = {
        id,
        decisionId,
        entryId,
        retrievalCount,
        successCount,
        lastRetrievedAt: lastRetrievedAt ?? undefined,
        outcomeScore,
        evaluatedAt: now(),
      };

      this.db.insert(extractionOutcomes).values(newOutcome).run();

      logger.debug({ decisionId, outcomeScore }, 'Extraction outcome created');
      return id;
    }
  }

  /**
   * Get extraction outcome for a decision
   */
  async getExtractionOutcome(decisionId: string): Promise<ExtractionOutcome | undefined> {
    const outcome = this.db
      .select()
      .from(extractionOutcomes)
      .where(eq(extractionOutcomes.decisionId, decisionId))
      .get();

    return outcome;
  }

  /**
   * Get extraction decisions within a date range
   */
  async getExtractionDecisionsByDateRange(
    startDate: string,
    endDate: string
  ): Promise<ExtractionDecision[]> {
    const decisions = this.db
      .select()
      .from(extractionDecisions)
      .where(
        and(
          gte(extractionDecisions.decidedAt, startDate),
          lte(extractionDecisions.decidedAt, endDate)
        )
      )
      .orderBy(desc(extractionDecisions.decidedAt))
      .all();

    return decisions;
  }

  // ===========================================================================
  // CONSOLIDATION DECISIONS
  // ===========================================================================

  /**
   * Create a new consolidation decision
   */
  async createConsolidationDecision(
    params: RecordConsolidationDecisionParams
  ): Promise<string> {
    const id = generateId();

    const newDecision: NewConsolidationDecision = {
      id,
      scopeType: params.scopeType,
      scopeId: params.scopeId,
      action: params.action,
      sourceEntryIds: JSON.stringify(params.sourceEntryIds),
      targetEntryId: params.targetEntryId,
      similarityScore: params.similarityScore,
      decidedAt: now(),
      decidedBy: params.decidedBy ?? 'agent',
    };

    this.db.insert(consolidationDecisions).values(newDecision).run();

    logger.debug(
      { id, action: params.action, sourceCount: params.sourceEntryIds.length },
      'Consolidation decision recorded'
    );

    return id;
  }

  /**
   * Get consolidation decisions for a scope
   */
  async getConsolidationDecisions(
    scopeType: ScopeType,
    scopeId?: string
  ): Promise<ConsolidationDecision[]> {
    const decisions = this.db
      .select()
      .from(consolidationDecisions)
      .where(
        scopeId
          ? and(
              eq(consolidationDecisions.scopeType, scopeType),
              eq(consolidationDecisions.scopeId, scopeId)
            )
          : eq(consolidationDecisions.scopeType, scopeType)
      )
      .orderBy(desc(consolidationDecisions.decidedAt))
      .all();

    return decisions;
  }

  /**
   * Get consolidation decision by ID
   */
  async getConsolidationDecisionById(id: string): Promise<ConsolidationDecision | undefined> {
    const decision = this.db
      .select()
      .from(consolidationDecisions)
      .where(eq(consolidationDecisions.id, id))
      .get();

    return decision;
  }

  /**
   * Create or update consolidation outcome
   */
  async upsertConsolidationOutcome(
    decisionId: string,
    preRetrievalRate: number,
    postRetrievalRate: number,
    preSuccessRate: number,
    postSuccessRate: number,
    evaluationWindowDays: number,
    outcomeScore: number
  ): Promise<string> {
    // Check if outcome exists
    const existing = this.db
      .select()
      .from(consolidationOutcomes)
      .where(eq(consolidationOutcomes.decisionId, decisionId))
      .get();

    if (existing) {
      // Update existing
      this.db
        .update(consolidationOutcomes)
        .set({
          preRetrievalRate,
          postRetrievalRate,
          preSuccessRate,
          postSuccessRate,
          evaluationWindowDays,
          outcomeScore,
          evaluatedAt: now(),
        })
        .where(eq(consolidationOutcomes.id, existing.id))
        .run();

      logger.debug({ decisionId, outcomeScore }, 'Consolidation outcome updated');
      return existing.id;
    } else {
      // Create new
      const id = generateId();

      const newOutcome: NewConsolidationOutcome = {
        id,
        decisionId,
        preRetrievalRate,
        postRetrievalRate,
        preSuccessRate,
        postSuccessRate,
        evaluationWindowDays,
        outcomeScore,
        evaluatedAt: now(),
      };

      this.db.insert(consolidationOutcomes).values(newOutcome).run();

      logger.debug({ decisionId, outcomeScore }, 'Consolidation outcome created');
      return id;
    }
  }

  /**
   * Get consolidation outcome for a decision
   */
  async getConsolidationOutcome(decisionId: string): Promise<ConsolidationOutcome | undefined> {
    const outcome = this.db
      .select()
      .from(consolidationOutcomes)
      .where(eq(consolidationOutcomes.decisionId, decisionId))
      .get();

    return outcome;
  }

  /**
   * Get consolidation decisions within a date range
   */
  async getConsolidationDecisionsByDateRange(
    startDate: string,
    endDate: string
  ): Promise<ConsolidationDecision[]> {
    const decisions = this.db
      .select()
      .from(consolidationDecisions)
      .where(
        and(
          gte(consolidationDecisions.decidedAt, startDate),
          lte(consolidationDecisions.decidedAt, endDate)
        )
      )
      .orderBy(desc(consolidationDecisions.decidedAt))
      .all();

    return decisions;
  }
}

/**
 * Factory function to create a decision repository
 */
export function createDecisionRepository(db: DrizzleDb): DecisionRepository {
  return new DecisionRepository(db);
}
