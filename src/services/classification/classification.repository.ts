/**
 * Classification Repository
 *
 * CRUD operations for classification_feedback and pattern_confidence tables
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { eq, desc, gte } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/repositories/base.js';
import { generateId, now } from '../../db/repositories/base.js';
import {
  classificationFeedback,
  patternConfidence,
  type ClassificationFeedback,
  type NewClassificationFeedback,
  type PatternConfidence,
  type NewPatternConfidence,
} from '../../db/schema/classification.js';
import { createComponentLogger } from '../../utils/logger.js';
import { createHash } from 'crypto';

const logger = createComponentLogger('classification:repo');

// =============================================================================
// TYPES
// =============================================================================

export interface RecordFeedbackParams {
  textHash: string;
  textPreview?: string;
  sessionId?: string;
  predictedType: 'guideline' | 'knowledge' | 'tool';
  actualType: 'guideline' | 'knowledge' | 'tool';
  method: 'regex' | 'llm' | 'hybrid' | 'forced';
  confidence: number;
  matchedPatterns?: string[];
}

export interface PatternStats {
  patternId: string;
  patternType: 'guideline' | 'knowledge' | 'tool';
  baseWeight: number;
  feedbackMultiplier: number;
  totalMatches: number;
  correctMatches: number;
  incorrectMatches: number;
  accuracy: number;
}

// =============================================================================
// CLASSIFICATION REPOSITORY
// =============================================================================

export class ClassificationRepository {
  constructor(private db: DrizzleDb) {}

  // ===========================================================================
  // CLASSIFICATION FEEDBACK
  // ===========================================================================

  /**
   * Record a classification feedback entry
   */
  async recordFeedback(params: RecordFeedbackParams): Promise<string> {
    const id = generateId();
    const wasCorrect = params.predictedType === params.actualType;

    const newFeedback: NewClassificationFeedback = {
      id,
      textHash: params.textHash,
      textPreview: params.textPreview,
      sessionId: params.sessionId,
      predictedType: params.predictedType,
      actualType: params.actualType,
      method: params.method,
      confidence: params.confidence,
      matchedPatterns: params.matchedPatterns ? JSON.stringify(params.matchedPatterns) : null,
      wasCorrect,
      createdAt: now(),
    };

    this.db.insert(classificationFeedback).values(newFeedback).run();

    logger.debug(
      {
        id,
        predicted: params.predictedType,
        actual: params.actualType,
        wasCorrect,
      },
      'Classification feedback recorded'
    );

    return id;
  }

  /**
   * Get feedback for a specific pattern within a time window
   */
  async getFeedbackForPattern(
    patternId: string,
    withinDays: number = 30
  ): Promise<ClassificationFeedback[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - withinDays);
    const cutoffStr = cutoffDate.toISOString();

    // SQLite JSON handling is limited, so we fetch all and filter in JS
    const allFeedback = this.db
      .select()
      .from(classificationFeedback)
      .where(gte(classificationFeedback.createdAt, cutoffStr))
      .orderBy(desc(classificationFeedback.createdAt))
      .all();

    return allFeedback.filter((f) => {
      if (!f.matchedPatterns) return false;
      try {
        const patterns = JSON.parse(f.matchedPatterns) as string[];
        return patterns.includes(patternId);
      } catch {
        return false;
      }
    });
  }

  /**
   * Get aggregate feedback stats for a pattern
   */
  async getPatternFeedbackStats(
    patternId: string,
    withinDays: number = 30
  ): Promise<{ total: number; correct: number; incorrect: number }> {
    const feedback = await this.getFeedbackForPattern(patternId, withinDays);
    const correct = feedback.filter((f) => f.wasCorrect).length;
    return {
      total: feedback.length,
      correct,
      incorrect: feedback.length - correct,
    };
  }

  /**
   * Get recent feedback entries
   */
  async getRecentFeedback(limit: number = 100): Promise<ClassificationFeedback[]> {
    return this.db
      .select()
      .from(classificationFeedback)
      .orderBy(desc(classificationFeedback.createdAt))
      .limit(limit)
      .all();
  }

  // ===========================================================================
  // PATTERN CONFIDENCE
  // ===========================================================================

  /**
   * Get or create pattern confidence entry
   */
  async getOrCreatePatternConfidence(
    patternId: string,
    patternType: 'guideline' | 'knowledge' | 'tool',
    baseWeight: number = 0.7
  ): Promise<PatternConfidence> {
    // Try to get existing
    const existing = this.db
      .select()
      .from(patternConfidence)
      .where(eq(patternConfidence.patternId, patternId))
      .get();

    if (existing) {
      return existing;
    }

    // Create new
    const id = generateId();
    const newPattern: NewPatternConfidence = {
      id,
      patternId,
      patternType,
      baseWeight,
      feedbackMultiplier: 1.0,
      totalMatches: 0,
      correctMatches: 0,
      incorrectMatches: 0,
      updatedAt: now(),
    };

    this.db.insert(patternConfidence).values(newPattern).run();

    logger.debug({ patternId, patternType, baseWeight }, 'Pattern confidence created');

    // Return the object we just inserted - no need to query again
    return newPattern as PatternConfidence;
  }

  /**
   * Get pattern confidence by pattern ID
   */
  async getPatternConfidence(patternId: string): Promise<PatternConfidence | undefined> {
    return this.db
      .select()
      .from(patternConfidence)
      .where(eq(patternConfidence.patternId, patternId))
      .get();
  }

  /**
   * Update pattern confidence after a match
   */
  async updatePatternConfidence(
    patternId: string,
    wasCorrect: boolean,
    newMultiplier: number
  ): Promise<void> {
    const existing = await this.getPatternConfidence(patternId);
    if (!existing) {
      logger.warn({ patternId }, 'Pattern confidence not found for update');
      return;
    }

    this.db
      .update(patternConfidence)
      .set({
        feedbackMultiplier: newMultiplier,
        totalMatches: existing.totalMatches + 1,
        correctMatches: existing.correctMatches + (wasCorrect ? 1 : 0),
        incorrectMatches: existing.incorrectMatches + (wasCorrect ? 0 : 1),
        updatedAt: now(),
      })
      .where(eq(patternConfidence.patternId, patternId))
      .run();

    logger.debug({ patternId, wasCorrect, newMultiplier }, 'Pattern confidence updated');
  }

  /**
   * Get all pattern confidence entries
   */
  async getAllPatternConfidence(): Promise<PatternConfidence[]> {
    return this.db.select().from(patternConfidence).all();
  }

  /**
   * Get pattern stats with computed accuracy
   */
  async getPatternStats(): Promise<PatternStats[]> {
    const patterns = await this.getAllPatternConfidence();
    return patterns.map((p) => ({
      patternId: p.patternId,
      patternType: p.patternType as 'guideline' | 'knowledge' | 'tool',
      baseWeight: p.baseWeight,
      feedbackMultiplier: p.feedbackMultiplier,
      totalMatches: p.totalMatches,
      correctMatches: p.correctMatches,
      incorrectMatches: p.incorrectMatches,
      accuracy: p.totalMatches > 0 ? p.correctMatches / p.totalMatches : 0.5,
    }));
  }

  /**
   * Reset pattern confidence to defaults
   */
  async resetPatternConfidence(patternId: string): Promise<void> {
    this.db
      .update(patternConfidence)
      .set({
        feedbackMultiplier: 1.0,
        totalMatches: 0,
        correctMatches: 0,
        incorrectMatches: 0,
        updatedAt: now(),
      })
      .where(eq(patternConfidence.patternId, patternId))
      .run();

    logger.debug({ patternId }, 'Pattern confidence reset');
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Hash text for aggregation (SHA-256, first 16 chars)
 */
export function hashText(text: string): string {
  return createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * Factory function to create a classification repository
 */
export function createClassificationRepository(db: DrizzleDb): ClassificationRepository {
  return new ClassificationRepository(db);
}
