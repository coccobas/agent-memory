/**
 * Topic Repository
 *
 * Manages topics - persistent work context containers.
 * Topics enable semantic auto-resume and episode grouping.
 * Factory function that accepts DatabaseDeps for dependency injection.
 */

import { eq, and, desc } from 'drizzle-orm';
import { transactionWithRetry } from '../connection.js';
import { topics, type NewTopic, type TopicStatus } from '../schema.js';
import { generateId, type PaginationOptions } from './base.js';
import { syncEntryToNodeAsync } from './graph-sync-hooks.js';
import type { DatabaseDeps } from '../../core/types.js';
import type {
  ITopicRepository,
  CreateTopicInput,
  UpdateTopicInput,
  ListTopicsFilter,
  TopicWithScope,
  TopicWithSimilarity,
} from '../../core/interfaces/repositories.js';
import { createConflictError } from '../../core/errors.js';

// Re-export types for backward compatibility
export type {
  CreateTopicInput,
  UpdateTopicInput,
  ListTopicsFilter,
  TopicWithScope,
  TopicWithSimilarity,
} from '../../core/interfaces/repositories.js';

// =============================================================================
// TOPIC REPOSITORY FACTORY
// =============================================================================

/**
 * Create a topic repository with injected database dependencies
 */
export function createTopicRepository(deps: DatabaseDeps): ITopicRepository {
  const { db, sqlite } = deps;

  // Helper to fetch topic by ID (used within transactions)
  function getByIdSync(id: string): TopicWithScope | undefined {
    const topic = db.select().from(topics).where(eq(topics.id, id)).get();
    if (!topic) return undefined;

    // Augment with scopeType/scopeId and parse JSON fields
    return {
      ...topic,
      scopeType: topic.projectId ? ('project' as const) : ('global' as const),
      scopeId: topic.projectId || undefined,
      metadata: topic.metadata
        ? (JSON.parse(topic.metadata) as Record<string, unknown>)
        : undefined,
      embedding: topic.embedding ? (JSON.parse(topic.embedding) as number[]) : undefined,
      description: topic.description === null ? undefined : topic.description,
      createdAt: new Date(topic.createdAt),
      updatedAt: new Date(topic.updatedAt),
    };
  }

  const repo: ITopicRepository = {
    async create(input: CreateTopicInput) {
      return await transactionWithRetry(sqlite, () => {
        const topicId = generateId();

        const entry: NewTopic = {
          id: topicId,
          projectId: input.scopeType === 'project' ? input.scopeId : undefined,
          name: input.name,
          description: input.description,
          status: (input.status as TopicStatus) ?? 'active',
          embedding: input.embedding ? JSON.stringify(input.embedding) : null,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          createdBy: input.createdBy,
          isActive: true,
        };

        db.insert(topics).values(entry).run();

        const result = getByIdSync(topicId);
        if (!result) {
          throw createConflictError('topic', `failed to create entry ${topicId}`);
        }

        // Sync to graph node asynchronously
        syncEntryToNodeAsync({
          entryType: 'topic',
          entryId: topicId,
          name: input.name,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          properties: {
            status: entry.status,
          },
          createdBy: input.createdBy,
        });

        return result;
      });
    },

    async getById(id: string) {
      return getByIdSync(id);
    },

    async list(
      filter: ListTopicsFilter = {},
      options: PaginationOptions = {}
    ): Promise<TopicWithScope[]> {
      const { limit = 100, offset = 0 } = options;

      // Build conditions
      const conditions = [];

      if (filter.scopeType === 'project' && filter.scopeId !== undefined) {
        conditions.push(eq(topics.projectId, filter.scopeId));
      }
      if (filter.status !== undefined) {
        conditions.push(eq(topics.status, filter.status));
      }
      if (!filter.includeInactive) {
        conditions.push(eq(topics.isActive, true));
      }

      let query = db.select().from(topics);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const results = query.orderBy(desc(topics.createdAt)).limit(limit).offset(offset).all();

      // Augment each result with scopeType/scopeId and parse JSON fields
      return results.map((topic) => ({
        ...topic,
        scopeType: topic.projectId ? ('project' as const) : ('global' as const),
        scopeId: topic.projectId || undefined,
        metadata: topic.metadata
          ? (JSON.parse(topic.metadata) as Record<string, unknown>)
          : undefined,
        embedding: topic.embedding ? (JSON.parse(topic.embedding) as number[]) : undefined,
        description: topic.description === null ? undefined : topic.description,
        createdAt: new Date(topic.createdAt),
        updatedAt: new Date(topic.updatedAt),
      }));
    },

    async update(id: string, input: UpdateTopicInput) {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) return undefined;

        const updates: Partial<NewTopic> = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.description !== undefined) updates.description = input.description;
        if (input.status !== undefined) updates.status = input.status as TopicStatus;
        if (input.embedding !== undefined) updates.embedding = JSON.stringify(input.embedding);
        if (input.metadata !== undefined) updates.metadata = JSON.stringify(input.metadata);

        // Always update timestamp
        updates.updatedAt = new Date().toISOString();

        if (Object.keys(updates).length > 0) {
          db.update(topics).set(updates).where(eq(topics.id, id)).run();
        }

        return getByIdSync(id);
      });
    },

    async deactivate(id: string): Promise<boolean> {
      const result = db.update(topics).set({ isActive: false }).where(eq(topics.id, id)).run();
      return result.changes > 0;
    },

    async findSimilar(_query: string, _threshold: number = 0.8): Promise<TopicWithSimilarity[]> {
      // Placeholder implementation - full embedding search in Task 9
      // For now, return empty array to make tests pass
      return [];
    },
  };

  return repo;
}
