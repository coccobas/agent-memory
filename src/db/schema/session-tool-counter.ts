import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const sessionToolCounter = sqliteTable('session_tool_counter', {
  sessionId: text('session_id').primaryKey().notNull(),
  toolCount: integer('tool_count').default(0).notNull(),
  lastAnalysisCount: integer('last_analysis_count').default(0).notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export type SessionToolCounter = typeof sessionToolCounter.$inferSelect;
export type NewSessionToolCounter = typeof sessionToolCounter.$inferInsert;
