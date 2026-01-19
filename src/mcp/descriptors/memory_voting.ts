/**
 * memory_voting tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { votingHandlers } from '../handlers/voting.handler.js';
import type {
  VotingRecordVoteParams,
  VotingGetConsensusParams,
  VotingListVotesParams,
  VotingGetStatsParams,
} from '../types.js';

export const memoryVotingDescriptor: ToolDescriptor = {
  name: 'memory_voting',
  visibility: 'experimental',
  description:
    'Manage multi-agent voting and consensus. Actions: record_vote, get_consensus, list_votes, get_stats',
  commonParams: {
    taskId: { type: 'string', description: 'Task ID (references knowledge/tool entry)' },
    agentId: { type: 'string', description: 'Agent identifier' },
    voteValue: {
      type: 'object',
      description: 'Agent vote value (any JSON-serializable value)',
    },
    confidence: { type: 'number', description: 'Confidence level 0-1 (default: 1.0)' },
    reasoning: { type: 'string', description: 'Reasoning for this vote' },
    k: {
      type: 'number',
      description: 'Number of votes ahead required for consensus (default: 1)',
    },
  },
  actions: {
    record_vote: {
      contextHandler: (ctx, p) =>
        votingHandlers.record_vote(ctx, p as unknown as VotingRecordVoteParams),
    },
    get_consensus: {
      contextHandler: (ctx, p) =>
        votingHandlers.get_consensus(ctx, p as unknown as VotingGetConsensusParams),
    },
    list_votes: {
      contextHandler: (ctx, p) =>
        votingHandlers.list_votes(ctx, p as unknown as VotingListVotesParams),
    },
    get_stats: {
      contextHandler: (ctx, p) =>
        votingHandlers.get_stats(ctx, p as unknown as VotingGetStatsParams),
    },
  },
};
