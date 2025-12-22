/**
 * Voting service for multi-agent consensus
 *
 * Implements First-to-Ahead-by-k voting algorithm where consensus is reached
 * when one option is k votes ahead of all other options.
 */

import { getDb, type DbClient } from '../db/connection.js';
import { agentVotes } from '../db/schema.js';
import { generateId } from '../db/repositories/base.js';
import { eq } from 'drizzle-orm';

export interface RecordVoteParams {
  taskId: string;
  agentId: string;
  voteValue: unknown;
  confidence?: number;
  reasoning?: string;
}

export interface ConsensusResult {
  consensus: unknown;
  voteCount: number;
  confidence: number;
  dissentingVotes: Array<{ agentId: string; vote: unknown; confidence: number }>;
  voteDistribution: Array<{ voteValue: unknown; count: number; agents: string[] }>;
}

/**
 * Record a vote from an agent for a task
 *
 * Uses atomic upsert to avoid race conditions when the same agent
 * votes multiple times in quick succession.
 *
 * @param params - Vote parameters
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
export function recordVote(params: RecordVoteParams, dbClient?: DbClient): void {
  const db = dbClient ?? getDb();
  const id = generateId();

  // Atomic upsert: insert new vote or update existing one
  // Uses the unique index on (taskId, agentId) for conflict detection
  db.insert(agentVotes)
    .values({
      id,
      taskId: params.taskId,
      agentId: params.agentId,
      voteValue: JSON.stringify(params.voteValue),
      confidence: params.confidence ?? 1.0,
      reasoning: params.reasoning ?? null,
    })
    .onConflictDoUpdate({
      target: [agentVotes.taskId, agentVotes.agentId],
      set: {
        voteValue: JSON.stringify(params.voteValue),
        confidence: params.confidence ?? 1.0,
        reasoning: params.reasoning ?? null,
      },
    })
    .run();
}

/**
 * Calculate consensus using First-to-Ahead-by-k algorithm
 *
 * Consensus is reached when one option is k votes ahead of all other options.
 * Returns null if no consensus is reached.
 *
 * @param taskId - The task ID to calculate consensus for
 * @param k - The number of votes ahead required (default: 1)
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 * @returns Consensus result with vote distribution and dissenting votes
 */
export function calculateConsensus(
  taskId: string,
  k: number = 1,
  dbClient?: DbClient
): ConsensusResult {
  const db = dbClient ?? getDb();

  // Get all votes for this task
  const votes = db.select().from(agentVotes).where(eq(agentVotes.taskId, taskId)).all();

  if (votes.length === 0) {
    return {
      consensus: null,
      voteCount: 0,
      confidence: 0,
      dissentingVotes: [],
      voteDistribution: [],
    };
  }

  // Group votes by value and count occurrences
  const voteMap = new Map<string, { count: number; agents: string[]; confidences: number[] }>();

  for (const vote of votes) {
    const voteKey = vote.voteValue; // Already a JSON string
    const existing = voteMap.get(voteKey);

    if (existing) {
      existing.count++;
      existing.agents.push(vote.agentId);
      existing.confidences.push(vote.confidence);
    } else {
      voteMap.set(voteKey, {
        count: 1,
        agents: [vote.agentId],
        confidences: [vote.confidence],
      });
    }
  }

  // Convert to array and sort by count (descending)
  const voteDistribution = Array.from(voteMap.entries())
    .map(([voteValue, data]) => ({
      voteValue: JSON.parse(voteValue) as unknown,
      count: data.count,
      agents: data.agents,
      avgConfidence: data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length,
    }))
    .sort((a, b) => b.count - a.count);

  if (voteDistribution.length === 0) {
    return {
      consensus: null,
      voteCount: votes.length,
      confidence: 0,
      dissentingVotes: [],
      voteDistribution: [],
    };
  }

  // Safe access - we've already verified voteDistribution.length > 0 above
  const topVote = voteDistribution[0];
  if (!topVote) {
    // Defensive guard - should never happen given the length check above
    return {
      consensus: null,
      voteCount: votes.length,
      confidence: 0,
      dissentingVotes: [],
      voteDistribution: [],
    };
  }
  const secondVote = voteDistribution.length > 1 ? voteDistribution[1] : null;

  // Check if top vote is k votes ahead
  const isConsensus = secondVote === null || topVote.count - (secondVote?.count ?? 0) >= k;

  // Calculate overall confidence (weighted average of top vote's confidence)
  const consensusConfidence = isConsensus && topVote ? topVote.avgConfidence : 0;

  // Get dissenting votes (all votes that are not the consensus)
  const dissentingVotes: Array<{ agentId: string; vote: unknown; confidence: number }> = [];
  if (isConsensus && topVote) {
    for (const vote of votes) {
      const parsedVote = JSON.parse(vote.voteValue) as unknown;
      const consensusValue = topVote.voteValue;

      // Deep equality check (simple string comparison for now)
      if (vote.voteValue !== JSON.stringify(consensusValue)) {
        dissentingVotes.push({
          agentId: vote.agentId,
          vote: parsedVote,
          confidence: vote.confidence,
        });
      }
    }
  } else {
    // If no consensus, all votes are dissenting
    for (const vote of votes) {
      dissentingVotes.push({
        agentId: vote.agentId,
        vote: JSON.parse(vote.voteValue) as unknown,
        confidence: vote.confidence,
      });
    }
  }

  return {
    consensus: isConsensus && topVote ? topVote.voteValue : null,
    voteCount: votes.length,
    confidence: consensusConfidence,
    dissentingVotes,
    voteDistribution: voteDistribution.map((v) => ({
      voteValue: v.voteValue,
      count: v.count,
      agents: v.agents,
    })),
  };
}

/**
 * List all votes for a task
 *
 * @param taskId - The task ID to list votes for
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
export function listVotes(
  taskId: string,
  dbClient?: DbClient
): Array<{
  id: string;
  agentId: string;
  voteValue: unknown;
  confidence: number;
  reasoning: string | null;
  createdAt: string;
}> {
  const db = dbClient ?? getDb();

  const votes = db.select().from(agentVotes).where(eq(agentVotes.taskId, taskId)).all();

  return votes.map((vote) => ({
    id: vote.id,
    agentId: vote.agentId,
    voteValue: JSON.parse(vote.voteValue) as unknown,
    confidence: vote.confidence,
    reasoning: vote.reasoning,
    createdAt: vote.createdAt,
  }));
}

/**
 * Get voting statistics for a task
 *
 * @param taskId - The task ID to get stats for
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
export function getVotingStats(
  taskId: string,
  dbClient?: DbClient
): {
  totalVotes: number;
  uniqueOptions: number;
  consensusReached: boolean;
  consensusValue: unknown;
  k: number;
  voteDistribution: Array<{ voteValue: unknown; count: number; agents: string[] }>;
} {
  const consensus = calculateConsensus(taskId, 1, dbClient);
  return {
    totalVotes: consensus.voteCount,
    uniqueOptions: consensus.voteDistribution.length,
    consensusReached: consensus.consensus !== null,
    consensusValue: consensus.consensus,
    k: 1,
    voteDistribution: consensus.voteDistribution,
  };
}
