/**
 * Service factory functions
 *
 * Creates all service instances with explicit configuration.
 */

import type { Pool } from 'pg';
import type { Config } from '../../config/index.js';
import type { Runtime } from '../runtime.js';
import { registerEmbeddingPipeline } from '../runtime.js';
import type { AppContextServices, IVectorService } from '../context.js';
import { EmbeddingService } from '../../services/embedding.service.js';
import { VectorService } from '../../services/vector.service.js';
import { ExtractionService } from '../../services/extraction.service.js';
import { PermissionService } from '../../services/permission.service.js';
import { VerificationService } from '../../services/verification.service.js';
import { HierarchicalSummarizationService } from '../../services/summarization/index.js';
import { registerVectorCleanupHook } from '../../db/repositories/base.js';
import type { AppDb } from '../types.js';
import type { IVectorStore } from '../interfaces/vector-store.js';
import { LanceDbVectorStore } from '../../db/vector-stores/lancedb.js';
import { initFeedbackService } from '../../services/feedback/index.js';
import { initFeedbackQueue } from '../../services/feedback/queue.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('services-factory');

/**
 * Database-specific dependencies for service creation.
 * Used for auto-detection of vector backend.
 */
export interface ServiceDependencies {
  /** Database type for auto-detection */
  dbType: 'sqlite' | 'postgresql';
  /** PostgreSQL pool (required when dbType is 'postgresql') */
  pgPool?: Pool;
}

/**
 * Optional service overrides for dependency injection.
 * Allows tests and alternative deployments to swap implementations.
 */
export interface ServiceOverrides {
  /** Custom vector store implementation (e.g., mock for tests) */
  vectorStore?: IVectorStore;
  /** Pre-created vector service (skips internal creation) */
  vectorService?: IVectorService;
}

/**
 * Create all services with explicit configuration (DI pattern)
 *
 * Also wires up embedding pipeline and vector cleanup hooks.
 *
 * Auto-detects vector backend based on database type:
 * - PostgreSQL → pgvector (unified PostgreSQL storage)
 * - SQLite → LanceDB (default file-based vector store)
 *
 * @param config - Application configuration
 * @param runtime - Runtime for wiring embedding pipeline
 * @param db - Database instance (for permission service)
 * @param deps - Database dependencies for auto-detection
 * @param overrides - Optional service overrides for DI (e.g., mock vector store for tests)
 * @returns Service instances
 */
export function createServices(
  config: Config,
  runtime: Runtime,
  db: AppDb,
  deps?: ServiceDependencies,
  overrides?: ServiceOverrides
): AppContextServices {
  // Create services with explicit configuration
  const embeddingService = new EmbeddingService({
    provider: config.embedding.provider,
    openaiApiKey: config.embedding.openaiApiKey,
    openaiModel: config.embedding.openaiModel,
  });

  // Determine vector store: overrides > config.backend > auto-detect > default
  let vectorStore: IVectorStore | undefined = overrides?.vectorStore;

  if (!vectorStore && !overrides?.vectorService) {
    const backend = config.vectorDb.backend ?? 'auto';

    if (backend === 'pgvector') {
      // Explicitly requested pgvector
      if (!deps?.pgPool) {
        throw new Error('pgvector backend requires PostgreSQL pool (dbType: postgresql)');
      }
      const { PgVectorStore } = require('../../db/vector-stores/pgvector.js');
      vectorStore = new PgVectorStore(deps.pgPool, config.vectorDb.distanceMetric);
    } else if (backend === 'lancedb') {
      // Explicitly requested LanceDB
      vectorStore = new LanceDbVectorStore();
    } else {
      // Auto-detect based on database type
      if (deps?.dbType === 'postgresql' && deps.pgPool) {
        // PostgreSQL mode: use pgvector for unified storage
        const { PgVectorStore } = require('../../db/vector-stores/pgvector.js');
        vectorStore = new PgVectorStore(deps.pgPool, config.vectorDb.distanceMetric);
      } else {
        // SQLite mode: use LanceDB (default)
        vectorStore = new LanceDbVectorStore();
      }
    }
  }

  // Use provided vectorService, or create one with the determined store
  const vectorService = overrides?.vectorService ?? new VectorService(vectorStore);

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

  // Wire embedding pipeline to runtime
  if (!runtime.embeddingPipeline) {
    registerEmbeddingPipeline(runtime, {
      isAvailable: () => embeddingService.isAvailable(),
      embed: async (text) => embeddingService.embed(text),
      storeEmbedding: async (entryType, entryId, versionId, text, embedding, model) => {
        await vectorService.storeEmbedding(entryType, entryId, versionId, text, embedding, model);
      },
    });
  }

  // Register vector cleanup hook for entry deletion
  registerVectorCleanupHook(async (entryType, entryId) => {
    await vectorService.removeEmbedding(entryType, entryId);
  });

  // Create permission service
  const permissionService = new PermissionService(db, runtime.memoryCoordinator);

  // Create verification service
  const verificationService = new VerificationService(db);

  // Create hierarchical summarization service
  const summarizationService = new HierarchicalSummarizationService(
    db,
    embeddingService,
    extractionService,
    vectorService,
    {
      provider: config.extraction.provider, // Use same provider as extraction
      model: config.extraction.openaiModel, // Default model
      maxLevels: 3,
      minGroupSize: 3,
      similarityThreshold: 0.75,
      communityResolution: 1.0,
    }
  );

  // Initialize feedback service for RL training data collection
  const feedbackService = initFeedbackService(
    { db },
    {
      enabled: true, // Enabled by default; could add config option if needed
    }
  );
  logger.debug('Feedback service initialized');

  // Initialize and start the feedback queue processor
  const feedbackQueue = initFeedbackQueue(feedbackService, {
    maxQueueSize: config.feedback.queueSize,
    workerConcurrency: config.feedback.workerConcurrency,
    batchTimeoutMs: config.feedback.batchTimeoutMs,
  });
  feedbackQueue.start();
  logger.info('Feedback queue processor started');

  return {
    embedding: embeddingService,
    vector: vectorService,
    extraction: extractionService,
    permission: permissionService,
    verification: verificationService,
    summarization: summarizationService,
    feedback: feedbackService,
    feedbackQueue,
  };
}
