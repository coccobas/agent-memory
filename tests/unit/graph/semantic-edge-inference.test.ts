import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SemanticEdgeInferenceService,
  type SemanticEdgeInferenceDeps,
} from '../../../src/services/graph/semantic-edge-inference.service.js';
import type { IExtractionService } from '../../../src/core/context.js';
import type { EntryWithEmbedding } from '../../../src/services/graph/semantic-edge-inference.types.js';

describe('SemanticEdgeInferenceService', () => {
  const createMockDeps = (): SemanticEdgeInferenceDeps => ({
    getEntriesWithEmbeddings: vi.fn().mockResolvedValue([]),
    createEdge: vi.fn().mockResolvedValue({ created: true, edgeId: 'edge-1' }),
    edgeExists: vi.fn().mockResolvedValue(false),
  });

  const createMockEntries = (): EntryWithEmbedding[] => [
    {
      entryId: 'guid-1',
      entryType: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-1',
      embedding: [0.5, 0.5, 0.5],
      name: 'Always use TypeScript strict mode',
    },
    {
      entryId: 'guid-2',
      entryType: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-1',
      embedding: [0.51, 0.49, 0.5],
      name: 'Enable strict null checks',
    },
    {
      entryId: 'know-1',
      entryType: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-1',
      embedding: [0.1, 0.2, 0.3],
      name: 'Database uses PostgreSQL',
    },
  ];

  describe('without extraction service', () => {
    it('should create related_to edges based on similarity', async () => {
      const deps = createMockDeps();
      vi.mocked(deps.getEntriesWithEmbeddings).mockResolvedValue(createMockEntries());

      const service = new SemanticEdgeInferenceService(deps, {
        similarityThreshold: 0.9,
      });

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.stats.entriesProcessed).toBe(3);
      expect(deps.createEdge).toHaveBeenCalledWith(
        expect.objectContaining({
          relationType: 'related_to',
        })
      );
    });

    it('should respect similarity threshold', async () => {
      const deps = createMockDeps();
      const dissimilarEntries: EntryWithEmbedding[] = [
        {
          entryId: 'guid-1',
          entryType: 'guideline',
          scopeType: 'project',
          scopeId: 'proj-1',
          embedding: [1, 0, 0],
          name: 'Entry 1',
        },
        {
          entryId: 'guid-2',
          entryType: 'guideline',
          scopeType: 'project',
          scopeId: 'proj-1',
          embedding: [0, 1, 0],
          name: 'Entry 2',
        },
      ];
      vi.mocked(deps.getEntriesWithEmbeddings).mockResolvedValue(dissimilarEntries);

      const service = new SemanticEdgeInferenceService(deps, {
        similarityThreshold: 0.99,
      });

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.stats.pairsAboveThreshold).toBe(0);
    });
  });

  describe('with extraction service (LLM-enhanced)', () => {
    const createMockExtractionService = (
      available: boolean,
      response?: string
    ): IExtractionService => ({
      isAvailable: () => available,
      extract: vi.fn().mockResolvedValue({
        entries: response ? [{ content: response }] : [],
        confidence: 0.8,
        duplicatesFiltered: 0,
      }),
    });

    it('should infer specific relation types using LLM for high-similarity pairs', async () => {
      const deps = createMockDeps();
      vi.mocked(deps.getEntriesWithEmbeddings).mockResolvedValue(createMockEntries());

      const mockExtraction = createMockExtractionService(
        true,
        JSON.stringify({
          relation_type: 'depends_on',
          confidence: 0.85,
          reasoning: 'Strict null checks are part of TypeScript strict mode',
        })
      );

      const service = new SemanticEdgeInferenceService(deps, {
        similarityThreshold: 0.9,
        extractionService: mockExtraction,
        llmInferenceThreshold: 0.95,
      });

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.stats.entriesProcessed).toBe(3);
    });

    it('should fall back to related_to when LLM is unavailable', async () => {
      const deps = createMockDeps();
      vi.mocked(deps.getEntriesWithEmbeddings).mockResolvedValue(createMockEntries());

      const mockExtraction = createMockExtractionService(false);

      const service = new SemanticEdgeInferenceService(deps, {
        similarityThreshold: 0.9,
        extractionService: mockExtraction,
      });

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.stats.entriesProcessed).toBe(3);
      expect(mockExtraction.extract).not.toHaveBeenCalled();
    });

    it('should fall back to related_to when LLM returns invalid response', async () => {
      const deps = createMockDeps();
      vi.mocked(deps.getEntriesWithEmbeddings).mockResolvedValue(createMockEntries());

      const mockExtraction = createMockExtractionService(true, 'Invalid JSON');

      const service = new SemanticEdgeInferenceService(deps, {
        similarityThreshold: 0.9,
        extractionService: mockExtraction,
        llmInferenceThreshold: 0.95,
      });

      await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(deps.createEdge).toHaveBeenCalledWith(
        expect.objectContaining({
          relationType: 'related_to',
        })
      );
    });

    it('should use LLM only for pairs above llmInferenceThreshold', async () => {
      const deps = createMockDeps();
      const highSimEntries: EntryWithEmbedding[] = [
        {
          entryId: 'guid-1',
          entryType: 'guideline',
          scopeType: 'project',
          scopeId: 'proj-1',
          embedding: [1, 0, 0],
          name: 'Entry 1',
        },
        {
          entryId: 'guid-2',
          entryType: 'guideline',
          scopeType: 'project',
          scopeId: 'proj-1',
          embedding: [0.99, 0.01, 0],
          name: 'Entry 2',
        },
        {
          entryId: 'guid-3',
          entryType: 'guideline',
          scopeType: 'project',
          scopeId: 'proj-1',
          embedding: [0.7, 0.3, 0],
          name: 'Entry 3',
        },
      ];
      vi.mocked(deps.getEntriesWithEmbeddings).mockResolvedValue(highSimEntries);

      const mockExtraction = createMockExtractionService(
        true,
        JSON.stringify({ relation_type: 'depends_on', confidence: 0.9 })
      );

      const service = new SemanticEdgeInferenceService(deps, {
        similarityThreshold: 0.6,
        extractionService: mockExtraction,
        llmInferenceThreshold: 0.95,
      });

      await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      const extractCalls = vi.mocked(mockExtraction.extract).mock.calls.length;
      expect(extractCalls).toBeLessThanOrEqual(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty entries', async () => {
      const deps = createMockDeps();
      vi.mocked(deps.getEntriesWithEmbeddings).mockResolvedValue([]);

      const service = new SemanticEdgeInferenceService(deps);
      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.stats.entriesProcessed).toBe(0);
    });

    it('should handle single entry', async () => {
      const deps = createMockDeps();
      vi.mocked(deps.getEntriesWithEmbeddings).mockResolvedValue([createMockEntries()[0]!]);

      const service = new SemanticEdgeInferenceService(deps);
      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.stats.entriesProcessed).toBe(1);
      expect(result.stats.edgesCreated).toBe(0);
    });

    it('should support dry run mode', async () => {
      const deps = createMockDeps();
      vi.mocked(deps.getEntriesWithEmbeddings).mockResolvedValue(createMockEntries());

      const service = new SemanticEdgeInferenceService(deps, {
        similarityThreshold: 0.9,
      });

      const result = await service.inferEdges({
        scopeType: 'project',
        scopeId: 'proj-1',
        dryRun: true,
      });

      expect(deps.createEdge).not.toHaveBeenCalled();
      expect(result.dryRun).toBe(true);
    });
  });
});
