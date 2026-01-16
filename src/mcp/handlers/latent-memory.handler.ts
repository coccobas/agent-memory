/**
 * Latent memory handlers for KV-cache management
 *
 * Manages latent memory representations and efficient context injection
 * through KV-cache optimization. Provides semantic search, preloading,
 * and formatted context building for LLM consumption.
 *
 * Context-aware handlers that receive AppContext for dependency injection.
 */

import type { AppContext } from '../../core/context.js';
import { createValidationError, createNotFoundError } from '../../core/errors.js';
import { getRequiredParam, getOptionalParam, isString, isNumber } from '../../utils/type-guards.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';

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
 */
async function createLatentMemory(
  context: AppContext,
  params: Record<string, unknown>
): Promise<{
  success: boolean;
  latentMemory: {
    sourceType: LatentSourceType;
    sourceId: string;
    text: string;
    embedding?: number[];
    createdAt: string;
  };
}> {
  const sourceType = getRequiredParam(params, 'sourceType', isSourceType);
  const sourceId = getRequiredParam(params, 'sourceId', isString);
  const text = getOptionalParam(params, 'text', isString);

  // Fetch source entry to generate latent representation
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

  // Generate embedding if available
  let embedding: number[] | undefined;
  if (context.services?.embedding?.isAvailable()) {
    const embeddingResult = await context.services.embedding.embed(sourceContent);
    embedding = embeddingResult.embedding;
  }

  // Create latent memory entry
  // Note: This is a placeholder - actual implementation would store in a KV-cache table
  const latentMemory = {
    sourceType,
    sourceId,
    text: sourceContent,
    embedding,
    createdAt: new Date().toISOString(),
  };

  return formatTimestamps({
    success: true,
    latentMemory,
  });
}

/**
 * Retrieve a latent memory entry by source
 */
async function getLatentMemory(
  context: AppContext,
  params: Record<string, unknown>
): Promise<{
  latentMemory?: {
    sourceType: LatentSourceType;
    sourceId: string;
    text: string;
    embedding?: number[];
    createdAt: string;
    lastAccessed?: string;
    hitCount?: number;
  };
}> {
  const sourceType = getRequiredParam(params, 'sourceType', isSourceType);
  const sourceId = getRequiredParam(params, 'sourceId', isString);

  // Note: This is a placeholder - actual implementation would query KV-cache table
  // For now, we'll recreate the latent memory on demand
  const result = await createLatentMemory(context, { sourceType, sourceId });

  return formatTimestamps({
    latentMemory: {
      ...result.latentMemory,
      lastAccessed: new Date().toISOString(),
      hitCount: 0,
    },
  });
}

/**
 * Semantic search for similar latent memories
 */
async function searchLatentMemories(
  context: AppContext,
  params: Record<string, unknown>
): Promise<{
  results: Array<{
    sourceType: LatentSourceType;
    sourceId: string;
    text: string;
    similarity: number;
  }>;
  meta: {
    query: string;
    count: number;
  };
}> {
  const query = getRequiredParam(params, 'query', isString);
  const limit = getOptionalParam(params, 'limit', isNumber) ?? 10;

  // Generate query embedding
  if (!context.services?.embedding?.isAvailable()) {
    throw createValidationError(
      'embedding',
      'service is not available',
      'Enable embedding service for semantic search'
    );
  }

  const embeddingResult = await context.services.embedding.embed(query);
  const queryEmbedding = embeddingResult.embedding;

  // Use vector service to search across all entry types
  const vectorStore = context.services?.vector;
  if (!vectorStore) {
    throw createValidationError(
      'vector',
      'service is not available',
      'Enable vector service for semantic search'
    );
  }

  const vectorResults = await vectorStore.searchSimilar(
    queryEmbedding,
    ['tool', 'guideline', 'knowledge', 'experience'],
    limit
  );

  const results = vectorResults.map((result) => ({
    sourceType: result.entryType as LatentSourceType,
    sourceId: result.entryId,
    text: result.text,
    similarity: result.score,
  }));

  return formatTimestamps({
    results,
    meta: {
      query,
      count: results.length,
    },
  });
}

/**
 * Build formatted context for LLM injection
 */
async function injectContext(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<{
  context: string | Record<string, unknown>;
  format: LatentOutputFormat;
  tokenEstimate?: number;
}> {
  const sessionId = getOptionalParam(params, 'sessionId', isString);
  const conversationId = getOptionalParam(params, 'conversationId', isString);
  const format = getOptionalParam(params, 'format', isOutputFormat) ?? 'markdown';

  if (!sessionId && !conversationId) {
    throw createValidationError(
      'sessionId or conversationId',
      'is required',
      'Provide either sessionId or conversationId to inject context'
    );
  }

  // Retrieve relevant memories for the session/conversation
  // Note: This is a placeholder - actual implementation would:
  // 1. Query session/conversation context
  // 2. Load related latent memories from KV-cache
  // 3. Format according to requested format
  // 4. Truncate to maxTokens if specified

  let formattedContext: string | Record<string, unknown>;

  switch (format) {
    case 'json':
      formattedContext = {
        session: sessionId,
        conversation: conversationId,
        memories: [],
      };
      break;
    case 'markdown':
      formattedContext = `# Context for ${sessionId || conversationId}\n\nNo memories loaded yet.`;
      break;
    case 'natural_language':
      formattedContext = `This is context for session ${sessionId || conversationId}.`;
      break;
  }

  // Rough token estimate (4 chars per token)
  const tokenEstimate =
    typeof formattedContext === 'string'
      ? Math.ceil(formattedContext.length / 4)
      : Math.ceil(JSON.stringify(formattedContext).length / 4);

  return formatTimestamps({
    context: formattedContext,
    format,
    tokenEstimate,
  });
}

/**
 * Preload memories for a session into KV-cache
 */
async function warmSession(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<{
  success: boolean;
  sessionId: string;
  memoriesLoaded: number;
  cacheSize?: number;
}> {
  const sessionId = getRequiredParam(params, 'sessionId', isString);

  // Note: This is a placeholder - actual implementation would:
  // 1. Query all relevant memories for the session
  // 2. Load them into KV-cache for fast access
  // 3. Return statistics about what was loaded

  return formatTimestamps({
    success: true,
    sessionId,
    memoriesLoaded: 0,
    cacheSize: 0,
  });
}

/**
 * Get KV-cache statistics
 */
async function getCacheStats(
  _context: AppContext,
  _params: Record<string, unknown>
): Promise<{
  stats: {
    totalEntries: number;
    totalSize: number;
    hitRate: number;
    averageAccessTime: number;
    oldestEntry?: string;
    newestEntry?: string;
  };
}> {
  // Note: This is a placeholder - actual implementation would query cache metrics

  return formatTimestamps({
    stats: {
      totalEntries: 0,
      totalSize: 0,
      hitRate: 0,
      averageAccessTime: 0,
    },
  });
}

/**
 * Prune stale entries from cache
 */
async function pruneCache(
  _context: AppContext,
  _params: Record<string, unknown>
): Promise<{
  success: boolean;
  entriesRemoved: number;
  bytesFreed: number;
}> {
  // Note: This is a placeholder - actual implementation would:
  // 1. Query entries not accessed in staleDays
  // 2. Remove them from KV-cache
  // 3. Return statistics

  return formatTimestamps({
    success: true,
    entriesRemoved: 0,
    bytesFreed: 0,
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
