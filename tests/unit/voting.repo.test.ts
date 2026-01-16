/**
 * Unit tests for voting repository
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, cleanupTestDb, type TestDb } from '../fixtures/test-helpers.js';
import { createVotingRepository } from '../../src/db/repositories/voting.js';
import type { IVotingRepository } from '../../src/core/interfaces/repositories.js';

const TEST_DB_PATH = './data/test-voting-repo.db';
let testDb: TestDb;
let votingRepo: IVotingRepository;

describe('votingRepo', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    votingRepo = createVotingRepository(testDb.db as any);
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('recordVote', () => {
    it('should record a new vote', async () => {
      await votingRepo.recordVote({
        taskId: 'task-1',
        agentId: 'agent-1',
        voteValue: { choice: 'approve' },
        confidence: 0.9,
        reasoning: 'Looks good',
      });

      const votes = await votingRepo.getVotesForTask('task-1');
      expect(votes).toHaveLength(1);
      expect(votes[0]?.agentId).toBe('agent-1');
      expect(votes[0]?.voteValue).toEqual({ choice: 'approve' });
      expect(votes[0]?.confidence).toBe(0.9);
      expect(votes[0]?.reasoning).toBe('Looks good');
    });

    it('should use default confidence when not provided', async () => {
      await votingRepo.recordVote({
        taskId: 'task-default-conf',
        agentId: 'agent-2',
        voteValue: 'yes',
      });

      const votes = await votingRepo.getVotesForTask('task-default-conf');
      expect(votes).toHaveLength(1);
      expect(votes[0]?.confidence).toBe(1.0);
    });

    it('should allow null reasoning', async () => {
      await votingRepo.recordVote({
        taskId: 'task-null-reason',
        agentId: 'agent-3',
        voteValue: { answer: 42 },
      });

      const votes = await votingRepo.getVotesForTask('task-null-reason');
      expect(votes).toHaveLength(1);
      expect(votes[0]?.reasoning).toBeNull();
    });

    it('should update vote on conflict (same task and agent)', async () => {
      // Record initial vote
      await votingRepo.recordVote({
        taskId: 'task-upsert',
        agentId: 'agent-upsert',
        voteValue: 'initial',
        confidence: 0.5,
        reasoning: 'First reasoning',
      });

      // Update with same task and agent
      await votingRepo.recordVote({
        taskId: 'task-upsert',
        agentId: 'agent-upsert',
        voteValue: 'updated',
        confidence: 0.9,
        reasoning: 'Updated reasoning',
      });

      const votes = await votingRepo.getVotesForTask('task-upsert');
      expect(votes).toHaveLength(1);
      expect(votes[0]?.voteValue).toBe('updated');
      expect(votes[0]?.confidence).toBe(0.9);
      expect(votes[0]?.reasoning).toBe('Updated reasoning');
    });

    it('should handle complex vote values', async () => {
      const complexValue = {
        choice: 'option_a',
        scores: [0.8, 0.9, 0.7],
        metadata: {
          nested: { deep: 'value' },
        },
      };

      await votingRepo.recordVote({
        taskId: 'task-complex',
        agentId: 'agent-complex',
        voteValue: complexValue,
      });

      const votes = await votingRepo.getVotesForTask('task-complex');
      expect(votes[0]?.voteValue).toEqual(complexValue);
    });

    it('should handle numeric vote values', async () => {
      await votingRepo.recordVote({
        taskId: 'task-numeric',
        agentId: 'agent-numeric',
        voteValue: 42,
      });

      const votes = await votingRepo.getVotesForTask('task-numeric');
      expect(votes[0]?.voteValue).toBe(42);
    });

    it('should handle string vote values', async () => {
      await votingRepo.recordVote({
        taskId: 'task-string',
        agentId: 'agent-string',
        voteValue: 'simple string vote',
      });

      const votes = await votingRepo.getVotesForTask('task-string');
      expect(votes[0]?.voteValue).toBe('simple string vote');
    });

    it('should handle boolean vote values', async () => {
      await votingRepo.recordVote({
        taskId: 'task-bool',
        agentId: 'agent-bool',
        voteValue: true,
      });

      const votes = await votingRepo.getVotesForTask('task-bool');
      expect(votes[0]?.voteValue).toBe(true);
    });

    it('should handle array vote values', async () => {
      await votingRepo.recordVote({
        taskId: 'task-array',
        agentId: 'agent-array',
        voteValue: ['option1', 'option2', 'option3'],
      });

      const votes = await votingRepo.getVotesForTask('task-array');
      expect(votes[0]?.voteValue).toEqual(['option1', 'option2', 'option3']);
    });
  });

  describe('getVotesForTask', () => {
    it('should return empty array for task with no votes', async () => {
      const votes = await votingRepo.getVotesForTask('nonexistent-task');
      expect(votes).toEqual([]);
    });

    it('should return all votes for a task', async () => {
      const taskId = 'task-multiple-votes';

      await votingRepo.recordVote({
        taskId,
        agentId: 'agent-a',
        voteValue: 'yes',
      });

      await votingRepo.recordVote({
        taskId,
        agentId: 'agent-b',
        voteValue: 'no',
      });

      await votingRepo.recordVote({
        taskId,
        agentId: 'agent-c',
        voteValue: 'abstain',
      });

      const votes = await votingRepo.getVotesForTask(taskId);

      expect(votes).toHaveLength(3);
      const agentIds = votes.map((v) => v.agentId).sort();
      expect(agentIds).toEqual(['agent-a', 'agent-b', 'agent-c']);
    });

    it('should return vote with all fields populated', async () => {
      const taskId = 'task-full-fields';

      await votingRepo.recordVote({
        taskId,
        agentId: 'agent-full',
        voteValue: { decision: 'approve' },
        confidence: 0.85,
        reasoning: 'Full test reasoning',
      });

      const votes = await votingRepo.getVotesForTask(taskId);

      expect(votes).toHaveLength(1);
      const vote = votes[0];
      expect(vote).toBeDefined();
      expect(vote?.id).toBeDefined();
      expect(vote?.taskId).toBe(taskId);
      expect(vote?.agentId).toBe('agent-full');
      expect(vote?.voteValue).toEqual({ decision: 'approve' });
      expect(vote?.confidence).toBe(0.85);
      expect(vote?.reasoning).toBe('Full test reasoning');
      expect(vote?.createdAt).toBeDefined();
    });

    it('should not return votes from other tasks', async () => {
      await votingRepo.recordVote({
        taskId: 'task-isolated-a',
        agentId: 'agent-isolated',
        voteValue: 'a',
      });

      await votingRepo.recordVote({
        taskId: 'task-isolated-b',
        agentId: 'agent-isolated',
        voteValue: 'b',
      });

      const votesA = await votingRepo.getVotesForTask('task-isolated-a');
      const votesB = await votingRepo.getVotesForTask('task-isolated-b');

      expect(votesA).toHaveLength(1);
      expect(votesA[0]?.voteValue).toBe('a');

      expect(votesB).toHaveLength(1);
      expect(votesB[0]?.voteValue).toBe('b');
    });
  });
});
