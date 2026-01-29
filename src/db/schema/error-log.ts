import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const errorLog = sqliteTable(
  'error_log',
  {
    id: text('id').primaryKey().notNull(),
    sessionId: text('session_id').notNull(),
    projectId: text('project_id'),
    toolName: text('tool_name').notNull(),
    errorType: text('error_type').notNull(),
    errorMessage: text('error_message'),
    errorSignature: text('error_signature').notNull(),
    occurrenceCount: integer('occurrence_count').default(1).notNull(),
    firstOccurrence: text('first_occurrence').notNull(),
    lastOccurrence: text('last_occurrence').notNull(),
    toolInputHash: text('tool_input_hash'),
    analyzed: integer('analyzed').default(0).notNull(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    sessionIdx: index('idx_error_log_session').on(table.sessionId),
    projectIdx: index('idx_error_log_project').on(table.projectId),
    signatureIdx: index('idx_error_log_signature').on(table.errorSignature),
    analyzedIdx: index('idx_error_log_analyzed').on(table.analyzed),
    sessionSignatureIdx: index('idx_error_log_session_signature').on(
      table.sessionId,
      table.errorSignature
    ),
  })
);

export type ErrorLog = typeof errorLog.$inferSelect;
export type NewErrorLog = typeof errorLog.$inferInsert;
