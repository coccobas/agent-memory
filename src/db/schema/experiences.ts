/**
 * Experiential Memory tables: Experiences, Versions, and Trajectory Steps
 *
 * Experiential memory enables agents to learn from past interactions.
 * It operates at two abstraction levels:
 * - Case: Concrete examples with full trajectories
 * - Strategy: Abstracted patterns and insights
 *
 * Promoting to 'skill' creates a linked memory_tool entry.
 */

import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { tools } from './memory.js';

/**
 * Experience level enum
 */
export type ExperienceLevel = 'case' | 'strategy';

/**
 * Experience source enum - how this experience was created
 */
export type ExperienceSource = 'observation' | 'reflection' | 'user' | 'promotion';

/**
 * Experiences - learned patterns from past interactions
 */
export const experiences = sqliteTable(
  'experiences',
  {
    id: text('id').primaryKey(),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    scopeId: text('scope_id'),

    // Identity
    title: text('title').notNull(),
    level: text('level', { enum: ['case', 'strategy'] })
      .notNull()
      .default('case'),
    category: text('category'), // 'debugging', 'refactoring', 'api-design', etc.

    // Lifecycle
    currentVersionId: text('current_version_id'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),

    // Promotion links
    promotedToToolId: text('promoted_to_tool_id').references(() => tools.id, {
      onDelete: 'set null',
    }),
    promotedFromId: text('promoted_from_id'), // Self-reference to source experience

    // Metrics
    useCount: integer('use_count').default(0).notNull(),
    successCount: integer('success_count').default(0).notNull(),
    lastUsedAt: text('last_used_at'),

    // Audit
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_experiences_scope').on(table.scopeType, table.scopeId),
    index('idx_experiences_level').on(table.level),
    index('idx_experiences_category').on(table.category),
    uniqueIndex('idx_experiences_scope_title').on(table.scopeType, table.scopeId, table.title),
    index('idx_experiences_active').on(table.isActive),
    // Composite index for common query pattern: active entries within a scope
    index('idx_experiences_scope_active').on(table.scopeType, table.scopeId, table.isActive),
  ]
);

/**
 * Experience versions - append-only history of experience content
 */
export const experienceVersions = sqliteTable(
  'experience_versions',
  {
    id: text('id').primaryKey(),
    experienceId: text('experience_id')
      .references(() => experiences.id, { onDelete: 'cascade' })
      .notNull(),
    versionNum: integer('version_num').notNull(),

    // Content
    content: text('content').notNull(), // Main learning/insight text

    // Case-level fields (populated when level='case')
    scenario: text('scenario'), // What triggered this (context)
    outcome: text('outcome'), // Result: success/failure + details

    // Strategy-level fields (populated when level='strategy')
    pattern: text('pattern'), // Abstracted pattern description
    applicability: text('applicability'), // When to apply this
    contraindications: text('contraindications'), // When NOT to apply

    // Common
    confidence: real('confidence').default(0.5), // 0.0-1.0 based on success rate
    source: text('source', { enum: ['observation', 'reflection', 'user', 'promotion'] }),

    // Audit
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
    changeReason: text('change_reason'),
    conflictFlag: integer('conflict_flag', { mode: 'boolean' }).default(false).notNull(),
  },
  (table) => [
    index('idx_experience_versions_experience').on(table.experienceId),
    uniqueIndex('idx_experience_versions_unique').on(table.experienceId, table.versionNum),
  ]
);

/**
 * Experience trajectory steps - normalized action sequences for case-level experiences
 */
export const experienceTrajectorySteps = sqliteTable(
  'experience_trajectory_steps',
  {
    id: text('id').primaryKey(),
    experienceVersionId: text('experience_version_id')
      .references(() => experienceVersions.id, { onDelete: 'cascade' })
      .notNull(),
    stepNum: integer('step_num').notNull(),

    // Step content
    action: text('action').notNull(), // What was done
    observation: text('observation'), // What was observed
    reasoning: text('reasoning'), // Why this action
    toolUsed: text('tool_used'), // Tool/command if applicable

    // Outcome
    success: integer('success', { mode: 'boolean' }),

    // Timing
    timestamp: text('timestamp'),
    durationMs: integer('duration_ms'),

    // Audit
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_trajectory_steps_version').on(table.experienceVersionId),
    uniqueIndex('idx_trajectory_steps_order').on(table.experienceVersionId, table.stepNum),
  ]
);

// Type exports
export type Experience = typeof experiences.$inferSelect;
export type NewExperience = typeof experiences.$inferInsert;

export type ExperienceVersion = typeof experienceVersions.$inferSelect;
export type NewExperienceVersion = typeof experienceVersions.$inferInsert;

export type ExperienceTrajectoryStep = typeof experienceTrajectorySteps.$inferSelect;
export type NewExperienceTrajectoryStep = typeof experienceTrajectorySteps.$inferInsert;
