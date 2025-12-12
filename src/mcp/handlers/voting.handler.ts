/**
 * Voting handlers for multi-agent consensus
 *
 * Implements First-to-Ahead-by-k voting algorithm for multi-agent coordination.
 */

import {
  recordVote,
  calculateConsensus,
  listVotes,
  getVotingStats,
} from '../../services/voting.service.js';

export interface VotingRecordVoteParams {
  taskId: string;
  agentId: string;
  voteValue: unknown;
  confidence?: number;
  reasoning?: string;
}

export interface VotingGetConsensusParams {
  taskId: string;
  k?: number; // Number of votes ahead required (default: 1)
}

export interface VotingListVotesParams {
  taskId: string;
}

export interface VotingGetStatsParams {
  taskId: string;
}

/**
 * Record a vote from an agent for a task
 */
export function recordVoteHandler(params: Record<string, unknown>): {
  success: boolean;
  taskId: string;
  agentId: string;
  message: string;
} {
  const { taskId, agentId, voteValue, confidence, reasoning } =
    params as unknown as VotingRecordVoteParams;

  if (!taskId || !agentId || voteValue === undefined) {
    throw new Error('taskId, agentId, and voteValue are required');
  }

  recordVote({
    taskId,
    agentId,
    voteValue,
    confidence,
    reasoning,
  });

  return {
    success: true,
    taskId,
    agentId,
    message: 'Vote recorded successfully',
  };
}

/**
 * Get consensus for a task using First-to-Ahead-by-k algorithm
 */
export function getConsensusHandler(params: Record<string, unknown>): {
  consensus: unknown;
  voteCount: number;
  confidence: number;
  dissentingVotes: Array<{ agentId: string; vote: unknown; confidence: number }>;
  voteDistribution: Array<{ voteValue: unknown; count: number; agents: string[] }>;
  k: number;
} {
  const { taskId, k = 1 } = params as unknown as VotingGetConsensusParams;

  if (!taskId) {
    throw new Error('taskId is required');
  }

  if (k < 1) {
    throw new Error('k must be at least 1');
  }

  const result = calculateConsensus(taskId, k);

  return {
    ...result,
    k,
  };
}

/**
 * List all votes for a task
 */
export function listVotesHandler(params: Record<string, unknown>): {
  votes: Array<{
    id: string;
    agentId: string;
    voteValue: unknown;
    confidence: number;
    reasoning: string | null;
    createdAt: string;
  }>;
  taskId: string;
} {
  const { taskId } = params as unknown as VotingListVotesParams;

  if (!taskId) {
    throw new Error('taskId is required');
  }

  const votes = listVotes(taskId);

  return {
    votes,
    taskId,
  };
}

/**
 * Get voting statistics for a task
 */
export function getStatsHandler(params: Record<string, unknown>): {
  totalVotes: number;
  uniqueOptions: number;
  consensusReached: boolean;
  consensusValue: unknown;
  k: number;
  voteDistribution: Array<{ voteValue: unknown; count: number; agents: string[] }>;
} {
  const { taskId } = params as unknown as VotingGetStatsParams;

  if (!taskId) {
    throw new Error('taskId is required');
  }

  return getVotingStats(taskId);
}

export const votingHandlers = {
  record_vote: recordVoteHandler,
  get_consensus: getConsensusHandler,
  list_votes: listVotesHandler,
  get_stats: getStatsHandler,
};
