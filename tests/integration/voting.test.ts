/**
 * Integration tests for voting handler
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestContext } from '../fixtures/test-helpers.js';
import { votingHandlers } from '../../src/mcp/handlers/voting.handler.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-voting-handler.db';
let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let ctx: AppContext;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

describe('Voting Handler Integration', () => {
  beforeAll(async () => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    ctx = await createTestContext(testDb);
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('record_vote', () => {
    it('should record a vote', async () => {
      const result = await votingHandlers.record_vote(ctx, {
        taskId: 'task-1',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('task-1');
      expect(result.agentId).toBe('agent-1');
      expect(result.message).toBe('Vote recorded successfully');
    });

    it('should require taskId, agentId, and voteValue', async () => {
      await expect(
        votingHandlers.record_vote(ctx, { taskId: 'task-1', agentId: 'agent-1' })
      ).rejects.toThrow(/taskId, agentId, and voteValue/);

      await expect(
        votingHandlers.record_vote(ctx, { taskId: 'task-1', voteValue: 'option-a' })
      ).rejects.toThrow(/taskId, agentId, and voteValue/);

      await expect(
        votingHandlers.record_vote(ctx, { agentId: 'agent-1', voteValue: 'option-a' })
      ).rejects.toThrow(/taskId, agentId, and voteValue/);
    });

    it('should record vote with confidence', async () => {
      const result = await votingHandlers.record_vote(ctx, {
        taskId: 'task-2',
        agentId: 'agent-1',
        voteValue: 'option-a',
        confidence: 0.9,
      });

      expect(result.success).toBe(true);
    });

    it('should record vote with reasoning', async () => {
      const result = await votingHandlers.record_vote(ctx, {
        taskId: 'task-3',
        agentId: 'agent-1',
        voteValue: 'option-a',
        reasoning: 'This is the best option',
      });

      expect(result.success).toBe(true);
    });

    it('should handle complex vote values', async () => {
      const result = await votingHandlers.record_vote(ctx, {
        taskId: 'task-4',
        agentId: 'agent-1',
        voteValue: { option: 'a', priority: 1 },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('get_consensus', () => {
    it('should get consensus for a task', async () => {
      await votingHandlers.record_vote(ctx, {
        taskId: 'task-consensus-1',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      await votingHandlers.record_vote(ctx, {
        taskId: 'task-consensus-1',
        agentId: 'agent-2',
        voteValue: 'option-a',
      });

      const result = await votingHandlers.get_consensus(ctx, {
        taskId: 'task-consensus-1',
      });

      expect(result).toBeDefined();
      expect(typeof result.voteCount).toBe('number');
      expect(typeof result.confidence).toBe('number');
      expect(Array.isArray(result.dissentingVotes)).toBe(true);
      expect(Array.isArray(result.voteDistribution)).toBe(true);
      expect(result.k).toBe(1); // default
    });

    it('should require taskId', async () => {
      await expect(votingHandlers.get_consensus(ctx, {})).rejects.toThrow(/taskId/);
    });

    it('should accept custom k value', async () => {
      await votingHandlers.record_vote(ctx, {
        taskId: 'task-consensus-2',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      const result = await votingHandlers.get_consensus(ctx, {
        taskId: 'task-consensus-2',
        k: 2,
      });

      expect(result.k).toBe(2);
    });

    it('should reject k < 1', async () => {
      await expect(
        votingHandlers.get_consensus(ctx, {
          taskId: 'task-1',
          k: 0,
        })
      ).rejects.toThrow(/k.*must be at least 1/);
    });

    it('should return null consensus when no votes', async () => {
      const result = await votingHandlers.get_consensus(ctx, {
        taskId: 'task-no-votes',
      });

      expect(result.consensus).toBeNull();
      expect(result.voteCount).toBe(0);
    });
  });

  describe('list_votes', () => {
    it('should list votes for a task', async () => {
      await votingHandlers.record_vote(ctx, {
        taskId: 'task-list-1',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      await votingHandlers.record_vote(ctx, {
        taskId: 'task-list-1',
        agentId: 'agent-2',
        voteValue: 'option-b',
      });

      const result = await votingHandlers.list_votes(ctx, {
        taskId: 'task-list-1',
      });

      expect(result.taskId).toBe('task-list-1');
      expect(Array.isArray(result.votes)).toBe(true);
      expect(result.votes.length).toBe(2);
    });

    it('should require taskId', async () => {
      await expect(votingHandlers.list_votes(ctx, {})).rejects.toThrow(/taskId/);
    });

    it('should include vote details', async () => {
      await votingHandlers.record_vote(ctx, {
        taskId: 'task-list-2',
        agentId: 'agent-1',
        voteValue: 'option-a',
        confidence: 0.85,
        reasoning: 'Test reasoning',
      });

      const result = await votingHandlers.list_votes(ctx, {
        taskId: 'task-list-2',
      });

      expect(result.votes[0]?.agentId).toBe('agent-1');
      expect(result.votes[0]?.confidence).toBe(0.85);
      expect(result.votes[0]?.reasoning).toBe('Test reasoning');
      expect(result.votes[0]?.voteValue).toBeDefined();
    });
  });

  describe('get_stats', () => {
    it('should get voting statistics', async () => {
      await votingHandlers.record_vote(ctx, {
        taskId: 'task-stats-1',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      await votingHandlers.record_vote(ctx, {
        taskId: 'task-stats-1',
        agentId: 'agent-2',
        voteValue: 'option-a',
      });

      await votingHandlers.record_vote(ctx, {
        taskId: 'task-stats-1',
        agentId: 'agent-3',
        voteValue: 'option-b',
      });

      const result = await votingHandlers.get_stats(ctx, {
        taskId: 'task-stats-1',
      });

      expect(result).toBeDefined();
      expect(typeof result.totalVotes).toBe('number');
      expect(result.totalVotes).toBe(3);
      expect(typeof result.uniqueOptions).toBe('number');
      expect(typeof result.consensusReached).toBe('boolean');
      expect(result.k).toBeDefined();
    });

    it('should require taskId', async () => {
      await expect(votingHandlers.get_stats(ctx, {})).rejects.toThrow(/taskId/);
    });

    it('should calculate vote distribution', async () => {
      await votingHandlers.record_vote(ctx, {
        taskId: 'task-stats-2',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      await votingHandlers.record_vote(ctx, {
        taskId: 'task-stats-2',
        agentId: 'agent-2',
        voteValue: 'option-a',
      });

      const result = await votingHandlers.get_stats(ctx, {
        taskId: 'task-stats-2',
      });

      expect(Array.isArray(result.voteDistribution)).toBe(true);
      expect(result.totalVotes).toBe(2);
    });
  });
});



