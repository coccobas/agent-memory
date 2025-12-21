/**
 * Service bootstrap wiring for optional integrations.
 *
 * This module connects service-layer implementations (embedding/vector) to
 * repository-layer lifecycle hooks. Import from server entrypoints.
 */

import { registerVectorCleanupHook } from '../db/repositories/base.js';
import { registerEmbeddingPipeline } from '../db/repositories/embedding-hooks.js';
import { getEmbeddingService } from './embedding.service.js';
import { getVectorService } from './vector.service.js';

registerVectorCleanupHook(async (entryType, entryId) => {
  const vectorService = getVectorService();
  await vectorService.removeEmbedding(entryType, entryId);
});

registerEmbeddingPipeline({
  isAvailable: () => getEmbeddingService().isAvailable(),
  embed: async (text) => {
    const embeddingService = getEmbeddingService();
    return embeddingService.embed(text);
  },
  storeEmbedding: async (entryType, entryId, versionId, text, embedding, model) => {
    const vectorService = getVectorService();
    await vectorService.storeEmbedding(entryType, entryId, versionId, text, embedding, model);
  },
});

