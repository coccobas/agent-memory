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

/**
 * Service interfaces for AppContext
 * Using interfaces to allow flexible implementations and testing
 */
export type EmbeddingProvider = 'openai' | 'local' | 'disabled';

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
 * Services container
 *
 * Service optionality:
 * - Required services are always created by the factory
 * - Optional services may be disabled via configuration or lazy-initialized
 *
 * Permission is required for all authorization checks
 */
export interface AppContextServices {
  // === Always Created (Required) ===
  permission: PermissionService; // Required - all code paths must have permission service
  /** Feedback service for RL training data collection */
  feedback: FeedbackService;
  /** Feedback queue processor for batched retrieval recording */
  feedbackQueue: FeedbackQueueProcessor;
  /** Reinforcement learning service for policy decisions */
  rl: RLService;
  /** Capture state manager for session state */
  captureState: CaptureStateManager;
  /** Entity extractor for text entity extraction */
  entityExtractor: EntityExtractor;
  /** Feedback score cache for retrieval scoring */
  feedbackScoreCache: FeedbackScoreCache;

  // === Configuration-Dependent (Optional) ===
  embedding?: IEmbeddingService;
  vector?: IVectorService;
  extraction?: IExtractionService;
  verification?: VerificationService;
  summarization?: IHierarchicalSummarizationService;

  // === Lazy-Initialized (Optional) ===
  /** Librarian service for pattern detection and promotion */
  librarian?: LibrarianService;
  /** Capture service for session-scoped entry capture */
  capture?: CaptureService;
  /** Experience promotion service for case→strategy→skill promotions */
  experiencePromotion?: ExperiencePromotionService;
  /** Observe commit service for storing extracted entries */
  observeCommit?: ObserveCommitService;
  /** LoRA service for exporting guidelines as training data */
  lora?: LoraService;
  /** Query rewrite service for HyDE and query expansion */
  queryRewrite?: IQueryRewriteService;
  /** Trigger orchestrator for auto-detection extraction triggers */
  triggerOrchestrator?: TriggerOrchestrator;
  /** Incremental extractor for sliding window extraction */
  incrementalExtractor?: IncrementalExtractor;
}

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
