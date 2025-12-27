/**
 * Verification Repository
 *
 * Handles database operations for verification-related entities:
 * - Session guideline acknowledgments
 * - Verification logs
 * - Verification rules lookup
 */

import { eq } from 'drizzle-orm';
import type { DrizzleDb } from './base.js';
import { generateId, now } from './base.js';
import {
  sessionGuidelineAcknowledgments,
  verificationLog,
  guidelines,
  guidelineVersions,
  sessions,
  type VerificationActionType,
} from '../schema.js';
import type {
  IVerificationRepository,
  CreateAcknowledgmentInput,
  SessionGuidelineAcknowledgment,
  LogVerificationInput,
  VerificationLogEntry,
  VerificationRules,
} from '../../core/interfaces/repositories.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('verification-repository');

/**
 * Create a verification repository instance
 */
export function createVerificationRepository(db: DrizzleDb): IVerificationRepository {
  return {
    /**
     * Create a guideline acknowledgment for a session
     */
    async createAcknowledgment(
      input: CreateAcknowledgmentInput
    ): Promise<SessionGuidelineAcknowledgment> {
      const id = generateId();
      const acknowledgedAt = now();

      db.insert(sessionGuidelineAcknowledgments)
        .values({
          id,
          sessionId: input.sessionId,
          guidelineId: input.guidelineId,
          acknowledgedBy: input.acknowledgedBy,
          acknowledgedAt,
        })
        .onConflictDoNothing()
        .run();

      // Return the created or existing acknowledgment
      const result = db
        .select()
        .from(sessionGuidelineAcknowledgments)
        .where(
          eq(sessionGuidelineAcknowledgments.sessionId, input.sessionId)
        )
        .get();

      if (!result) {
        // This shouldn't happen, but handle it
        return {
          id,
          sessionId: input.sessionId,
          guidelineId: input.guidelineId,
          acknowledgedBy: input.acknowledgedBy ?? null,
          acknowledgedAt,
        };
      }

      return {
        id: result.id,
        sessionId: result.sessionId,
        guidelineId: result.guidelineId,
        acknowledgedBy: result.acknowledgedBy,
        acknowledgedAt: result.acknowledgedAt,
      };
    },

    /**
     * Get all acknowledged guideline IDs for a session
     */
    async getAcknowledgedGuidelineIds(sessionId: string): Promise<string[]> {
      const acknowledgments = db
        .select({ guidelineId: sessionGuidelineAcknowledgments.guidelineId })
        .from(sessionGuidelineAcknowledgments)
        .where(eq(sessionGuidelineAcknowledgments.sessionId, sessionId))
        .all();

      return acknowledgments.map((a) => a.guidelineId);
    },

    /**
     * Log a verification action
     */
    async logVerification(input: LogVerificationInput): Promise<VerificationLogEntry> {
      const id = generateId();
      const createdAt = now();

      try {
        db.insert(verificationLog)
          .values({
            id,
            sessionId: input.sessionId,
            actionType: input.actionType as VerificationActionType,
            proposedAction: input.proposedAction,
            result: input.result,
            guidelineIds: input.guidelineIds,
            createdBy: input.createdBy,
            createdAt,
          })
          .run();
      } catch (error) {
        logger.error({ error }, 'Failed to log verification');
        throw error;
      }

      return {
        id,
        sessionId: input.sessionId,
        actionType: input.actionType,
        proposedAction: input.proposedAction as Record<string, unknown>,
        result: input.result as Record<string, unknown>,
        guidelineIds: input.guidelineIds,
        createdBy: input.createdBy ?? null,
        createdAt,
      };
    },

    /**
     * Get verification rules for a guideline
     */
    async getVerificationRules(guidelineId: string): Promise<VerificationRules | null> {
      const guideline = db
        .select()
        .from(guidelines)
        .where(eq(guidelines.id, guidelineId))
        .get();

      if (!guideline?.currentVersionId) {
        return null;
      }

      const version = db
        .select()
        .from(guidelineVersions)
        .where(eq(guidelineVersions.id, guideline.currentVersionId))
        .get();

      return (version?.verificationRules as VerificationRules) ?? null;
    },

    /**
     * Get project ID for a session
     */
    async getProjectIdForSession(sessionId: string): Promise<string | null> {
      const session = db
        .select({ projectId: sessions.projectId })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .get();

      return session?.projectId ?? null;
    },
  };
}
