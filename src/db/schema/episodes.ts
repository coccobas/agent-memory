/**
 * Episodes Schema: First-class temporal constructs
 *
 * Episodes enable bounded activity grouping for:
 * - "What happened during X?" queries
 * - Causal chain analysis ("what led to this?")
 * - Timeline navigation and range queries
 */

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { sessions } from './scopes.js';

/**
 * Episode status enum
 */
export type EpisodeStatus = 'planned' | 'active' | 'completed' | 'failed' | 'cancelled';

/**
 * Episode outcome type enum
 */
export type EpisodeOutcomeType = 'success' | 'partial' | 'failure' | 'abandoned';

/**
 * Episode event type enum
 */
export type EpisodeEventType = 'started' | 'checkpoint' | 'decision' | 'error' | 'completed';

/**
 * Episodes - bounded activity groupings with temporal boundaries
 */
export const episodes = sqliteTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    scopeId: text('scope_id'),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'cascade' }),

    // Identity
    name: text('name').notNull(),
    description: text('description'),

    // Status & Outcome
    status: text('status', {
      enum: ['planned', 'active', 'completed', 'failed', 'cancelled'],
    })
      .notNull()
      .default('planned'),
    outcome: text('outcome'),
    outcomeType: text('outcome_type', {
      enum: ['success', 'partial', 'failure', 'abandoned'],
    }),

    // Temporal bounds
    plannedAt: text('planned_at'),
    startedAt: text('started_at'),
    endedAt: text('ended_at'),
    durationMs: integer('duration_ms'),

    // Hierarchy
    parentEpisodeId: text('parent_episode_id'),
    depth: integer('depth').default(0),

    // Trigger information
    triggerType: text('trigger_type'), // 'user_request', 'system_event', 'scheduled', etc.
    triggerRef: text('trigger_ref'),

    // Metadata
    tags: text('tags'), // JSON array
    metadata: text('metadata'), // JSON

    // Lifecycle
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  },
  (table) => [
    index('idx_episodes_session').on(table.sessionId),
    index('idx_episodes_status').on(table.status),
    index('idx_episodes_time_range').on(table.startedAt, table.endedAt),
    index('idx_episodes_scope').on(table.scopeType, table.scopeId),
    index('idx_episodes_parent').on(table.parentEpisodeId),
  ]
);

/**
 * Episode events - discrete events within an episode
 */
export const episodeEvents = sqliteTable(
  'episode_events',
  {
    id: text('id').primaryKey(),
    episodeId: text('episode_id')
      .references(() => episodes.id, { onDelete: 'cascade' })
      .notNull(),

    // Event details
    eventType: text('event_type').notNull(), // 'started', 'checkpoint', 'decision', 'error', 'completed'
    name: text('name').notNull(),
    description: text('description'),

    // Temporal
    occurredAt: text('occurred_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    sequenceNum: integer('sequence_num').notNull(),

    // Linked entity
    entryType: text('entry_type'), // 'guideline', 'knowledge', 'tool', 'experience', 'task'
    entryId: text('entry_id'),

    // Event data
    data: text('data'), // JSON

    // Audit
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_episode_events_episode').on(table.episodeId),
    uniqueIndex('idx_episode_events_sequence').on(table.episodeId, table.sequenceNum),
  ]
);

// Type exports
export type Episode = typeof episodes.$inferSelect;
export type NewEpisode = typeof episodes.$inferInsert;

export type EpisodeEvent = typeof episodeEvents.$inferSelect;
export type NewEpisodeEvent = typeof episodeEvents.$inferInsert;
