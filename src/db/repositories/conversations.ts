/**
 * Conversation Repository
 *
 * Factory function that accepts DatabaseDeps for dependency injection.
 */

import { eq, and, or, like, desc, asc, sql, inArray } from 'drizzle-orm';
import { transactionWithDb } from '../connection.js';
import {
  conversations,
  conversationMessages,
  conversationContext,
  type NewConversation,
  type NewConversationMessage,
  type NewConversationContext,
} from '../schema.js';
import { generateId, type PaginationOptions, DEFAULT_LIMIT, MAX_LIMIT } from './base.js';
import type { DatabaseDeps } from '../../core/types.js';
import type {
  IConversationRepository,
  CreateConversationInput,
  UpdateConversationInput,
  ListConversationsFilter,
  AddMessageInput,
  LinkContextInput,
  ConversationSearchFilter,
  ConversationWithMessages,
  ContextEntryType,
} from '../../core/interfaces/repositories.js';

// Re-export types for backward compatibility
export type {
  CreateConversationInput,
  UpdateConversationInput,
  ListConversationsFilter,
  AddMessageInput,
  LinkContextInput,
  ConversationSearchFilter,
  ConversationWithMessages,
  ContextEntryType,
} from '../../core/interfaces/repositories.js';

// =============================================================================
// CONVERSATION REPOSITORY FACTORY
// =============================================================================

/**
 * Create a conversation repository with injected database dependencies
 */
export function createConversationRepository(deps: DatabaseDeps): IConversationRepository {
  const { db, sqlite } = deps;

  // Helper to fetch conversation (used within transactions)
  function getByIdSync(
    id: string,
    includeMessages?: boolean,
    includeContext?: boolean
  ): ConversationWithMessages | undefined {
    const conversation = db.select().from(conversations).where(eq(conversations.id, id)).get();

    if (!conversation) return undefined;

    const result: ConversationWithMessages = { ...conversation };

    if (includeMessages) {
      result.messages = db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, id))
        .orderBy(asc(conversationMessages.messageIndex))
        .all();
    }

    if (includeContext) {
      result.context = db
        .select()
        .from(conversationContext)
        .where(eq(conversationContext.conversationId, id))
        .all();
    }

    return result;
  }

  const repo: IConversationRepository = {
    async create(input: CreateConversationInput): Promise<ConversationWithMessages> {
      return transactionWithDb(sqlite, () => {
        const conversationId = generateId();

        const entry: NewConversation = {
          id: conversationId,
          sessionId: input.sessionId,
          projectId: input.projectId,
          agentId: input.agentId,
          title: input.title,
          status: 'active',
          metadata: input.metadata,
        };

        db.insert(conversations).values(entry).run();

        const result = getByIdSync(conversationId);
        if (!result) {
          throw new Error(`Failed to create conversation ${conversationId}`);
        }

        return result;
      });
    },

    async getById(
      id: string,
      includeMessages?: boolean,
      includeContext?: boolean
    ): Promise<ConversationWithMessages | undefined> {
      const conversation = db.select().from(conversations).where(eq(conversations.id, id)).get();

      if (!conversation) return undefined;

      const result: ConversationWithMessages = { ...conversation };

      if (includeMessages) {
        result.messages = db
          .select()
          .from(conversationMessages)
          .where(eq(conversationMessages.conversationId, id))
          .orderBy(asc(conversationMessages.messageIndex))
          .all();
      }

      if (includeContext) {
        result.context = db
          .select()
          .from(conversationContext)
          .where(eq(conversationContext.conversationId, id))
          .all();
      }

      return result;
    },

    async list(
      filter: ListConversationsFilter = {},
      options: PaginationOptions = {}
    ): Promise<ConversationWithMessages[]> {
      const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = options.offset ?? 0;

      const conditions = [];

      if (filter.sessionId !== undefined) {
        conditions.push(eq(conversations.sessionId, filter.sessionId));
      }

      if (filter.projectId !== undefined) {
        conditions.push(eq(conversations.projectId, filter.projectId));
      }

      if (filter.agentId !== undefined) {
        conditions.push(eq(conversations.agentId, filter.agentId));
      }

      if (filter.status !== undefined) {
        conditions.push(eq(conversations.status, filter.status));
      }

      if (filter.startedAfter !== undefined) {
        conditions.push(sql`${conversations.startedAt} >= ${filter.startedAfter}`);
      }

      if (filter.startedBefore !== undefined) {
        conditions.push(sql`${conversations.startedAt} <= ${filter.startedBefore}`);
      }

      let query = db.select().from(conversations);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      return query.orderBy(desc(conversations.startedAt)).limit(limit).offset(offset).all();
    },

    async update(id: string, updates: UpdateConversationInput): Promise<ConversationWithMessages | undefined> {
      return transactionWithDb(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) return undefined;

        const updateData: Partial<NewConversation> = {};

        if (updates.title !== undefined) {
          updateData.title = updates.title;
        }

        if (updates.status !== undefined) {
          updateData.status = updates.status;
          // Set ended_at if status changed to completed or archived
          if (updates.status === 'completed' || updates.status === 'archived') {
            if (!existing.endedAt) {
              updateData.endedAt = new Date().toISOString();
            }
          }
        }

        if (updates.metadata !== undefined) {
          updateData.metadata = updates.metadata;
        }

        db.update(conversations).set(updateData).where(eq(conversations.id, id)).run();

        return getByIdSync(id);
      });
    },

    async addMessage(input: AddMessageInput) {
      return transactionWithDb(sqlite, () => {
        const messageId = generateId();

        // Get max message_index for this conversation
        const maxIndexResult = db
          .select({ maxIndex: sql<number>`MAX(${conversationMessages.messageIndex})` })
          .from(conversationMessages)
          .where(eq(conversationMessages.conversationId, input.conversationId))
          .get();

        const nextIndex =
          maxIndexResult?.maxIndex !== null && maxIndexResult?.maxIndex !== undefined
            ? maxIndexResult.maxIndex + 1
            : 0;

        const message: NewConversationMessage = {
          id: messageId,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          messageIndex: nextIndex,
          contextEntries: input.contextEntries,
          toolsUsed: input.toolsUsed,
          metadata: input.metadata,
        };

        db.insert(conversationMessages).values(message).run();

        const result = db
          .select()
          .from(conversationMessages)
          .where(eq(conversationMessages.id, messageId))
          .get();

        if (!result) {
          throw new Error(`Failed to create message ${messageId}`);
        }

        return result;
      });
    },

    async getMessages(conversationId: string, limit?: number, offset?: number) {
      let query = db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversationId))
        .orderBy(asc(conversationMessages.messageIndex));

      if (limit !== undefined) {
        query = query.limit(limit) as typeof query;
      }

      if (offset !== undefined) {
        query = query.offset(offset) as typeof query;
      }

      return query.all();
    },

    async linkContext(input: LinkContextInput) {
      return transactionWithDb(sqlite, () => {
        const contextId = generateId();

        const context: NewConversationContext = {
          id: contextId,
          conversationId: input.conversationId,
          messageId: input.messageId,
          entryType: input.entryType,
          entryId: input.entryId,
          relevanceScore: input.relevanceScore,
        };

        // Check if context link already exists before inserting
        const existing = db
          .select()
          .from(conversationContext)
          .where(
            and(
              eq(conversationContext.conversationId, input.conversationId),
              input.messageId
                ? eq(conversationContext.messageId, input.messageId)
                : sql`${conversationContext.messageId} IS NULL`,
              eq(conversationContext.entryType, input.entryType),
              eq(conversationContext.entryId, input.entryId)
            )
          )
          .get();

        if (existing) {
          // Update relevance score if provided and different
          if (
            input.relevanceScore !== undefined &&
            existing.relevanceScore !== input.relevanceScore
          ) {
            db.update(conversationContext)
              .set({ relevanceScore: input.relevanceScore })
              .where(eq(conversationContext.id, existing.id))
              .run();
            const updated = db
              .select()
              .from(conversationContext)
              .where(eq(conversationContext.id, existing.id))
              .get();
            if (!updated) {
              throw new Error(`Failed to update context link ${existing.id}`);
            }
            return updated;
          }
          return existing;
        }

        // Insert new context link
        db.insert(conversationContext).values(context).run();

        const result = db
          .select()
          .from(conversationContext)
          .where(eq(conversationContext.id, contextId))
          .get();

        if (!result) {
          throw new Error(`Failed to create context link ${contextId}`);
        }

        return result;
      });
    },

    async getContextForEntry(entryType: ContextEntryType, entryId: string) {
      return db
        .select()
        .from(conversationContext)
        .where(
          and(eq(conversationContext.entryType, entryType), eq(conversationContext.entryId, entryId))
        )
        .all();
    },

    async getContextForConversation(conversationId: string) {
      return db
        .select()
        .from(conversationContext)
        .where(eq(conversationContext.conversationId, conversationId))
        .all();
    },

    async search(searchQuery: string, filter?: ConversationSearchFilter): Promise<ConversationWithMessages[]> {
      const limit = Math.min(filter?.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = filter?.offset ?? 0;

      // Also search in message content by finding conversations with matching messages
      const matchingMessageConversations = db
        .selectDistinct({ conversationId: conversationMessages.conversationId })
        .from(conversationMessages)
        .where(like(conversationMessages.content, `%${searchQuery}%`))
        .all();

      const conversationIds = matchingMessageConversations.map((m) => m.conversationId);

      const searchConditions = [];

      // Search in conversation titles (handle nullable title)
      searchConditions.push(like(conversations.title, `%${searchQuery}%`));

      // Also match conversations with matching messages
      if (conversationIds.length > 0) {
        searchConditions.push(inArray(conversations.id, conversationIds));
      }

      // Combine with OR for title OR message content match
      // If no conditions, return empty (shouldn't happen but handle gracefully)
      const searchCondition = searchConditions.length > 0 ? or(...searchConditions) : sql`1=0`;

      const baseConditions = [];

      if (filter?.sessionId !== undefined) {
        baseConditions.push(eq(conversations.sessionId, filter.sessionId));
      }

      if (filter?.projectId !== undefined) {
        baseConditions.push(eq(conversations.projectId, filter.projectId));
      }

      if (filter?.agentId !== undefined) {
        baseConditions.push(eq(conversations.agentId, filter.agentId));
      }

      let query = db.select().from(conversations);

      const allConditions = [];
      if (searchCondition) {
        allConditions.push(searchCondition);
      }
      if (baseConditions.length > 0) {
        allConditions.push(...baseConditions);
      }

      if (allConditions.length > 0) {
        query = query.where(and(...allConditions)) as typeof query;
      }

      return query.orderBy(desc(conversations.startedAt)).limit(limit).offset(offset).all();
    },
  };

  return repo;
}
