/**
 * Outcome Collector
 *
 * Collects task outcome events and links them to retrievals
 */

import type { OutcomeRepository } from '../repositories/outcome.repository.js';
import type { RecordOutcomeParams, ContributionScore } from '../types.js';
import type { OutcomeType, AttributionMethod } from '../../../db/schema/feedback.js';
import { createComponentLogger } from '../../../utils/logger.js';

const logger = createComponentLogger('feedback:outcome-collector');

// =============================================================================
// OUTCOME COLLECTOR
// =============================================================================

export class OutcomeCollector {
  constructor(private outcomeRepo: OutcomeRepository) {}

  /**
   * Record a task outcome
   */
  async recordOutcome(params: RecordOutcomeParams): Promise<string> {
    try {
      const id = await this.outcomeRepo.createOutcome(params);
      return id;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId: params.sessionId,
          outcomeType: params.outcomeType,
        },
        'Failed to record outcome'
      );
      throw error;
    }
  }

  /**
   * Link retrievals to an outcome
   */
  async linkRetrievalsToOutcome(
    outcomeId: string,
    retrievalIds: string[],
    contributionScores?: ContributionScore[],
    attributionMethod?: AttributionMethod
  ): Promise<void> {
    try {
      await this.outcomeRepo.linkRetrievals(
        outcomeId,
        retrievalIds,
        contributionScores,
        attributionMethod
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          outcomeId,
          retrievalCount: retrievalIds.length,
        },
        'Failed to link retrievals to outcome'
      );
      throw error;
    }
  }

  /**
   * Get outcomes for a session
   */
  async getSessionOutcomes(sessionId: string) {
    return this.outcomeRepo.getBySession(sessionId);
  }

  /**
   * Infer outcome type from session status
   * This is a simple heuristic - can be enhanced with more sophisticated logic
   */
  inferOutcomeFromSessionStatus(status: string): OutcomeType {
    const normalizedStatus = status.toLowerCase();

    if (normalizedStatus.includes('complete') || normalizedStatus.includes('success')) {
      return 'success';
    }

    if (normalizedStatus.includes('fail') || normalizedStatus.includes('error')) {
      return 'failure';
    }

    if (normalizedStatus.includes('partial') || normalizedStatus.includes('incomplete')) {
      return 'partial';
    }

    return 'unknown';
  }

  /**
   * Record outcome from session status (convenience method)
   */
  async recordOutcomeFromStatus(
    sessionId: string,
    status: string,
    conversationId?: string
  ): Promise<string> {
    const outcomeType = this.inferOutcomeFromSessionStatus(status);

    return this.recordOutcome({
      sessionId,
      conversationId,
      outcomeType,
      outcomeSignal: 'session_status',
      confidence: outcomeType === 'unknown' ? 0.5 : 0.8,
    });
  }
}

/**
 * Factory function to create an outcome collector
 */
export function createOutcomeCollector(outcomeRepo: OutcomeRepository): OutcomeCollector {
  return new OutcomeCollector(outcomeRepo);
}
