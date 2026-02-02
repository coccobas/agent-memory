import { describe, it, expect } from 'vitest';
import { topics, type Topic, type NewTopic } from '../topics.js';

describe('Topics Schema', () => {
  it('should export Topic type', () => {
    const topic: Topic = {
      id: 'topic-1',
      projectId: 'proj-1',
      name: 'Authentication',
      description: 'Auth implementation work',
      status: 'active',
      embedding: null,
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'user-1',
      isActive: true,
    };

    expect(topic.id).toBe('topic-1');
    expect(topic.status).toBe('active');
  });

  it('should export NewTopic type', () => {
    const newTopic: NewTopic = {
      id: 'topic-2',
      projectId: 'proj-1',
      name: 'Database Schema',
      description: 'Schema design and migrations',
      status: 'active',
    };

    expect(newTopic.name).toBe('Database Schema');
  });

  it('should have id, projectId, name, status columns', () => {
    expect(topics.id).toBeDefined();
    expect(topics.projectId).toBeDefined();
    expect(topics.name).toBeDefined();
    expect(topics.status).toBeDefined();
  });

  it('should have lifecycle columns', () => {
    expect(topics.createdAt).toBeDefined();
    expect(topics.updatedAt).toBeDefined();
    expect(topics.isActive).toBeDefined();
  });

  it('should support active and inactive status', () => {
    const activeTopic: Topic = {
      id: 'topic-3',
      projectId: 'proj-1',
      name: 'Active Topic',
      description: null,
      status: 'active',
      embedding: null,
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: null,
      isActive: true,
    };

    const inactiveTopic: Topic = {
      ...activeTopic,
      id: 'topic-4',
      name: 'Inactive Topic',
      status: 'inactive',
      isActive: false,
    };

    expect(activeTopic.status).toBe('active');
    expect(inactiveTopic.status).toBe('inactive');
  });

  it('should support embedding field', () => {
    const topicWithEmbedding: Topic = {
      id: 'topic-5',
      projectId: 'proj-1',
      name: 'Embedded Topic',
      description: null,
      status: 'active',
      embedding: '[0.1, 0.2, 0.3]',
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: null,
      isActive: true,
    };

    expect(topicWithEmbedding.embedding).toBe('[0.1, 0.2, 0.3]');
  });

  it('should support metadata field', () => {
    const topicWithMetadata: Topic = {
      id: 'topic-6',
      projectId: 'proj-1',
      name: 'Topic with Metadata',
      description: null,
      status: 'active',
      embedding: null,
      metadata: '{"priority": "high", "tags": ["urgent"]}',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: null,
      isActive: true,
    };

    expect(topicWithMetadata.metadata).toBe('{"priority": "high", "tags": ["urgent"]}');
  });
});
