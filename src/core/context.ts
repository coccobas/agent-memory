import type { Logger } from 'pino';
import type Database from 'better-sqlite3';
import type { Config } from '../config/index.js';
import type { SecurityService } from '../services/security.service.js';
import type { PermissionService } from '../services/permission.service.js';
import type { VerificationService } from '../services/verification.service.js';
import type { PipelineDependencies } from '../services/query/pipeline.js';
import type { Runtime } from './runtime.js';
import type { Repositories } from './interfaces/repositories.js';
import type { AppDb } from './types.js';
import type {
  AdaptersWithRedis,
  IEventAdapter,
  ICacheAdapter,
  IFileSystemAdapter,
} from './adapters/index.js';
import type { EntryChangedEvent } from '../utils/events.js';
import type { FeedbackService } from '../services/feedback/index.js';
import type { FeedbackQueueProcessor } from '../services/feedback/queue.js';
import type { RLService } from '../services/rl/index.js';
import type { LibrarianService } from '../services/librarian/index.js';
import type { CaptureService } from '../services/capture/index.js';
import type { CaptureStateManager } from '../services/capture/state.js';
import type { EntityExtractor } from '../services/query/entity-extractor.js';
import type { FeedbackScoreCache } from '../services/query/feedback-cache.js';
import type { ExperiencePromotionService } from '../services/experience/index.js';
import type { ObserveCommitService } from '../services/observe/index.js';
import type { LoraService } from '../services/lora.service.js';
import type { IQueryRewriteService } from '../services/query-rewrite/types.js';
import type { TriggerOrchestrator } from '../services/extraction/trigger-orchestrator.js';
import type { IncrementalExtractor } from '../services/extraction/incremental.js';
import type { IContextDetectionService } from '../services/context-detection.service.js';
import type { ISessionTimeoutService } from '../services/session-timeout.service.js';
import type { IAutoTaggingService } from '../services/auto-tagging.service.js';
import type { IClassificationService } from '../services/classification/index.js';
import type { IExtractionHookService } from '../services/extraction-hook.service.js';
import type { RedFlagService } from '../services/redflag.service.js';
import type { ReembeddingService } from '../services/reembedding.service.js';
import type { GraphSyncService } from '../services/graph/sync.service.js';
import type { GraphBackfillService } from '../services/graph/backfill.service.js';
import type { LatentMemoryService } from '../services/latent-memory/latent-memory.service.js';
import type { EpisodeService } from '../services/episode/index.js';
import type { IEpisodeAutoLoggerService } from '../services/episode-auto-logger.js';

/**
 * Service interfaces for AppContext
 * Using interfaces to allow flexible implementations and testing
 */
export type EmbeddingProvider = 'openai' | 'lmstudio' | 'local' | 'disabled';

export interface IEmbeddingService {
  isAvailable(): boolean;
  getProvider(): EmbeddingProvider;
  getEmbeddingDimension(): number;
  embed(text: string): Promise<{ embedding: number[]; model: string; provider: EmbeddingProvider }>;
  embedBatch(
    texts: string[]
  ): Promise<{ embeddings: number[][]; model: string; provider: EmbeddingProvider }>;
  clearCache(): void;
  cleanup(): void;
}

export interface IVectorService {
  isAvailable(): boolean;
  initialize(): Promise<void>;
  waitForReady(): Promise<void>;
  storeEmbedding(
    entryType: string,
    entryId: string,
    versionId: string,
    text: string,
    embedding: number[],
    model: string
  ): Promise<void>;
  searchSimilar(
    embedding: number[],
    entryTypes: string[],
    limit?: number
  ): Promise<
    Array<{
      entryType: string;
      entryId: string;
      versionId: string;
      text: string;
      score: number;
    }>
  >;
  removeEmbedding(entryType: string, entryId: string, versionId?: string): Promise<void>;
  getCount(): Promise<number>;
  close(): void;
  /**
   * Get embeddings by entry IDs.
   * Used for batch loading embeddings (e.g., for semantic edge inference).
   */
  getByEntryIds?(
    entryIds: Array<{ entryType: string; entryId: string }>
  ): Promise<Map<string, number[]>>;
}

export type ExtractionProvider = 'openai' | 'anthropic' | 'ollama' | 'disabled';
export type EntityType = 'person' | 'technology' | 'component' | 'concept' | 'organization';
export type ExtractedRelationType = 'depends_on' | 'related_to' | 'applies_to' | 'conflicts_with';

export interface IExtractionService {
  isAvailable(): boolean;
  getProvider(): ExtractionProvider;
  extract(input: {
    context: string;
    contextType?: 'conversation' | 'code' | 'mixed';
    focusAreas?: ('decisions' | 'facts' | 'rules' | 'tools')[];
  }): Promise<{
    entries: Array<{
      type: 'guideline' | 'knowledge' | 'tool';
      name?: string;
      title?: string;
      content: string;
      confidence: number;
    }>;
    entities: Array<{
      name: string;
      entityType: EntityType;
      description?: string;
      confidence: number;
    }>;
    relationships: Array<{
      sourceRef: string;
      sourceType: 'guideline' | 'knowledge' | 'tool' | 'entity';
      targetRef: string;
      targetType: 'guideline' | 'knowledge' | 'tool' | 'entity';
      relationType: ExtractedRelationType;
      confidence: number;
    }>;
    model: string;
    provider: ExtractionProvider;
    tokensUsed?: number;
    processingTimeMs: number;
  }>;
}

/**
 * Hierarchical summarization service interface
 */
export interface IHierarchicalSummarizationService {
  buildSummaries(options: {
    scopeType: 'global' | 'org' | 'project' | 'session';
    scopeId?: string;
    entryTypes?: Array<'tool' | 'guideline' | 'knowledge' | 'experience'>;
    forceRebuild?: boolean;
  }): Promise<{
    summariesCreated: number;
    levelsBuilt: number;
    processingTimeMs: number;
  }>;
}

/**
 * Hierarchical retriever interface for query pipeline integration
 *
 * Implements coarse-to-fine retrieval through summary hierarchies.
 */
export interface IHierarchicalRetriever {
  /** Check if summaries exist for a scope */
  hasSummaries(
    scopeType: 'global' | 'org' | 'project' | 'session',
    scopeId?: string | null
  ): Promise<boolean>;

  /** Perform coarse-to-fine retrieval through summary hierarchy */
  retrieve(options: {
    query: string;
    scopeType?: 'global' | 'org' | 'project' | 'session';
    scopeId?: string;
    maxResults?: number;
    expansionFactor?: number;
    minSimilarity?: number;
  }): Promise<{
    entries: Array<{ id: string; type: string; score: number }>;
    steps: Array<{
      level: number;
      summariesSearched: number;
      summariesMatched: number;
      timeMs: number;
    }>;
    totalTimeMs: number;
  }>;
}

// ============================================================================
// SERVICE GROUP INTERFACES
// ============================================================================

/**
 * Core services - always available, required for basic operation.
 * These services are created during application bootstrap and are never optional.
 */
export interface CoreServices {
  /** Permission service for authorization checks - required for all code paths */
  permission: PermissionService;
  /** Feedback service for RL training data collection */
  feedback: FeedbackService;
  /** Feedback queue processor for batched retrieval recording */
  feedbackQueue: FeedbackQueueProcessor;
  /** Reinforcement learning service for policy decisions */
  rl: RLService;
}

/**
 * AI/ML services - configuration-dependent.
 * Availability depends on provider configuration (OpenAI, Anthropic, Ollama, etc.)
 * and feature flags. May be disabled in minimal deployments.
 */
export interface AIServices {
  /** Embedding service for text vectorization */
  embedding?: IEmbeddingService;
  /** Vector storage and similarity search */
  vector?: IVectorService;
  /** LLM-based extraction of entries from conversations */
  extraction?: IExtractionService;
  /** Hybrid entry type classification (rule-based + semantic + LLM) */
  classification?: IClassificationService;
  /** Hierarchical summary generation for entry clusters */
  summarization?: IHierarchicalSummarizationService;
  /** Latent memory service for cache warming and fast retrieval */
  latentMemory?: LatentMemoryService;
}

/**
 * Session and capture services - manage session lifecycle and entry capture.
 * These services handle the capture flow from observation to storage.
 */
export interface SessionServices {
  /** Capture state manager for session state tracking */
  captureState: CaptureStateManager;
  /** Capture service for session-scoped entry capture */
  capture?: CaptureService;
  /** Librarian service for pattern detection and promotion */
  librarian?: LibrarianService;
  /** Experience promotion service for case->strategy->skill promotions */
  experiencePromotion?: ExperiencePromotionService;
  /** Observe commit service for storing extracted entries */
  observeCommit?: ObserveCommitService;
  /** Episode service for temporal activity grouping and timeline queries */
  episode?: EpisodeService;
  /** Episode auto-logger for automatic tool execution logging */
  episodeAutoLogger?: IEpisodeAutoLoggerService;
}

/**
 * Query enhancement services - improve query accuracy and scoring.
 * These services enhance retrieval quality through entity extraction,
 * scoring, and query rewriting.
 */
export interface QueryServices {
  /** Entity extractor for text entity extraction */
  entityExtractor: EntityExtractor;
  /** Feedback score cache for retrieval scoring */
  feedbackScoreCache: FeedbackScoreCache;
  /** Query rewrite service for HyDE and query expansion */
  queryRewrite?: IQueryRewriteService;
}

/**
 * Extraction pipeline services - handle automatic extraction triggers.
 * These services orchestrate when and how extraction occurs.
 */
export interface ExtractionPipelineServices {
  /** Trigger orchestrator for auto-detection extraction triggers */
  triggerOrchestrator?: TriggerOrchestrator;
  /** Incremental extractor for sliding window extraction */
  incrementalExtractor?: IncrementalExtractor;
}

/**
 * Graph services - knowledge graph synchronization and management.
 * These services handle graph node/edge creation and maintenance.
 */
export interface GraphServices {
  /** Graph sync service for automatic entry-to-node and relation-to-edge synchronization */
  graphSync?: GraphSyncService;
  /** Graph backfill service for background population of the knowledge graph */
  graphBackfill?: GraphBackfillService;
}

/**
 * Utility services - miscellaneous services for specific features.
 * These services provide auxiliary functionality that may or may not be needed.
 */
export interface UtilityServices {
  /** Verification service for entry validation */
  verification?: VerificationService;
  /** LoRA service for exporting guidelines as training data */
  lora?: LoraService;
  /** Context detection service for auto-detecting project/session from cwd */
  contextDetection?: IContextDetectionService;
  /** Session timeout service for auto-ending inactive sessions */
  sessionTimeout?: ISessionTimeoutService;
  /** Auto-tagging service for automatic tag inference */
  autoTagging?: IAutoTaggingService;
  /** Extraction hook service for proactive pattern detection */
  extractionHook?: IExtractionHookService;
  /** Red flag detection service for quality checks */
  redFlag?: RedFlagService;
  /** Re-embedding service for fixing dimension mismatches */
  reembedding?: ReembeddingService;
  /** Factory function to create re-embedding service (internal use) */
  _createReembeddingService?: (db: AppDb) => ReembeddingService | undefined;
}

// ============================================================================
// COMBINED SERVICES CONTAINER
// ============================================================================

/**
 * Services container - combines all service groups.
 *
 * This interface extends all service group interfaces, providing a unified
 * view of all available services. The grouping is for documentation and
 * organizational purposes - existing code accessing `context.services.xxx`
 * continues to work unchanged.
 *
 * Service optionality:
 * - Required services (from CoreServices, parts of SessionServices/QueryServices)
 *   are always created by the factory
 * - Optional services may be disabled via configuration or lazy-initialized
 *
 * @see CoreServices - Always available, required for basic operation
 * @see AIServices - Configuration-dependent AI/ML services
 * @see SessionServices - Session lifecycle and capture management
 * @see QueryServices - Query enhancement and scoring
 * @see ExtractionPipelineServices - Automatic extraction triggers
 * @see GraphServices - Knowledge graph synchronization and management
 * @see UtilityServices - Miscellaneous auxiliary services
 */
export interface AppContextServices
  extends
    CoreServices,
    AIServices,
    SessionServices,
    QueryServices,
    ExtractionPipelineServices,
    GraphServices,
    UtilityServices {}

/**
 * Unified adapter interface for handler injection.
 * Provides access to event, cache, and filesystem adapters with a consistent interface.
 */
export interface UnifiedAdapters {
  /** Event adapter - automatically uses Redis or local based on availability */
  event: IEventAdapter<EntryChangedEvent>;
  /** Cache adapter - optional, uses Redis when available */
  cache?: ICacheAdapter;
  /** FileSystem adapter - abstracts file I/O for testability */
  fs: IFileSystemAdapter;
}

/**
 * Application Context
 *
 * Holds the lifecycle-bound dependencies for the application.
 * Passed down to services and controllers to avoid global state.
 */
export interface AppContext {
  config: Config;
  /** Type-safe Drizzle database with full schema type information */
  db: AppDb;
  /** SQLite handle - only present in SQLite mode, undefined in PostgreSQL mode */
  sqlite?: Database.Database;
  logger: Logger;
  queryDeps: PipelineDependencies;
  security: SecurityService;
  runtime: Runtime;
  services: AppContextServices;
  repos: Repositories;
  /**
   * Adapter layer with Redis auto-detection and lifecycle management.
   * Includes storage, cache, lock, and event adapters.
   * When Redis is configured, includes Redis-specific adapters and lifecycle methods.
   */
  adapters: AdaptersWithRedis;
  /**
   * Unified adapters for handler injection.
   * Provides a simplified interface for accessing event, cache, and filesystem adapters.
   * Automatically resolves to Redis or local based on availability.
   */
  unifiedAdapters: UnifiedAdapters;
}
