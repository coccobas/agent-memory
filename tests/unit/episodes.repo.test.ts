import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  createTestProject,
  createTestSession,
  type TestDb,
} from '../fixtures/test-helpers.js';
import type { IEpisodeRepository } from '../../src/core/interfaces/repositories.js';

const TEST_DB_PATH = './data/test-memory-episodes.db';
let testDb: TestDb;
let episodeRepo: IEpisodeRepository;

describe('episodeRepo', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    episodeRepo = repos.episodes!;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('create', () => {
    it('should create an episode with minimal fields', async () => {
      const episode = await episodeRepo.create({
        scopeType: 'global',
        name: 'Test Episode',
      });

      expect(episode).toBeDefined();
      expect(episode.id).toMatch(/^[a-zA-Z0-9_-]+/);
      expect(episode.name).toBe('Test Episode');
      expect(episode.status).toBe('planned');
      expect(episode.depth).toBe(0);
      expect(episode.isActive).toBe(true);
    });

    it('should create an episode with all fields', async () => {
      const project = createTestProject(testDb.db, 'Test Project');
      const session = createTestSession(testDb.db, project.id, 'Test Session');

      const episode = await episodeRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        sessionId: session.id,
        name: 'Full Episode',
        description: 'Episode with all fields',
        triggerType: 'user_request',
        triggerRef: 'req-123',
        tags: ['bug', 'auth'],
        metadata: { priority: 'high' },
        createdBy: 'test-agent',
      });

      expect(episode.scopeType).toBe('project');
      expect(episode.scopeId).toBe(project.id);
      expect(episode.sessionId).toBe(session.id);
      expect(episode.name).toBe('Full Episode');
      expect(episode.description).toBe('Episode with all fields');
      expect(episode.triggerType).toBe('user_request');
      expect(episode.triggerRef).toBe('req-123');
      expect(episode.createdBy).toBe('test-agent');
    });

    it('should create nested episodes with depth tracking', async () => {
      const parent = await episodeRepo.create({
        scopeType: 'global',
        name: 'Parent Episode',
      });

      const child = await episodeRepo.create({
        scopeType: 'global',
        name: 'Child Episode',
        parentEpisodeId: parent.id,
      });

      expect(parent.depth).toBe(0);
      expect(child.depth).toBe(1);
      expect(child.parentEpisodeId).toBe(parent.id);
    });
  });

  describe('lifecycle', () => {
    it('should start a planned episode', async () => {
      const episode = await episodeRepo.create({
        scopeType: 'global',
        name: 'Episode to Start',
      });

      expect(episode.status).toBe('planned');
      expect(episode.startedAt).toBeNull();

      const started = await episodeRepo.start(episode.id);

      expect(started.status).toBe('active');
      expect(started.startedAt).not.toBeNull();
      expect(started.events).toBeDefined();
      expect(started.events!.length).toBe(1);
      expect(started.events![0].eventType).toBe('started');
    });

    it('should complete an active episode', async () => {
      const episode = await episodeRepo.create({
        scopeType: 'global',
        name: 'Episode to Complete',
      });

      await episodeRepo.start(episode.id);

      const completed = await episodeRepo.complete(
        episode.id,
        'Successfully completed task',
        'success'
      );

      expect(completed.status).toBe('completed');
      expect(completed.outcome).toBe('Successfully completed task');
      expect(completed.outcomeType).toBe('success');
      expect(completed.endedAt).not.toBeNull();
      expect(completed.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should fail an active episode', async () => {
      const episode = await episodeRepo.create({
        scopeType: 'global',
        name: 'Episode to Fail',
      });

      await episodeRepo.start(episode.id);

      const failed = await episodeRepo.fail(episode.id, 'Task failed due to timeout');

      expect(failed.status).toBe('failed');
      expect(failed.outcome).toBe('Task failed due to timeout');
      expect(failed.outcomeType).toBe('failure');
      expect(failed.endedAt).not.toBeNull();
    });

    it('should cancel an episode', async () => {
      const episode = await episodeRepo.create({
        scopeType: 'global',
        name: 'Episode to Cancel',
      });

      await episodeRepo.start(episode.id);

      const cancelled = await episodeRepo.cancel(episode.id, 'User requested cancellation');

      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.outcome).toBe('User requested cancellation');
      expect(cancelled.outcomeType).toBe('abandoned');
    });

    it('should not start an already active episode', async () => {
      const episode = await episodeRepo.create({
        scopeType: 'global',
        name: 'Already Active',
      });

      await episodeRepo.start(episode.id);

      await expect(episodeRepo.start(episode.id)).rejects.toThrow();
    });

    it('should not complete a non-active episode', async () => {
      const episode = await episodeRepo.create({
        scopeType: 'global',
        name: 'Not Started',
      });

      await expect(
        episodeRepo.complete(episode.id, 'Trying to complete', 'success')
      ).rejects.toThrow();
    });
  });

  describe('events', () => {
    it('should add events to an episode', async () => {
      const episode = await episodeRepo.create({
        scopeType: 'global',
        name: 'Episode with Events',
      });

      await episodeRepo.start(episode.id);

      const event = await episodeRepo.addEvent({
        episodeId: episode.id,
        eventType: 'checkpoint',
        name: 'Found root cause',
        description: 'Identified memory leak in auth module',
      });

      expect(event).toBeDefined();
      expect(event.episodeId).toBe(episode.id);
      expect(event.eventType).toBe('checkpoint');
      expect(event.name).toBe('Found root cause');
      expect(event.sequenceNum).toBe(2); // 1 is the 'started' event
    });

    it('should retrieve events in sequence order', async () => {
      const episode = await episodeRepo.create({
        scopeType: 'global',
        name: 'Episode for Event Ordering',
      });

      await episodeRepo.start(episode.id);

      await episodeRepo.addEvent({
        episodeId: episode.id,
        eventType: 'decision',
        name: 'First Decision',
      });

      await episodeRepo.addEvent({
        episodeId: episode.id,
        eventType: 'decision',
        name: 'Second Decision',
      });

      const events = await episodeRepo.getEvents(episode.id);

      expect(events.length).toBe(3); // started + 2 decisions
      expect(events[0].eventType).toBe('started');
      expect(events[1].name).toBe('First Decision');
      expect(events[2].name).toBe('Second Decision');
    });
  });

  describe('queries', () => {
    it('should list episodes with filters', async () => {
      const project = createTestProject(testDb.db, 'Query Test Project');

      await episodeRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Query Test 1',
      });

      await episodeRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Query Test 2',
      });

      const episodes = await episodeRepo.list(
        { scopeType: 'project', scopeId: project.id },
        { limit: 10 }
      );

      expect(episodes.length).toBeGreaterThanOrEqual(2);
      expect(episodes.every((e) => e.scopeId === project.id)).toBe(true);
    });

    it('should get active episode for session', async () => {
      const project = createTestProject(testDb.db, 'Active Episode Project');
      const session = createTestSession(testDb.db, project.id, 'Active Episode Session');

      const episode = await episodeRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        sessionId: session.id,
        name: 'Active Episode',
      });

      await episodeRepo.start(episode.id);

      const active = await episodeRepo.getActiveEpisode(session.id);

      expect(active).toBeDefined();
      expect(active!.id).toBe(episode.id);
      expect(active!.status).toBe('active');
    });

    it('should get children of an episode', async () => {
      const parent = await episodeRepo.create({
        scopeType: 'global',
        name: 'Parent for Children Query',
      });

      await episodeRepo.create({
        scopeType: 'global',
        name: 'Child 1',
        parentEpisodeId: parent.id,
      });

      await episodeRepo.create({
        scopeType: 'global',
        name: 'Child 2',
        parentEpisodeId: parent.id,
      });

      const children = await episodeRepo.getChildren(parent.id);

      expect(children.length).toBe(2);
      expect(children.every((c) => c.parentEpisodeId === parent.id)).toBe(true);
    });

    it('should get ancestors of an episode', async () => {
      const grandparent = await episodeRepo.create({
        scopeType: 'global',
        name: 'Grandparent',
      });

      const parent = await episodeRepo.create({
        scopeType: 'global',
        name: 'Parent',
        parentEpisodeId: grandparent.id,
      });

      const child = await episodeRepo.create({
        scopeType: 'global',
        name: 'Child',
        parentEpisodeId: parent.id,
      });

      const ancestors = await episodeRepo.getAncestors(child.id);

      expect(ancestors.length).toBe(2);
      expect(ancestors[0].id).toBe(parent.id);
      expect(ancestors[1].id).toBe(grandparent.id);
    });
  });

  describe('update and delete', () => {
    it('should update an episode', async () => {
      const episode = await episodeRepo.create({
        scopeType: 'global',
        name: 'Original Name',
        description: 'Original description',
      });

      const updated = await episodeRepo.update(episode.id, {
        name: 'Updated Name',
        description: 'Updated description',
        tags: ['updated', 'modified'],
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.description).toBe('Updated description');
    });

    it('should deactivate an episode', async () => {
      const episode = await episodeRepo.create({
        scopeType: 'global',
        name: 'To Deactivate',
      });

      const result = await episodeRepo.deactivate(episode.id);
      expect(result).toBe(true);

      // getById returns the episode but with isActive: false
      const found = await episodeRepo.getById(episode.id);
      expect(found).toBeDefined();
      expect(found!.isActive).toBe(false);

      // list() by default filters out inactive episodes
      const activeList = await episodeRepo.list({});
      expect(activeList.some((e) => e.id === episode.id)).toBe(false);

      // Should find with includeInactive
      const foundInactive = await episodeRepo.list({ includeInactive: true });
      expect(foundInactive.some((e) => e.id === episode.id)).toBe(true);
    });

    it('should delete an episode', async () => {
      const episode = await episodeRepo.create({
        scopeType: 'global',
        name: 'To Delete',
      });

      const result = await episodeRepo.delete(episode.id);
      expect(result).toBe(true);

      const found = await episodeRepo.list({ includeInactive: true });
      expect(found.some((e) => e.id === episode.id)).toBe(false);
    });
  });
});
