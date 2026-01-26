import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { sessions, projects } from './scopes.js';
import { episodes } from './episodes.js';

export const ideTranscripts = sqliteTable(
  'ide_transcripts',
  {
    id: text('id').primaryKey(),
    ideName: text('ide_name').notNull(),
    ideSessionId: text('ide_session_id').notNull(),
    agentMemorySessionId: text('agent_memory_session_id').references(() => sessions.id, {
      onDelete: 'set null',
    }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    projectPath: text('project_path'),
    title: text('title'),
    importedAt: text('imported_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    lastMessageTimestamp: text('last_message_timestamp'),
    messageCount: integer('message_count').default(0),
    isSealed: integer('is_sealed', { mode: 'boolean' }).default(false),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (table) => [
    uniqueIndex('idx_ide_transcripts_unique').on(table.ideName, table.ideSessionId),
    index('idx_ide_transcripts_session').on(table.agentMemorySessionId),
    index('idx_ide_transcripts_project').on(table.projectId),
  ]
);

export const ideTranscriptMessages = sqliteTable(
  'ide_transcript_messages',
  {
    id: text('id').primaryKey(),
    transcriptId: text('transcript_id')
      .references(() => ideTranscripts.id, { onDelete: 'cascade' })
      .notNull(),
    ideMessageId: text('ide_message_id').notNull(),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    content: text('content').notNull(),
    toolsUsed: text('tools_used', { mode: 'json' }).$type<string[]>(),
    timestamp: text('timestamp').notNull(),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    episodeId: text('episode_id').references(() => episodes.id, { onDelete: 'set null' }),
    relevanceScore: real('relevance_score'),
    relevanceCategory: text('relevance_category', { enum: ['high', 'medium', 'low'] }),
    relevanceScoredAt: text('relevance_scored_at'),
  },
  (table) => [
    uniqueIndex('idx_transcript_messages_unique').on(table.transcriptId, table.ideMessageId),
    index('idx_transcript_messages_timestamp').on(table.transcriptId, table.timestamp),
    index('idx_transcript_messages_episode').on(table.episodeId),
    index('idx_transcript_messages_relevance').on(table.relevanceCategory),
  ]
);

export type IDETranscript = typeof ideTranscripts.$inferSelect;
export type NewIDETranscript = typeof ideTranscripts.$inferInsert;
export type IDETranscriptMessage = typeof ideTranscriptMessages.$inferSelect;
export type NewIDETranscriptMessage = typeof ideTranscriptMessages.$inferInsert;
