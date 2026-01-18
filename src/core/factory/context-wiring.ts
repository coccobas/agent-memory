/**
 * Context Wiring Helper
 *
 * Extracts shared AppContext wiring logic that is common between
 * SQLite and PostgreSQL backends. Used by createAppContext().
 */

import type { Logger } from 'pino';
import type { Pool } from 'pg';
import type Database from 'better-sqlite3';
import type { AppContext, UnifiedAdapters } from '../context.js';
import type { Config } from '../../config/index.js';
import type { Runtime } from '../runtime.js';
import { setRateLimiters } from '../runtime.js';
import type { AppDb } from '../types.js';
import type { AdaptersWithRedis } from '../adapters/index.js';
import { createLocalFileSystemAdapter } from '../adapters/index.js';
import type { Repositories } from '../interfaces/repositories.js';
import { createComponentLogger } from '../../utils/logger.js';
import { SecurityService } from '../../services/security.service.js';
import { createExperiencePromotionService } from '../../services/experience/index.js';
import { createObserveCommitService } from '../../services/observe/index.js';
import { CaptureService } from '../../services/capture/index.js';
import type { ExtractionService } from '../../services/extraction.service.js';
import { LRUCache } from '../../utils/lru-cache.js';
import { createMemoryCacheAdapter } from '../adapters/memory-cache.adapter.js';
import type { ParentScopeValue } from '../../services/permission.service.js';
import type { ICacheAdapter } from '../adapters/interfaces.js';

import { createServices, type ServiceDependencies } from './services.js';
import { createQueryPipeline, wireQueryCache } from './query-pipeline.js';
import { EntityIndex } from '../../services/query/entity-index.js';
import { createContextDetectionService } from '../../services/context-detection.service.js';
import { createSessionTimeoutService } from '../../services/session-timeout.service.js';
import { createAutoTaggingService } from '../../services/auto-tagging.service.js';
import { createExtractionHookService } from '../../services/extraction-hook.service.js';
import { createEpisodeService } from '../../services/episode/index.js';
import {
  createHierarchicalRetriever,
  createPipelineRetriever,
} from '../../services/summarization/index.js';
import type { EmbeddingService } from '../../services/embedding.service.js';

/**
 * Input for wireContext - all backend-specific resources resolved
 */
export interface WireContextInput {
  config: Config;
  runtime: Runtime;
  db: AppDb;
  sqlite: Database.Database | undefined;
  repos: Repositories;
  adapters: AdaptersWithRedis;
  logger: Logger;
  /** Database type for service auto-detection */
  dbType: 'sqlite' | 'postgresql';
  /** PostgreSQL pool (for pgvector when dbType is 'postgresql') */
  pgPool?: Pool;
  /** Skip ExtractionService initialization (for hooks that don't need it) */
  skipExtractionService?: boolean;
}

/**
 * Wire all shared AppContext components from resolved database connection.
 *
 * This helper extracts the common wiring logic that is identical between
 * SQLite and PostgreSQL backends. The caller is responsible for:
 * - Connection resolution (backend-specific)
 * - Repository creation (needs dbDeps)
 * - Adapter instantiation (needs repos.fileLocks)
 *
 * wireContext handles:
 * - Service creation
 * - Query pipeline setup
 * - Cache wiring
 * - Security service
 * - Final AppContext assembly
 *
 * @param input - All resolved backend-specific resources
 * @returns Fully wired AppContext
 */
export async function wireContext(input: WireContextInput): Promise<AppContext> {
  const { config, runtime, db, sqlite, repos, adapters, logger, dbType, pgPool, skipExtractionService } =
    input;

  // Create permission cache adapter
  // Use Redis if enabled, otherwise use in-memory LRU cache
  let permissionCacheAdapter: ICacheAdapter<ParentScopeValue>;

  if (config.redis.enabled && 'redis' in adapters && adapters.redis) {
    // Redis mode: use Redis-backed cache adapter
    // Note: RedisCacheAdapter would need to be instantiated here if available
    // For now, we use memory cache as Redis cache adapter for permission scope is not yet implemented
    logger.info(
      'Permission scope cache: using in-memory cache (Redis permission cache not yet implemented)'
    );
    const lru = new LRUCache<ParentScopeValue>({ maxSize: 500, ttlMs: 5 * 60 * 1000 });
    permissionCacheAdapter = createMemoryCacheAdapter(lru);
    if (runtime.memoryCoordinator) {
      runtime.memoryCoordinator.register('parent-scope', lru, 7);
    }
  } else {
    // Local mode: use in-memory LRU cache
    const lru = new LRUCache<ParentScopeValue>({ maxSize: 500, ttlMs: 5 * 60 * 1000 });
    permissionCacheAdapter = createMemoryCacheAdapter(lru);
    if (runtime.memoryCoordinator) {
      runtime.memoryCoordinator.register('parent-scope', lru, 7);
    }
  }

  // Build service dependencies for auto-detection
  const serviceDeps: ServiceDependencies = { dbType, pgPool, permissionCacheAdapter };

  // Create services with explicit configuration
  const services = await createServices(config, runtime, db, serviceDeps, undefined, {
    skipExtractionService,
  });

  // Create ExperiencePromotionService (needs repos and adapters)
  const experiencePromotionService = createExperiencePromotionService({
    experienceRepo: repos.experiences,
    eventAdapter: adapters.event,
  });
  services.experiencePromotion = experiencePromotionService;

  // Create ObserveCommitService (needs repos and db)
  const observeCommitService = createObserveCommitService({
    repos,
    db,
  });
  services.observeCommit = observeCommitService;

  // Wire commit service to trigger orchestrator's observer for auto-extraction storage
  if (services.triggerOrchestrator && 'setObserverCommitService' in services.triggerOrchestrator) {
    services.triggerOrchestrator.setObserverCommitService(observeCommitService);
    logger.debug('Wired commit service to trigger orchestrator observer');
  }

  // Create CaptureService (needs repos, services, and optional extraction)
  // Cast extraction service to concrete type (KnowledgeModuleDeps expects ExtractionService, not interface)
  const captureService = new CaptureService({
    experienceRepo: repos.experiences,
    knowledgeModuleDeps: {
      knowledgeRepo: repos.knowledge,
      guidelineRepo: repos.guidelines,
      toolRepo: repos.tools,
      extractionService: services.extraction as ExtractionService | undefined,
    },
    stateManager: services.captureState,
    rlService: services.rl,
    feedbackService: services.feedback,
  });
  services.capture = captureService;

  // Pass CaptureService to Librarian for unified session-end processing
  if (services.librarian) {
    services.librarian.setCaptureService(captureService);
  }

  // Pass LatentMemoryService to Librarian for session-start cache warming
  if (services.librarian && services.latentMemory) {
    services.librarian.setLatentMemoryService(services.latentMemory);
  }

  // Create ContextDetectionService (needs repos for project/session lookup)
  const contextDetectionService = createContextDetectionService(
    config,
    repos.projects,
    repos.sessions
  );
  services.contextDetection = contextDetectionService;

  // Create SessionTimeoutService (auto-ends inactive sessions)
  const sessionTimeoutService = createSessionTimeoutService(config, repos.sessions);
  services.sessionTimeout = sessionTimeoutService;
  // Wire capture service to session timeout for experience capture before auto-end
  if (captureService) {
    sessionTimeoutService.setCaptureService(captureService);
  }
  // Start the timeout checker (runs in background, unref'd to not block process exit)
  sessionTimeoutService.start();

  // Create AutoTaggingService (auto-infers and attaches tags)
  const autoTaggingService = createAutoTaggingService(config, repos.tags, repos.entryTags);
  services.autoTagging = autoTaggingService;

  // Create RedFlagService (quality issue detection)
  const { createRedFlagService } = await import('../../services/redflag.service.js');
  const redFlagService = createRedFlagService({
    guidelineRepo: repos.guidelines,
    knowledgeRepo: repos.knowledge,
    toolRepo: repos.tools,
  });
  services.redFlag = redFlagService;

  // Create ExtractionHookService (proactive pattern detection)
  const extractionHookService = createExtractionHookService(config);
  services.extractionHook = extractionHookService;

  // Create EpisodeService (temporal activity grouping and timeline queries)
  if (repos.episodes) {
    const episodeService = createEpisodeService({
      episodeRepo: repos.episodes,
      nodeRepo: repos.graphNodes,
      edgeRepo: repos.graphEdges,
    });
    services.episode = episodeService;
    logger.debug('Episode service initialized');
  }

  // Create GraphSyncService (entry-to-node and relation-to-edge synchronization)
  // Only create if graph repositories are available
  if (repos.graphNodes && repos.graphEdges && repos.typeRegistry) {
    const { createGraphSyncService } = await import('../../services/graph/sync.service.js');
    const graphSyncService = createGraphSyncService(
      repos.graphNodes,
      repos.graphEdges,
      repos.typeRegistry
    );
    services.graphSync = graphSyncService;

    // Register graph sync hooks so repository operations trigger graph sync
    const { registerGraphSyncService } = await import('../../db/repositories/graph-sync-hooks.js');
    registerGraphSyncService(graphSyncService, {
      autoSync: config.graph.autoSync,
      captureEnabled: config.graph.captureEnabled,
    });

    logger.debug('Graph sync service initialized and registered with hooks');

    // Create GraphBackfillService (background graph population)
    // Note: Scheduling is now handled by the librarian service's unified maintenance
    const { createGraphBackfillService } = await import('../../services/graph/index.js');
    const graphBackfillService = createGraphBackfillService(
      { db, repos, graphSync: graphSyncService },
      {
        enabled: config.graph.autoSync,
        triggerOnSessionEnd: false, // Now handled via librarian maintenance
      }
    );
    services.graphBackfill = graphBackfillService;

    logger.debug('Graph backfill service initialized (scheduling via librarian)');
  }

  // Initialize librarian maintenance orchestrator now that repos and services are available
  if (services.librarian) {
    services.librarian.initMaintenanceOrchestrator({
      db,
      repos,
      graphBackfill: services.graphBackfill,
      embedding: services.embedding,
      vector: services.vector,
      latentMemory: services.latentMemory,
    });
    logger.debug('Librarian maintenance orchestrator initialized');
  }

  // Create ReembeddingService now that db is available
  // This enables automatic re-embedding when dimension mismatch is detected
  if (services._createReembeddingService) {
    services.reembedding = services._createReembeddingService(db);
    if (services.reembedding) {
      logger.debug('Re-embedding service created for dimension mismatch auto-fix');
    }
  }

  // Create entity index for entity-aware retrieval
  const entityIndex = new EntityIndex(db);

  // Create hierarchical retriever for coarse-to-fine search through summaries
  // Only create if embedding and vector services are available
  let hierarchicalRetriever;
  if (services.embedding && services.vector && config.hierarchical.enabled) {
    try {
      const retriever = createHierarchicalRetriever(
        db,
        services.embedding as EmbeddingService,
        services.vector,
        {
          maxResults: config.hierarchical.maxCandidates,
          expansionFactor: config.hierarchical.expansionFactor,
          minSimilarity: config.hierarchical.minSimilarity,
        }
      );
      hierarchicalRetriever = createPipelineRetriever(retriever);
      logger.debug('Hierarchical retriever initialized for summary-aware retrieval');
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to create hierarchical retriever, summary-aware retrieval disabled'
      );
    }
  }

  // Create query pipeline with feedback queue, query rewrite service, entity index, embedding service, vector service, and hierarchical retriever
  const queryDeps = createQueryPipeline(config, runtime, {
    feedbackQueue: services.feedbackQueue,
    queryRewriteService: services.queryRewrite,
    entityIndex,
    embeddingService: services.embedding,
    vectorService: services.vector,
    hierarchicalRetriever,
  });

  // Wire query cache invalidation using the event adapter
  wireQueryCache(adapters.event, runtime, createComponentLogger('query-cache'));

  // If Redis adapters were created and connected, swap rate limiters
  if (config.redis.enabled && 'redis' in adapters && adapters.redis) {
    logger.info('Swapping local rate limiters with Redis rate limiters');
    const redisAdapters = adapters.redis;
    await setRateLimiters(runtime, redisAdapters.rateLimiters);
  }

  // Create security service with runtime's rate limiters
  // (which are now Redis-backed if Redis is enabled)
  const security = new SecurityService(config, runtime.rateLimiters);

  // Create unified adapters with filesystem adapter for handler injection
  const unifiedAdapters: UnifiedAdapters = {
    event: adapters.event,
    cache: adapters.cache,
    fs: createLocalFileSystemAdapter(),
  };

  // Ensure vector service is fully initialized before returning context
  // This is important for session-start hooks that need vector service immediately
  if (services.vector) {
    await services.vector.waitForReady();
    logger.debug('Vector service ready');
  }

  return {
    config,
    db,
    sqlite,
    logger,
    queryDeps,
    security,
    runtime,
    services,
    repos,
    adapters,
    unifiedAdapters,
  };
}
