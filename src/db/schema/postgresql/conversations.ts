/**
 * PostgreSQL Conversation history tables
 */

import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sessions, projects } from './scopes.js';
import { episodes } from './episodes.js';
import type { EntryType } from './types.js';

/**
 * Conversations - tracks conversation threads between agents and users
 */
export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    agentId: text('agent_id'),
    title: text('title'),
    status: text('status', { enum: ['active', 'completed', 'archived'] })
      .default('active')
      .notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (table) => [
    index('idx_conversations_session').on(table.sessionId),
    index('idx_conversations_project').on(table.projectId),
    index('idx_conversations_agent').on(table.agentId),
    index('idx_conversations_status').on(table.status),
    index('idx_conversations_started').on(table.startedAt),
  ]
);

/**
 * Conversation messages - individual messages in conversations
 */
export const conversationMessages = pgTable(
  'conversation_messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    episodeId: text('episode_id').references(() => episodes.id, { onDelete: 'set null' }),
    role: text('role', { enum: ['user', 'agent', 'system'] }).notNull(),
    content: text('content').notNull(),
    messageIndex: integer('message_index').notNull(),
    contextEntries: jsonb('context_entries').$type<Array<{ type: EntryType; id: string }>>(),
    toolsUsed: jsonb('tools_used').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    relevanceScore: real('relevance_score'),
    relevanceCategory: text('relevance_category', { enum: ['high', 'medium', 'low'] }),
    relevanceScoredAt: timestamp('relevance_scored_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_messages_conversation').on(table.conversationId),
    index('idx_messages_episode').on(table.episodeId),
    index('idx_messages_index').on(table.conversationId, table.messageIndex),
    index('idx_messages_role').on(table.conversationId, table.role),
    index('idx_messages_relevance').on(table.relevanceCategory),
  ]
);

/**
 * Conversation context - links memory entries to conversations/messages
 */
export const conversationContext = pgTable(
  'conversation_context',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    messageId: text('message_id').references(() => conversationMessages.id, {
      onDelete: 'cascade',
    }),
    entryType: text('entry_type', {
      enum: ['tool', 'guideline', 'knowledge'],
    }).notNull(),
    entryId: text('entry_id').notNull(),
    relevanceScore: real('relevance_score'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_context_conversation').on(table.conversationId),
    index('idx_context_message').on(table.messageId),
    index('idx_context_entry').on(table.entryType, table.entryId),
    uniqueIndex('idx_context_unique').on(
      table.conversationId,
      table.messageId,
      table.entryType,
      table.entryId
    ),
  ]
);

// Type exports
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type NewConversationMessage = typeof conversationMessages.$inferInsert;
export type ConversationContext = typeof conversationContext.$inferSelect;
export type NewConversationContext = typeof conversationContext.$inferInsert;
