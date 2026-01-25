/**
 * Conversation history tables
 */

import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { sessions, projects } from './scopes.js';
import { episodes } from './episodes.js';
import type { EntryType } from './types.js';

/**
 * Conversations - tracks conversation threads between agents and users
 */
export const conversations = sqliteTable(
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
    startedAt: text('started_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    endedAt: text('ended_at'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
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
export const conversationMessages = sqliteTable(
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
    contextEntries: text('context_entries', {
      mode: 'json',
    }).$type<Array<{ type: EntryType; id: string }>>(),
    toolsUsed: text('tools_used', { mode: 'json' }).$type<string[]>(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    relevanceScore: real('relevance_score'),
    relevanceCategory: text('relevance_category', { enum: ['high', 'medium', 'low'] }),
    relevanceScoredAt: text('relevance_scored_at'),
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
export const conversationContext = sqliteTable(
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
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
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
