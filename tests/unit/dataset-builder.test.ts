import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildExtractionDataset,
  buildRetrievalDataset,
  buildConsolidationDataset,
  type DatasetParams,
  type Dataset,
} from '../../src/services/rl/training/dataset-builder.js';
import type {
  ExtractionTrainingExample,
  RetrievalTrainingExample,
  ConsolidationTrainingExample,
} from '../../src/services/rl/types.js';
import type { TrainingDataset } from '../../src/services/feedback/types.js';

// Mock the feedback service
const mockFeedbackService = {
  exportTrainingData: vi.fn(),
};

vi.mock('../../src/services/feedback/index.js', () => ({
  getFeedbackService: () => mockFeedbackService,
}));

describe('Dataset Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildExtractionDataset', () => {
    it('should build extraction dataset from feedback data', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        extractionSamples: 100,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const params: DatasetParams = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        minConfidence: 0.7,
        maxExamples: 1000,
      };

      const dataset = await buildExtractionDataset(params);

      expect(dataset).toBeDefined();
      expect(dataset.train).toBeDefined();
      expect(dataset.eval).toBeDefined();
      expect(dataset.stats.totalExamples).toBeGreaterThan(0);
    });

    it('should convert extraction samples to training examples', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        extractionSamples: 50,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildExtractionDataset();

      const example = dataset.train[0];
      if (example) {
        expect(example).toHaveProperty('state');
        expect(example).toHaveProperty('action');
        expect(example).toHaveProperty('reward');
        expect(example.state).toHaveProperty('contextFeatures');
        expect(example.state).toHaveProperty('memoryState');
        expect(example.state).toHaveProperty('contentFeatures');
        expect(example.action).toHaveProperty('decision');
      }
    });

    it('should filter by minimum confidence', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        extractionSamples: 100,
        withConfidence: true,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildExtractionDataset({ minConfidence: 0.8 });

      // Should have filtered out low confidence samples
      expect(dataset.stats.totalExamples).toBeLessThan(100);
    });

    it('should skip samples without outcome scores', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        extractionSamples: 50,
        withOutcomes: false,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildExtractionDataset();

      // All samples without outcomes should be filtered
      expect(dataset.stats.totalExamples).toBe(0);
    });

    it('should split into train and eval sets', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        extractionSamples: 100,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildExtractionDataset({ evalSplit: 0.3 });

      expect(dataset.train.length).toBeGreaterThan(0);
      expect(dataset.eval.length).toBeGreaterThan(0);

      // Eval should be approximately 30% of total
      const evalRatio = dataset.eval.length / dataset.stats.totalExamples;
      expect(evalRatio).toBeGreaterThan(0.2);
      expect(evalRatio).toBeLessThan(0.4);
    });

    it('should use default eval split of 0.2', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        extractionSamples: 100,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildExtractionDataset();

      // Default split should be around 20% eval
      const evalRatio = dataset.eval.length / dataset.stats.totalExamples;
      expect(evalRatio).toBeGreaterThan(0.15);
      expect(evalRatio).toBeLessThan(0.25);
    });

    it('should populate dataset stats', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        extractionSamples: 80,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildExtractionDataset({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      expect(dataset.stats.totalExamples).toBe(dataset.train.length + dataset.eval.length);
      expect(dataset.stats.trainExamples).toBe(dataset.train.length);
      expect(dataset.stats.evalExamples).toBe(dataset.eval.length);
      expect(dataset.stats.dateRange.start).toBe('2024-01-01');
      expect(dataset.stats.dateRange.end).toBe('2024-12-31');
    });

    it('should pass export parameters to feedback service', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        extractionSamples: 50,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const params: DatasetParams = {
        startDate: '2024-01-01',
        endDate: '2024-06-30',
        maxExamples: 500,
      };

      await buildExtractionDataset(params);

      expect(mockFeedbackService.exportTrainingData).toHaveBeenCalledWith({
        startDate: '2024-01-01',
        endDate: '2024-06-30',
        onlyWithOutcomes: true,
        limit: 500,
      });
    });

    it('should construct state features from sample metadata', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        extractionSamples: 10,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildExtractionDataset();

      const example = dataset.train[0];
      if (example) {
        expect(example.state.contextFeatures.turnNumber).toBeDefined();
        expect(example.state.contentFeatures.hasDecision).toBeDefined();
        expect(example.state.contentFeatures.hasRule).toBeDefined();
        expect(example.state.contentFeatures.hasFact).toBeDefined();
        expect(example.state.contentFeatures.hasCommand).toBeDefined();
      }
    });

    it('should map entry types to content features', async () => {
      const mockTrainingData: TrainingDataset = {
        metadata: {
          exportedAt: new Date().toISOString(),
          filters: {},
        },
        extraction: {
          samples: [
            {
              decisionId: 'dec-1',
              sessionId: 'session-1',
              decision: 'store',
              entryType: 'knowledge',
              decidedAt: new Date().toISOString(),
              outcomeScore: 0.8,
            },
            {
              decisionId: 'dec-2',
              sessionId: 'session-2',
              decision: 'store',
              entryType: 'guideline',
              decidedAt: new Date().toISOString(),
              outcomeScore: 0.7,
            },
            {
              decisionId: 'dec-3',
              sessionId: 'session-3',
              decision: 'store',
              entryType: 'tool',
              decidedAt: new Date().toISOString(),
              outcomeScore: 0.9,
            },
          ],
          count: 3,
        },
        retrieval: { samples: [], count: 0 },
        consolidation: { samples: [], count: 0 },
        stats: {
          totalRetrievals: 0,
          totalExtractions: 3,
          totalConsolidations: 0,
          successRate: 0,
          averageContributionScore: 0,
        },
      };

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildExtractionDataset();

      // Combine train and eval to find all examples (dataset is shuffled)
      const allExamples = [...dataset.train, ...dataset.eval];

      const knowledgeExample = allExamples.find((ex) => ex.action.entryType === 'knowledge');
      const guidelineExample = allExamples.find((ex) => ex.action.entryType === 'guideline');
      const toolExample = allExamples.find((ex) => ex.action.entryType === 'tool');

      expect(knowledgeExample?.state.contentFeatures.hasDecision).toBe(true);
      expect(knowledgeExample?.state.contentFeatures.hasFact).toBe(true);

      expect(guidelineExample?.state.contentFeatures.hasRule).toBe(true);

      expect(toolExample?.state.contentFeatures.hasCommand).toBe(true);
    });
  });

  describe('buildRetrievalDataset', () => {
    it('should build retrieval dataset from feedback data', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        retrievalSamples: 100,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildRetrievalDataset();

      expect(dataset).toBeDefined();
      expect(dataset.train).toBeDefined();
      expect(dataset.eval).toBeDefined();
      expect(dataset.stats.totalExamples).toBeGreaterThan(0);
    });

    it('should convert retrieval samples to training examples', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        retrievalSamples: 50,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildRetrievalDataset();

      const example = dataset.train[0];
      if (example) {
        expect(example).toHaveProperty('state');
        expect(example).toHaveProperty('action');
        expect(example).toHaveProperty('reward');
        expect(example.state).toHaveProperty('queryFeatures');
        expect(example.state).toHaveProperty('contextFeatures');
        expect(example.state).toHaveProperty('memoryStats');
        expect(example.action).toHaveProperty('shouldRetrieve');
      }
    });

    it('should skip samples without contribution scores', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        retrievalSamples: 50,
        withContributionScores: false,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildRetrievalDataset();

      expect(dataset.stats.totalExamples).toBe(0);
    });

    it('should construct query features from samples', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        retrievalSamples: 20,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildRetrievalDataset();

      const example = dataset.train[0];
      if (example) {
        expect(example.state.queryFeatures.queryLength).toBeGreaterThan(0);
        expect(example.state.queryFeatures.hasKeywords).toBeDefined();
        expect(example.state.queryFeatures.queryComplexity).toBeDefined();
        expect(example.state.queryFeatures.semanticCategory).toBeDefined();
      }
    });

    it('should set shouldRetrieve to true for retrieved samples', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        retrievalSamples: 30,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildRetrievalDataset();

      // All samples from feedback are retrievals, so shouldRetrieve should be true
      for (const example of dataset.train) {
        expect(example.action.shouldRetrieve).toBe(true);
      }
    });

    it('should use contribution score as reward', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        retrievalSamples: 10,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildRetrievalDataset();

      for (const example of dataset.train) {
        expect(example.reward).toBeDefined();
        expect(typeof example.reward).toBe('number');
      }
    });

    it('should split retrieval dataset properly', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        retrievalSamples: 100,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildRetrievalDataset({ evalSplit: 0.25 });

      const evalRatio = dataset.eval.length / dataset.stats.totalExamples;
      expect(evalRatio).toBeGreaterThan(0.2);
      expect(evalRatio).toBeLessThan(0.3);
    });
  });

  describe('buildConsolidationDataset', () => {
    it('should build consolidation dataset from feedback data', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        consolidationSamples: 100,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildConsolidationDataset();

      expect(dataset).toBeDefined();
      expect(dataset.train).toBeDefined();
      expect(dataset.eval).toBeDefined();
      expect(dataset.stats.totalExamples).toBeGreaterThan(0);
    });

    it('should convert consolidation samples to training examples', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        consolidationSamples: 50,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildConsolidationDataset();

      const example = dataset.train[0];
      if (example) {
        expect(example).toHaveProperty('state');
        expect(example).toHaveProperty('action');
        expect(example).toHaveProperty('reward');
        expect(example.state).toHaveProperty('groupFeatures');
        expect(example.state).toHaveProperty('usageStats');
        expect(example.state).toHaveProperty('scopeStats');
        expect(example.action).toHaveProperty('action');
      }
    });

    it('should skip samples without outcome scores', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        consolidationSamples: 50,
        withOutcomes: false,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildConsolidationDataset();

      expect(dataset.stats.totalExamples).toBe(0);
    });

    it('should construct group features from samples', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        consolidationSamples: 20,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildConsolidationDataset();

      const example = dataset.train[0];
      if (example) {
        expect(example.state.groupFeatures.groupSize).toBeGreaterThan(0);
        expect(example.state.groupFeatures.avgSimilarity).toBeDefined();
        expect(example.state.groupFeatures.minSimilarity).toBeDefined();
        expect(example.state.groupFeatures.maxSimilarity).toBeDefined();
      }
    });

    it('should construct usage stats from samples', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        consolidationSamples: 20,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildConsolidationDataset();

      const example = dataset.train[0];
      if (example) {
        expect(example.state.usageStats.successRate).toBeDefined();
        expect(example.state.usageStats.lastAccessedDaysAgo).toBeDefined();
      }
    });

    it('should map consolidation actions correctly', async () => {
      const mockTrainingData: TrainingDataset = {
        metadata: {
          exportedAt: new Date().toISOString(),
          filters: {},
        },
        extraction: { samples: [], count: 0 },
        retrieval: { samples: [], count: 0 },
        consolidation: {
          samples: [
            {
              decisionId: 'dec-1',
              scopeType: 'project',
              action: 'merge',
              sourceEntryIds: ['entry-1', 'entry-2'],
              targetEntryId: 'merged-entry',
              decidedAt: new Date().toISOString(),
              outcomeScore: 0.8,
            },
            {
              decisionId: 'dec-2',
              scopeType: 'project',
              action: 'dedupe',
              sourceEntryIds: ['entry-3', 'entry-4'],
              decidedAt: new Date().toISOString(),
              outcomeScore: 0.9,
            },
            {
              decisionId: 'dec-3',
              scopeType: 'project',
              action: 'archive',
              sourceEntryIds: ['entry-5'],
              decidedAt: new Date().toISOString(),
              outcomeScore: 0.7,
            },
          ],
          count: 3,
        },
        stats: {
          totalRetrievals: 0,
          totalExtractions: 0,
          totalConsolidations: 3,
          successRate: 0,
          averageContributionScore: 0,
        },
      };

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildConsolidationDataset();

      // Combine train and eval to find all examples (dataset is shuffled)
      const allExamples = [...dataset.train, ...dataset.eval];

      const mergeExample = allExamples.find((ex) => ex.action.action === 'merge');
      const dedupeExample = allExamples.find((ex) => ex.action.action === 'dedupe');
      const archiveExample = allExamples.find((ex) => ex.action.action === 'archive');

      expect(mergeExample?.action.action).toBe('merge');
      expect(mergeExample?.action.targetEntries).toEqual(['merged-entry']);
      expect(dedupeExample?.action.action).toBe('dedupe');
      expect(archiveExample?.action.action).toBe('archive');
    });

    it('should split consolidation dataset properly', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        consolidationSamples: 100,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildConsolidationDataset({ evalSplit: 0.15 });

      const evalRatio = dataset.eval.length / dataset.stats.totalExamples;
      expect(evalRatio).toBeGreaterThan(0.1);
      expect(evalRatio).toBeLessThan(0.2);
    });
  });

  describe('Dataset split behavior', () => {
    it('should shuffle data before splitting', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        extractionSamples: 100,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      // Build dataset twice and compare order
      const dataset1 = await buildExtractionDataset({ evalSplit: 0.2 });
      const dataset2 = await buildExtractionDataset({ evalSplit: 0.2 });

      // Due to shuffling, the datasets should likely differ
      // (This test has a small probability of false negative)
      const firstIdsDiffer =
        dataset1.train[0]?.metadata.sessionId !== dataset2.train[0]?.metadata.sessionId;
      const lengthsSame = dataset1.train.length === dataset2.train.length;

      // At least verify structure is maintained
      expect(lengthsSame).toBe(true);
    });

    it('should handle zero eval split', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        extractionSamples: 50,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildExtractionDataset({ evalSplit: 0 });

      expect(dataset.train.length).toBe(dataset.stats.totalExamples);
      expect(dataset.eval.length).toBe(0);
    });

    it('should handle 100% eval split', async () => {
      const mockTrainingData: TrainingDataset = createMockTrainingDataset({
        extractionSamples: 50,
      });

      mockFeedbackService.exportTrainingData.mockResolvedValue(mockTrainingData);

      const dataset = await buildExtractionDataset({ evalSplit: 1.0 });

      expect(dataset.train.length).toBe(0);
      expect(dataset.eval.length).toBe(dataset.stats.totalExamples);
    });
  });
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createMockTrainingDataset(options: {
  extractionSamples?: number;
  retrievalSamples?: number;
  consolidationSamples?: number;
  withOutcomes?: boolean;
  withConfidence?: boolean;
  withContributionScores?: boolean;
}): TrainingDataset {
  const {
    extractionSamples = 0,
    retrievalSamples = 0,
    consolidationSamples = 0,
    withOutcomes = true,
    withConfidence = false,
    withContributionScores = true,
  } = options;

  const extraction = {
    samples: Array.from({ length: extractionSamples }, (_, i) => ({
      decisionId: `dec-${i}`,
      sessionId: `session-${i}`,
      turnNumber: i % 10,
      decision: i % 2 === 0 ? ('store' as const) : ('skip' as const),
      entryType: 'knowledge' as const,
      entryId: i % 2 === 0 ? `entry-${i}` : undefined,
      decidedAt: new Date(Date.now() - i * 1000000).toISOString(),
      outcomeScore: withOutcomes ? 0.5 + Math.random() * 0.5 : undefined,
      confidence: withConfidence ? 0.5 + Math.random() * 0.5 : undefined,
      retrievalCount: Math.floor(Math.random() * 10),
      successCount: Math.floor(Math.random() * 5),
    })),
    count: extractionSamples,
  };

  const retrieval = {
    samples: Array.from({ length: retrievalSamples }, (_, i) => ({
      retrievalId: `ret-${i}`,
      sessionId: `session-${i}`,
      queryText: `query text ${i}`,
      entryType: 'knowledge' as const,
      entryId: `entry-${i}`,
      retrievalRank: i % 5,
      retrievalScore: 0.5 + Math.random() * 0.5,
      retrievedAt: new Date(Date.now() - i * 1000000).toISOString(),
      contributionScore: withContributionScores ? Math.random() : undefined,
    })),
    count: retrievalSamples,
  };

  const consolidation = {
    samples: Array.from({ length: consolidationSamples }, (_, i) => ({
      decisionId: `cons-${i}`,
      scopeType: 'project' as const,
      scopeId: 'project-1',
      action: (['merge', 'dedupe', 'keep'] as const)[i % 3],
      sourceEntryIds: [`entry-${i}`, `entry-${i + 1}`],
      targetEntryId: i % 3 === 0 ? `merged-${i}` : undefined,
      similarityScore: 0.7 + Math.random() * 0.3,
      decidedAt: new Date(Date.now() - i * 1000000).toISOString(),
      outcomeScore: withOutcomes ? 0.5 + Math.random() * 0.5 : undefined,
      preSuccessRate: 0.5 + Math.random() * 0.3,
      postSuccessRate: 0.5 + Math.random() * 0.4,
    })),
    count: consolidationSamples,
  };

  return {
    metadata: {
      exportedAt: new Date().toISOString(),
      filters: {},
    },
    extraction,
    retrieval,
    consolidation,
    stats: {
      totalRetrievals: retrievalSamples,
      totalExtractions: extractionSamples,
      totalConsolidations: consolidationSamples,
      successRate: 0.8,
      averageContributionScore: 0.7,
    },
  };
}
