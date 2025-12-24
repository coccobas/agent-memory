/**
 * Latent Memory Services
 *
 * Services for working with latent memories - implicit memories formed from
 * interactions, experiences, and usage patterns.
 *
 * @module services/latent-memory
 */

export {
  ContextInjectorService,
  createContextInjector,
  type ContextFormat,
  type ContextInjectionOptions,
  type LatentMemoryWithScore,
  type InjectedContext,
} from './context-injector.js';

export {
  LatentMemoryService,
  type IKVCacheService,
  type ILatentMemoryRepository,
  type NewLatentMemoryData,
  type CreateLatentMemoryInput,
  type FindSimilarOptions,
  type SimilarLatentMemory,
  type LatentMemoryServiceConfig,
} from './latent-memory.service.js';

// Re-export compression types for convenience
export type { CompressionStrategy, CompressionMethod } from './compression/types.js';

export {
  KVCacheService,
  createKVCacheService,
  type LatentMemory,
  type LatentMemorySourceType,
  type CompressionMethod,
  type KVCacheConfig,
  type CacheStats,
} from './kv-cache.service.js';
