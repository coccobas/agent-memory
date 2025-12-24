/**
 * PostgreSQL Multi-agent voting table for consensus
 */

import { pgTable, text, real, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Agent votes - tracks votes from multiple agents for consensus
 */
export const agentVotes = pgTable(
  'agent_votes',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull(),
    agentId: text('agent_id').notNull(),
    voteValue: text('vote_value').notNull(),
    confidence: real('confidence').default(1.0).notNull(),
    reasoning: text('reasoning'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
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
