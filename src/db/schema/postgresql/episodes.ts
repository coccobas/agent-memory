/**
 * PostgreSQL Episodes Schema: First-class temporal constructs
 *
 * Episodes enable bounded activity grouping for:
 * - "What happened during X?" queries
 * - Causal chain analysis ("what led to this?")
 * - Timeline navigation and range queries
 */

import { pgTable, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { sessions, projects } from './scopes.js';
import { conversations } from './conversations.js';

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
export const episodes = pgTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    scopeId: text('scope_id'),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id').references(() => conversations.id),

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
    plannedAt: timestamp('planned_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),

    // Hierarchy
    parentEpisodeId: text('parent_episode_id'),
    depth: integer('depth').default(0),

    // Trigger information
    triggerType: text('trigger_type'), // 'user_request', 'system_event', 'scheduled', etc.
    triggerRef: text('trigger_ref'),

    // Metadata
    tags: jsonb('tags').$type<string[]>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    // Lifecycle
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    isActive: integer('is_active').default(1).notNull(),
  },
  (table) => [
    index('idx_episodes_project').on(table.projectId),
    index('idx_episodes_session').on(table.sessionId),
    index('idx_episodes_conversation').on(table.conversationId),
    index('idx_episodes_status').on(table.status),
    index('idx_episodes_time_range').on(table.startedAt, table.endedAt),
    index('idx_episodes_scope').on(table.scopeType, table.scopeId),
    index('idx_episodes_parent').on(table.parentEpisodeId),
  ]
);

/**
 * Episode events - discrete events within an episode
 */
export const episodeEvents = pgTable(
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
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    sequenceNum: integer('sequence_num').notNull(),

    // Linked entity
    entryType: text('entry_type'), // 'guideline', 'knowledge', 'tool', 'experience', 'task'
    entryId: text('entry_id'),

    // Event data
    data: jsonb('data').$type<Record<string, unknown>>(),

    // Audit
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_episode_events_episode').on(table.episodeId),
    index('idx_episode_events_sequence').on(table.episodeId, table.sequenceNum),
  ]
);

// Type exports
export type Episode = typeof episodes.$inferSelect;
export type NewEpisode = typeof episodes.$inferInsert;

export type EpisodeEvent = typeof episodeEvents.$inferSelect;
export type NewEpisodeEvent = typeof episodeEvents.$inferInsert;
