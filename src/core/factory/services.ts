/**
 * Service factory functions
 *
 * Creates all service instances with explicit configuration.
 */

import type { Config } from '../../config/index.js';
import type { Runtime } from '../runtime.js';
import { registerEmbeddingPipeline } from '../runtime.js';
import type { AppContextServices } from '../context.js';
import { EmbeddingService } from '../../services/embedding.service.js';
import { VectorService } from '../../services/vector.service.js';
import { ExtractionService } from '../../services/extraction.service.js';
import { PermissionService } from '../../services/permission.service.js';
import { VerificationService } from '../../services/verification.service.js';
import { registerVectorCleanupHook } from '../../db/repositories/base.js';
import type { AppDb } from '../types.js';

/**
 * Create all services with explicit configuration (DI pattern)
 *
 * Also wires up embedding pipeline and vector cleanup hooks.
 *
 * @param config - Application configuration
 * @param runtime - Runtime for wiring embedding pipeline
 * @param db - Database instance (for permission service)
 * @returns Service instances
 */
export function createServices(config: Config, runtime: Runtime, db: AppDb): AppContextServices {
  // Create services with explicit configuration
  const embeddingService = new EmbeddingService({
    provider: config.embedding.provider,
    openaiApiKey: config.embedding.openaiApiKey,
    openaiModel: config.embedding.openaiModel,
  });

  const vectorService = new VectorService();

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
