import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AppContext } from './context.js';
import type { Config } from '../config/index.js';
import type { Runtime } from './runtime.js';
import type { DatabaseDeps } from './types.js';
import type { Repositories } from './interfaces/repositories.js';
import { registerEmbeddingPipeline } from './runtime.js';
import { getRuntime, isRuntimeRegistered } from './container.js';
import { createComponentLogger } from '../utils/logger.js';
import { createDatabaseConnection } from '../db/factory.js';
import { getDb, getPreparedStatement } from '../db/connection.js';
import { SecurityService } from '../services/security.service.js';
import { createDependencies, wireQueryCacheInvalidation } from '../services/query/index.js';
import { EmbeddingService } from '../services/embedding.service.js';
import { VectorService } from '../services/vector.service.js';
import { ExtractionService } from '../services/extraction.service.js';
import { registerVectorCleanupHook } from '../db/repositories/base.js';
// Repository factory imports
import {
  createTagRepository,
  createEntryTagRepository,
  createEntryRelationRepository,
} from '../db/repositories/tags.js';
import {
  createOrganizationRepository,
  createProjectRepository,
  createSessionRepository,
} from '../db/repositories/scopes.js';
import { createFileLockRepository } from '../db/repositories/file_locks.js';
import { createGuidelineRepository } from '../db/repositories/guidelines.js';
import { createKnowledgeRepository } from '../db/repositories/knowledge.js';
import { createToolRepository } from '../db/repositories/tools.js';
import { createConversationRepository } from '../db/repositories/conversations.js';

/**
 * Create a new Application Context
 *
 * This factory initializes all core dependencies.
 *
 * @param config - The application configuration
 * @param runtime - Optional runtime. If not provided, uses the one registered with the container.
 * @returns Fully initialized AppContext
 */
export async function createAppContext(config: Config, runtime?: Runtime): Promise<AppContext> {
  // Get runtime from container if not provided
  const effectiveRuntime = runtime ?? (isRuntimeRegistered() ? getRuntime() : null);
  if (!effectiveRuntime) {
    throw new Error(
      'Runtime not available. Either pass runtime to createAppContext() or call registerRuntime() first.'
    );
  }
  const logger = createComponentLogger('app');

  // Create services with explicit configuration (DI pattern)
  const embeddingService = new EmbeddingService({
    provider: config.embedding.provider,
    openaiApiKey: config.embedding.openaiApiKey,
    openaiModel: config.embedding.openaiModel,
  });
  const vectorService = new VectorService(); // Uses default LanceDbVectorStore
  const extractionService = new ExtractionService({
    provider: config.extraction.provider,
    openaiApiKey: config.extraction.openaiApiKey,
    openaiModel: config.extraction.openaiModel,
    openaiBaseUrl: config.extraction.openaiBaseUrl,
    anthropicApiKey: config.extraction.anthropicApiKey,
    anthropicModel: config.extraction.anthropicModel,
    ollamaBaseUrl: config.extraction.ollamaBaseUrl,
    ollamaModel: config.extraction.ollamaModel,
  });

  // Wire embedding pipeline to runtime (replaces initializeBootstrap)
  if (!effectiveRuntime.embeddingPipeline) {
    registerEmbeddingPipeline(effectiveRuntime, {
      isAvailable: () => embeddingService.isAvailable(),
      embed: async (text) => embeddingService.embed(text),
      storeEmbedding: async (entryType, entryId, versionId, text, embedding, model) => {
        await vectorService.storeEmbedding(entryType, entryId, versionId, text, embedding, model);
      },
    });
  }

  // Register vector cleanup hook for entry deletion (replaces bootstrap.ts)
  registerVectorCleanupHook(async (entryType, entryId) => {
    await vectorService.removeEmbedding(entryType, entryId);
  });

  // Ensure data directory exists
  const dbPath = config.database.path;
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logger.debug({ dir }, 'Created data directory');
  }

  // Initialize Database
  // We use the factory from connection.ts to reuse the safe initialization logic
  const { db, sqlite } = await createDatabaseConnection(config);

  // Create database dependencies for repository injection
  const dbDeps: DatabaseDeps = { db, sqlite };

  // Create all repositories with injected dependencies
  const tagRepo = createTagRepository(dbDeps);
  const repos: Repositories = {
    tags: tagRepo,
    entryTags: createEntryTagRepository(dbDeps, tagRepo),
    entryRelations: createEntryRelationRepository(dbDeps),
    organizations: createOrganizationRepository(dbDeps),
    projects: createProjectRepository(dbDeps),
    sessions: createSessionRepository(dbDeps),
    fileLocks: createFileLockRepository(dbDeps),
    guidelines: createGuidelineRepository(dbDeps),
    knowledge: createKnowledgeRepository(dbDeps),
    tools: createToolRepository(dbDeps),
    conversations: createConversationRepository(dbDeps),
  };

  // Create query pipeline dependencies with explicit DI (no globals)
  const queryLogger = createComponentLogger('query-pipeline');
  const queryDeps = createDependencies({
    getDb: () => getDb(),
    getPreparedStatement: (sql: string) => getPreparedStatement(sql),
    cache: effectiveRuntime.queryCache.cache,
    perfLog: config.logging.performance,
    logger: queryLogger,
  });

  // Wire query cache invalidation to entry change events
  // Store unsubscribe function in runtime for cleanup on shutdown
  if (!effectiveRuntime.queryCache.unsubscribe) {
    effectiveRuntime.queryCache.unsubscribe = wireQueryCacheInvalidation(
      effectiveRuntime.queryCache.cache,
      queryLogger
    );
  }

  // Security is context-bound and configured explicitly (no env lookups at runtime).
  const security = new SecurityService(config);

  // Wire services to context (all use explicit DI)
  const services = {
    embedding: embeddingService,
    vector: vectorService,
    extraction: extractionService,
  };

  const context: AppContext = {
    config,
    db,
    sqlite,
    logger,
    queryDeps,
    security,
    runtime: effectiveRuntime,
    services,
    repos,
  };

  return context;
}
