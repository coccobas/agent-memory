/**
 * Service factory functions
 *
 * Creates all service instances with explicit configuration.
 */

import type { Config } from '../../config/index.js';
import type { Runtime } from '../runtime.js';
import { registerEmbeddingPipeline } from '../runtime.js';
import type { AppContextServices, IVectorService } from '../context.js';
import { EmbeddingService } from '../../services/embedding.service.js';
import { VectorService } from '../../services/vector.service.js';
import { ExtractionService } from '../../services/extraction.service.js';
import { PermissionService } from '../../services/permission.service.js';
import { VerificationService } from '../../services/verification.service.js';
import { registerVectorCleanupHook } from '../../db/repositories/base.js';
import type { AppDb } from '../types.js';
import type { IVectorStore } from '../interfaces/vector-store.js';

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
 * @param config - Application configuration
 * @param runtime - Runtime for wiring embedding pipeline
 * @param db - Database instance (for permission service)
 * @param overrides - Optional service overrides for DI (e.g., mock vector store for tests)
 * @returns Service instances
 */
export function createServices(
  config: Config,
  runtime: Runtime,
  db: AppDb,
  overrides?: ServiceOverrides
): AppContextServices {
  // Create services with explicit configuration
  const embeddingService = new EmbeddingService({
    provider: config.embedding.provider,
    openaiApiKey: config.embedding.openaiApiKey,
    openaiModel: config.embedding.openaiModel,
  });

  // Use provided vectorService, or create one with optional custom store
  const vectorService = overrides?.vectorService ?? new VectorService(overrides?.vectorStore);

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

  return {
    embedding: embeddingService,
    vector: vectorService,
    extraction: extractionService,
    permission: permissionService,
    verification: verificationService,
  };
}
