/**
 * Integration tests for voting handler
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb } from '../fixtures/test-helpers.js';
import { votingHandlers } from '../../src/mcp/handlers/voting.handler.js';

const TEST_DB_PATH = './data/test-voting-handler.db';
let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

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
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('record_vote', () => {
    it('should record a vote', () => {
      const result = votingHandlers.record_vote({
        taskId: 'task-1',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('task-1');
      expect(result.agentId).toBe('agent-1');
      expect(result.message).toBe('Vote recorded successfully');
    });

    it('should require taskId, agentId, and voteValue', () => {
      expect(() => {
        votingHandlers.record_vote({ taskId: 'task-1', agentId: 'agent-1' });
      }).toThrow('taskId, agentId, and voteValue are required');

      expect(() => {
        votingHandlers.record_vote({ taskId: 'task-1', voteValue: 'option-a' });
      }).toThrow('taskId, agentId, and voteValue are required');

      expect(() => {
        votingHandlers.record_vote({ agentId: 'agent-1', voteValue: 'option-a' });
      }).toThrow('taskId, agentId, and voteValue are required');
    });

    it('should record vote with confidence', () => {
      const result = votingHandlers.record_vote({
        taskId: 'task-2',
        agentId: 'agent-1',
        voteValue: 'option-a',
        confidence: 0.9,
      });

      expect(result.success).toBe(true);
    });

    it('should record vote with reasoning', () => {
      const result = votingHandlers.record_vote({
        taskId: 'task-3',
        agentId: 'agent-1',
        voteValue: 'option-a',
        reasoning: 'This is the best option',
      });

      expect(result.success).toBe(true);
    });

    it('should handle complex vote values', () => {
      const result = votingHandlers.record_vote({
        taskId: 'task-4',
        agentId: 'agent-1',
        voteValue: { option: 'a', priority: 1 },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('get_consensus', () => {
    it('should get consensus for a task', () => {
      votingHandlers.record_vote({
        taskId: 'task-consensus-1',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      votingHandlers.record_vote({
        taskId: 'task-consensus-1',
        agentId: 'agent-2',
        voteValue: 'option-a',
      });

      const result = votingHandlers.get_consensus({
        taskId: 'task-consensus-1',
      });

      expect(result).toBeDefined();
      expect(typeof result.voteCount).toBe('number');
      expect(typeof result.confidence).toBe('number');
      expect(Array.isArray(result.dissentingVotes)).toBe(true);
      expect(Array.isArray(result.voteDistribution)).toBe(true);
      expect(result.k).toBe(1); // default
    });

    it('should require taskId', () => {
      expect(() => {
        votingHandlers.get_consensus({});
      }).toThrow('taskId is required');
    });

    it('should accept custom k value', () => {
      votingHandlers.record_vote({
        taskId: 'task-consensus-2',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      const result = votingHandlers.get_consensus({
        taskId: 'task-consensus-2',
        k: 2,
      });

      expect(result.k).toBe(2);
    });

    it('should reject k < 1', () => {
      expect(() => {
        votingHandlers.get_consensus({
          taskId: 'task-1',
          k: 0,
        });
      }).toThrow('k must be at least 1');
    });

    it('should return null consensus when no votes', () => {
      const result = votingHandlers.get_consensus({
        taskId: 'task-no-votes',
      });

      expect(result.consensus).toBeNull();
      expect(result.voteCount).toBe(0);
    });
  });

  describe('list_votes', () => {
    it('should list votes for a task', () => {
      votingHandlers.record_vote({
        taskId: 'task-list-1',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      votingHandlers.record_vote({
        taskId: 'task-list-1',
        agentId: 'agent-2',
        voteValue: 'option-b',
      });

      const result = votingHandlers.list_votes({
        taskId: 'task-list-1',
      });

      expect(result.taskId).toBe('task-list-1');
      expect(Array.isArray(result.votes)).toBe(true);
      expect(result.votes.length).toBe(2);
    });

    it('should require taskId', () => {
      expect(() => {
        votingHandlers.list_votes({});
      }).toThrow('taskId is required');
    });

    it('should include vote details', () => {
      votingHandlers.record_vote({
        taskId: 'task-list-2',
        agentId: 'agent-1',
        voteValue: 'option-a',
        confidence: 0.85,
        reasoning: 'Test reasoning',
      });

      const result = votingHandlers.list_votes({
        taskId: 'task-list-2',
      });

      expect(result.votes[0]?.agentId).toBe('agent-1');
      expect(result.votes[0]?.confidence).toBe(0.85);
      expect(result.votes[0]?.reasoning).toBe('Test reasoning');
      expect(result.votes[0]?.voteValue).toBeDefined();
    });
  });

  describe('get_stats', () => {
    it('should get voting statistics', () => {
      votingHandlers.record_vote({
        taskId: 'task-stats-1',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      votingHandlers.record_vote({
        taskId: 'task-stats-1',
        agentId: 'agent-2',
        voteValue: 'option-a',
      });

      votingHandlers.record_vote({
        taskId: 'task-stats-1',
        agentId: 'agent-3',
        voteValue: 'option-b',
      });

      const result = votingHandlers.get_stats({
        taskId: 'task-stats-1',
      });

      expect(result).toBeDefined();
      expect(typeof result.totalVotes).toBe('number');
      expect(result.totalVotes).toBe(3);
      expect(typeof result.uniqueOptions).toBe('number');
      expect(typeof result.consensusReached).toBe('boolean');
      expect(result.k).toBeDefined();
    });

    it('should require taskId', () => {
      expect(() => {
        votingHandlers.get_stats({});
      }).toThrow('taskId is required');
    });

    it('should calculate vote distribution', () => {
      votingHandlers.record_vote({
        taskId: 'task-stats-2',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      votingHandlers.record_vote({
        taskId: 'task-stats-2',
        agentId: 'agent-2',
        voteValue: 'option-a',
      });

      const result = votingHandlers.get_stats({
        taskId: 'task-stats-2',
      });

      expect(Array.isArray(result.voteDistribution)).toBe(true);
      expect(result.totalVotes).toBe(2);
    });
  });
});









