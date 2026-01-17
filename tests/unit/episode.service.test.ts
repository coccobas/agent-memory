import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  createTestProject,
  createTestSession,
  type TestDb,
} from '../fixtures/test-helpers.js';
import type { IEpisodeRepository } from '../../src/core/interfaces/repositories.js';
import { createEpisodeService, type EpisodeService } from '../../src/services/episode/index.js';

const TEST_DB_PATH = './data/test-memory-episode-service.db';
let testDb: TestDb;
let episodeRepo: IEpisodeRepository;
let episodeService: EpisodeService;

describe('EpisodeService', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    episodeRepo = repos.episodes!;

    // Create service without graph repositories (simpler testing)
    episodeService = createEpisodeService({ episodeRepo });
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('CRUD operations', () => {
    it('should create and retrieve an episode', async () => {
      const episode = await episodeService.create({
        scopeType: 'global',
        name: 'Service Test Episode',
        description: 'Testing via service',
      });

      expect(episode).toBeDefined();
      expect(episode.name).toBe('Service Test Episode');

      const retrieved = await episodeService.getById(episode.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(episode.id);
    });

    it('should list episodes', async () => {
      const project = createTestProject(testDb.db, 'Service List Test');

      await episodeService.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'List Test 1',
      });

      await episodeService.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'List Test 2',
      });

      const episodes = await episodeService.list({
        scopeType: 'project',
        scopeId: project.id,
      });

      expect(episodes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('lifecycle management', () => {
    it('should manage episode lifecycle through service', async () => {
      const episode = await episodeService.create({
        scopeType: 'global',
        name: 'Lifecycle Test',
      });

      expect(episode.status).toBe('planned');

      const started = await episodeService.start(episode.id);
      expect(started.status).toBe('active');
      expect(started.startedAt).not.toBeNull();

      const completed = await episodeService.complete(episode.id, 'Done', 'success');
      expect(completed.status).toBe('completed');
      expect(completed.outcome).toBe('Done');
      expect(completed.outcomeType).toBe('success');
    });

    it('should fail an episode', async () => {
      const episode = await episodeService.create({
        scopeType: 'global',
        name: 'Failure Test',
      });

      await episodeService.start(episode.id);
      const failed = await episodeService.fail(episode.id, 'Something went wrong');

      expect(failed.status).toBe('failed');
      expect(failed.outcomeType).toBe('failure');
    });

    it('should cancel an episode', async () => {
      const episode = await episodeService.create({
        scopeType: 'global',
        name: 'Cancel Test',
      });

      await episodeService.start(episode.id);
      const cancelled = await episodeService.cancel(episode.id, 'Not needed anymore');

      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.outcomeType).toBe('abandoned');
    });
  });

  describe('timeline queries', () => {
    it('should get timeline for a session', async () => {
      const project = createTestProject(testDb.db, 'Timeline Test Project');
      const session = createTestSession(testDb.db, project.id, 'Timeline Session');

      // Create and complete an episode
      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: project.id,
        sessionId: session.id,
        name: 'Timeline Episode',
      });

      await episodeService.start(episode.id);

      await episodeService.addEvent({
        episodeId: episode.id,
        eventType: 'checkpoint',
        name: 'Checkpoint 1',
      });

      await episodeService.complete(episode.id, 'Timeline done', 'success');

      const timeline = await episodeService.getTimeline(session.id);

      expect(timeline.length).toBeGreaterThanOrEqual(3); // start, checkpoint, end
      expect(timeline.some((e) => e.type === 'episode_start')).toBe(true);
      expect(timeline.some((e) => e.type === 'event')).toBe(true);
      expect(timeline.some((e) => e.type === 'episode_end')).toBe(true);
    });

    it('should filter timeline by time range', async () => {
      const project = createTestProject(testDb.db, 'Timeline Range Project');
      const session = createTestSession(testDb.db, project.id, 'Timeline Range Session');

      // Create episode in the past
      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: project.id,
        sessionId: session.id,
        name: 'Range Test Episode',
      });

      await episodeService.start(episode.id);

      // Use a future date range that won't include our episode
      const futureDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
      const timeline = await episodeService.getTimeline(session.id, { start: futureDate });

      // Should filter out episodes that started before the range
      expect(timeline.length).toBe(0);
    });
  });

  describe('whatHappened query', () => {
    it('should summarize what happened during an episode', async () => {
      const episode = await episodeService.create({
        scopeType: 'global',
        name: 'What Happened Test',
        description: 'Testing what happened query',
      });

      await episodeService.start(episode.id);

      await episodeService.addEvent({
        episodeId: episode.id,
        eventType: 'decision',
        name: 'Made a decision',
        description: 'Decided to use approach A',
      });

      await episodeService.addEvent({
        episodeId: episode.id,
        eventType: 'checkpoint',
        name: 'Reached checkpoint',
        description: 'Completed first phase',
      });

      await episodeService.complete(episode.id, 'All done', 'success');

      const result = await episodeService.whatHappened(episode.id);

      expect(result.episode).toBeDefined();
      expect(result.episode.id).toBe(episode.id);
      expect(result.timeline.length).toBeGreaterThanOrEqual(3); // start, events, end
      expect(result.metrics).toBeDefined();
      expect(result.metrics.eventCount).toBeGreaterThanOrEqual(3);
      expect(result.metrics.durationMs).toBeDefined();
    });

    it('should throw for non-existent episode', async () => {
      await expect(episodeService.whatHappened('non-existent-id')).rejects.toThrow();
    });
  });

  describe('causal chain traversal', () => {
    it('should trace backward through parent-child hierarchy', async () => {
      // Create a hierarchy: grandparent -> parent -> child
      const grandparent = await episodeService.create({
        scopeType: 'global',
        name: 'Grandparent Episode',
      });

      const parent = await episodeService.create({
        scopeType: 'global',
        name: 'Parent Episode',
        parentEpisodeId: grandparent.id,
      });

      const child = await episodeService.create({
        scopeType: 'global',
        name: 'Child Episode',
        parentEpisodeId: parent.id,
      });

      const chain = await episodeService.traceCausalChain(child.id, 'backward', 10);

      // Chain includes: self (child), parent, grandparent
      expect(chain.length).toBe(3);
      expect(chain[0].episode.id).toBe(child.id);
      expect(chain[0].relationship).toBe('self');
      expect(chain[1].episode.id).toBe(parent.id);
      expect(chain[1].relationship).toBe('caused_by');
      expect(chain[2].episode.id).toBe(grandparent.id);
    });

    it('should trace forward through children', async () => {
      // Create parent with children
      const parent = await episodeService.create({
        scopeType: 'global',
        name: 'Parent for Forward',
      });

      await episodeService.create({
        scopeType: 'global',
        name: 'Child 1',
        parentEpisodeId: parent.id,
      });

      await episodeService.create({
        scopeType: 'global',
        name: 'Child 2',
        parentEpisodeId: parent.id,
      });

      const chain = await episodeService.traceCausalChain(parent.id, 'forward', 10);

      // Chain includes: self (parent) + 2 children
      expect(chain.length).toBe(3);
      expect(chain[0].relationship).toBe('self');
      expect(chain.slice(1).every((c) => c.relationship === 'caused')).toBe(true);
    });

    it('should respect maxDepth', async () => {
      // Create a deep hierarchy
      const root = await episodeService.create({
        scopeType: 'global',
        name: 'Root',
      });

      let current = root;
      for (let i = 0; i < 5; i++) {
        const next = await episodeService.create({
          scopeType: 'global',
          name: `Level ${i + 1}`,
          parentEpisodeId: current.id,
        });
        current = next;
      }

      const chain = await episodeService.traceCausalChain(current.id, 'backward', 2);

      // Chain includes: self + up to maxDepth ancestors
      expect(chain.length).toBe(3); // self + 2 ancestors (maxDepth=2)
      expect(chain[0].relationship).toBe('self');
    });
  });

  describe('active episode queries', () => {
    it('should find active episode for a session', async () => {
      const project = createTestProject(testDb.db, 'Active Test Project');
      const session = createTestSession(testDb.db, project.id, 'Active Test Session');

      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: project.id,
        sessionId: session.id,
        name: 'Active Episode',
      });

      await episodeService.start(episode.id);

      const active = await episodeService.getActiveEpisode(session.id);

      expect(active).toBeDefined();
      expect(active!.id).toBe(episode.id);
      expect(active!.status).toBe('active');
    });

    it('should return undefined when no active episode', async () => {
      const project = createTestProject(testDb.db, 'No Active Project');
      const session = createTestSession(testDb.db, project.id, 'No Active Session');

      const active = await episodeService.getActiveEpisode(session.id);

      expect(active).toBeUndefined();
    });
  });

  describe('hierarchy queries', () => {
    it('should get children of an episode', async () => {
      const parent = await episodeService.create({
        scopeType: 'global',
        name: 'Parent with Children',
      });

      await episodeService.create({
        scopeType: 'global',
        name: 'Child A',
        parentEpisodeId: parent.id,
      });

      await episodeService.create({
        scopeType: 'global',
        name: 'Child B',
        parentEpisodeId: parent.id,
      });

      const children = await episodeService.getChildren(parent.id);

      expect(children.length).toBe(2);
    });

    it('should get ancestors of an episode', async () => {
      const root = await episodeService.create({
        scopeType: 'global',
        name: 'Root',
      });

      const mid = await episodeService.create({
        scopeType: 'global',
        name: 'Middle',
        parentEpisodeId: root.id,
      });

      const leaf = await episodeService.create({
        scopeType: 'global',
        name: 'Leaf',
        parentEpisodeId: mid.id,
      });

      const ancestors = await episodeService.getAncestors(leaf.id);

      expect(ancestors.length).toBe(2);
      expect(ancestors[0].id).toBe(mid.id);
      expect(ancestors[1].id).toBe(root.id);
    });
  });
});
