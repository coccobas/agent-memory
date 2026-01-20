/**
 * Unit Tests for Semantic Edge Inference Service
 *
 * Tests the service that automatically creates `related_to` edges
 * between semantically similar entries based on embedding similarity.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SemanticEdgeInferenceService,
  createSemanticEdgeInferenceService,
} from '../../../src/services/graph/semantic-edge-inference.service.js';
import type {
  SemanticEdgeInferenceConfig,
  EntryWithEmbedding,
} from '../../../src/services/graph/semantic-edge-inference.types.js';
import { DEFAULT_SEMANTIC_EDGE_CONFIG } from '../../../src/services/graph/semantic-edge-inference.types.js';

// =============================================================================
// MOCKS
// =============================================================================

function createMockDeps() {
  return {
    getEntriesWithEmbeddings: vi.fn().mockResolvedValue([]),
    createEdge: vi.fn().mockResolvedValue({ created: true }),
    edgeExists: vi.fn().mockResolvedValue(false),
  };
}

function createMockEntry(
  id: string,
  type: 'knowledge' | 'guideline' | 'tool' | 'experience',
  embedding: number[]
): EntryWithEmbedding {
  return {
    entryId: id,
    entryType: type,
    scopeType: 'project',
    scopeId: 'proj-123',
    embedding,
    name: `Test ${type} ${id}`,
  };
}

// Create normalized embedding vectors for testing
function createNormalizedEmbedding(values: number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  return values.map((v) => v / magnitude);
}

// =============================================================================
// TESTS
// =============================================================================

describe('SemanticEdgeInferenceService', () => {
  describe('createSemanticEdgeInferenceService', () => {
    it('should create service with default config', () => {
      const deps = createMockDeps();
      const service = createSemanticEdgeInferenceService(deps);

      expect(service).toBeDefined();
      expect(service.getConfig()).toEqual(DEFAULT_SEMANTIC_EDGE_CONFIG);
    });

    it('should create service with custom config', () => {
      const deps = createMockDeps();
      const customConfig: Partial<SemanticEdgeInferenceConfig> = {
        similarityThreshold: 0.9,
        maxEdgesPerEntry: 3,
      };

      const service = createSemanticEdgeInferenceService(deps, customConfig);
      const config = service.getConfig();

      expect(config.similarityThreshold).toBe(0.9);
      expect(config.maxEdgesPerEntry).toBe(3);
      expect(config.batchSize).toBe(DEFAULT_SEMANTIC_EDGE_CONFIG.batchSize);
    });
  });

  describe('inferEdges', () => {
    let deps: ReturnType<typeof createMockDeps>;
    let service: SemanticEdgeInferenceService;

    beforeEach(() => {
      deps = createMockDeps();
      service = createSemanticEdgeInferenceService(deps, {
        similarityThreshold: 0.7,
        maxEdgesPerEntry: 5,
      });
    });

    it('should return empty result when no entries have embeddings', async () => {
      deps.getEntriesWithEmbeddings.mockResolvedValue([]);

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result.stats.entriesProcessed).toBe(0);
      expect(result.stats.edgesCreated).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should return empty result with single entry (need pairs)', async () => {
      const entry = createMockEntry('k1', 'knowledge', createNormalizedEmbedding([1, 0, 0]));
      deps.getEntriesWithEmbeddings.mockResolvedValue([entry]);

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result.stats.entriesProcessed).toBe(1);
      expect(result.stats.comparisonsComputed).toBe(0);
      expect(result.stats.edgesCreated).toBe(0);
    });

    it('should create edge between highly similar entries', async () => {
      // Two very similar embeddings (cosine similarity ~0.99)
      const e1 = createMockEntry('k1', 'knowledge', createNormalizedEmbedding([1, 0.1, 0]));
      const e2 = createMockEntry('k2', 'knowledge', createNormalizedEmbedding([1, 0.15, 0]));

      deps.getEntriesWithEmbeddings.mockResolvedValue([e1, e2]);

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result.stats.entriesProcessed).toBe(2);
      expect(result.stats.comparisonsComputed).toBe(1); // 2 entries = 1 comparison
      expect(result.stats.pairsAboveThreshold).toBe(1);
      expect(result.stats.edgesCreated).toBe(1);
      expect(deps.createEdge).toHaveBeenCalledTimes(1);
    });

    it('should NOT create edge between dissimilar entries', async () => {
      // Two orthogonal embeddings (cosine similarity = 0)
      const e1 = createMockEntry('k1', 'knowledge', createNormalizedEmbedding([1, 0, 0]));
      const e2 = createMockEntry('k2', 'knowledge', createNormalizedEmbedding([0, 1, 0]));

      deps.getEntriesWithEmbeddings.mockResolvedValue([e1, e2]);

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result.stats.comparisonsComputed).toBe(1);
      expect(result.stats.pairsAboveThreshold).toBe(0);
      expect(result.stats.edgesCreated).toBe(0);
      expect(deps.createEdge).not.toHaveBeenCalled();
    });

    it('should skip existing edges', async () => {
      const e1 = createMockEntry('k1', 'knowledge', createNormalizedEmbedding([1, 0.1, 0]));
      const e2 = createMockEntry('k2', 'knowledge', createNormalizedEmbedding([1, 0.15, 0]));

      deps.getEntriesWithEmbeddings.mockResolvedValue([e1, e2]);
      deps.edgeExists.mockResolvedValue(true); // Edge already exists

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result.stats.pairsAboveThreshold).toBe(1);
      expect(result.stats.edgesExisting).toBe(1);
      expect(result.stats.edgesCreated).toBe(0);
      expect(deps.createEdge).not.toHaveBeenCalled();
    });

    it('should respect maxEdgesPerEntry limit', async () => {
      // Create 5 similar entries - should create max 3 edges per entry
      const entries = [
        createMockEntry('k1', 'knowledge', createNormalizedEmbedding([1, 0.1, 0])),
        createMockEntry('k2', 'knowledge', createNormalizedEmbedding([1, 0.12, 0])),
        createMockEntry('k3', 'knowledge', createNormalizedEmbedding([1, 0.14, 0])),
        createMockEntry('k4', 'knowledge', createNormalizedEmbedding([1, 0.16, 0])),
        createMockEntry('k5', 'knowledge', createNormalizedEmbedding([1, 0.18, 0])),
      ];

      deps.getEntriesWithEmbeddings.mockResolvedValue(entries);

      const limitedService = createSemanticEdgeInferenceService(deps, {
        similarityThreshold: 0.7,
        maxEdgesPerEntry: 2, // Limit to 2 edges per entry
      });

      const result = await limitedService.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      // With 5 entries, there are 10 possible pairs (5 choose 2)
      expect(result.stats.comparisonsComputed).toBe(10);

      // Due to maxEdgesPerEntry=2, each entry can have at most 2 edges
      // Total edges limited by min(pairsAboveThreshold, maxEdges*entries/2)
      expect(result.stats.edgesCreated).toBeLessThanOrEqual(5); // At most 5 edges (2 per entry, shared)
      expect(result.stats.edgesSkipped).toBeGreaterThan(0);
    });

    it('should work in dry run mode without creating edges', async () => {
      const e1 = createMockEntry('k1', 'knowledge', createNormalizedEmbedding([1, 0.1, 0]));
      const e2 = createMockEntry('k2', 'knowledge', createNormalizedEmbedding([1, 0.15, 0]));

      deps.getEntriesWithEmbeddings.mockResolvedValue([e1, e2]);

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-123',
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.stats.pairsAboveThreshold).toBe(1);
      expect(result.stats.edgesCreated).toBe(0); // Dry run - no actual creation
      expect(deps.createEdge).not.toHaveBeenCalled();
      expect(deps.edgeExists).not.toHaveBeenCalled();
    });

    it('should include sample edges in result', async () => {
      const e1 = createMockEntry('k1', 'knowledge', createNormalizedEmbedding([1, 0.1, 0]));
      const e2 = createMockEntry('k2', 'knowledge', createNormalizedEmbedding([1, 0.15, 0]));

      deps.getEntriesWithEmbeddings.mockResolvedValue([e1, e2]);

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result.sampleEdges).toBeDefined();
      expect(result.sampleEdges!.length).toBe(1);
      expect(result.sampleEdges![0]).toMatchObject({
        sourceId: 'k1',
        sourceType: 'knowledge',
        targetId: 'k2',
        targetType: 'knowledge',
      });
      expect(result.sampleEdges![0].similarity).toBeGreaterThan(0.7);
    });

    it('should handle edge creation failures gracefully', async () => {
      const e1 = createMockEntry('k1', 'knowledge', createNormalizedEmbedding([1, 0.1, 0]));
      const e2 = createMockEntry('k2', 'knowledge', createNormalizedEmbedding([1, 0.15, 0]));

      deps.getEntriesWithEmbeddings.mockResolvedValue([e1, e2]);
      deps.createEdge.mockRejectedValue(new Error('Database error'));

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result.stats.edgesFailed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Database error');
    });

    it('should create edges across different entry types', async () => {
      const k1 = createMockEntry('k1', 'knowledge', createNormalizedEmbedding([1, 0.1, 0]));
      const g1 = createMockEntry('g1', 'guideline', createNormalizedEmbedding([1, 0.12, 0]));

      deps.getEntriesWithEmbeddings.mockResolvedValue([k1, g1]);

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result.stats.edgesCreated).toBe(1);
      expect(deps.createEdge).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceEntryId: 'k1',
          sourceEntryType: 'knowledge',
          targetEntryId: 'g1',
          targetEntryType: 'guideline',
          relationType: 'related_to',
        })
      );
    });

    it('should include timing information', async () => {
      deps.getEntriesWithEmbeddings.mockResolvedValue([]);

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result.timing).toBeDefined();
      expect(result.timing.startedAt).toBeDefined();
      expect(result.timing.completedAt).toBeDefined();
      expect(result.timing.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.runId).toBeDefined();
    });

    it('should use provided runId', async () => {
      deps.getEntriesWithEmbeddings.mockResolvedValue([]);

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-123',
        runId: 'custom-run-id',
      });

      expect(result.runId).toBe('custom-run-id');
    });

    it('should filter entries by configured entry types', async () => {
      const k1 = createMockEntry('k1', 'knowledge', createNormalizedEmbedding([1, 0.1, 0]));
      const g1 = createMockEntry('g1', 'guideline', createNormalizedEmbedding([1, 0.12, 0]));
      const t1 = createMockEntry('t1', 'tool', createNormalizedEmbedding([1, 0.14, 0]));

      deps.getEntriesWithEmbeddings.mockResolvedValue([k1, g1, t1]);

      // Only process knowledge and guideline
      const filteredService = createSemanticEdgeInferenceService(deps, {
        similarityThreshold: 0.7,
        entryTypes: ['knowledge', 'guideline'],
      });

      await filteredService.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      // Should pass entry types to the query
      expect(deps.getEntriesWithEmbeddings).toHaveBeenCalledWith(
        expect.objectContaining({
          entryTypes: ['knowledge', 'guideline'],
        })
      );
    });
  });

  describe('cosineSimilarity', () => {
    let service: SemanticEdgeInferenceService;

    beforeEach(() => {
      const deps = createMockDeps();
      service = createSemanticEdgeInferenceService(deps);
    });

    it('should return 1 for identical vectors', () => {
      const v = createNormalizedEmbedding([1, 2, 3]);
      const similarity = service.computeSimilarity(v, v);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const v1 = createNormalizedEmbedding([1, 0, 0]);
      const v2 = createNormalizedEmbedding([0, 1, 0]);
      const similarity = service.computeSimilarity(v1, v2);
      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const v1 = createNormalizedEmbedding([1, 0, 0]);
      const v2 = createNormalizedEmbedding([-1, 0, 0]);
      const similarity = service.computeSimilarity(v1, v2);
      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it('should handle high-dimensional vectors', () => {
      // 1536-dimension vectors (typical for OpenAI embeddings)
      const dim = 1536;
      const v1 = createNormalizedEmbedding(Array.from({ length: dim }, (_, i) => Math.sin(i)));
      const v2 = createNormalizedEmbedding(
        Array.from({ length: dim }, (_, i) => Math.sin(i + 0.1))
      );

      const similarity = service.computeSimilarity(v1, v2);
      expect(similarity).toBeGreaterThan(0.9); // Should be very similar
      expect(similarity).toBeLessThan(1.0);
    });
  });

  describe('disabled service', () => {
    it('should return early when disabled', async () => {
      const deps = createMockDeps();
      const service = createSemanticEdgeInferenceService(deps, {
        enabled: false,
      });

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result.stats.entriesProcessed).toBe(0);
      expect(deps.getEntriesWithEmbeddings).not.toHaveBeenCalled();
    });
  });
});
