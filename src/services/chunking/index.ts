/**
 * Chunking System
 *
 * Text chunking with relation and dependency tracking.
 * Supports both rule-based and LLM-powered chunking.
 *
 * @example
 * ```typescript
 * // Rule-based chunking (fast, no LLM required)
 * import { createChunkingService } from 'agent-memory/services/chunking';
 *
 * const chunker = createChunkingService({
 *   targetSize: 1000,
 *   strategy: 'semantic',
 * });
 * const result = chunker.chunk(documentText, 'doc-123');
 *
 * // LLM-powered chunking (smarter, requires LM Studio)
 * import { createLLMChunkingService } from 'agent-memory/services/chunking';
 *
 * const llmChunker = createLLMChunkingService({
 *   targetTokens: 500,
 *   extractRelations: true,
 * });
 * const result = await llmChunker.chunk(documentText, 'doc-123');
 * ```
 */

// Rule-based chunking
export { ChunkingService, createChunkingService } from './chunking.service.js';

// LLM-powered chunking
export {
  LLMChunkingService,
  createLLMChunkingService,
  DEFAULT_LLM_CHUNKING_CONFIG,
} from './llm-chunker.js';
export type { LLMChunkingConfig } from './llm-chunker.js';

// Types
export type {
  Chunk,
  ChunkingConfig,
  ChunkingResult,
  ChunkingStats,
  ChunkingStrategy,
  ChunkMetadata,
  ChunkRelation,
  ChunkRelationType,
  ContentType,
} from './types.js';

export { DEFAULT_CHUNKING_CONFIG, CHARS_PER_TOKEN } from './types.js';
