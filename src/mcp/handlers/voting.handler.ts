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
import type {
  VotingRecordVoteParams,
  VotingGetConsensusParams,
  VotingListVotesParams,
  VotingGetStatsParams,
} from '../types.js';
import { createValidationError } from '../../core/errors.js';

/**
 * Record a vote from an agent for a task
 */
export function recordVoteHandler(params: VotingRecordVoteParams): {
  success: boolean;
  taskId: string;
  agentId: string;
  message: string;
} {
  if (!params.taskId || !params.agentId || params.voteValue === undefined) {
    throw createValidationError(
      'taskId, agentId, and voteValue',
      'are required',
      'Provide all required fields to record a vote'
    );
  }

  recordVote({
    taskId: params.taskId,
    agentId: params.agentId,
    voteValue: params.voteValue,
    confidence: params.confidence,
    reasoning: params.reasoning,
  });

  return {
    success: true,
    taskId: params.taskId,
    agentId: params.agentId,
    message: 'Vote recorded successfully',
  };
}

/**
 * Get consensus for a task using First-to-Ahead-by-k algorithm
 */
export function getConsensusHandler(params: VotingGetConsensusParams): {
  consensus: unknown;
  voteCount: number;
  confidence: number;
  dissentingVotes: Array<{ agentId: string; vote: unknown; confidence: number }>;
  voteDistribution: Array<{ voteValue: unknown; count: number; agents: string[] }>;
  k: number;
} {
  if (!params.taskId) {
    throw createValidationError('taskId', 'is required', 'Provide the task ID to get consensus for');
  }

  const k = params.k ?? 1;
  if (k < 1) {
    throw createValidationError(
      'k',
      'must be at least 1',
      'The k parameter defines how many votes ahead are needed for consensus'
    );
  }

  const result = calculateConsensus(params.taskId, k);

  return {
    ...result,
    k,
  };
}

/**
 * List all votes for a task
 */
export function listVotesHandler(params: VotingListVotesParams): {
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
  if (!params.taskId) {
    throw createValidationError('taskId', 'is required', 'Provide the task ID to list votes for');
  }

  const votes = listVotes(params.taskId);

  return {
    votes,
    taskId: params.taskId,
  };
}

/**
 * Get voting statistics for a task
 */
export function getStatsHandler(params: VotingGetStatsParams): {
  totalVotes: number;
  uniqueOptions: number;
  consensusReached: boolean;
  consensusValue: unknown;
  k: number;
  voteDistribution: Array<{ voteValue: unknown; count: number; agents: string[] }>;
} {
  if (!params.taskId) {
    throw createValidationError('taskId', 'is required', 'Provide the task ID to get stats for');
  }

  return getVotingStats(params.taskId);
}

export const votingHandlers = {
  record_vote: recordVoteHandler,
  get_consensus: getConsensusHandler,
  list_votes: listVotesHandler,
  get_stats: getStatsHandler,
};
