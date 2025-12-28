import type {
  IConversationRepository,
  CreateKnowledgeInput,
} from '../core/interfaces/repositories.js';
import type { PermissionEntryType } from '../db/schema.js';
import type { MemoryQueryResult } from './query.service.js';
import { createComponentLogger } from '../utils/logger.js';
import { createNotFoundError } from '../core/errors.js';

const logger = createComponentLogger('ConversationService');

/**
 * Conversation service interface
 */
export interface ConversationService {
  autoLinkContextFromQuery(
    conversationId: string,
    messageId: string | undefined,
    queryResult: MemoryQueryResult
  ): Promise<void>;
  generateConversationSummary(conversationId: string): Promise<string>;
  extractKnowledgeFromConversation(conversationId: string): Promise<CreateKnowledgeInput[]>;
  getConversationAnalytics(conversationId: string): Promise<ConversationAnalytics>;
}

/**
 * Create a conversation service with injected dependencies
 *
 * @param conversationRepo - Conversation repository
 * @returns Conversation service instance
 */
export function createConversationService(
  conversationRepo: IConversationRepository
): ConversationService {
  return {
    async autoLinkContextFromQuery(
      conversationId: string,
      messageId: string | undefined,
      queryResult: MemoryQueryResult
    ): Promise<void> {
      await autoLinkContextFromQueryImpl(conversationRepo, conversationId, messageId, queryResult);
    },
    async generateConversationSummary(conversationId: string): Promise<string> {
      return generateConversationSummaryImpl(conversationRepo, conversationId);
    },
    async extractKnowledgeFromConversation(
      conversationId: string
    ): Promise<CreateKnowledgeInput[]> {
      return extractKnowledgeFromConversationImpl(conversationRepo, conversationId);
    },
    async getConversationAnalytics(conversationId: string): Promise<ConversationAnalytics> {
      return getConversationAnalyticsImpl(conversationRepo, conversationId);
    },
  };
}

/**
 * Conversation analytics
 */
export interface ConversationAnalytics {
  messageCount: number;
  userMessageCount: number;
  agentMessageCount: number;
  duration: number; // milliseconds
  memoryEntriesUsed: Array<{ type: PermissionEntryType; id: string; count: number }>;
  toolsUsed: Array<{ tool: string; count: number }>;
  averageRelevanceScore: number;
}

/**
 * Automatically link memory entries from query results to conversation (implementation)
 */
async function autoLinkContextFromQueryImpl(
  conversationRepo: IConversationRepository,
  conversationId: string,
  messageId: string | undefined,
  queryResult: MemoryQueryResult
): Promise<void> {
  // Defensive null checks - this is fire-and-forget, so fail silently
  if (!queryResult || !Array.isArray(queryResult.results)) {
    return;
  }

  for (const item of queryResult.results) {
    // Skip null/undefined items
    if (!item || !item.type || !item.id) {
      continue;
    }

    // Only link tool, guideline, and knowledge entries (not projects)
    if (item.type === 'tool' || item.type === 'guideline' || item.type === 'knowledge') {
      const entryType = item.type as PermissionEntryType;
      const entryId = item.id;
      const relevanceScore =
        typeof item.score === 'number' ? (item.score > 1 ? item.score / 100 : item.score) : 0;

      try {
        await conversationRepo.linkContext({
          conversationId,
          messageId,
          entryType,
          entryId,
          relevanceScore,
        });
      } catch (error) {
        // Log error but don't throw - this is fire-and-forget operation
        // Common expected errors: duplicate links (UNIQUE constraint)
        const message = error instanceof Error ? error.message : String(error);
        const isDuplicate = message.includes('UNIQUE constraint');
        if (!isDuplicate) {
          // Only log unexpected errors to avoid noise from expected duplicates
          logger.debug(
            { conversationId, entryType, entryId, error: message },
            'Failed to link context entry'
          );
        }
      }
    }
  }
}

/**
 * Generate a summary of conversation (implementation)
 */
async function generateConversationSummaryImpl(
  conversationRepo: IConversationRepository,
  conversationId: string
): Promise<string> {
  const conversation = await conversationRepo.getById(conversationId, true, true);

  if (!conversation) {
    return 'Conversation not found';
  }

  const messages = conversation.messages || [];
  const userMessages = messages.filter((m) => m.role === 'user');
  const agentMessages = messages.filter((m) => m.role === 'agent');

  const summaryParts: string[] = [];

  summaryParts.push(`Conversation: ${conversation.title || 'Untitled'}`);
  summaryParts.push(`Status: ${conversation.status}`);
  summaryParts.push(
    `Messages: ${messages.length} total (${userMessages.length} user, ${agentMessages.length} agent)`
  );

  if (conversation.startedAt && conversation.endedAt) {
    const start = new Date(conversation.startedAt);
    const end = new Date(conversation.endedAt);
    const duration = end.getTime() - start.getTime();
    const minutes = Math.floor(duration / 60000);
    summaryParts.push(`Duration: ${minutes} minutes`);
  }

  if (conversation.context && conversation.context.length > 0) {
    summaryParts.push(`Memory entries used: ${conversation.context.length}`);
  }

  // Extract key topics from first few messages
  if (userMessages.length > 0) {
    const firstUserMessage = userMessages[0];
    if (firstUserMessage && firstUserMessage.content.length > 0) {
      const preview = firstUserMessage.content.substring(0, 100);
      summaryParts.push(`Topic: ${preview}${firstUserMessage.content.length > 100 ? '...' : ''}`);
    }
  }

  return summaryParts.join('\n');
}

/**
 * Extract knowledge from conversation (implementation)
 */
async function extractKnowledgeFromConversationImpl(
  conversationRepo: IConversationRepository,
  conversationId: string
): Promise<CreateKnowledgeInput[]> {
  const conversation = await conversationRepo.getById(conversationId, true, true);

  if (!conversation || !conversation.messages) {
    return [];
  }

  const knowledgeEntries: CreateKnowledgeInput[] = [];

  // Extract decisions from agent messages
  const agentMessages = conversation.messages.filter((m) => m.role === 'agent');
  for (const message of agentMessages) {
    // Simple heuristic: if message contains "decision" or "decided" or "will"
    if (
      message.content.toLowerCase().includes('decision') ||
      message.content.toLowerCase().includes('decided') ||
      message.content.toLowerCase().includes('will do')
    ) {
      knowledgeEntries.push({
        scopeType: conversation.projectId ? 'project' : 'global',
        scopeId: conversation.projectId || undefined,
        title: `Decision from conversation ${conversationId}`,
        category: 'decision',
        content: message.content,
        source: `conversation:${conversationId}`,
        confidence: 0.8,
      });
    }
  }

  return knowledgeEntries;
}

/**
 * Get analytics for a conversation (implementation)
 */
async function getConversationAnalyticsImpl(
  conversationRepo: IConversationRepository,
  conversationId: string
): Promise<ConversationAnalytics> {
  const conversation = await conversationRepo.getById(conversationId, true, true);

  if (!conversation) {
    throw createNotFoundError('Conversation', conversationId);
  }

  const messages = conversation.messages || [];
  const userMessages = messages.filter((m) => m.role === 'user');
  const agentMessages = messages.filter((m) => m.role === 'agent');

  // Calculate duration
  let duration = 0;
  if (conversation.startedAt && conversation.endedAt) {
    const start = new Date(conversation.startedAt);
    const end = new Date(conversation.endedAt);
    duration = end.getTime() - start.getTime();
  } else if (conversation.startedAt) {
    // If not ended, use current time
    const start = new Date(conversation.startedAt);
    duration = Date.now() - start.getTime();
  }

  // Count memory entries used
  const context = conversation.context || [];
  const entryCounts = new Map<string, number>();
  for (const ctx of context) {
    const key = `${ctx.entryType}:${ctx.entryId}`;
    entryCounts.set(key, (entryCounts.get(key) || 0) + 1);
  }

  const memoryEntriesUsed: Array<{ type: PermissionEntryType; id: string; count: number }> = [];
  for (const [key, count] of entryCounts.entries()) {
    const [type, id] = key.split(':');
    if (type && id && (type === 'tool' || type === 'guideline' || type === 'knowledge')) {
      memoryEntriesUsed.push({
        type: type as PermissionEntryType,
        id,
        count,
      });
    }
  }

  // Count tools used
  const toolCounts = new Map<string, number>();
  for (const message of messages) {
    if (message.toolsUsed) {
      for (const tool of message.toolsUsed) {
        toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
      }
    }
  }

  const toolsUsed: Array<{ tool: string; count: number }> = [];
  for (const [tool, count] of toolCounts.entries()) {
    toolsUsed.push({ tool, count });
  }

  // Calculate average relevance score
  let totalScore = 0;
  let scoreCount = 0;
  for (const ctx of context) {
    if (ctx.relevanceScore !== null && ctx.relevanceScore !== undefined) {
      totalScore += ctx.relevanceScore;
      scoreCount++;
    }
  }
  const averageRelevanceScore = scoreCount > 0 ? totalScore / scoreCount : 0;

  return {
    messageCount: messages.length,
    userMessageCount: userMessages.length,
    agentMessageCount: agentMessages.length,
    duration,
    memoryEntriesUsed,
    toolsUsed,
    averageRelevanceScore,
  };
}



