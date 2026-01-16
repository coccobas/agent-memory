/**
 * Extraction Collector
 *
 * Collects extraction decision events and evaluates their outcomes
 */

import type { DecisionRepository } from '../repositories/decision.repository.js';
import type { RetrievalRepository } from '../repositories/retrieval.repository.js';
import type { OutcomeRepository } from '../repositories/outcome.repository.js';
import type { RecordExtractionDecisionParams, ExtractionOutcomeResult } from '../types.js';
import { createComponentLogger } from '../../../utils/logger.js';

const logger = createComponentLogger('feedback:extraction-collector');

// =============================================================================
// EXTRACTION COLLECTOR
// =============================================================================

export class ExtractionCollector {
  constructor(
    private decisionRepo: DecisionRepository,
    private retrievalRepo: RetrievalRepository,
    private outcomeRepo: OutcomeRepository
  ) {}

  /**
   * Record an extraction decision
   */
  async recordExtractionDecision(params: RecordExtractionDecisionParams): Promise<string> {
    try {
      const id = await this.decisionRepo.createExtractionDecision(params);
      return id;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId: params.sessionId,
          decision: params.decision,
        },
        'Failed to record extraction decision'
      );
      throw error;
    }
  }

  /**
   * Evaluate the outcome of an extraction decision
   *
   * Looks at:
   * - How many times the entry was retrieved
   * - How many times retrievals led to successful outcomes
   * - When it was last retrieved
   *
   * Returns a computed outcome score
   */
  async evaluateExtractionOutcome(decisionId: string): Promise<ExtractionOutcomeResult | null> {
    try {
      // Get the decision
      const decision = await this.decisionRepo.getExtractionDecisionById(decisionId);
      if (!decision) {
        logger.warn({ decisionId }, 'Extraction decision not found');
        return null;
      }

      // Only evaluate 'store' decisions that have an entryId
      if (decision.decision !== 'store' || !decision.entryId || !decision.entryType) {
        logger.debug(
          { decisionId, decision: decision.decision },
          'Skipping evaluation for non-store decision'
        );
        return null;
      }

      // Get all retrievals for this entry
      const retrievals = await this.retrievalRepo.getByEntry(decision.entryType, decision.entryId);

      const retrievalCount = retrievals.length;
      const lastRetrievedAt = retrievals.length > 0 ? retrievals[0]?.retrievedAt : null;

      // Count successful outcomes for these retrievals
      let successCount = 0;

      for (const retrieval of retrievals) {
        const contributions = await this.outcomeRepo.getRetrievalContributions(retrieval.id);

        for (const contribution of contributions) {
          const outcome = await this.outcomeRepo.getOutcomeById(contribution.outcomeId);
          if (outcome && outcome.outcomeType === 'success') {
            successCount++;
          }
        }
      }

      // Compute a simple outcome score
      // This is a basic formula - can be enhanced with the reward computation from evaluators
      let outcomeScore = 0;

      if (retrievalCount === 0) {
        // Never retrieved = wasted storage
        outcomeScore = -1.0;
      } else if (successCount > 0) {
        // Retrieved and contributed to success
        outcomeScore = Math.min(successCount / retrievalCount, 1.0);
      } else {
        // Retrieved but no successes
        outcomeScore = -0.5;
      }

      // Store the outcome
      await this.decisionRepo.upsertExtractionOutcome(
        decisionId,
        decision.entryId,
        retrievalCount,
        successCount,
        lastRetrievedAt ?? null,
        outcomeScore
      );

      logger.debug(
        {
          decisionId,
          entryId: decision.entryId,
          retrievalCount,
          successCount,
          outcomeScore,
        },
        'Extraction outcome evaluated'
      );

      return {
        decisionId,
        entryId: decision.entryId,
        retrievalCount,
        successCount,
        lastRetrievedAt: lastRetrievedAt ?? undefined,
        outcomeScore,
        evaluatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          decisionId,
        },
        'Failed to evaluate extraction outcome'
      );
      throw error;
    }
  }

  /**
   * Get extraction decisions for a session
   */
  async getSessionDecisions(sessionId: string) {
    return this.decisionRepo.getExtractionDecisions(sessionId);
  }
}

/**
 * Factory function to create an extraction collector
 */
export function createExtractionCollector(
  decisionRepo: DecisionRepository,
  retrievalRepo: RetrievalRepository,
  outcomeRepo: OutcomeRepository
): ExtractionCollector {
  return new ExtractionCollector(decisionRepo, retrievalRepo, outcomeRepo);
}
