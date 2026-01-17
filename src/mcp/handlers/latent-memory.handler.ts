/**
 * Latent memory handlers for KV-cache management
 *
 * Manages latent memory representations and efficient context injection
 * through KV-cache optimization. Provides semantic search, preloading,
 * and formatted context building for LLM consumption.
 *
 * Context-aware handlers that receive AppContext for dependency injection.
 * These handlers delegate to LatentMemoryService for actual operations.
 */

import type { AppContext } from '../../core/context.js';
import {
  createValidationError,
  createNotFoundError,
  createServiceUnavailableError,
} from '../../core/errors.js';
import { getRequiredParam, getOptionalParam, isString, isNumber } from '../../utils/type-guards.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import type { LatentMemoryService } from '../../services/latent-memory/latent-memory.service.js';

/**
 * Get the latent memory service or throw if unavailable
 */
function getLatentMemoryService(context: AppContext): LatentMemoryService {
  const service = context.services.latentMemory;
  if (!service) {
    throw createServiceUnavailableError(
      'LatentMemoryService',
      'latent memory service is not configured'
    );
  }
  if (!service.isAvailable()) {
    throw createServiceUnavailableError(
      'LatentMemoryService',
      'embedding or vector service is not available'
    );
  }
  return service;
}

/**
 * Source type for latent memory entries
 */
type LatentSourceType = 'tool' | 'guideline' | 'knowledge' | 'experience';

/**
 * Output format for injected context
 */
type LatentOutputFormat = 'json' | 'markdown' | 'natural_language';

/**
 * Validates source type parameter
 */
function isSourceType(value: unknown): value is LatentSourceType {
  return (
    value === 'tool' || value === 'guideline' || value === 'knowledge' || value === 'experience'
  );
}

/**
 * Validates output format parameter
 */
function isOutputFormat(value: unknown): value is LatentOutputFormat {
  return value === 'json' || value === 'markdown' || value === 'natural_language';
}

/**
 * Create a latent memory entry from a source entry
 *
 * Generates an optimized representation suitable for KV-cache storage.
 * Delegates to LatentMemoryService for embedding generation and persistence.
 */
async function createLatentMemory(
  context: AppContext,
  params: Record<string, unknown>
): Promise<{
  success: boolean;
  latentMemory: {
    id: string;
    sourceType: LatentSourceType;
    sourceId: string;
    text: string;
    importanceScore: number;
    createdAt: string;
  };
}> {
  const service = getLatentMemoryService(context);

  const sourceType = getRequiredParam(params, 'sourceType', isSourceType);
  const sourceId = getRequiredParam(params, 'sourceId', isString);
  const text = getOptionalParam(params, 'text', isString);
  const sessionId = getOptionalParam(params, 'sessionId', isString);
  const importanceScore = getOptionalParam(params, 'importanceScore', isNumber);

  // Fetch source entry content if text not provided
  let sourceContent: string;
  if (text) {
    sourceContent = text;
  } else {
    // Retrieve from appropriate repository
    let sourceEntry;
    switch (sourceType) {
      case 'tool':
        sourceEntry = await context.repos.tools.getById(sourceId);
        if (!sourceEntry) {
          throw createNotFoundError('tool', sourceId);
        }
        sourceContent = `${sourceEntry.name}\n${sourceEntry.currentVersion?.description || ''}`;
        break;
      case 'guideline':
        sourceEntry = await context.repos.guidelines.getById(sourceId);
        if (!sourceEntry) {
          throw createNotFoundError('guideline', sourceId);
        }
        sourceContent = `${sourceEntry.name}\n${sourceEntry.currentVersion?.content || ''}`;
        break;
      case 'knowledge':
        sourceEntry = await context.repos.knowledge.getById(sourceId);
        if (!sourceEntry) {
          throw createNotFoundError('knowledge', sourceId);
        }
        sourceContent = `${sourceEntry.title}\n${sourceEntry.currentVersion?.content || ''}`;
        break;
      case 'experience':
        sourceEntry = await context.repos.experiences.getById(sourceId);
        if (!sourceEntry) {
          throw createNotFoundError('experience', sourceId);
        }
        sourceContent = `${sourceEntry.title}\n${sourceEntry.currentVersion?.content || ''}`;
        break;
      default:
        throw createValidationError(
          'sourceType',
          'is invalid',
          'Must be tool, guideline, knowledge, or experience'
        );
    }
  }

  // Create latent memory via service (handles embedding, compression, and persistence)
  const latentMemory = await service.createLatentMemory({
    sourceType,
    sourceId,
    text: sourceContent,
    sessionId,
    importanceScore,
  });

  return formatTimestamps({
    success: true,
    latentMemory: {
      id: latentMemory.id,
      sourceType: latentMemory.sourceType as LatentSourceType,
      sourceId: latentMemory.sourceId,
      text: latentMemory.textPreview ?? sourceContent.substring(0, 200),
      importanceScore: latentMemory.importanceScore,
      createdAt: latentMemory.createdAt,
    },
  });
}

/**
 * Retrieve a latent memory entry by source
 *
 * Delegates to LatentMemoryService which checks cache first, then repository.
 */
async function getLatentMemory(
  context: AppContext,
  params: Record<string, unknown>
): Promise<{
  latentMemory?: {
    id: string;
    sourceType: LatentSourceType;
    sourceId: string;
    text: string;
    importanceScore: number;
    createdAt: string;
    lastAccessedAt?: string;
    accessCount?: number;
  };
}> {
  const service = getLatentMemoryService(context);

  const sourceType = getRequiredParam(params, 'sourceType', isSourceType);
  const sourceId = getRequiredParam(params, 'sourceId', isString);

  // Get latent memory from service (checks cache first, then repository)
  const latentMemory = await service.getLatentMemory(sourceType, sourceId);

  if (!latentMemory) {
    return formatTimestamps({ latentMemory: undefined });
  }

  return formatTimestamps({
    latentMemory: {
      id: latentMemory.id,
      sourceType: latentMemory.sourceType as LatentSourceType,
      sourceId: latentMemory.sourceId,
      text: latentMemory.textPreview ?? '',
      importanceScore: latentMemory.importanceScore,
      createdAt: latentMemory.createdAt,
      lastAccessedAt: latentMemory.lastAccessedAt,
      accessCount: latentMemory.accessCount,
    },
  });
}

/**
 * Semantic search for similar latent memories
 *
 * Delegates to LatentMemoryService.findSimilar for consistent behavior.
 */
async function searchLatentMemories(
  context: AppContext,
  params: Record<string, unknown>
): Promise<{
  results: Array<{
    id: string;
    sourceType: LatentSourceType;
    sourceId: string;
    text: string;
    similarity: number;
    importanceScore: number;
  }>;
  meta: {
    query: string;
    count: number;
    limit: number;
  };
}> {
  const service = getLatentMemoryService(context);

  const query = getRequiredParam(params, 'query', isString);
  const limit = getOptionalParam(params, 'limit', isNumber) ?? 10;
  const minScore = getOptionalParam(params, 'minScore', isNumber) ?? 0.0;
  const sessionId = getOptionalParam(params, 'sessionId', isString);

  // Use service's findSimilar for consistent embedding/search behavior
  const similarMemories = await service.findSimilar(query, {
    limit,
    minScore,
    sessionId,
    sourceTypes: ['tool', 'guideline', 'knowledge', 'experience'],
  });

  const results = similarMemories.map((memory) => ({
    id: memory.id,
    sourceType: memory.sourceType as LatentSourceType,
    sourceId: memory.sourceId,
    text: memory.textPreview ?? '',
    similarity: memory.similarityScore,
    importanceScore: memory.importanceScore,
  }));

  return formatTimestamps({
    results,
    meta: {
      query,
      count: results.length,
      limit,
    },
  });
}

/**
 * Build formatted context for LLM injection
 *
 * Retrieves relevant memories for a session/conversation and formats them
 * for injection into LLM context windows.
 */
async function injectContext(
  context: AppContext,
  params: Record<string, unknown>
): Promise<{
  context: string | Record<string, unknown>;
  format: LatentOutputFormat;
  memoriesIncluded: number;
  tokenEstimate: number;
}> {
  const service = getLatentMemoryService(context);

  const sessionId = getOptionalParam(params, 'sessionId', isString);
  const conversationId = getOptionalParam(params, 'conversationId', isString);
  const format = getOptionalParam(params, 'format', isOutputFormat) ?? 'markdown';
  const maxTokens = getOptionalParam(params, 'maxTokens', isNumber) ?? 4000;
  const query = getOptionalParam(params, 'query', isString);

  if (!sessionId && !conversationId && !query) {
    throw createValidationError(
      'sessionId, conversationId, or query',
      'is required',
      'Provide sessionId, conversationId, or query to inject context'
    );
  }

  // Find relevant memories using semantic search
  // If query provided, use it; otherwise search for memories related to the session
  const searchQuery = query ?? `relevant context for session ${sessionId ?? conversationId}`;
  const similarMemories = await service.findSimilar(searchQuery, {
    limit: 50, // Get more than needed, then truncate by tokens
    minScore: 0.3,
    sessionId,
  });

  // Build context from memories, respecting token limit
  const memories: Array<{
    type: string;
    id: string;
    content: string;
    score: number;
  }> = [];

  let currentTokens = 0;
  const tokensPerChar = 0.25; // Rough estimate: 4 chars per token

  for (const memory of similarMemories) {
    const content = memory.textPreview ?? '';
    const memoryTokens = Math.ceil(content.length * tokensPerChar);

    // Check if adding this memory would exceed limit
    if (currentTokens + memoryTokens > maxTokens) {
      break;
    }

    memories.push({
      type: memory.sourceType,
      id: memory.sourceId,
      content,
      score: memory.similarityScore,
    });
    currentTokens += memoryTokens;
  }

  // Format according to requested format
  let formattedContext: string | Record<string, unknown>;

  switch (format) {
    case 'json':
      formattedContext = {
        session: sessionId,
        conversation: conversationId,
        memoriesCount: memories.length,
        memories: memories.map((m) => ({
          type: m.type,
          id: m.id,
          content: m.content,
          relevance: m.score,
        })),
      };
      break;
    case 'markdown':
      if (memories.length === 0) {
        formattedContext = `# Context\n\nNo relevant memories found.`;
      } else {
        const sections = memories.map(
          (m, i) =>
            `## ${i + 1}. ${m.type.charAt(0).toUpperCase() + m.type.slice(1)} (${(m.score * 100).toFixed(0)}% relevant)\n\n${m.content}`
        );
        formattedContext = `# Context (${memories.length} memories)\n\n${sections.join('\n\n---\n\n')}`;
      }
      break;
    case 'natural_language':
      if (memories.length === 0) {
        formattedContext = 'No relevant context memories were found.';
      } else {
        const descriptions = memories.map(
          (m) =>
            `A ${m.type} entry states: "${m.content.substring(0, 150)}${m.content.length > 150 ? '...' : ''}"`
        );
        formattedContext = `Here is relevant context from ${memories.length} memories:\n\n${descriptions.join('\n\n')}`;
      }
      break;
  }

  // Calculate actual token estimate
  const tokenEstimate =
    typeof formattedContext === 'string'
      ? Math.ceil(formattedContext.length * tokensPerChar)
      : Math.ceil(JSON.stringify(formattedContext).length * tokensPerChar);

  return formatTimestamps({
    context: formattedContext,
    format,
    memoriesIncluded: memories.length,
    tokenEstimate,
  });
}

/**
 * Preload memories for a session into KV-cache
 *
 * Uses semantic search to find relevant memories and loads them into cache.
 */
async function warmSession(
  context: AppContext,
  params: Record<string, unknown>
): Promise<{
  success: boolean;
  sessionId: string;
  memoriesLoaded: number;
  byType: Record<string, number>;
}> {
  const service = getLatentMemoryService(context);

  const sessionId = getRequiredParam(params, 'sessionId', isString);
  const limit = getOptionalParam(params, 'limit', isNumber) ?? 100;

  // Get session info to understand context
  const session = await context.repos.sessions.getById(sessionId);
  if (!session) {
    throw createNotFoundError('session', sessionId);
  }

  // Build search query from session purpose/name
  const searchQuery = session.purpose ?? session.name ?? `context for session ${sessionId}`;

  // Find relevant memories for this session
  const memories = await service.findSimilar(searchQuery, {
    limit,
    minScore: 0.3,
    sourceTypes: ['tool', 'guideline', 'knowledge', 'experience'],
  });

  // Count by type
  const byType: Record<string, number> = {};
  for (const memory of memories) {
    byType[memory.sourceType] = (byType[memory.sourceType] ?? 0) + 1;
  }

  return formatTimestamps({
    success: true,
    sessionId,
    memoriesLoaded: memories.length,
    byType,
  });
}

/**
 * Get KV-cache statistics
 *
 * Returns statistics about latent memory storage and cache.
 */
async function getCacheStats(
  context: AppContext,
  _params: Record<string, unknown>
): Promise<{
  stats: {
    totalVectorCount: number;
    compressionEnabled: boolean;
    cacheEnabled: boolean;
    repositoryAvailable: boolean;
    embeddingServiceAvailable: boolean;
    vectorServiceAvailable: boolean;
  };
}> {
  const service = context.services.latentMemory;

  // If service not available, return availability info
  if (!service) {
    return formatTimestamps({
      stats: {
        totalVectorCount: 0,
        compressionEnabled: false,
        cacheEnabled: false,
        repositoryAvailable: false,
        embeddingServiceAvailable: context.services.embedding?.isAvailable() ?? false,
        vectorServiceAvailable: context.services.vector?.isAvailable() ?? false,
      },
    });
  }

  // Get stats from service
  const serviceStats = await service.getStats();

  return formatTimestamps({
    stats: {
      ...serviceStats,
      embeddingServiceAvailable: context.services.embedding?.isAvailable() ?? false,
      vectorServiceAvailable: context.services.vector?.isAvailable() ?? false,
    },
  });
}

/**
 * Prune stale entries from cache
 *
 * Removes latent memories not accessed within the specified number of days.
 */
async function pruneCache(
  context: AppContext,
  params: Record<string, unknown>
): Promise<{
  success: boolean;
  entriesRemoved: number;
  staleDays: number;
}> {
  const service = getLatentMemoryService(context);

  const staleDays = getOptionalParam(params, 'staleDays', isNumber) ?? 30;

  if (staleDays <= 0) {
    throw createValidationError('staleDays', 'must be greater than 0', `Got: ${staleDays}`);
  }

  // Prune stale entries via service
  const entriesRemoved = await service.pruneStale(staleDays);

  return formatTimestamps({
    success: true,
    entriesRemoved,
    staleDays,
  });
}

/**
 * Exported handler object
 */
export const latentMemoryHandlers = {
  create: createLatentMemory,
  get: getLatentMemory,
  search: searchLatentMemories,
  inject: injectContext,
  warm_session: warmSession,
  stats: getCacheStats,
  prune: pruneCache,
};
