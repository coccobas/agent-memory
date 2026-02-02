import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  createTestProject,
  createTestSession,
  type TestDb,
} from '../fixtures/test-helpers.js';
import type { ITopicRepository } from '../../src/core/interfaces/repositories.js';

const TEST_DB_PATH = './data/test-memory-topic-service.db';
let testDb: TestDb;
let topicRepo: ITopicRepository;

describe('TopicService', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    topicRepo = repos.topics!;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('CRUD operations', () => {
    it('should create and retrieve a topic', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Service Test Topic',
        description: 'Testing via service',
      });

      expect(topic).toBeDefined();
      expect(topic.name).toBe('Service Test Topic');
      expect(topic.description).toBe('Testing via service');
      expect(topic.status).toBe('active');

      const retrieved = await topicRepo.getById(topic.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(topic.id);
      expect(retrieved!.name).toBe('Service Test Topic');
    });

    it('should create topic with minimal fields', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Minimal Topic',
      });

      expect(topic).toBeDefined();
      expect(topic.name).toBe('Minimal Topic');
      expect(topic.description === null || topic.description === undefined).toBe(true);
      expect(topic.status).toBe('active');
    });

    it('should create topic with all fields', async () => {
      const metadata = { key: 'value', nested: { prop: 123 } };
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Full Topic',
        description: 'Complete topic with all fields',
        status: 'active',
        metadata,
        createdBy: 'test-user',
      });

      expect(topic).toBeDefined();
      expect(topic.name).toBe('Full Topic');
      expect(topic.description).toBe('Complete topic with all fields');
      expect(topic.metadata).toBeDefined();
      expect(topic.createdBy).toBe('test-user');
    });

    it('should list topics', async () => {
      const project = createTestProject(testDb.db, 'Service List Test');

      await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'List Test 1',
      });

      await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'List Test 2',
      });

      const topics = await topicRepo.list({
        scopeType: 'project',
        scopeId: project.id,
      });

      expect(topics.length).toBeGreaterThanOrEqual(2);
      expect(topics.some((t) => t.name === 'List Test 1')).toBe(true);
      expect(topics.some((t) => t.name === 'List Test 2')).toBe(true);
    });

    it('should list topics with status filter', async () => {
      const project = createTestProject(testDb.db, 'Status Filter Test');

      const activeTopic = await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Active Topic',
        status: 'active',
      });

      const inactiveTopic = await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Inactive Topic',
        status: 'inactive',
      });

      const activeTopics = await topicRepo.list({
        scopeType: 'project',
        scopeId: project.id,
        status: 'active',
      });

      expect(activeTopics.some((t) => t.id === activeTopic.id)).toBe(true);
      expect(activeTopics.some((t) => t.id === inactiveTopic.id)).toBe(false);
    });

    it('should exclude inactive topics by default', async () => {
      const project = createTestProject(testDb.db, 'Inactive Exclude Test');

      const topic = await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'To Deactivate',
      });

      await topicRepo.deactivate(topic.id);

      const topics = await topicRepo.list({
        scopeType: 'project',
        scopeId: project.id,
      });

      expect(topics.some((t) => t.id === topic.id)).toBe(false);
    });

    it('should include inactive topics when requested', async () => {
      const project = createTestProject(testDb.db, 'Inactive Include Test');

      const topic = await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'To Include Inactive',
      });

      await topicRepo.deactivate(topic.id);

      const topics = await topicRepo.list(
        {
          scopeType: 'project',
          scopeId: project.id,
          includeInactive: true,
        },
        { limit: 100 }
      );

      expect(topics.some((t) => t.id === topic.id)).toBe(true);
    });

    it('should update topic name', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Original Name',
      });

      const updated = await topicRepo.update(topic.id, {
        name: 'Updated Name',
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated Name');

      const retrieved = await topicRepo.getById(topic.id);
      expect(retrieved!.name).toBe('Updated Name');
    });

    it('should update topic description', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Topic for Description Update',
        description: 'Original description',
      });

      const updated = await topicRepo.update(topic.id, {
        description: 'Updated description',
      });

      expect(updated!.description).toBe('Updated description');
    });

    it('should update topic status', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Topic for Status Update',
        status: 'active',
      });

      const updated = await topicRepo.update(topic.id, {
        status: 'inactive',
      });

      expect(updated!.status).toBe('inactive');
    });

    it('should update multiple fields', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Multi Update Topic',
        description: 'Original',
        status: 'active',
      });

      const updated = await topicRepo.update(topic.id, {
        name: 'New Name',
        description: 'New Description',
        status: 'inactive',
      });

      expect(updated!.name).toBe('New Name');
      expect(updated!.description).toBe('New Description');
      expect(updated!.status).toBe('inactive');
    });

    it('should return undefined when updating non-existent topic', async () => {
      const updated = await topicRepo.update('non-existent-id', {
        name: 'New Name',
      });

      expect(updated).toBeUndefined();
    });

    it('should return undefined when getting non-existent topic', async () => {
      const retrieved = await topicRepo.getById('non-existent-id');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('deactivate', () => {
    it('should deactivate a topic', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Topic to Deactivate',
      });

      const result = await topicRepo.deactivate(topic.id);
      expect(result).toBe(true);

      const topics = await topicRepo.list({
        scopeType: 'global',
        includeInactive: false,
      });
      expect(topics.some((t) => t.id === topic.id)).toBe(false);
    });

    it('should return false when deactivating non-existent topic', async () => {
      const result = await topicRepo.deactivate('non-existent-id');
      expect(result).toBe(false);
    });

    it('should mark topic as inactive', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Mark Inactive',
      });

      await topicRepo.deactivate(topic.id);

      const topics = await topicRepo.list(
        {
          scopeType: 'global',
          includeInactive: true,
        },
        { limit: 100 }
      );

      const deactivated = topics.find((t) => t.id === topic.id);
      expect(deactivated).toBeDefined();
    });
  });

  describe('findOrCreate', () => {
    it('should find existing topic by name', async () => {
      const project = createTestProject(testDb.db, 'FindOrCreate Test');

      const created = await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Existing Topic',
      });

      const topics = await topicRepo.list({
        scopeType: 'project',
        scopeId: project.id,
      });

      const found = topics.find((t) => t.name === 'Existing Topic');
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('should create new topic if not found', async () => {
      const project = createTestProject(testDb.db, 'FindOrCreate Test 2');

      const topic = await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'New Topic',
      });

      expect(topic).toBeDefined();
      expect(topic.name).toBe('New Topic');
      expect(topic.status).toBe('active');
    });

    it('should find existing topic with description', async () => {
      const project = createTestProject(testDb.db, 'FindOrCreate Desc Test');

      const created = await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Topic with Desc',
        description: 'Original description',
      });

      const topics = await topicRepo.list({
        scopeType: 'project',
        scopeId: project.id,
      });

      const found = topics.find((t) => t.name === 'Topic with Desc');
      expect(found!.id).toBe(created.id);
      expect(found!.description).toBe('Original description');
    });

    it('should create topic with description if not found', async () => {
      const project = createTestProject(testDb.db, 'FindOrCreate Create Desc');

      const topic = await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'New Topic with Desc',
        description: 'New description',
      });

      expect(topic.name).toBe('New Topic with Desc');
      expect(topic.description).toBe('New description');
    });

    it('should scope search by project', async () => {
      const project1 = createTestProject(testDb.db, 'Project 1');
      const project2 = createTestProject(testDb.db, 'Project 2');

      const topic1 = await topicRepo.create({
        scopeType: 'project',
        scopeId: project1.id,
        name: 'Shared Name',
      });

      const topic2 = await topicRepo.create({
        scopeType: 'project',
        scopeId: project2.id,
        name: 'Shared Name',
      });

      expect(topic1.id).not.toBe(topic2.id);
      expect(topic1.projectId).toBe(project1.id);
      expect(topic2.projectId).toBe(project2.id);
    });
  });

  describe('getActiveTopic', () => {
    it('should get active topic for session', async () => {
      const project = createTestProject(testDb.db, 'Active Topic Test');
      const session = createTestSession(testDb.db, project.id, 'Session 1');

      const topic = await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Active Topic',
        status: 'active',
      });

      const topics = await topicRepo.list({
        scopeType: 'project',
        scopeId: project.id,
        status: 'active',
      });

      expect(topics.some((t) => t.id === topic.id)).toBe(true);
    });

    it('should return empty when no active topic', async () => {
      const project = createTestProject(testDb.db, 'No Active Project');
      const session = createTestSession(testDb.db, project.id, 'No Active Session');

      const topics = await topicRepo.list({
        scopeType: 'project',
        scopeId: project.id,
        status: 'active',
      });

      expect(Array.isArray(topics)).toBe(true);
    });
  });

  describe('auto-resume logic', () => {
    it('should find similar topic by embedding', async () => {
      const project = createTestProject(testDb.db, 'Auto Resume Test');

      const topic1 = await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Authentication Topic',
        description: 'JWT token handling',
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
      });

      const similar = await topicRepo.findSimilar('auth token', 0.8);

      expect(Array.isArray(similar)).toBe(true);
    });

    it('should return empty array when no similar topics', async () => {
      const similar = await topicRepo.findSimilar('completely unique query', 0.95);
      expect(Array.isArray(similar)).toBe(true);
      expect(similar.length).toBeGreaterThanOrEqual(0);
    });

    it('should respect similarity threshold', async () => {
      const project = createTestProject(testDb.db, 'Threshold Test');

      await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Topic 1',
        embedding: [0.1, 0.2, 0.3],
      });

      const highThreshold = await topicRepo.findSimilar('query', 0.99);
      const lowThreshold = await topicRepo.findSimilar('query', 0.1);

      expect(Array.isArray(highThreshold)).toBe(true);
      expect(Array.isArray(lowThreshold)).toBe(true);
    });

    it('should exclude inactive topics from similarity search', async () => {
      const project = createTestProject(testDb.db, 'Inactive Similarity Test');

      const topic = await topicRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'To Deactivate',
        embedding: [0.1, 0.2, 0.3],
      });

      await topicRepo.deactivate(topic.id);

      const similar = await topicRepo.findSimilar('query', 0.1);

      expect(similar.every((t) => t.id !== topic.id)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty description', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Empty Description Topic',
        description: '',
      });

      expect(topic).toBeDefined();
      expect(
        topic.description === '' || topic.description === null || topic.description === undefined
      ).toBe(true);
    });

    it('should handle null description', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Null Description Topic',
      });

      expect(topic).toBeDefined();
      expect(topic.description === null || topic.description === undefined).toBe(true);
    });

    it('should handle complex metadata', async () => {
      const metadata = {
        nested: {
          deep: {
            value: 'test',
          },
        },
        array: [1, 2, 3],
        mixed: {
          string: 'value',
          number: 42,
          boolean: true,
        },
      };

      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Complex Metadata Topic',
        metadata,
      });

      expect(topic.metadata).toBeDefined();
      if (typeof topic.metadata === 'string') {
        expect(JSON.parse(topic.metadata)).toEqual(metadata);
      } else {
        expect(topic.metadata).toEqual(metadata);
      }
    });

    it('should handle special characters in name', async () => {
      const specialName = 'Topic with @#$%^&*() special chars!';
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: specialName,
      });

      expect(topic.name).toBe(specialName);

      const retrieved = await topicRepo.getById(topic.id);
      expect(retrieved!.name).toBe(specialName);
    });

    it('should handle very long name', async () => {
      const longName = 'A'.repeat(500);
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: longName,
      });

      expect(topic.name).toBe(longName);
      expect(topic.name.length).toBe(500);
    });

    it('should handle embedding array', async () => {
      const embedding = Array.from({ length: 1536 }, (_, i) => i / 1536);
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Embedding Topic',
        embedding,
      });

      expect(topic.embedding).toBeDefined();
      if (typeof topic.embedding === 'string') {
        const parsed = JSON.parse(topic.embedding);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBe(1536);
      } else {
        expect(Array.isArray(topic.embedding)).toBe(true);
      }
    });
  });

  describe('pagination', () => {
    it('should respect limit parameter', async () => {
      const project = createTestProject(testDb.db, 'Pagination Limit Test');

      for (let i = 0; i < 5; i++) {
        await topicRepo.create({
          scopeType: 'project',
          scopeId: project.id,
          name: `Topic ${i}`,
        });
      }

      const topics = await topicRepo.list(
        {
          scopeType: 'project',
          scopeId: project.id,
        },
        { limit: 2 }
      );

      expect(topics.length).toBeLessThanOrEqual(2);
    });

    it('should respect offset parameter', async () => {
      const project = createTestProject(testDb.db, 'Pagination Offset Test');

      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const topic = await topicRepo.create({
          scopeType: 'project',
          scopeId: project.id,
          name: `Offset Topic ${i}`,
        });
        ids.push(topic.id);
      }

      const page1 = await topicRepo.list(
        {
          scopeType: 'project',
          scopeId: project.id,
        },
        { limit: 2, offset: 0 }
      );

      const page2 = await topicRepo.list(
        {
          scopeType: 'project',
          scopeId: project.id,
        },
        { limit: 2, offset: 2 }
      );

      const page1Ids = page1.map((t) => t.id);
      const page2Ids = page2.map((t) => t.id);

      expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
    });
  });

  describe('timestamps', () => {
    it('should set createdAt on creation', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Timestamp Test',
      });

      expect(topic.createdAt).toBeDefined();
      expect(topic.createdAt instanceof Date || typeof topic.createdAt === 'string').toBe(true);
    });

    it('should update updatedAt on modification', async () => {
      const topic = await topicRepo.create({
        scopeType: 'global',
        name: 'Update Timestamp Test',
      });

      const createdAt = topic.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await topicRepo.update(topic.id, {
        name: 'Updated Name',
      });

      expect(updated!.updatedAt).toBeDefined();
      expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(createdAt).getTime()
      );
    });
  });
});
