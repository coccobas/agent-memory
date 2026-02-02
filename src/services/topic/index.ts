/**
 * Topic Service
 *
 * Orchestrates topic operations, providing:
 * - CRUD operations (delegated to repository)
 * - findOrCreate - query by name, create if not found
 * - getActiveTopic - get the active topic for a session/project
 * - findSimilar - semantic search for similar topics (placeholder for Task 9)
 */

import type {
  ITopicRepository,
  CreateTopicInput,
  UpdateTopicInput,
  ListTopicsFilter,
  TopicWithScope,
  TopicWithSimilarity,
} from '../../core/interfaces/repositories.js';
import type { PaginationOptions } from '../../db/repositories/base.js';
import type { ScopeType, TopicStatus } from '../../db/schema.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('topic-service');

// =============================================================================
// SERVICE INTERFACES
// =============================================================================

export interface TopicServiceDeps {
  topicRepo: ITopicRepository;
}

export interface FindOrCreateInput {
  scopeType: ScopeType;
  scopeId?: string;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

export interface ITopicService {
  // CRUD Operations
  create(input: CreateTopicInput): Promise<TopicWithScope>;
  getById(id: string): Promise<TopicWithScope | undefined>;
  list(filter?: ListTopicsFilter, options?: PaginationOptions): Promise<TopicWithScope[]>;
  update(id: string, input: UpdateTopicInput): Promise<TopicWithScope | undefined>;
  deactivate(id: string): Promise<boolean>;

  // Business Logic
  findOrCreate(input: FindOrCreateInput): Promise<{ topic: TopicWithScope; created: boolean }>;
  getActiveTopic(
    scopeType: ScopeType,
    scopeId?: string,
    sessionId?: string
  ): Promise<TopicWithScope | undefined>;

  // Semantic Search (placeholder for Task 9)
  findSimilar(query: string, threshold?: number): Promise<TopicWithSimilarity[]>;
}

// =============================================================================
// SERVICE FACTORY
// =============================================================================

export function createTopicService(deps: TopicServiceDeps): ITopicService {
  const { topicRepo } = deps;

  return {
    // =========================================================================
    // CRUD Operations (delegated to repository)
    // =========================================================================

    async create(input: CreateTopicInput): Promise<TopicWithScope> {
      logger.debug({ input }, 'Creating topic');
      return topicRepo.create(input);
    },

    async getById(id: string): Promise<TopicWithScope | undefined> {
      return topicRepo.getById(id);
    },

    async list(filter?: ListTopicsFilter, options?: PaginationOptions): Promise<TopicWithScope[]> {
      return topicRepo.list(filter, options);
    },

    async update(id: string, input: UpdateTopicInput): Promise<TopicWithScope | undefined> {
      logger.debug({ id, input }, 'Updating topic');
      return topicRepo.update(id, input);
    },

    async deactivate(id: string): Promise<boolean> {
      logger.debug({ id }, 'Deactivating topic');
      return topicRepo.deactivate(id);
    },

    // =========================================================================
    // Business Logic
    // =========================================================================

    /**
     * Find an existing topic by name or create a new one.
     * Scoped by project - same name in different projects creates separate topics.
     */
    async findOrCreate(
      input: FindOrCreateInput
    ): Promise<{ topic: TopicWithScope; created: boolean }> {
      const { scopeType, scopeId, name, description, metadata, createdBy } = input;

      logger.debug({ scopeType, scopeId, name }, 'Finding or creating topic');

      // Search for existing topic by name within the scope
      const existingTopics = await topicRepo.list({
        scopeType,
        scopeId,
        includeInactive: false,
      });

      const existing = existingTopics.find((t) => t.name.toLowerCase() === name.toLowerCase());

      if (existing) {
        logger.debug({ topicId: existing.id }, 'Found existing topic');
        return { topic: existing, created: false };
      }

      // Create new topic
      const newTopic = await topicRepo.create({
        scopeType,
        scopeId,
        name,
        description,
        status: 'active',
        metadata,
        createdBy,
      });

      logger.debug({ topicId: newTopic.id }, 'Created new topic');
      return { topic: newTopic, created: true };
    },

    /**
     * Get the currently active topic for a session or project.
     * Returns undefined if no active topic exists.
     */
    async getActiveTopic(
      scopeType: ScopeType,
      scopeId?: string,
      _sessionId?: string
    ): Promise<TopicWithScope | undefined> {
      // For now, return the most recently created active topic in the scope
      // Future: could track which topic is "current" for a session
      const activeTopics = await topicRepo.list(
        {
          scopeType,
          scopeId,
          status: 'active' as TopicStatus,
          includeInactive: false,
        },
        { limit: 1 }
      );

      return activeTopics[0];
    },

    // =========================================================================
    // Semantic Search (placeholder for Task 9)
    // =========================================================================

    /**
     * Find topics similar to the query using embedding-based search.
     * Placeholder implementation - full embedding search in Task 9.
     */
    async findSimilar(query: string, threshold = 0.8): Promise<TopicWithSimilarity[]> {
      logger.debug({ query, threshold }, 'Finding similar topics');
      return topicRepo.findSimilar(query, threshold);
    },
  };
}

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type TopicService = ReturnType<typeof createTopicService>;

// Re-export types for convenience
export type {
  CreateTopicInput,
  UpdateTopicInput,
  ListTopicsFilter,
  TopicWithScope,
  TopicWithSimilarity,
} from '../../core/interfaces/repositories.js';
