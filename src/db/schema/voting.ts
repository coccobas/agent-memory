/**
 * Multi-agent voting table for consensus
 */

import { sqliteTable, text, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Agent votes - tracks votes from multiple agents for consensus
 */
export const agentVotes = sqliteTable(
  'agent_votes',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull(),
    agentId: text('agent_id').notNull(),
    voteValue: text('vote_value').notNull(),
    confidence: real('confidence').default(1.0).notNull(),
    reasoning: text('reasoning'),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_votes_task').on(table.taskId),
    index('idx_votes_agent').on(table.agentId),
    uniqueIndex('idx_votes_unique').on(table.taskId, table.agentId),
  ]
);

// Type exports
export type AgentVote = typeof agentVotes.$inferSelect;
export type NewAgentVote = typeof agentVotes.$inferInsert;
