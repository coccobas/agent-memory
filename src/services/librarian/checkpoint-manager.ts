/**
 * Checkpoint Manager for Librarian Service
 *
 * Handles incremental processing checkpoints for librarian analysis runs.
 * Checkpoints track the last processed experience timestamp to enable
 * efficient incremental analysis on subsequent runs.
 */

import { librarianCheckpointRepo } from '../../db/repositories/librarian-checkpoints.js';
import { createComponentLogger } from '../../utils/logger.js';
import type { ScopeType } from '../../db/schema/types.js';

const logger = createComponentLogger('librarian:checkpoint');

/**
 * Checkpoint data structure
 */
export interface CheckpointData {
  lastExperienceCreatedAt?: string;
  runId?: string;
}

/**
 * Checkpoint completion data
 */
export interface CheckpointCompletionData {
  runId: string;
  lastExperienceCreatedAt: string;
  experiencesProcessed: number;
  patternsDetected: number;
  recommendationsGenerated: number;
}

/**
 * Checkpoint Manager
 *
 * Wraps checkpoint repository operations with error handling
 * and graceful degradation for environments without database access.
 */
export class CheckpointManager {
  private checkpointsAvailable = true;

  /**
   * Load checkpoint for incremental processing
   *
   * @returns Checkpoint data or undefined if no checkpoint exists
   */
  getForScope(scopeType: ScopeType, scopeId?: string): CheckpointData | undefined {
    if (!this.checkpointsAvailable) {
      return undefined;
    }

    try {
      const checkpoint = librarianCheckpointRepo.getForScope(scopeType, scopeId);
      return checkpoint
        ? { lastExperienceCreatedAt: checkpoint.lastExperienceCreatedAt ?? undefined }
        : undefined;
    } catch (error) {
      // Checkpoint system unavailable (e.g., in unit tests without database)
      logger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'Checkpoint system unavailable, using non-incremental mode'
      );
      this.checkpointsAvailable = false;
      return undefined;
    }
  }

  /**
   * Mark analysis as started
   */
  markStarted(scopeType: ScopeType, scopeId: string | undefined, runId: string): void {
    if (!this.checkpointsAvailable) {
      return;
    }

    try {
      librarianCheckpointRepo.markStarted(scopeType, scopeId, runId);
    } catch (error) {
      logger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to mark checkpoint as started (non-fatal)'
      );
    }
  }

  /**
   * Mark analysis as completed with processing stats
   */
  markCompleted(
    scopeType: ScopeType,
    scopeId: string | undefined,
    data: CheckpointCompletionData
  ): void {
    if (!this.checkpointsAvailable) {
      return;
    }

    try {
      librarianCheckpointRepo.markCompleted(scopeType, scopeId, data);
      logger.debug(
        {
          scopeType,
          scopeId,
          newCursor: data.lastExperienceCreatedAt,
        },
        'Checkpoint updated for incremental processing'
      );
    } catch (error) {
      logger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to update checkpoint (non-fatal)'
      );
    }
  }

  /**
   * Update checkpoint status without completion data
   * Used when no experiences were processed but we want to reset error state
   */
  updateStatus(
    scopeType: ScopeType,
    scopeId: string | undefined,
    runId: string,
    completedAt: string
  ): void {
    if (!this.checkpointsAvailable) {
      return;
    }

    try {
      librarianCheckpointRepo.update(scopeType, scopeId, {
        status: 'idle',
        lastAnalysisRunId: runId,
        lastAnalysisAt: completedAt,
        lastError: null,
        consecutiveErrors: 0,
      });
    } catch (error) {
      logger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to update checkpoint status (non-fatal)'
      );
    }
  }

  /**
   * Mark analysis as failed
   */
  markFailed(scopeType: ScopeType, scopeId: string | undefined, errorMessage: string): void {
    if (!this.checkpointsAvailable) {
      return;
    }

    try {
      librarianCheckpointRepo.markFailed(scopeType, scopeId, errorMessage);
    } catch (error) {
      logger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to mark checkpoint as failed (non-fatal)'
      );
    }
  }

  /**
   * Check if checkpoints are available
   */
  isAvailable(): boolean {
    return this.checkpointsAvailable;
  }

  /**
   * Reset availability state (useful for testing)
   */
  resetAvailability(): void {
    this.checkpointsAvailable = true;
  }
}

/**
 * Create a new checkpoint manager instance
 */
export function createCheckpointManager(): CheckpointManager {
  return new CheckpointManager();
}
