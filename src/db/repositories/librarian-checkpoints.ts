/**
 * Librarian Checkpoints Repository
 *
 * Manages librarian analysis checkpoints for incremental processing.
 * Uses timestamp cursors to track which experiences have been analyzed.
 */

import { eq, and, isNull } from 'drizzle-orm';
import { getDb } from '../connection.js';
import {
  librarianScopeCheckpoints,
  type LibrarianScopeCheckpoint,
  type NewLibrarianScopeCheckpoint,
  type ScopeType,
  type CheckpointStatus,
} from '../schema.js';
import { generateId } from './base.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateCheckpointInput {
  scopeType: ScopeType;
  scopeId?: string;
}

export interface UpdateCheckpointInput {
  lastAnalysisRunId?: string;
  lastAnalysisAt?: string;
  lastExperienceCreatedAt?: string;
  experiencesProcessed?: number;
  patternsDetected?: number;
  recommendationsGenerated?: number;
  status?: CheckpointStatus;
  lastError?: string | null;
  consecutiveErrors?: number;
}

export interface CheckpointStats {
  totalExperiencesProcessed: number;
  totalPatternsDetected: number;
  totalRecommendationsGenerated: number;
  lastAnalysisAt?: string;
}

// =============================================================================
// REPOSITORY
// =============================================================================

export const librarianCheckpointRepo = {
  /**
   * Get checkpoint for a specific scope
   * Returns undefined if no checkpoint exists yet
   */
  getForScope(scopeType: ScopeType, scopeId?: string): LibrarianScopeCheckpoint | undefined {
    const db = getDb();

    const conditions = [eq(librarianScopeCheckpoints.scopeType, scopeType)];

    if (scopeId) {
      conditions.push(eq(librarianScopeCheckpoints.scopeId, scopeId));
    } else {
      conditions.push(isNull(librarianScopeCheckpoints.scopeId));
    }

    return db
      .select()
      .from(librarianScopeCheckpoints)
      .where(and(...conditions))
      .get() as LibrarianScopeCheckpoint | undefined;
  },

  /**
   * Get or create checkpoint for a scope
   * Creates a new checkpoint if one doesn't exist
   */
  getOrCreate(scopeType: ScopeType, scopeId?: string): LibrarianScopeCheckpoint {
    const existing = this.getForScope(scopeType, scopeId);
    if (existing) {
      return existing;
    }

    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    const checkpoint: NewLibrarianScopeCheckpoint = {
      id,
      scopeType,
      scopeId: scopeId ?? null,
      status: 'idle',
      experiencesProcessed: 0,
      patternsDetected: 0,
      recommendationsGenerated: 0,
      consecutiveErrors: 0,
      createdAt: now,
      updatedAt: now,
    };

    db.insert(librarianScopeCheckpoints).values(checkpoint).run();
    return db
      .select()
      .from(librarianScopeCheckpoints)
      .where(eq(librarianScopeCheckpoints.id, id))
      .get() as LibrarianScopeCheckpoint;
  },

  /**
   * Update checkpoint after an analysis run
   */
  update(
    scopeType: ScopeType,
    scopeId: string | undefined,
    input: UpdateCheckpointInput
  ): LibrarianScopeCheckpoint {
    const db = getDb();
    const checkpoint = this.getOrCreate(scopeType, scopeId);

    const updates: Partial<LibrarianScopeCheckpoint> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.lastAnalysisRunId !== undefined) {
      updates.lastAnalysisRunId = input.lastAnalysisRunId;
    }
    if (input.lastAnalysisAt !== undefined) {
      updates.lastAnalysisAt = input.lastAnalysisAt;
    }
    if (input.lastExperienceCreatedAt !== undefined) {
      updates.lastExperienceCreatedAt = input.lastExperienceCreatedAt;
    }
    if (input.experiencesProcessed !== undefined) {
      // Accumulate total
      updates.experiencesProcessed = checkpoint.experiencesProcessed + input.experiencesProcessed;
    }
    if (input.patternsDetected !== undefined) {
      updates.patternsDetected = checkpoint.patternsDetected + input.patternsDetected;
    }
    if (input.recommendationsGenerated !== undefined) {
      updates.recommendationsGenerated =
        checkpoint.recommendationsGenerated + input.recommendationsGenerated;
    }
    if (input.status !== undefined) {
      updates.status = input.status;
    }
    if (input.lastError !== undefined) {
      updates.lastError = input.lastError;
    }
    if (input.consecutiveErrors !== undefined) {
      updates.consecutiveErrors = input.consecutiveErrors;
    }

    db.update(librarianScopeCheckpoints)
      .set(updates)
      .where(eq(librarianScopeCheckpoints.id, checkpoint.id))
      .run();

    return db
      .select()
      .from(librarianScopeCheckpoints)
      .where(eq(librarianScopeCheckpoints.id, checkpoint.id))
      .get() as LibrarianScopeCheckpoint;
  },

  /**
   * Mark analysis as started
   */
  markStarted(scopeType: ScopeType, scopeId?: string, runId?: string): LibrarianScopeCheckpoint {
    return this.update(scopeType, scopeId, {
      status: 'running',
      lastAnalysisRunId: runId,
      lastError: null,
    });
  },

  /**
   * Mark analysis as completed successfully
   */
  markCompleted(
    scopeType: ScopeType,
    scopeId: string | undefined,
    result: {
      runId: string;
      lastExperienceCreatedAt: string;
      experiencesProcessed: number;
      patternsDetected: number;
      recommendationsGenerated: number;
    }
  ): LibrarianScopeCheckpoint {
    return this.update(scopeType, scopeId, {
      status: 'idle',
      lastAnalysisRunId: result.runId,
      lastAnalysisAt: new Date().toISOString(),
      lastExperienceCreatedAt: result.lastExperienceCreatedAt,
      experiencesProcessed: result.experiencesProcessed,
      patternsDetected: result.patternsDetected,
      recommendationsGenerated: result.recommendationsGenerated,
      lastError: null,
      consecutiveErrors: 0,
    });
  },

  /**
   * Mark analysis as failed
   */
  markFailed(
    scopeType: ScopeType,
    scopeId: string | undefined,
    error: string
  ): LibrarianScopeCheckpoint {
    const checkpoint = this.getOrCreate(scopeType, scopeId);
    return this.update(scopeType, scopeId, {
      status: 'idle',
      lastError: error,
      consecutiveErrors: checkpoint.consecutiveErrors + 1,
    });
  },

  /**
   * Reset checkpoint for a scope (e.g., for full reprocessing)
   */
  reset(scopeType: ScopeType, scopeId?: string): LibrarianScopeCheckpoint {
    const checkpoint = this.getOrCreate(scopeType, scopeId);
    const db = getDb();

    db.update(librarianScopeCheckpoints)
      .set({
        lastExperienceCreatedAt: null,
        status: 'idle',
        lastError: null,
        consecutiveErrors: 0,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(librarianScopeCheckpoints.id, checkpoint.id))
      .run();

    return db
      .select()
      .from(librarianScopeCheckpoints)
      .where(eq(librarianScopeCheckpoints.id, checkpoint.id))
      .get() as LibrarianScopeCheckpoint;
  },

  /**
   * Get stats for a scope
   */
  getStats(scopeType: ScopeType, scopeId?: string): CheckpointStats {
    const checkpoint = this.getForScope(scopeType, scopeId);

    if (!checkpoint) {
      return {
        totalExperiencesProcessed: 0,
        totalPatternsDetected: 0,
        totalRecommendationsGenerated: 0,
      };
    }

    return {
      totalExperiencesProcessed: checkpoint.experiencesProcessed,
      totalPatternsDetected: checkpoint.patternsDetected,
      totalRecommendationsGenerated: checkpoint.recommendationsGenerated,
      lastAnalysisAt: checkpoint.lastAnalysisAt ?? undefined,
    };
  },

  /**
   * List all checkpoints
   */
  listAll(): LibrarianScopeCheckpoint[] {
    const db = getDb();
    return db.select().from(librarianScopeCheckpoints).all() as LibrarianScopeCheckpoint[];
  },

  /**
   * Delete checkpoint for a scope
   */
  delete(scopeType: ScopeType, scopeId?: string): boolean {
    const db = getDb();

    const conditions = [eq(librarianScopeCheckpoints.scopeType, scopeType)];

    if (scopeId) {
      conditions.push(eq(librarianScopeCheckpoints.scopeId, scopeId));
    } else {
      conditions.push(isNull(librarianScopeCheckpoints.scopeId));
    }

    const result = db
      .delete(librarianScopeCheckpoints)
      .where(and(...conditions))
      .run();
    return (result.changes ?? 0) > 0;
  },
};
