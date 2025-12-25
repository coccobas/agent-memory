import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  votingHandlers,
  recordVoteHandler,
  getConsensusHandler,
  listVotesHandler,
  getStatsHandler,
} from '../../src/mcp/handlers/voting.handler.js';
import * as votingService from '../../src/services/voting.service.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/services/voting.service.js');

describe('Voting Handler', () => {
  let mockContext: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {
      db: {} as any,
      repos: {} as any,
      services: {} as any,
    };
  });

  describe('recordVoteHandler', () => {
    it('should record a vote successfully', async () => {
      vi.mocked(votingService.recordVote).mockReturnValue(undefined);

      const result = await recordVoteHandler(mockContext, {
        taskId: 'task-1',
        agentId: 'agent-1',
        voteValue: { option: 'A' },
      });

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('task-1');
      expect(result.agentId).toBe('agent-1');
      expect(result.message).toContain('recorded');
    });

    it('should pass confidence and reasoning', async () => {
      vi.mocked(votingService.recordVote).mockReturnValue(undefined);

      await recordVoteHandler(mockContext, {
        taskId: 'task-1',
        agentId: 'agent-1',
        voteValue: 'option-a',
        confidence: 0.9,
        reasoning: 'Best option based on criteria',
      });

      expect(votingService.recordVote).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-1',
          agentId: 'agent-1',
          voteValue: 'option-a',
          confidence: 0.9,
          reasoning: 'Best option based on criteria',
        }),
        mockContext.db
      );
    });

    it('should throw when taskId is missing', async () => {
      await expect(
        recordVoteHandler(mockContext, {
          agentId: 'agent-1',
          voteValue: 'A',
        })
      ).rejects.toThrow();
    });

    it('should throw when agentId is missing', async () => {
      await expect(
        recordVoteHandler(mockContext, {
          taskId: 'task-1',
          voteValue: 'A',
        })
      ).rejects.toThrow();
    });

    it('should throw when voteValue is missing', async () => {
      await expect(
        recordVoteHandler(mockContext, {
          taskId: 'task-1',
          agentId: 'agent-1',
        })
      ).rejects.toThrow();
    });
  });

  describe('getConsensusHandler', () => {
    it('should return consensus result', async () => {
      const mockConsensus = {
        consensus: 'option-a',
        voteCount: 5,
        confidence: 0.8,
        dissentingVotes: [],
        voteDistribution: [
          { voteValue: 'option-a', count: 4, agents: ['a1', 'a2', 'a3', 'a4'] },
          { voteValue: 'option-b', count: 1, agents: ['a5'] },
        ],
      };
      vi.mocked(votingService.calculateConsensus).mockReturnValue(mockConsensus);

      const result = await getConsensusHandler(mockContext, { taskId: 'task-1' });

      expect(result.consensus).toBe('option-a');
      expect(result.voteCount).toBe(5);
      expect(result.k).toBe(1); // Default k value
    });

    it('should use custom k value', async () => {
      vi.mocked(votingService.calculateConsensus).mockReturnValue({
        consensus: null,
        voteCount: 3,
        confidence: 0,
        dissentingVotes: [],
        voteDistribution: [],
      });

      const result = await getConsensusHandler(mockContext, {
        taskId: 'task-1',
        k: 3,
      });

      expect(result.k).toBe(3);
      expect(votingService.calculateConsensus).toHaveBeenCalledWith(
        'task-1',
        3,
        mockContext.db
      );
    });

    it('should throw when taskId is missing', async () => {
      await expect(getConsensusHandler(mockContext, {})).rejects.toThrow();
    });

    it('should throw when k is less than 1', async () => {
      await expect(
        getConsensusHandler(mockContext, { taskId: 'task-1', k: 0 })
      ).rejects.toThrow();
    });

    it('should include dissenting votes in result', async () => {
      const mockConsensus = {
        consensus: 'option-a',
        voteCount: 4,
        confidence: 0.75,
        dissentingVotes: [
          { agentId: 'agent-3', vote: 'option-b', confidence: 0.6 },
        ],
        voteDistribution: [],
      };
      vi.mocked(votingService.calculateConsensus).mockReturnValue(mockConsensus);

      const result = await getConsensusHandler(mockContext, { taskId: 'task-1' });

      expect(result.dissentingVotes).toHaveLength(1);
      expect(result.dissentingVotes[0]!.agentId).toBe('agent-3');
    });
  });

  describe('listVotesHandler', () => {
    it('should list all votes for a task', async () => {
      const mockVotes = [
        {
          id: 'vote-1',
          agentId: 'agent-1',
          voteValue: 'option-a',
          confidence: 0.9,
          reasoning: null,
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'vote-2',
          agentId: 'agent-2',
          voteValue: 'option-b',
          confidence: 0.7,
          reasoning: 'Some reason',
          createdAt: '2024-01-01T00:01:00Z',
        },
      ];
      vi.mocked(votingService.listVotes).mockReturnValue(mockVotes);

      const result = await listVotesHandler(mockContext, { taskId: 'task-1' });

      expect(result.votes).toHaveLength(2);
      expect(result.taskId).toBe('task-1');
    });

    it('should throw when taskId is missing', async () => {
      await expect(listVotesHandler(mockContext, {})).rejects.toThrow();
    });

    it('should return empty array when no votes', async () => {
      vi.mocked(votingService.listVotes).mockReturnValue([]);

      const result = await listVotesHandler(mockContext, { taskId: 'task-1' });

      expect(result.votes).toEqual([]);
    });
  });

  describe('getStatsHandler', () => {
    it('should return voting statistics', async () => {
      const mockStats = {
        totalVotes: 10,
        uniqueOptions: 3,
        consensusReached: true,
        consensusValue: 'option-a',
        k: 2,
        voteDistribution: [
          { voteValue: 'option-a', count: 6, agents: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'] },
          { voteValue: 'option-b', count: 3, agents: ['a7', 'a8', 'a9'] },
          { voteValue: 'option-c', count: 1, agents: ['a10'] },
        ],
      };
      vi.mocked(votingService.getVotingStats).mockReturnValue(mockStats);

      const result = await getStatsHandler(mockContext, { taskId: 'task-1' });

      expect(result.totalVotes).toBe(10);
      expect(result.uniqueOptions).toBe(3);
      expect(result.consensusReached).toBe(true);
      expect(result.consensusValue).toBe('option-a');
    });

    it('should throw when taskId is missing', async () => {
      await expect(getStatsHandler(mockContext, {})).rejects.toThrow();
    });

    it('should return no consensus when not reached', async () => {
      const mockStats = {
        totalVotes: 4,
        uniqueOptions: 4,
        consensusReached: false,
        consensusValue: null,
        k: 1,
        voteDistribution: [],
      };
      vi.mocked(votingService.getVotingStats).mockReturnValue(mockStats);

      const result = await getStatsHandler(mockContext, { taskId: 'task-1' });

      expect(result.consensusReached).toBe(false);
      expect(result.consensusValue).toBeNull();
    });
  });

  describe('votingHandlers export', () => {
    it('should export all handlers', () => {
      expect(votingHandlers.record_vote).toBe(recordVoteHandler);
      expect(votingHandlers.get_consensus).toBe(getConsensusHandler);
      expect(votingHandlers.list_votes).toBe(listVotesHandler);
      expect(votingHandlers.get_stats).toBe(getStatsHandler);
    });
  });
});
