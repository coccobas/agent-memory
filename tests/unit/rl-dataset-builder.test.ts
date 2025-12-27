/**
 * Unit tests for RL dataset builder
 *
 * Tests feature extraction and dataset construction for training data.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildExtractionDataset,
  buildRetrievalDataset,
  buildConsolidationDataset,
} from '../../src/services/rl/training/dataset-builder.js';
import { getFeedbackService } from '../../src/services/feedback/index.js';
import type { TrainingDataset } from '../../src/services/feedback/types.js';

// Mock the feedback service
vi.mock('../../src/services/feedback/index.js', () => ({
  getFeedbackService: vi.fn(),
}));

const mockGetFeedbackService = vi.mocked(getFeedbackService);

describe('RL Dataset Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildExtractionDataset', () => {
    it('should throw when feedback service not available', async () => {
      mockGetFeedbackService.mockReturnValue(null);

      await expect(buildExtractionDataset()).rejects.toThrow('feedback service');
    });

    it('should build dataset from extraction samples', async () => {
      const mockFeedbackService = {
        exportTrainingData: vi.fn().mockResolvedValue({
          extraction: {
            samples: [
              {
                decisionId: 'dec-1',
                sessionId: 'sess-1',
                turnNumber: 3,
                decision: 'store',
                entryType: 'knowledge',
                confidence: 0.8,
                outcomeScore: 0.9,
                retrievalCount: 5,
                successCount: 4,
              },
              {
                decisionId: 'dec-2',
                sessionId: 'sess-1',
                turnNumber: 5,
                decision: 'skip',
                entryType: 'guideline',
                confidence: 0.3,
                outcomeScore: -0.2,
                retrievalCount: 0,
              },
            ],
            count: 2,
          },
          retrieval: { samples: [], count: 0 },
          consolidation: { samples: [], count: 0 },
          metadata: { exportedAt: new Date().toISOString() },
          stats: {},
        } as unknown as TrainingDataset),
      };

      mockGetFeedbackService.mockReturnValue(mockFeedbackService as any);

      const result = await buildExtractionDataset();

      expect(result).toHaveProperty('train');
      expect(result).toHaveProperty('eval');
      expect(result).toHaveProperty('stats');
      expect(result.stats.totalExamples).toBe(2);
    });

    it('should compute context features from turn number', async () => {
      const mockFeedbackService = {
        exportTrainingData: vi.fn().mockResolvedValue({
          extraction: {
            samples: [
              {
                decisionId: 'dec-1',
                sessionId: 'sess-1',
                turnNumber: 4,
                decision: 'store',
                entryType: 'tool',
                confidence: 0.9,
                outcomeScore: 0.8,
              },
            ],
            count: 1,
          },
          retrieval: { samples: [], count: 0 },
          consolidation: { samples: [], count: 0 },
          metadata: { exportedAt: new Date().toISOString() },
          stats: {},
        } as unknown as TrainingDataset),
      };

      mockGetFeedbackService.mockReturnValue(mockFeedbackService as any);

      const result = await buildExtractionDataset();

      expect(result.train.length + result.eval.length).toBe(1);
      const example = result.train[0] || result.eval[0];

      // Verify context features were computed
      expect(example.state.contextFeatures.turnNumber).toBe(4);
      expect(example.state.contextFeatures.tokenCount).toBe(4 * 500); // 2000
      expect(example.state.contextFeatures.toolCallCount).toBe(Math.floor(4 * 2)); // 8

      // Tool type should have higher complexity
      expect(example.state.contentFeatures.complexity).toBe(0.7);
    });

    it('should filter by confidence threshold', async () => {
      const mockFeedbackService = {
        exportTrainingData: vi.fn().mockResolvedValue({
          extraction: {
            samples: [
              { decision: 'store', confidence: 0.9, outcomeScore: 0.8 },
              { decision: 'skip', confidence: 0.3, outcomeScore: 0.5 },
            ],
            count: 2,
          },
          retrieval: { samples: [], count: 0 },
          consolidation: { samples: [], count: 0 },
          metadata: { exportedAt: new Date().toISOString() },
          stats: {},
        } as unknown as TrainingDataset),
      };

      mockGetFeedbackService.mockReturnValue(mockFeedbackService as any);

      const result = await buildExtractionDataset({ minConfidence: 0.5 });

      // Should only include the high-confidence sample
      expect(result.stats.totalExamples).toBe(1);
    });
  });

  describe('buildRetrievalDataset', () => {
    it('should throw when feedback service not available', async () => {
      mockGetFeedbackService.mockReturnValue(null);

      await expect(buildRetrievalDataset()).rejects.toThrow('feedback service');
    });

    it('should build dataset from retrieval samples', async () => {
      const mockFeedbackService = {
        exportTrainingData: vi.fn().mockResolvedValue({
          extraction: { samples: [], count: 0 },
          retrieval: {
            samples: [
              {
                retrievalId: 'ret-1',
                sessionId: 'sess-1',
                queryText: 'how to fix authentication',
                entryType: 'knowledge',
                retrievalRank: 1,
                retrievedAt: new Date().toISOString(),
                contributionScore: 0.8,
              },
            ],
            count: 1,
          },
          consolidation: { samples: [], count: 0 },
          metadata: { exportedAt: new Date().toISOString() },
          stats: {},
        } as unknown as TrainingDataset),
      };

      mockGetFeedbackService.mockReturnValue(mockFeedbackService as any);

      const result = await buildRetrievalDataset();

      expect(result.stats.totalExamples).toBe(1);
      const example = result.train[0] || result.eval[0];

      // Verify query features
      expect(example.state.queryFeatures.hasKeywords).toBe(true);
      expect(example.state.queryFeatures.queryLength).toBeGreaterThan(0);
    });

    it('should classify query semantic category', async () => {
      const mockFeedbackService = {
        exportTrainingData: vi.fn().mockResolvedValue({
          extraction: { samples: [], count: 0 },
          retrieval: {
            samples: [
              {
                queryText: 'how to implement auth',
                entryType: 'knowledge',
                retrievedAt: new Date().toISOString(),
                contributionScore: 0.5,
              },
              {
                queryText: 'fix the error in login',
                entryType: 'knowledge',
                retrievedAt: new Date().toISOString(),
                contributionScore: 0.5,
              },
              {
                queryText: 'create new user endpoint',
                entryType: 'tool',
                retrievedAt: new Date().toISOString(),
                contributionScore: 0.5,
              },
            ],
            count: 3,
          },
          consolidation: { samples: [], count: 0 },
          metadata: { exportedAt: new Date().toISOString() },
          stats: {},
        } as unknown as TrainingDataset),
      };

      mockGetFeedbackService.mockReturnValue(mockFeedbackService as any);

      const result = await buildRetrievalDataset();

      // Verify semantic categories
      const examples = [...result.train, ...result.eval];
      const categories = examples.map((e) => e.state.queryFeatures.semanticCategory);

      expect(categories).toContain('question'); // "how to"
      expect(categories).toContain('debugging'); // "fix" and "error"
      expect(categories).toContain('creation'); // "create"
    });
  });

  describe('buildConsolidationDataset', () => {
    it('should throw when feedback service not available', async () => {
      mockGetFeedbackService.mockReturnValue(null);

      await expect(buildConsolidationDataset()).rejects.toThrow('feedback service');
    });

    it('should build dataset from consolidation samples', async () => {
      const mockFeedbackService = {
        exportTrainingData: vi.fn().mockResolvedValue({
          extraction: { samples: [], count: 0 },
          retrieval: { samples: [], count: 0 },
          consolidation: {
            samples: [
              {
                decisionId: 'cons-1',
                scopeType: 'project',
                action: 'merge',
                sourceEntryIds: ['entry-1', 'entry-2'],
                similarityScore: 0.85,
                decidedAt: new Date().toISOString(),
                preSuccessRate: 0.8,
                outcomeScore: 0.9,
              },
            ],
            count: 1,
          },
          metadata: { exportedAt: new Date().toISOString() },
          stats: {},
        } as unknown as TrainingDataset),
      };

      mockGetFeedbackService.mockReturnValue(mockFeedbackService as any);

      const result = await buildConsolidationDataset();

      expect(result.stats.totalExamples).toBe(1);
      const example = result.train[0] || result.eval[0];

      // Verify group features
      expect(example.state.groupFeatures.groupSize).toBe(2);
      expect(example.state.groupFeatures.avgSimilarity).toBe(0.85);
      expect(example.state.groupFeatures.entryTypes).toContain('knowledge');

      // Verify action
      expect(example.action.action).toBe('merge');
    });

    it('should compute days since decision for lastAccessedDaysAgo', async () => {
      // Use a date from 7 days ago
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const mockFeedbackService = {
        exportTrainingData: vi.fn().mockResolvedValue({
          extraction: { samples: [], count: 0 },
          retrieval: { samples: [], count: 0 },
          consolidation: {
            samples: [
              {
                decisionId: 'cons-1',
                scopeType: 'project',
                action: 'archive',
                sourceEntryIds: ['entry-1'],
                decidedAt: sevenDaysAgo.toISOString(),
                outcomeScore: 0.5,
              },
            ],
            count: 1,
          },
          metadata: { exportedAt: new Date().toISOString() },
          stats: {},
        } as unknown as TrainingDataset),
      };

      mockGetFeedbackService.mockReturnValue(mockFeedbackService as any);

      const result = await buildConsolidationDataset();
      const example = result.train[0] || result.eval[0];

      // Should be approximately 7 days
      expect(example.state.usageStats.lastAccessedDaysAgo).toBeGreaterThanOrEqual(6);
      expect(example.state.usageStats.lastAccessedDaysAgo).toBeLessThanOrEqual(8);
    });
  });

  describe('dataset splitting', () => {
    it('should split dataset according to evalSplit ratio', async () => {
      const mockFeedbackService = {
        exportTrainingData: vi.fn().mockResolvedValue({
          extraction: {
            samples: Array.from({ length: 100 }, (_, i) => ({
              decisionId: `dec-${i}`,
              decision: 'store',
              outcomeScore: 0.5 + Math.random() * 0.5,
            })),
            count: 100,
          },
          retrieval: { samples: [], count: 0 },
          consolidation: { samples: [], count: 0 },
          metadata: { exportedAt: new Date().toISOString() },
          stats: {},
        } as unknown as TrainingDataset),
      };

      mockGetFeedbackService.mockReturnValue(mockFeedbackService as any);

      const result = await buildExtractionDataset({ evalSplit: 0.2 });

      // Should be approximately 80/20 split
      expect(result.train.length).toBeGreaterThan(70);
      expect(result.train.length).toBeLessThan(90);
      expect(result.eval.length).toBeGreaterThan(10);
      expect(result.eval.length).toBeLessThan(30);
    });
  });
});
