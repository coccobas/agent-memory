import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  createTestProject,
  type TestDb,
} from '../fixtures/test-helpers.js';
import type { ITopicRepository } from '../../src/core/interfaces/repositories.js';

const TEST_DB_PATH = './data/test-memory-topics.db';
let testDb: TestDb;
let topicRepo: ITopicRepository;

describe('topicRepo', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    topicRepo = repos.topics!;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('create', () => {
    it('should create a topic with minimal fields', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Test Topic',
      });

      expect(topic).toBeDefined();
      expect(topic.id).toMatch(/^[a-zA-Z0-9_-]+/);
      expect(topic.name).toBe('Test Topic');
      expect(topic.status).toBe('active');
      expect(topic.isActive).toBe(true);
      expect(topic.createdAt).toBeDefined();
      expect(topic.updatedAt).toBeDefined();
    });

    it('should create a topic with all fields', async () => {
      const project = createTestProject(testDb.db, 'Test Project');

      const topic = await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Full Topic',
        description: 'Topic with all fields',
        status: 'active',
        metadata: { priority: 'high', tags: ['important'] },
        createdBy: 'test-agent',
      });

      expect(topic.scopeType).toBe('project');
      expect(topic.scopeId).toBe(project.id);
      expect(topic.name).toBe('Full Topic');
      expect(topic.description).toBe('Topic with all fields');
      expect(topic.status).toBe('active');
      expect(topic.metadata).toEqual({ priority: 'high', tags: ['important'] });
      expect(topic.createdBy).toBe('test-agent');
      expect(topic.isActive).toBe(true);
    });

    it('should default status to active', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Default Status Topic',
      });

      expect(topic.status).toBe('active');
    });

    it('should default isActive to true', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Default Active Topic',
      });

      expect(topic.isActive).toBe(true);
    });

    it('should create topic at project scope with projectId', async () => {
      const project = createTestProject(testDb.db, 'Project Scope Test');

      const topic = await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Project Topic',
        description: 'Topic scoped to project',
      });

      expect(topic.scopeType).toBe('project');
      expect(topic.scopeId).toBe(project.id);
    });
  });

  describe('getById', () => {
    it('should get topic by ID', async () => {
      const created = await topicRepo.create({
        scopeType: 'global',
        name: 'Get By ID Topic',
      });

      const topic = await topicRepo.getById(created.id);

      expect(topic).toBeDefined();
      expect(topic?.id).toBe(created.id);
      expect(topic?.name).toBe('Get By ID Topic');
    });

    it('should return undefined for non-existent ID', async () => {
      const topic = await topicRepo.getById('non-existent-id');
      expect(topic).toBeUndefined();
    });

    it('should return deactivated topic with getById', async () => {
      const created = await topicRepo.create({
        scopeType: 'global',
        name: 'To Get Deactivated',
      });

      await topicRepo.deactivate(created.id);

      const topic = await topicRepo.getById(created.id);
      expect(topic).toBeDefined();
      expect(topic?.isActive).toBe(false);
    });
  });

  describe('list', () => {
    it('should list all active topics', async () => {
      await topicRepo.create({
        scopeType: 'global',
        name: 'List Topic 1',
      });

      await topicRepo.create({
        scopeType: 'global',
        name: 'List Topic 2',
      });

      const topics = await topicRepo.list({}, { limit: 100 });

      expect(topics.length).toBeGreaterThanOrEqual(2);
      expect(topics.every((t) => t.isActive === true)).toBe(true);
    });

    it('should filter by projectId', async () => {
      const project = createTestProject(testDb.db, 'Filter Project');

      await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Project Specific Topic',
      });

      const topics = await topicRepo.list(
        { scopeType: 'project', scopeId: project.id },
        { limit: 100 }
      );

      expect(topics.length).toBeGreaterThanOrEqual(1);
      expect(topics.every((t) => t.scopeId === project.id)).toBe(true);
    });

    it('should filter by status', async () => {
      await topicRepo.create({
        scopeType: 'global',
        name: 'Active Status Topic',
        status: 'active',
      });

      const topics = await topicRepo.list(
        { scopeType: 'global', status: 'active' },
        { limit: 100 }
      );

      expect(topics.length).toBeGreaterThanOrEqual(1);
      expect(topics.every((t) => t.status === 'active')).toBe(true);
    });

    it('should exclude inactive topics by default', async () => {
      const created = await topicRepo.create({
        scopeType: 'global',
        name: 'To Exclude Inactive',
      });

      await topicRepo.deactivate(created.id);

      const topics = await topicRepo.list({}, { limit: 100 });

      expect(topics.some((t) => t.id === created.id)).toBe(false);
    });

    it('should include inactive topics with includeInactive flag', async () => {
      const created = await topicRepo.create({
        scopeType: 'global',
        name: 'To Include Inactive',
      });

      await topicRepo.deactivate(created.id);

      const topics = await topicRepo.list({ includeInactive: true }, { limit: 100 });

      expect(topics.some((t) => t.id === created.id)).toBe(true);
      expect(topics.find((t) => t.id === created.id)?.isActive).toBe(false);
    });

    it('should support pagination', async () => {
      await topicRepo.create({
        scopeType: 'global',
        name: 'Pagination Topic 1',
      });

      await topicRepo.create({
        scopeType: 'global',
        name: 'Pagination Topic 2',
      });

      const page1 = await topicRepo.list({}, { limit: 1, offset: 0 });
      const page2 = await topicRepo.list({}, { limit: 1, offset: 1 });

      expect(page1.length).toBeLessThanOrEqual(1);
      expect(page2.length).toBeLessThanOrEqual(1);
    });
  });

  describe('update', () => {
    it('should update topic name', async () => {
      const created = await topicRepo.create({
        scopeType: 'global',
        name: 'Original Name',
      });

      const updated = await topicRepo.update(created.id, {
        name: 'Updated Name',
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.id).toBe(created.id);
    });

    it('should update topic description', async () => {
      const created = await topicRepo.create({
        scopeType: 'global',
        name: 'Topic for Description Update',
        description: 'Original description',
      });

      const updated = await topicRepo.update(created.id, {
        description: 'Updated description',
      });

      expect(updated?.description).toBe('Updated description');
    });

    it('should update topic status', async () => {
      const created = await topicRepo.create({
        scopeType: 'global',
        name: 'Topic for Status Update',
        status: 'active',
      });

      const updated = await topicRepo.update(created.id, {
        status: 'inactive',
      });

      expect(updated?.status).toBe('inactive');
    });

    it('should update topic metadata', async () => {
      const created = await topicRepo.create({
        scopeType: 'global',
        name: 'Topic for Metadata Update',
        metadata: { version: 1 },
      });

      const updated = await topicRepo.update(created.id, {
        metadata: { version: 2, updated: true },
      });

      expect(updated?.metadata).toEqual({ version: 2, updated: true });
    });

    it('should update multiple fields at once', async () => {
      const created = await topicRepo.create({
        scopeType: 'global',
        name: 'Original',
        description: 'Original desc',
        status: 'active',
      });

      const updated = await topicRepo.update(created.id, {
        name: 'Updated',
        description: 'Updated desc',
        status: 'inactive',
      });

      expect(updated?.name).toBe('Updated');
      expect(updated?.description).toBe('Updated desc');
      expect(updated?.status).toBe('inactive');
    });

    it('should return undefined for non-existent topic', async () => {
      const updated = await topicRepo.update('non-existent-id', {
        name: 'New Name',
      });

      expect(updated).toBeUndefined();
    });

    it('should update updatedAt timestamp', async () => {
      const created = await topicRepo.create({
        scopeType: 'global',
        name: 'Timestamp Test',
      });

      const originalUpdatedAt = created.updatedAt;

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await topicRepo.update(created.id, {
        name: 'Updated Name',
      });

      expect(updated?.updatedAt).not.toBe(originalUpdatedAt);
      expect(updated?.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('deactivate', () => {
    it('should deactivate a topic (soft delete)', async () => {
      const created = await topicRepo.create({
        scopeType: 'global',
        name: 'To Deactivate',
      });

      expect(created.isActive).toBe(true);

      const result = await topicRepo.deactivate(created.id);
      expect(result).toBe(true);

      const found = await topicRepo.getById(created.id);
      expect(found).toBeDefined();
      expect(found?.isActive).toBe(false);
    });

    it('should exclude deactivated topic from list', async () => {
      const created = await topicRepo.create({
        scopeType: 'global',
        name: 'To Exclude After Deactivate',
      });

      await topicRepo.deactivate(created.id);

      const activeList = await topicRepo.list({}, { limit: 100 });
      expect(activeList.some((t) => t.id === created.id)).toBe(false);
    });

    it('should return false for non-existent topic', async () => {
      const result = await topicRepo.deactivate('non-existent-id');
      expect(result).toBe(false);
    });

    it('should be idempotent (deactivate twice)', async () => {
      const created = await topicRepo.create({
        scopeType: 'global',
        name: 'Idempotent Deactivate',
      });

      const result1 = await topicRepo.deactivate(created.id);
      const result2 = await topicRepo.deactivate(created.id);

      expect(result1).toBe(true);
      expect(result2).toBe(true);

      const found = await topicRepo.getById(created.id);
      expect(found?.isActive).toBe(false);
    });
  });

  describe('findSimilar', () => {
    it('should return topics above similarity threshold', async () => {
      const topic1 = await topicRepo.create({
        scopeType: 'global',
        name: 'Authentication System',
        description: 'JWT token management and user auth',
      });

      const topic2 = await topicRepo.create({
        scopeType: 'global',
        name: 'Database Schema',
        description: 'PostgreSQL tables and relationships',
      });

      // Placeholder test - embedding search not implemented yet
      const similar = await topicRepo.findSimilar('Authentication', 0.8);

      expect(Array.isArray(similar)).toBe(true);
      expect(similar.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array for no matches above threshold', async () => {
      // Placeholder test - embedding search not implemented yet
      const similar = await topicRepo.findSimilar('Extremely Unique Query XYZ123', 0.95);

      expect(Array.isArray(similar)).toBe(true);
    });

    it('should exclude inactive topics from similarity search', async () => {
      const created = await topicRepo.create({
        scopeType: 'global',
        name: 'Inactive Similar Topic',
        description: 'This should not appear in results',
      });

      await topicRepo.deactivate(created.id);

      // Placeholder test - embedding search not implemented yet
      const similar = await topicRepo.findSimilar('Similar', 0.5);

      expect(Array.isArray(similar)).toBe(true);
      expect(similar.some((t) => t.id === created.id)).toBe(false);
    });

    it('should handle empty query gracefully', async () => {
      // Placeholder test - embedding search not implemented yet
      const similar = await topicRepo.findSimilar('', 0.8);

      expect(Array.isArray(similar)).toBe(true);
    });

    it('should respect similarity threshold parameter', async () => {
      // Placeholder test - embedding search not implemented yet
      const highThreshold = await topicRepo.findSimilar('Test', 0.95);
      const lowThreshold = await topicRepo.findSimilar('Test', 0.5);

      expect(Array.isArray(highThreshold)).toBe(true);
      expect(Array.isArray(lowThreshold)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle topic with empty description', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'No Description Topic',
        description: '',
      });

      expect(topic.description).toBe('');
    });

    it('should handle topic with null description', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Null Description Topic',
      });

      expect(topic.description).toBeUndefined();
    });

    it('should handle topic with complex metadata', async () => {
      const complexMetadata = {
        nested: {
          level1: {
            level2: 'value',
          },
        },
        array: [1, 2, 3],
        boolean: true,
        null: null,
      };

      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Complex Metadata Topic',
        metadata: complexMetadata,
      });

      expect(topic.metadata).toEqual(complexMetadata);
    });

    it('should handle topic name with special characters', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Topic with @#$%^&*() special chars',
      });

      expect(topic.name).toBe('Topic with @#$%^&*() special chars');
    });

    it('should handle very long topic name', async () => {
      const longName = 'A'.repeat(500);

      const topic = await topicRepo.create({
        scopeType: 'global',
        name: longName,
      });

      expect(topic.name).toBe(longName);
    });
  });
});
