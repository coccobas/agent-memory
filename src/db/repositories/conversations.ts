import { eq, and, or, like, desc, asc, sql, inArray } from 'drizzle-orm';
import { getDb } from '../connection.js';
import {
  conversations,
  conversationMessages,
  conversationContext,
  type Conversation,
  type NewConversation,
  type ConversationMessage,
  type NewConversationMessage,
  type ConversationContext,
  type NewConversationContext,
  type PermissionEntryType,
} from '../schema.js';
import { generateId, type PaginationOptions, DEFAULT_LIMIT, MAX_LIMIT } from './base.js';
import { transaction } from '../connection.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateConversationInput {
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateConversationInput {
  title?: string;
  status?: 'active' | 'completed' | 'archived';
  metadata?: Record<string, unknown>;
}

export interface ListConversationsFilter {
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  status?: 'active' | 'completed' | 'archived';
  startedAfter?: string;
  startedBefore?: string;
}

export interface AddMessageInput {
  conversationId: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  contextEntries?: Array<{ type: PermissionEntryType; id: string }>;
  toolsUsed?: string[];
  metadata?: Record<string, unknown>;
}

export interface LinkContextInput {
  conversationId: string;
  messageId?: string;
  entryType: PermissionEntryType;
  entryId: string;
  relevanceScore?: number;
}

export interface ConversationSearchFilter {
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  limit?: number;
  offset?: number;
}

export interface ConversationWithMessages extends Conversation {
  messages?: ConversationMessage[];
  context?: ConversationContext[];
}

// =============================================================================
// REPOSITORY
// =============================================================================

export const conversationRepo = {
  /**
   * Create a new conversation thread
   *
   * @param input - Conversation creation parameters
   * @returns The created conversation
   */
  create(input: CreateConversationInput): Conversation {
    return transaction(() => {
      const db = getDb();
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

      const result = this.getById(conversationId);
      if (!result) {
        throw new Error(`Failed to create conversation ${conversationId}`);
      }

      return result;
    });
  },

  /**
   * Get conversation by ID with optional messages and context
   *
   * @param id - The conversation ID
   * @param includeMessages - Whether to include messages
   * @param includeContext - Whether to include context links
   * @returns The conversation with optional messages and context, or undefined if not found
   */
  getById(
    id: string,
    includeMessages?: boolean,
    includeContext?: boolean
  ): ConversationWithMessages | undefined {
    const db = getDb();

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

  /**
   * List conversations with filtering and pagination
   *
   * @param filter - Optional filters for session, project, agent, status, date range
   * @param options - Optional pagination parameters (limit, offset)
   * @returns Array of conversations matching the filter criteria
   */
  list(filter: ListConversationsFilter = {}, options: PaginationOptions = {}): Conversation[] {
    const db = getDb();
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

  /**
   * Update conversation metadata
   *
   * @param id - The conversation ID to update
   * @param updates - Update parameters
   * @returns The updated conversation, or undefined if not found
   */
  update(id: string, updates: UpdateConversationInput): Conversation | undefined {
    return transaction(() => {
      const db = getDb();

      const existing = this.getById(id);
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

      return this.getById(id) ?? undefined;
    });
  },

  /**
   * Add message to conversation
   *
   * @param input - Message creation parameters
   * @returns The created message
   */
  addMessage(input: AddMessageInput): ConversationMessage {
    return transaction(() => {
      const db = getDb();
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

  /**
   * Get messages for a conversation
   *
   * @param conversationId - The conversation ID
   * @param limit - Optional limit for pagination
   * @param offset - Optional offset for pagination
   * @returns Array of messages ordered by message_index
   */
  getMessages(conversationId: string, limit?: number, offset?: number): ConversationMessage[] {
    const db = getDb();

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

  /**
   * Link memory entry to conversation/message
   *
   * @param input - Context link parameters
   * @returns The created context link
   */
  linkContext(input: LinkContextInput): ConversationContext {
    return transaction(() => {
      const db = getDb();
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

  /**
   * Get all conversations that used a specific memory entry
   *
   * @param entryType - The entry type
   * @param entryId - The entry ID
   * @returns Array of context links with conversation and message info
   */
  getContextForEntry(entryType: PermissionEntryType, entryId: string): ConversationContext[] {
    const db = getDb();

    return db
      .select()
      .from(conversationContext)
      .where(
        and(eq(conversationContext.entryType, entryType), eq(conversationContext.entryId, entryId))
      )
      .all();
  },

  /**
   * Get all memory entries linked to a conversation
   *
   * @param conversationId - The conversation ID
   * @returns Array of context links with entry info
   */
  getContextForConversation(conversationId: string): ConversationContext[] {
    const db = getDb();

    return db
      .select()
      .from(conversationContext)
      .where(eq(conversationContext.conversationId, conversationId))
      .all();
  },

  /**
   * Search conversations by title and message content
   *
   * @param searchQuery - The search query string
   * @param filter - Optional filters
   * @returns Array of matching conversations
   */
  search(searchQuery: string, filter?: ConversationSearchFilter): Conversation[] {
    const db = getDb();
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

