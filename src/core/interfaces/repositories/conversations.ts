/**
 * Conversation Repository Interfaces
 *
 * Conversations and context linking
 */

import type { EntryType } from '../../../db/schema.js';
import type { PaginationOptions } from '../../../db/repositories/base.js';

// Narrower type for conversation context entry types (excludes 'project')
export type ContextEntryType = 'tool' | 'guideline' | 'knowledge';

// =============================================================================
// CONVERSATION REPOSITORY
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
  episodeId?: string;
  contextEntries?: Array<{ type: EntryType; id: string }>;
  toolsUsed?: string[];
  metadata?: Record<string, unknown>;
}

export interface LinkContextInput {
  conversationId: string;
  messageId?: string;
  entryType: ContextEntryType;
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

export interface ConversationWithMessages {
  id: string;
  sessionId: string | null;
  projectId: string | null;
  agentId: string | null;
  title: string | null;
  status: 'active' | 'completed' | 'archived';
  startedAt: string;
  endedAt: string | null;
  metadata: Record<string, unknown> | null;
  messages?: Array<{
    id: string;
    conversationId: string;
    role: 'user' | 'agent' | 'system';
    content: string;
    messageIndex: number;
    contextEntries: Array<{ type: EntryType; id: string }> | null;
    toolsUsed: string[] | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    relevanceScore: number | null;
    relevanceCategory: 'high' | 'medium' | 'low' | null;
    relevanceScoredAt: string | null;
  }>;
  context?: Array<{
    id: string;
    conversationId: string;
    messageId: string | null;
    entryType: ContextEntryType;
    entryId: string;
    relevanceScore: number | null;
    createdAt: string;
  }>;
}

export interface IConversationRepository {
  /**
   * Create a new conversation.
   * @param input - Conversation creation parameters
   * @returns Created conversation
   * @throws {AgentMemoryError} E2000 - Referenced session or project not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  create(input: CreateConversationInput): Promise<ConversationWithMessages>;

  /**
   * Get a conversation by ID.
   * @param id - Conversation ID
   * @param includeMessages - Whether to include messages
   * @param includeContext - Whether to include linked context
   * @returns Conversation if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getById(
    id: string,
    includeMessages?: boolean,
    includeContext?: boolean
  ): Promise<ConversationWithMessages | undefined>;

  /**
   * List conversations matching filter criteria.
   * @param filter - Filter options (sessionId, projectId, status, date range)
   * @param options - Pagination options
   * @returns Array of conversations
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  list(
    filter?: ListConversationsFilter,
    options?: PaginationOptions
  ): Promise<ConversationWithMessages[]>;

  /**
   * Update a conversation.
   * @param id - Conversation ID
   * @param updates - Update parameters
   * @returns Updated conversation, or undefined if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  update(
    id: string,
    updates: UpdateConversationInput
  ): Promise<ConversationWithMessages | undefined>;

  /**
   * Add a message to a conversation.
   * @param input - Message parameters
   * @returns Created message
   * @throws {AgentMemoryError} E1000 - Missing required field (conversationId, role, content)
   * @throws {AgentMemoryError} E2000 - Conversation not found
   * @throws {AgentMemoryError} E1005 - Content exceeds size limit
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  addMessage(input: AddMessageInput): Promise<{
    id: string;
    conversationId: string;
    role: 'user' | 'agent' | 'system';
    content: string;
    messageIndex: number;
    episodeId: string | null;
    contextEntries: Array<{ type: EntryType; id: string }> | null;
    toolsUsed: string[] | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>;

  /**
   * Get messages for a conversation.
   * @param conversationId - Conversation ID
   * @param limit - Maximum number of messages
   * @param offset - Number of messages to skip
   * @returns Array of messages
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getMessages(
    conversationId: string,
    limit?: number,
    offset?: number
  ): Promise<
    Array<{
      id: string;
      conversationId: string;
      role: 'user' | 'agent' | 'system';
      content: string;
      messageIndex: number;
      episodeId: string | null;
      contextEntries: Array<{ type: EntryType; id: string }> | null;
      toolsUsed: string[] | null;
      metadata: Record<string, unknown> | null;
      createdAt: string;
    }>
  >;

  /**
   * Get messages for an episode.
   * @param episodeId - Episode ID
   * @param limit - Maximum number of messages
   * @param offset - Number of messages to skip
   * @returns Array of messages
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getMessagesByEpisode(
    episodeId: string,
    limit?: number,
    offset?: number
  ): Promise<
    Array<{
      id: string;
      conversationId: string;
      role: 'user' | 'agent' | 'system';
      content: string;
      messageIndex: number;
      episodeId: string | null;
      contextEntries: Array<{ type: EntryType; id: string }> | null;
      toolsUsed: string[] | null;
      metadata: Record<string, unknown> | null;
      createdAt: string;
      relevanceScore: number | null;
      relevanceCategory: 'high' | 'medium' | 'low' | null;
      relevanceScoredAt: string | null;
    }>
  >;

  /**
   * Link a context entry to a conversation.
   * @param input - Context link parameters
   * @returns Created context link
   * @throws {AgentMemoryError} E1000 - Missing required field (conversationId, entryType, entryId)
   * @throws {AgentMemoryError} E2000 - Conversation or entry not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  linkContext(input: LinkContextInput): Promise<{
    id: string;
    conversationId: string;
    messageId: string | null;
    entryType: ContextEntryType;
    entryId: string;
    relevanceScore: number | null;
    createdAt: string;
  }>;

  /**
   * Get all conversations that reference a specific entry.
   * @param entryType - Entry type
   * @param entryId - Entry ID
   * @returns Array of context links
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getContextForEntry(
    entryType: ContextEntryType,
    entryId: string
  ): Promise<
    Array<{
      id: string;
      conversationId: string;
      messageId: string | null;
      entryType: ContextEntryType;
      entryId: string;
      relevanceScore: number | null;
      createdAt: string;
    }>
  >;

  /**
   * Get all context entries linked to a conversation.
   * @param conversationId - Conversation ID
   * @returns Array of context links
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getContextForConversation(conversationId: string): Promise<
    Array<{
      id: string;
      conversationId: string;
      messageId: string | null;
      entryType: ContextEntryType;
      entryId: string;
      relevanceScore: number | null;
      createdAt: string;
    }>
  >;

  /**
   * Search conversations by message content.
   * @param searchQuery - Full-text search query
   * @param filter - Additional filter options
   * @returns Array of matching conversations
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  search(
    searchQuery: string,
    filter?: ConversationSearchFilter
  ): Promise<ConversationWithMessages[]>;

  /**
   * Link messages to an episode by time range.
   * Updates messages in the given session that fall within the time range
   * and don't already have an episodeId assigned.
   *
   * @param params - Parameters for linking
   * @param params.episodeId - Episode ID to link messages to
   * @param params.sessionId - Session ID to find messages in
   * @param params.startTime - Start of time range (ISO timestamp)
   * @param params.endTime - End of time range (ISO timestamp)
   * @returns Number of messages linked
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  linkMessagesToEpisode(params: {
    episodeId: string;
    sessionId: string;
    startTime: string;
    endTime: string;
  }): Promise<number>;
}
