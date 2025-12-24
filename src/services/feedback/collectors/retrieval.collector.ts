/**
 * Retrieval Collector
 *
 * Collects retrieval events from the query pipeline
 */

import type { RetrievalRepository } from '../repositories/retrieval.repository.js';
import type { RecordRetrievalParams } from '../types.js';
import { createComponentLogger } from '../../../utils/logger.js';

const logger = createComponentLogger('feedback:retrieval-collector');

// =============================================================================
// RETRIEVAL COLLECTOR
// =============================================================================

export class RetrievalCollector {
  constructor(private retrievalRepo: RetrievalRepository) {}

  /**
   * Record a single retrieval event
   */
  async recordRetrieval(params: RecordRetrievalParams): Promise<string> {
    try {
      const id = await this.retrievalRepo.create(params);
      return id;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId: params.sessionId,
          entryType: params.entryType,
        },
        'Failed to record retrieval'
      );
      throw error;
    }
  }

  /**
   * Record multiple retrieval events in batch
   */
  async recordRetrievalBatch(params: RecordRetrievalParams[]): Promise<string[]> {
    if (params.length === 0) {
      return [];
    }

    try {
      const ids = await this.retrievalRepo.createBatch(params);
      return ids;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          count: params.length,
          sessionId: params[0]?.sessionId,
        },
        'Failed to record retrieval batch'
      );
      throw error;
    }
  }

  /**
   * Get all retrievals for a session
   */
  async getSessionRetrievals(sessionId: string) {
    return this.retrievalRepo.getBySession(sessionId);
  }

  /**
   * Get unlinked retrievals for a session (not yet connected to outcomes)
   */
  async getUnlinkedRetrievals(sessionId: string) {
    return this.retrievalRepo.getUnlinked(sessionId);
  }
}

/**
 * Factory function to create a retrieval collector
 */
export function createRetrievalCollector(
  retrievalRepo: RetrievalRepository
): RetrievalCollector {
  return new RetrievalCollector(retrievalRepo);
}
