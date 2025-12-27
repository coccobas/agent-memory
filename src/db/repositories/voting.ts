/**
 * Voting Repository
 *
 * Handles database operations for multi-agent voting.
 * Provides pure data access for the voting service.
 */

import { eq } from 'drizzle-orm';
import type { DrizzleDb } from './base.js';
import { generateId } from './base.js';
import { agentVotes } from '../schema.js';
import type {
  IVotingRepository,
  RecordVoteInput,
  VoteRecord,
} from '../../core/interfaces/repositories.js';

/**
 * Create a voting repository instance
 */
export function createVotingRepository(db: DrizzleDb): IVotingRepository {
  return {
    /**
     * Record a vote from an agent for a task
     * Uses atomic upsert to avoid race conditions
     */
    async recordVote(input: RecordVoteInput): Promise<void> {
      const id = generateId();

      // Atomic upsert: insert new vote or update existing one
      // Uses the unique index on (taskId, agentId) for conflict detection
      db.insert(agentVotes)
        .values({
          id,
          taskId: input.taskId,
          agentId: input.agentId,
          voteValue: JSON.stringify(input.voteValue),
          confidence: input.confidence ?? 1.0,
          reasoning: input.reasoning ?? null,
        })
        .onConflictDoUpdate({
          target: [agentVotes.taskId, agentVotes.agentId],
          set: {
            voteValue: JSON.stringify(input.voteValue),
            confidence: input.confidence ?? 1.0,
            reasoning: input.reasoning ?? null,
          },
        })
        .run();
    },

    /**
     * Get all votes for a task
     */
    async getVotesForTask(taskId: string): Promise<VoteRecord[]> {
      const votes = db
        .select()
        .from(agentVotes)
        .where(eq(agentVotes.taskId, taskId))
        .all();

      return votes.map((vote) => ({
        id: vote.id,
        taskId: vote.taskId,
        agentId: vote.agentId,
        voteValue: JSON.parse(vote.voteValue) as unknown,
        confidence: vote.confidence,
        reasoning: vote.reasoning,
        createdAt: vote.createdAt,
      }));
    },
  };
}
