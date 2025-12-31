/**
 * Classification schema - Hybrid classification with learning
 *
 * Tables for tracking:
 * - Classification feedback (corrections and outcomes)
 * - Pattern confidence (learned adjustments)
 */

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Classification method enum - how the classification was determined
 */
export type ClassificationMethod = 'regex' | 'llm' | 'hybrid' | 'forced';

/**
 * Entry type for classification
 */
export type ClassifiedEntryType = 'guideline' | 'knowledge' | 'tool';

/**
 * Classification feedback - track classification outcomes for learning
 *
 * Records each classification decision and whether it was correct.
 * When user provides forceType that differs from prediction, this
 * creates a correction signal that updates pattern confidence.
 */
export const classificationFeedback = sqliteTable(
  'classification_feedback',
  {
    id: text('id').primaryKey(),

    // Input context
    textHash: text('text_hash').notNull(), // SHA-256 hash for aggregation
    textPreview: text('text_preview'), // First 100 chars for debugging
    sessionId: text('session_id'),

    // Classification result
    predictedType: text('predicted_type', {
      enum: ['guideline', 'knowledge', 'tool'],
    }).notNull(),
    actualType: text('actual_type', {
      enum: ['guideline', 'knowledge', 'tool'],
    }).notNull(),
    method: text('method', {
      enum: ['regex', 'llm', 'hybrid', 'forced'],
    }).notNull(),
    confidence: real('confidence').notNull(),

    // Pattern tracking (JSON array of pattern IDs that matched)
    matchedPatterns: text('matched_patterns'),

    // Outcome
    wasCorrect: integer('was_correct', { mode: 'boolean' }).notNull(),

    // Timestamps
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_classification_feedback_text_hash').on(table.textHash),
    index('idx_classification_feedback_predicted').on(table.predictedType, table.wasCorrect),
    index('idx_classification_feedback_created').on(table.createdAt),
    index('idx_classification_feedback_session').on(table.sessionId),
  ]
);

/**
 * Pattern confidence - learned adjustments for classification patterns
 *
 * Stores the feedback multiplier for each pattern, which is updated
 * based on classification outcomes. Patterns with high accuracy get
 * boosted, while frequently-corrected patterns get penalized.
 */
export const patternConfidence = sqliteTable(
  'pattern_confidence',
  {
    id: text('id').primaryKey(),

    // Pattern identification
    patternId: text('pattern_id').notNull().unique(), // Unique identifier (e.g., 'guideline_rule_prefix')
    patternType: text('pattern_type', {
      enum: ['guideline', 'knowledge', 'tool'],
    }).notNull(),

    // Confidence metrics
    baseWeight: real('base_weight').default(0.7).notNull(), // Initial pattern weight
    feedbackMultiplier: real('feedback_multiplier').default(1.0).notNull(), // Learned adjustment [0.7-1.15]

    // Usage statistics
    totalMatches: integer('total_matches').default(0).notNull(),
    correctMatches: integer('correct_matches').default(0).notNull(),
    incorrectMatches: integer('incorrect_matches').default(0).notNull(),

    // Timestamps
    updatedAt: text('updated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_pattern_confidence_type').on(table.patternType),
    index('idx_pattern_confidence_multiplier').on(table.feedbackMultiplier),
  ]
);

// Type exports
export type ClassificationFeedback = typeof classificationFeedback.$inferSelect;
export type NewClassificationFeedback = typeof classificationFeedback.$inferInsert;

export type PatternConfidence = typeof patternConfidence.$inferSelect;
export type NewPatternConfidence = typeof patternConfidence.$inferInsert;
