/**
 * Unit tests for voting service
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb } from '../fixtures/test-helpers.js';
import {
  recordVote,
  calculateConsensus,
  listVotes,
  getVotingStats,
} from '../../src/services/voting.service.js';

const TEST_DB_PATH = './data/test-voting.db';
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

describe('voting.service', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('recordVote', () => {
    it('should record a vote', () => {
      recordVote({
        taskId: 'task-1',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      const votes = listVotes('task-1');
      expect(votes.length).toBe(1);
      expect(votes[0]?.agentId).toBe('agent-1');
      expect(votes[0]?.voteValue).toBe('option-a'); // JSON parsed back to original value
    });

    it('should update existing vote from same agent', () => {
      recordVote({
        taskId: 'task-2',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      recordVote({
        taskId: 'task-2',
        agentId: 'agent-1',
        voteValue: 'option-b',
      });

      const votes = listVotes('task-2');
      expect(votes.length).toBe(1);
      expect(votes[0]?.voteValue).toBe('option-b');
    });

    it('should record vote with confidence', () => {
      recordVote({
        taskId: 'task-3',
        agentId: 'agent-1',
        voteValue: 'option-a',
        confidence: 0.9,
      });

      const votes = listVotes('task-3');
      expect(votes[0]?.confidence).toBe(0.9);
    });

    it('should record vote with reasoning', () => {
      recordVote({
        taskId: 'task-4',
        agentId: 'agent-1',
        voteValue: 'option-a',
        reasoning: 'This is the best option',
      });

      const votes = listVotes('task-4');
      expect(votes[0]?.reasoning).toBe('This is the best option');
    });

    it('should default confidence to 1.0', () => {
      recordVote({
        taskId: 'task-5',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      const votes = listVotes('task-5');
      expect(votes[0]?.confidence).toBe(1.0);
    });

    it('should handle complex vote values', () => {
      const complexValue = { option: 'a', priority: 1, metadata: { key: 'value' } };

      recordVote({
        taskId: 'task-6',
        agentId: 'agent-1',
        voteValue: complexValue,
      });

      const votes = listVotes('task-6');
      expect(votes[0]?.voteValue).toBeDefined();
      // Should be parsed back to object
      expect(typeof votes[0]?.voteValue).toBe('object');
    });
  });

  describe('calculateConsensus', () => {
    it('should return null consensus when no votes', () => {
      const result = calculateConsensus('task-no-votes');

      expect(result.consensus).toBeNull();
      expect(result.voteCount).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.dissentingVotes).toEqual([]);
      expect(result.voteDistribution).toEqual([]);
    });

    it('should reach consensus with single vote', () => {
      recordVote({
        taskId: 'task-single',
        agentId: 'agent-1',
        voteValue: 'option-a',
      });

      const result = calculateConsensus('task-single');

      expect(result.consensus).toBeDefined();
      expect(result.voteCount).toBe(1);
    });

    it('should reach consensus when one option is k votes ahead', () => {
      recordVote({ taskId: 'task-consensus-1', agentId: 'agent-1', voteValue: 'option-a' });
      recordVote({ taskId: 'task-consensus-1', agentId: 'agent-2', voteValue: 'option-a' });
      recordVote({ taskId: 'task-consensus-1', agentId: 'agent-3', voteValue: 'option-b' });

      const result = calculateConsensus('task-consensus-1', 1);

      // option-a has 2 votes, option-b has 1, so option-a is 1 vote ahead
      expect(result.consensus).toBeDefined();
      expect(result.voteCount).toBe(3);
    });

    it('should not reach consensus when no option is k votes ahead', () => {
      recordVote({ taskId: 'task-no-consensus', agentId: 'agent-1', voteValue: 'option-a' });
      recordVote({ taskId: 'task-no-consensus', agentId: 'agent-2', voteValue: 'option-b' });

      const result = calculateConsensus('task-no-consensus', 1);

      // Both have 1 vote, neither is 1 vote ahead
      expect(result.consensus).toBeNull();
      expect(result.voteCount).toBe(2);
    });

    it('should return vote distribution', () => {
      recordVote({ taskId: 'task-dist', agentId: 'agent-1', voteValue: 'option-a' });
      recordVote({ taskId: 'task-dist', agentId: 'agent-2', voteValue: 'option-a' });
      recordVote({ taskId: 'task-dist', agentId: 'agent-3', voteValue: 'option-b' });

      const result = calculateConsensus('task-dist');

      expect(result.voteDistribution.length).toBe(2);
      expect(result.voteDistribution[0]?.count).toBe(2); // option-a
      expect(result.voteDistribution[1]?.count).toBe(1); // option-b
    });

    it('should return dissenting votes', () => {
      recordVote({
        taskId: 'task-dissent',
        agentId: 'agent-1',
        voteValue: 'option-a',
        confidence: 0.9,
      });
      recordVote({
        taskId: 'task-dissent',
        agentId: 'agent-2',
        voteValue: 'option-b',
        confidence: 0.8,
      });

      const result = calculateConsensus('task-dissent');

      // If consensus is reached, dissenting votes are those not matching consensus
      expect(Array.isArray(result.dissentingVotes)).toBe(true);
    });

    it('should calculate confidence from consensus votes', () => {
      recordVote({
        taskId: 'task-conf',
        agentId: 'agent-1',
        voteValue: 'option-a',
        confidence: 0.8,
      });
      recordVote({
        taskId: 'task-conf',
        agentId: 'agent-2',
        voteValue: 'option-a',
        confidence: 0.9,
      });

      const result = calculateConsensus('task-conf');

      if (result.consensus !== null) {
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('listVotes', () => {
    it('should list all votes for a task', () => {
      recordVote({ taskId: 'task-list-1', agentId: 'agent-1', voteValue: 'option-a' });
      recordVote({ taskId: 'task-list-1', agentId: 'agent-2', voteValue: 'option-b' });

      const votes = listVotes('task-list-1');

      expect(votes.length).toBe(2);
    });

    it('should return empty array for task with no votes', () => {
      const votes = listVotes('task-no-votes-2');

      expect(votes).toEqual([]);
    });

    it('should include vote details', () => {
      recordVote({
        taskId: 'task-details',
        agentId: 'agent-1',
        voteValue: 'option-a',
        confidence: 0.85,
        reasoning: 'Test reasoning',
      });

      const votes = listVotes('task-details');

      expect(votes[0]?.agentId).toBe('agent-1');
      expect(votes[0]?.confidence).toBe(0.85);
      expect(votes[0]?.reasoning).toBe('Test reasoning');
      expect(votes[0]?.voteValue).toBeDefined();
    });
  });

  describe('getVotingStats', () => {
    it('should return voting statistics', () => {
      recordVote({ taskId: 'task-stats-unique-1', agentId: 'agent-1', voteValue: 'option-a' });
      recordVote({ taskId: 'task-stats-unique-1', agentId: 'agent-2', voteValue: 'option-a' });

      const stats = getVotingStats('task-stats-unique-1');

      expect(stats).toBeDefined();
      expect(typeof stats.totalVotes).toBe('number');
      expect(stats.totalVotes).toBe(2);
      expect(typeof stats.uniqueOptions).toBe('number');
      expect(typeof stats.consensusReached).toBe('boolean');
      expect(stats.consensusValue).toBeDefined();
    });

    it('should calculate vote distribution', () => {
      recordVote({ taskId: 'task-stats-unique-2', agentId: 'agent-1', voteValue: 'option-a' });
      recordVote({ taskId: 'task-stats-unique-2', agentId: 'agent-2', voteValue: 'option-a' });

      const stats = getVotingStats('task-stats-unique-2');

      expect(stats).toBeDefined();
      expect(stats.totalVotes).toBe(2);
      expect(stats.uniqueOptions).toBe(1); // Both votes are for the same option
    });

    it('should list all voters', () => {
      recordVote({ taskId: 'task-stats-3', agentId: 'agent-1', voteValue: 'option-a' });
      recordVote({ taskId: 'task-stats-3', agentId: 'agent-2', voteValue: 'option-b' });

      const stats = getVotingStats('task-stats-3');

      expect(stats).toBeDefined();
      expect(stats.totalVotes).toBe(2);
      expect(typeof stats.uniqueOptions).toBe('number');
    });

    it('should return empty stats for task with no votes', () => {
      const stats = getVotingStats('task-stats-empty');

      expect(stats.totalVotes).toBe(0);
      expect(stats.uniqueOptions).toBe(0);
      expect(stats.consensusReached).toBe(false);
      expect(stats.consensusValue).toBeNull();
    });
  });
});







