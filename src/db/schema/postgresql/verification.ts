/**
 * PostgreSQL Verification tables for guideline compliance
 */

import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sessions } from './scopes.js';
import { guidelines } from './memory.js';

/**
 * Session guideline acknowledgments - tracks which guidelines have been acknowledged per session
 */
export const sessionGuidelineAcknowledgments = pgTable(
  'session_guideline_acknowledgments',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .references(() => sessions.id, { onDelete: 'cascade' })
      .notNull(),
    guidelineId: text('guideline_id')
      .references(() => guidelines.id, { onDelete: 'cascade' })
      .notNull(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }).defaultNow().notNull(),
    acknowledgedBy: text('acknowledged_by'),
  },
  (table) => [
    index('idx_session_acknowledgments_session').on(table.sessionId),
    uniqueIndex('idx_session_acknowledgments_unique').on(table.sessionId, table.guidelineId),
  ]
);

/**
 * Verification log - tracks all verification checks
 */
export const verificationLog = pgTable(
  'verification_log',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    actionType: text('action_type', {
      enum: ['pre_check', 'post_check', 'acknowledge'],
    }).notNull(),
    proposedAction: jsonb('proposed_action').$type<{
      type: string;
      description?: string;
      filePath?: string;
      content?: string;
      metadata?: Record<string, unknown>;
    }>(),
    result: jsonb('result')
      .$type<{
        allowed: boolean;
        blocked: boolean;
        violations: Array<{
          guidelineId: string;
          guidelineName: string;
          severity: string;
          message: string;
          suggestedAction?: string;
        }>;
        warnings: string[];
        requiresConfirmation: boolean;
      }>()
      .notNull(),
    guidelineIds: jsonb('guideline_ids').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_verification_log_session').on(table.sessionId),
    index('idx_verification_log_action_type').on(table.actionType),
    index('idx_verification_log_created_at').on(table.createdAt),
  ]
);

// Type exports
export type SessionGuidelineAcknowledgment = typeof sessionGuidelineAcknowledgments.$inferSelect;
export type NewSessionGuidelineAcknowledgment = typeof sessionGuidelineAcknowledgments.$inferInsert;
export type VerificationLog = typeof verificationLog.$inferSelect;
export type NewVerificationLog = typeof verificationLog.$inferInsert;
