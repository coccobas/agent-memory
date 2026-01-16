/**
 * Recommendations tables: Librarian-generated promotion recommendations
 *
 * The Librarian Agent analyzes patterns in case experiences and generates
 * recommendations for promoting them to strategies or skills.
 */

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { experiences } from './experiences.js';

/**
 * Recommendation status enum
 */
export type RecommendationStatus = 'pending' | 'approved' | 'rejected' | 'skipped' | 'expired';

/**
 * Recommendation type enum - what kind of promotion is being recommended
 */
export type RecommendationType = 'strategy' | 'skill';

/**
 * Librarian recommendations - generated promotion suggestions
 */
export const recommendations = sqliteTable(
  'recommendations',
  {
    id: text('id').primaryKey(),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    scopeId: text('scope_id'),

    // Type of recommendation
    type: text('type', { enum: ['strategy', 'skill'] }).notNull(),
    status: text('status', { enum: ['pending', 'approved', 'rejected', 'skipped', 'expired'] })
      .notNull()
      .default('pending'),

    // Generated content
    title: text('title').notNull(),
    pattern: text('pattern'), // Abstracted pattern description
    applicability: text('applicability'), // When to apply this
    contraindications: text('contraindications'), // When NOT to apply
    rationale: text('rationale'), // Why this recommendation

    // Confidence and metrics
    confidence: real('confidence').notNull().default(0.5), // 0.0-1.0
    patternCount: integer('pattern_count').notNull().default(1), // Number of similar cases found
    exemplarExperienceId: text('exemplar_experience_id').references(() => experiences.id, {
      onDelete: 'set null',
    }),

    // Source experiences (JSON array of IDs)
    sourceExperienceIds: text('source_experience_ids').notNull(), // JSON array

    // Result of approval
    promotedExperienceId: text('promoted_experience_id').references(() => experiences.id, {
      onDelete: 'set null',
    }),
    promotedToolId: text('promoted_tool_id'), // If promoted to skill

    // Review metadata
    reviewedAt: text('reviewed_at'),
    reviewedBy: text('reviewed_by'),
    reviewNotes: text('review_notes'),

    // Analysis metadata
    analysisRunId: text('analysis_run_id'), // Links to specific librarian run
    analysisVersion: text('analysis_version'), // Version of analysis algorithm

    // Lifecycle
    expiresAt: text('expires_at'), // Auto-expire stale recommendations

    // Audit
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
    updatedAt: text('updated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_recommendations_scope').on(table.scopeType, table.scopeId),
    index('idx_recommendations_status').on(table.status),
    index('idx_recommendations_type').on(table.type),
    index('idx_recommendations_confidence').on(table.confidence),
    index('idx_recommendations_created').on(table.createdAt),
    index('idx_recommendations_expires').on(table.expiresAt),
  ]
);

/**
 * Recommendation source experiences - many-to-many link
 * More detailed than the JSON array for complex queries
 */
export const recommendationSources = sqliteTable(
  'recommendation_sources',
  {
    id: text('id').primaryKey(),
    recommendationId: text('recommendation_id')
      .references(() => recommendations.id, { onDelete: 'cascade' })
      .notNull(),
    experienceId: text('experience_id')
      .references(() => experiences.id, { onDelete: 'cascade' })
      .notNull(),

    // Role in the pattern
    isExemplar: integer('is_exemplar', { mode: 'boolean' }).default(false).notNull(),
    similarityScore: real('similarity_score'), // How similar to the exemplar

    // Audit
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_rec_sources_recommendation').on(table.recommendationId),
    index('idx_rec_sources_experience').on(table.experienceId),
  ]
);

// Type exports
export type Recommendation = typeof recommendations.$inferSelect;
export type NewRecommendation = typeof recommendations.$inferInsert;

export type RecommendationSource = typeof recommendationSources.$inferSelect;
export type NewRecommendationSource = typeof recommendationSources.$inferInsert;
