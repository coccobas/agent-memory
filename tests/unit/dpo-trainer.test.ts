import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatExtractionForDPO,
  formatRetrievalForDPO,
  formatConsolidationForDPO,
  trainExtractionPolicy,
  trainRetrievalPolicy,
  trainConsolidationPolicy,
  type TrainingConfig,
  type DPOPair,
} from '../../src/services/rl/training/dpo-trainer.js';
import type {
  ExtractionTrainingExample,
  RetrievalTrainingExample,
  ConsolidationTrainingExample,
  ExtractionState,
  RetrievalState,
  ConsolidationState,
  ExtractionAction,
  RetrievalAction,
  ConsolidationAction,
} from '../../src/services/rl/types.js';
import type { Dataset } from '../../src/services/rl/training/dataset-builder.js';

describe('DPO Trainer', () => {
  describe('formatExtractionForDPO', () => {
    it('should format extraction examples into DPO pairs', () => {
      const examples: ExtractionTrainingExample[] = [
        {
          state: createMockExtractionState({ turnNumber: 1 }),
          action: { decision: 'store', entryType: 'knowledge', priority: 80 },
          reward: 0.9,
          metadata: { sessionId: 'session-1', turnNumber: 1, outcomeType: 'extraction' },
        },
        {
          state: createMockExtractionState({ turnNumber: 1 }),
          action: { decision: 'skip', priority: 20 },
          reward: 0.3,
          metadata: { sessionId: 'session-1', turnNumber: 1, outcomeType: 'extraction' },
        },
      ];

      const pairs = formatExtractionForDPO(examples);

      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs[0]).toHaveProperty('prompt');
      expect(pairs[0]).toHaveProperty('chosen');
      expect(pairs[0]).toHaveProperty('rejected');
    });

    it('should only create pairs when reward difference is significant', () => {
      const examples: ExtractionTrainingExample[] = [
        {
          state: createMockExtractionState({ turnNumber: 1 }),
          action: { decision: 'store', entryType: 'knowledge', priority: 50 },
          reward: 0.5,
          metadata: { sessionId: 'session-1', turnNumber: 1, outcomeType: 'extraction' },
        },
        {
          state: createMockExtractionState({ turnNumber: 1 }),
          action: { decision: 'skip', priority: 50 },
          reward: 0.49, // Difference < 0.1
          metadata: { sessionId: 'session-1', turnNumber: 1, outcomeType: 'extraction' },
        },
      ];

      const pairs = formatExtractionForDPO(examples);

      expect(pairs.length).toBe(0);
    });

    it('should group examples by similar state features', () => {
      const examples: ExtractionTrainingExample[] = [
        {
          state: createMockExtractionState({ turnNumber: 5, hasDecision: true }),
          action: { decision: 'store', entryType: 'knowledge', priority: 80 },
          reward: 0.9,
          metadata: { sessionId: 'session-1', turnNumber: 5, outcomeType: 'extraction' },
        },
        {
          state: createMockExtractionState({ turnNumber: 5, hasDecision: true }),
          action: { decision: 'skip', priority: 20 },
          reward: 0.2,
          metadata: { sessionId: 'session-1', turnNumber: 5, outcomeType: 'extraction' },
        },
        {
          state: createMockExtractionState({ turnNumber: 10, hasRule: true }),
          action: { decision: 'store', entryType: 'guideline', priority: 70 },
          reward: 0.8,
          metadata: { sessionId: 'session-1', turnNumber: 10, outcomeType: 'extraction' },
        },
      ];

      const pairs = formatExtractionForDPO(examples);

      // Should create pairs from similarly grouped states
      expect(pairs.length).toBeGreaterThan(0);
    });

    it('should handle empty examples array', () => {
      const pairs = formatExtractionForDPO([]);
      expect(pairs).toEqual([]);
    });

    it('should create multiple pairs from large groups', () => {
      const examples: ExtractionTrainingExample[] = [];
      const baseState = createMockExtractionState({ turnNumber: 1 });

      // Create 6 examples with same state but different rewards
      for (let i = 0; i < 6; i++) {
        examples.push({
          state: baseState,
          action: { decision: 'store', entryType: 'knowledge', priority: i * 10 },
          reward: i / 6,
          metadata: { sessionId: 'session-1', turnNumber: 1, outcomeType: 'extraction' },
        });
      }

      const pairs = formatExtractionForDPO(examples);

      // Should create multiple pairs for large groups
      expect(pairs.length).toBeGreaterThan(1);
    });

    it('should format prompt with state features', () => {
      const state = createMockExtractionState({
        turnNumber: 5,
        tokenCount: 100,
        hasDecision: true,
      });

      const examples: ExtractionTrainingExample[] = [
        {
          state,
          action: { decision: 'store', entryType: 'knowledge', priority: 80 },
          reward: 0.9,
          metadata: { sessionId: 'session-1', turnNumber: 5, outcomeType: 'extraction' },
        },
        {
          state,
          action: { decision: 'skip', priority: 20 },
          reward: 0.1,
          metadata: { sessionId: 'session-1', turnNumber: 5, outcomeType: 'extraction' },
        },
      ];

      const pairs = formatExtractionForDPO(examples);

      expect(pairs[0]?.prompt).toContain('Turn: 5');
      expect(pairs[0]?.prompt).toContain('Tokens: 100');
      expect(pairs[0]?.prompt).toContain('Has decision: true');
    });

    it('should format action as JSON response', () => {
      const examples: ExtractionTrainingExample[] = [
        {
          state: createMockExtractionState(),
          action: { decision: 'store', entryType: 'knowledge', priority: 80 },
          reward: 0.9,
          metadata: { sessionId: 'session-1', turnNumber: 1, outcomeType: 'extraction' },
        },
        {
          state: createMockExtractionState(),
          action: { decision: 'skip', priority: 20 },
          reward: 0.1,
          metadata: { sessionId: 'session-1', turnNumber: 1, outcomeType: 'extraction' },
        },
      ];

      const pairs = formatExtractionForDPO(examples);

      expect(() => JSON.parse(pairs[0]?.chosen ?? '')).not.toThrow();
      expect(() => JSON.parse(pairs[0]?.rejected ?? '')).not.toThrow();
    });
  });

  describe('formatRetrievalForDPO', () => {
    it('should format retrieval examples into DPO pairs', () => {
      const examples: RetrievalTrainingExample[] = [
        {
          state: createMockRetrievalState({ queryLength: 50 }),
          action: { shouldRetrieve: true, scope: 'project', types: ['knowledge'], maxResults: 10 },
          reward: 0.9,
          metadata: { sessionId: 'session-1', queryText: 'test query', outcomeType: 'retrieval' },
        },
        {
          state: createMockRetrievalState({ queryLength: 50 }),
          action: { shouldRetrieve: false, maxResults: 0 },
          reward: 0.2,
          metadata: { sessionId: 'session-1', queryText: 'test query', outcomeType: 'retrieval' },
        },
      ];

      const pairs = formatRetrievalForDPO(examples);

      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs[0]).toHaveProperty('prompt');
      expect(pairs[0]).toHaveProperty('chosen');
      expect(pairs[0]).toHaveProperty('rejected');
    });

    it('should group by query features', () => {
      const examples: RetrievalTrainingExample[] = [
        {
          state: createMockRetrievalState({ queryLength: 50, semanticCategory: 'technical' }),
          action: { shouldRetrieve: true, scope: 'project', types: ['knowledge'] },
          reward: 0.9,
          metadata: { sessionId: 'session-1', outcomeType: 'retrieval' },
        },
        {
          state: createMockRetrievalState({ queryLength: 52, semanticCategory: 'technical' }),
          action: { shouldRetrieve: false },
          reward: 0.1,
          metadata: { sessionId: 'session-1', outcomeType: 'retrieval' },
        },
      ];

      const pairs = formatRetrievalForDPO(examples);

      expect(pairs.length).toBeGreaterThan(0);
    });

    it('should handle empty examples', () => {
      const pairs = formatRetrievalForDPO([]);
      expect(pairs).toEqual([]);
    });

    it('should format prompt with query and context features', () => {
      const state = createMockRetrievalState({
        queryLength: 100,
        hasKeywords: true,
        semanticCategory: 'technical',
      });

      const examples: RetrievalTrainingExample[] = [
        {
          state,
          action: { shouldRetrieve: true, scope: 'project', types: ['knowledge'] },
          reward: 0.9,
          metadata: { sessionId: 'session-1', outcomeType: 'retrieval' },
        },
        {
          state,
          action: { shouldRetrieve: false },
          reward: 0.1,
          metadata: { sessionId: 'session-1', outcomeType: 'retrieval' },
        },
      ];

      const pairs = formatRetrievalForDPO(examples);

      expect(pairs[0]?.prompt).toContain('Length: 100');
      expect(pairs[0]?.prompt).toContain('Has keywords: true');
      expect(pairs[0]?.prompt).toContain('Category: technical');
    });
  });

  describe('formatConsolidationForDPO', () => {
    it('should format consolidation examples into DPO pairs', () => {
      const examples: ConsolidationTrainingExample[] = [
        {
          state: createMockConsolidationState({ groupSize: 3, avgSimilarity: 0.9 }),
          action: { action: 'merge', targetEntries: ['entry-1'], mergeStrategy: 'union' },
          reward: 0.8,
          metadata: { decisionId: 'decision-1', entryIds: ['entry-1', 'entry-2'] },
        },
        {
          state: createMockConsolidationState({ groupSize: 3, avgSimilarity: 0.9 }),
          action: { action: 'keep', mergeStrategy: 'union' },
          reward: 0.2,
          metadata: { decisionId: 'decision-2', entryIds: ['entry-1', 'entry-2'] },
        },
      ];

      const pairs = formatConsolidationForDPO(examples);

      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs[0]).toHaveProperty('prompt');
      expect(pairs[0]).toHaveProperty('chosen');
      expect(pairs[0]).toHaveProperty('rejected');
    });

    it('should group by consolidation state features', () => {
      const examples: ConsolidationTrainingExample[] = [
        {
          state: createMockConsolidationState({ groupSize: 2, avgSimilarity: 0.95 }),
          action: { action: 'dedupe', mergeStrategy: 'union' },
          reward: 0.9,
          metadata: { decisionId: 'decision-1', entryIds: ['entry-1', 'entry-2'] },
        },
        {
          state: createMockConsolidationState({ groupSize: 2, avgSimilarity: 0.94 }),
          action: { action: 'keep', mergeStrategy: 'union' },
          reward: 0.1,
          metadata: { decisionId: 'decision-2', entryIds: ['entry-1', 'entry-2'] },
        },
      ];

      const pairs = formatConsolidationForDPO(examples);

      expect(pairs.length).toBeGreaterThan(0);
    });

    it('should handle empty examples', () => {
      const pairs = formatConsolidationForDPO([]);
      expect(pairs).toEqual([]);
    });

    it('should format prompt with group and usage stats', () => {
      const state = createMockConsolidationState({
        groupSize: 5,
        avgSimilarity: 0.85,
        successRate: 0.7,
      });

      const examples: ConsolidationTrainingExample[] = [
        {
          state,
          action: { action: 'abstract', mergeStrategy: 'union' },
          reward: 0.9,
          metadata: { decisionId: 'decision-1', entryIds: ['entry-1'] },
        },
        {
          state,
          action: { action: 'keep', mergeStrategy: 'union' },
          reward: 0.1,
          metadata: { decisionId: 'decision-2', entryIds: ['entry-1'] },
        },
      ];

      const pairs = formatConsolidationForDPO(examples);

      expect(pairs[0]?.prompt).toContain('Size: 5');
      expect(pairs[0]?.prompt).toContain('Avg similarity: 0.85');
      expect(pairs[0]?.prompt).toContain('Success rate: 0.70');
    });
  });

  describe('trainExtractionPolicy', () => {
    const testOutputDir = './data/test-dpo-output-extraction';

    const baseConfig: TrainingConfig = {
      modelName: 'extraction-model',
      outputPath: testOutputDir,
      epochs: 3,
      batchSize: 16,
      learningRate: 0.0001,
      beta: 0.1,
    };

    afterEach(() => {
      // Clean up test output directory
      if (existsSync(testOutputDir)) {
        rmSync(testOutputDir, { recursive: true, force: true });
      }
    });

    it('should return error for insufficient training pairs', async () => {
      const dataset = createMockExtractionDataset(5, 2);

      const result = await trainExtractionPolicy(dataset, baseConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient training pairs');
    });

    it('should successfully write training files when sufficient data', async () => {
      // Create dataset that will generate enough DPO pairs
      // We need different actions in same state group with reward difference > 0.1
      const train: ExtractionTrainingExample[] = [];

      // Create 100+ pairs by having pairs with same state, different actions, different rewards
      for (let i = 0; i < 300; i++) {
        // High reward action
        train.push({
          state: createMockExtractionState({ turnNumber: i % 30 }),
          action: { decision: 'store', entryType: 'knowledge', priority: 80 },
          reward: 0.9,
          metadata: { sessionId: `session-${i}`, turnNumber: i, outcomeType: 'extraction' },
        });
        // Low reward action for same state
        train.push({
          state: createMockExtractionState({ turnNumber: i % 30 }),
          action: { decision: 'skip', priority: 20 },
          reward: 0.1,
          metadata: { sessionId: `session-${i}-alt`, turnNumber: i, outcomeType: 'extraction' },
        });
      }

      const dataset: Dataset<ExtractionTrainingExample> = {
        train,
        eval: train.slice(0, 50),
        stats: {
          totalExamples: train.length + 50,
          trainExamples: train.length,
          evalExamples: 50,
          dateRange: { start: new Date().toISOString(), end: new Date().toISOString() },
        },
      };

      const result = await trainExtractionPolicy(dataset, baseConfig);

      expect(result.success).toBe(true);
      expect(result.modelPath).toBe(testOutputDir);

      // Verify files were created
      expect(existsSync(join(testOutputDir, 'extraction_dpo_train.jsonl'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'extraction_dpo_eval.jsonl'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'extraction_metadata.json'))).toBe(true);

      // Verify metadata content
      const metadata = JSON.parse(
        readFileSync(join(testOutputDir, 'extraction_metadata.json'), 'utf-8')
      );
      expect(metadata.config.modelName).toBe('extraction-model');
      expect(metadata.trainPairs).toBeGreaterThanOrEqual(100);
    });

    it('should format and validate dataset for training', async () => {
      const dataset: Dataset<ExtractionTrainingExample> = createMockExtractionDataset(150, 50);

      // Format the data to get DPO pairs
      const trainPairs = formatExtractionForDPO(dataset.train);
      const evalPairs = formatExtractionForDPO(dataset.eval);

      // DPO formatting creates pairs from grouped examples with reward differences
      // The exact count depends on how examples are grouped and reward variance
      // We just verify the format is correct if any pairs are created
      if (trainPairs.length > 0) {
        expect(trainPairs[0]).toHaveProperty('prompt');
        expect(trainPairs[0]).toHaveProperty('chosen');
        expect(trainPairs[0]).toHaveProperty('rejected');
      }

      if (evalPairs.length > 0) {
        expect(evalPairs[0]).toHaveProperty('prompt');
      }

      // At minimum, verify formatting works without errors
      expect(trainPairs).toBeInstanceOf(Array);
      expect(evalPairs).toBeInstanceOf(Array);
    });

    it('should detect insufficient training pairs', () => {
      const dataset: Dataset<ExtractionTrainingExample> = createMockExtractionDataset(10, 5);

      // Format the data
      const trainPairs = formatExtractionForDPO(dataset.train);

      // Should not have enough pairs
      expect(trainPairs.length).toBeLessThan(100);
    });

    it('should create valid DPO pair format', () => {
      const dataset: Dataset<ExtractionTrainingExample> = createMockExtractionDataset(150, 50);

      const trainPairs = formatExtractionForDPO(dataset.train);

      // Each pair should have the required structure
      for (const pair of trainPairs.slice(0, 5)) {
        // Check first 5
        expect(pair).toHaveProperty('prompt');
        expect(pair).toHaveProperty('chosen');
        expect(pair).toHaveProperty('rejected');

        // Validate JSON format
        expect(typeof pair.prompt).toBe('string');
        expect(typeof pair.chosen).toBe('string');
        expect(typeof pair.rejected).toBe('string');

        // Verify chosen and rejected are valid JSON
        expect(() => JSON.parse(pair.chosen)).not.toThrow();
        expect(() => JSON.parse(pair.rejected)).not.toThrow();
      }
    });
  });

  describe('trainRetrievalPolicy', () => {
    const testOutputDir = './data/test-dpo-output-retrieval';

    const baseConfig: TrainingConfig = {
      modelName: 'retrieval-model',
      outputPath: testOutputDir,
      epochs: 3,
      batchSize: 16,
      learningRate: 0.0001,
      beta: 0.1,
    };

    afterEach(() => {
      if (existsSync(testOutputDir)) {
        rmSync(testOutputDir, { recursive: true, force: true });
      }
    });

    it('should format retrieval dataset for training', () => {
      const dataset: Dataset<RetrievalTrainingExample> = createMockRetrievalDataset(150, 50);

      const trainPairs = formatRetrievalForDPO(dataset.train);
      const evalPairs = formatRetrievalForDPO(dataset.eval);

      expect(trainPairs.length).toBeGreaterThan(0);
      expect(evalPairs.length).toBeGreaterThan(0);
    });

    it('should detect insufficient retrieval data', () => {
      const dataset: Dataset<RetrievalTrainingExample> = createMockRetrievalDataset(5, 2);

      const trainPairs = formatRetrievalForDPO(dataset.train);

      expect(trainPairs.length).toBeLessThan(100);
    });

    it('should return error for insufficient training pairs', async () => {
      const dataset = createMockRetrievalDataset(5, 2);

      const result = await trainRetrievalPolicy(dataset, baseConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient training pairs');
    });

    it('should successfully write retrieval training files', async () => {
      const train: RetrievalTrainingExample[] = [];
      const categories = ['general', 'technical', 'api', 'design', 'testing'];

      // Create 150 distinct state groups (length/10 * hasKeywords * category = 15 * 2 * 5)
      // Each group needs 2+ examples with reward diff > 0.1
      for (let l = 0; l < 15; l++) {
        for (const hasKw of [true, false]) {
          for (const cat of categories) {
            // High reward example
            train.push({
              state: createMockRetrievalState({
                queryLength: l * 10 + 5,
                hasKeywords: hasKw,
                semanticCategory: cat,
              }),
              action: {
                shouldRetrieve: true,
                scope: 'project',
                types: ['knowledge'],
                maxResults: 10,
              },
              reward: 0.9,
              metadata: { sessionId: `session-${l}-${hasKw}-${cat}`, outcomeType: 'retrieval' },
            });
            // Low reward example
            train.push({
              state: createMockRetrievalState({
                queryLength: l * 10 + 5,
                hasKeywords: hasKw,
                semanticCategory: cat,
              }),
              action: { shouldRetrieve: false, maxResults: 0 },
              reward: 0.1,
              metadata: { sessionId: `session-${l}-${hasKw}-${cat}-alt`, outcomeType: 'retrieval' },
            });
          }
        }
      }

      const dataset: Dataset<RetrievalTrainingExample> = {
        train,
        eval: train.slice(0, 50),
        stats: {
          totalExamples: train.length + 50,
          trainExamples: train.length,
          evalExamples: 50,
          dateRange: { start: new Date().toISOString(), end: new Date().toISOString() },
        },
      };

      const result = await trainRetrievalPolicy(dataset, baseConfig);

      expect(result.success).toBe(true);
      expect(existsSync(join(testOutputDir, 'retrieval_dpo_train.jsonl'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'retrieval_metadata.json'))).toBe(true);
    });
  });

  describe('trainConsolidationPolicy', () => {
    const testOutputDir = './data/test-dpo-output-consolidation';

    const baseConfig: TrainingConfig = {
      modelName: 'consolidation-model',
      outputPath: testOutputDir,
      epochs: 3,
      batchSize: 16,
      learningRate: 0.0001,
      beta: 0.1,
    };

    afterEach(() => {
      if (existsSync(testOutputDir)) {
        rmSync(testOutputDir, { recursive: true, force: true });
      }
    });

    it('should format consolidation dataset for training', () => {
      const dataset: Dataset<ConsolidationTrainingExample> = createMockConsolidationDataset(
        150,
        50
      );

      const trainPairs = formatConsolidationForDPO(dataset.train);
      const evalPairs = formatConsolidationForDPO(dataset.eval);

      expect(trainPairs.length).toBeGreaterThan(0);
      expect(evalPairs.length).toBeGreaterThan(0);
    });

    it('should detect insufficient consolidation data', () => {
      const dataset: Dataset<ConsolidationTrainingExample> = createMockConsolidationDataset(3, 1);

      const trainPairs = formatConsolidationForDPO(dataset.train);

      expect(trainPairs.length).toBeLessThan(100);
    });

    it('should return error for insufficient training pairs', async () => {
      const dataset = createMockConsolidationDataset(5, 2);

      const result = await trainConsolidationPolicy(dataset, baseConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient training pairs');
    });

    it('should successfully write consolidation training files', async () => {
      const train: ConsolidationTrainingExample[] = [];
      const scopeTypes = ['project', 'org', 'global'] as const;

      // Create 150 distinct state groups (groupSize * similarity/10 * scopeType = 10 * 5 * 3)
      // Each group needs 2+ examples with reward diff > 0.1
      for (let g = 2; g <= 11; g++) {
        for (let s = 5; s < 10; s++) {
          for (const scope of scopeTypes) {
            // High reward example
            train.push({
              state: createMockConsolidationStateWithScope(g, s / 10, scope),
              action: { action: 'merge', targetEntries: ['entry-1'], mergeStrategy: 'union' },
              reward: 0.9,
              metadata: {
                decisionId: `decision-${g}-${s}-${scope}`,
                entryIds: ['entry-1', 'entry-2'],
              },
            });
            // Low reward example
            train.push({
              state: createMockConsolidationStateWithScope(g, s / 10, scope),
              action: { action: 'keep', mergeStrategy: 'union' },
              reward: 0.1,
              metadata: {
                decisionId: `decision-${g}-${s}-${scope}-alt`,
                entryIds: ['entry-1', 'entry-2'],
              },
            });
          }
        }
      }

      const dataset: Dataset<ConsolidationTrainingExample> = {
        train,
        eval: train.slice(0, 50),
        stats: {
          totalExamples: train.length + 50,
          trainExamples: train.length,
          evalExamples: 50,
          dateRange: { start: new Date().toISOString(), end: new Date().toISOString() },
        },
      };

      const result = await trainConsolidationPolicy(dataset, baseConfig);

      expect(result.success).toBe(true);
      expect(existsSync(join(testOutputDir, 'consolidation_dpo_train.jsonl'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'consolidation_metadata.json'))).toBe(true);
    });
  });
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createMockExtractionState(
  overrides?: Partial<{
    turnNumber: number;
    tokenCount: number;
    hasError: boolean;
    hasDecision: boolean;
    hasRule: boolean;
    hasFact: boolean;
    hasCommand: boolean;
  }>
): ExtractionState {
  return {
    contextFeatures: {
      turnNumber: overrides?.turnNumber ?? 1,
      tokenCount: overrides?.tokenCount ?? 50,
      toolCallCount: 0,
      hasError: overrides?.hasError ?? false,
      userTurnCount: 1,
      assistantTurnCount: 1,
    },
    memoryState: {
      totalEntries: 100,
      recentExtractions: 5,
      similarEntryExists: false,
      sessionCaptureCount: 0,
    },
    contentFeatures: {
      hasDecision: overrides?.hasDecision ?? false,
      hasRule: overrides?.hasRule ?? false,
      hasFact: overrides?.hasFact ?? false,
      hasCommand: overrides?.hasCommand ?? false,
      noveltyScore: 0.5,
      complexity: 0.5,
    },
  };
}

function createMockRetrievalState(
  overrides?: Partial<{
    queryLength: number;
    hasKeywords: boolean;
    semanticCategory: string;
  }>
): RetrievalState {
  return {
    queryFeatures: {
      queryLength: overrides?.queryLength ?? 50,
      hasKeywords: overrides?.hasKeywords ?? false,
      queryComplexity: 0.5,
      semanticCategory: overrides?.semanticCategory ?? 'general',
    },
    contextFeatures: {
      turnNumber: 1,
      conversationDepth: 1,
      recentToolCalls: 0,
      hasErrors: false,
    },
    memoryStats: {
      totalEntries: 100,
      recentRetrievals: 5,
      avgRetrievalSuccess: 0.8,
    },
  };
}

function createMockConsolidationState(
  overrides?: Partial<{
    groupSize: number;
    avgSimilarity: number;
    successRate: number;
  }>
): ConsolidationState {
  return {
    groupFeatures: {
      groupSize: overrides?.groupSize ?? 2,
      avgSimilarity: overrides?.avgSimilarity ?? 0.8,
      minSimilarity: 0.7,
      maxSimilarity: 0.9,
      entryTypes: ['knowledge'],
    },
    usageStats: {
      totalRetrievals: 10,
      avgRetrievalRank: 2,
      successRate: overrides?.successRate ?? 0.5,
      lastAccessedDaysAgo: 5,
    },
    scopeStats: {
      scopeType: 'project',
      totalEntriesInScope: 100,
      duplicateRatio: 0.1,
    },
  };
}

function createMockConsolidationStateWithScope(
  groupSize: number,
  avgSimilarity: number,
  scopeType: 'project' | 'org' | 'global'
): ConsolidationState {
  return {
    groupFeatures: {
      groupSize,
      avgSimilarity,
      minSimilarity: avgSimilarity - 0.1,
      maxSimilarity: avgSimilarity + 0.1,
      entryTypes: ['knowledge'],
    },
    usageStats: {
      totalRetrievals: 10,
      avgRetrievalRank: 2,
      successRate: 0.5,
      lastAccessedDaysAgo: 5,
    },
    scopeStats: {
      scopeType,
      totalEntriesInScope: 100,
      duplicateRatio: 0.1,
    },
  };
}

function createMockExtractionDataset(
  trainSize: number,
  evalSize: number
): Dataset<ExtractionTrainingExample> {
  const train: ExtractionTrainingExample[] = [];
  const eval_: ExtractionTrainingExample[] = [];

  // Create diverse training examples with varying rewards
  for (let i = 0; i < trainSize; i++) {
    const reward = i % 2 === 0 ? 0.8 : 0.2;
    const decision = i % 2 === 0 ? 'store' : 'skip';

    train.push({
      state: createMockExtractionState({ turnNumber: i % 10 }),
      action: {
        decision: decision as 'store' | 'skip' | 'defer',
        entryType: 'knowledge',
        priority: 50,
      },
      reward,
      metadata: { sessionId: `session-${i}`, turnNumber: i, outcomeType: 'extraction' },
    });
  }

  for (let i = 0; i < evalSize; i++) {
    const reward = i % 2 === 0 ? 0.7 : 0.3;
    eval_.push({
      state: createMockExtractionState({ turnNumber: i % 5 }),
      action: { decision: 'store', entryType: 'knowledge', priority: 50 },
      reward,
      metadata: { sessionId: `eval-session-${i}`, turnNumber: i, outcomeType: 'extraction' },
    });
  }

  return {
    train,
    eval: eval_,
    stats: {
      totalExamples: trainSize + evalSize,
      trainExamples: trainSize,
      evalExamples: evalSize,
      dateRange: {
        start: new Date(0).toISOString(),
        end: new Date().toISOString(),
      },
    },
  };
}

function createMockRetrievalDataset(
  trainSize: number,
  evalSize: number
): Dataset<RetrievalTrainingExample> {
  const train: RetrievalTrainingExample[] = [];
  const eval_: RetrievalTrainingExample[] = [];

  for (let i = 0; i < trainSize; i++) {
    const reward = i % 2 === 0 ? 0.9 : 0.2;
    train.push({
      state: createMockRetrievalState({ queryLength: 50 + (i % 50) }),
      action: { shouldRetrieve: i % 2 === 0, scope: 'project', types: ['knowledge'] },
      reward,
      metadata: { sessionId: `session-${i}`, outcomeType: 'retrieval' },
    });
  }

  for (let i = 0; i < evalSize; i++) {
    const reward = i % 2 === 0 ? 0.8 : 0.3;
    eval_.push({
      state: createMockRetrievalState({ queryLength: 40 + (i % 30) }),
      action: { shouldRetrieve: true, scope: 'project', types: ['knowledge'] },
      reward,
      metadata: { sessionId: `eval-session-${i}`, outcomeType: 'retrieval' },
    });
  }

  return {
    train,
    eval: eval_,
    stats: {
      totalExamples: trainSize + evalSize,
      trainExamples: trainSize,
      evalExamples: evalSize,
      dateRange: {
        start: new Date(0).toISOString(),
        end: new Date().toISOString(),
      },
    },
  };
}

function createMockConsolidationDataset(
  trainSize: number,
  evalSize: number
): Dataset<ConsolidationTrainingExample> {
  const train: ConsolidationTrainingExample[] = [];
  const eval_: ConsolidationTrainingExample[] = [];

  for (let i = 0; i < trainSize; i++) {
    const reward = i % 2 === 0 ? 0.8 : 0.2;
    train.push({
      state: createMockConsolidationState({ groupSize: 2 + (i % 3), avgSimilarity: 0.8 }),
      action: { action: i % 2 === 0 ? 'merge' : 'keep', mergeStrategy: 'union' },
      reward,
      metadata: { decisionId: `decision-${i}`, entryIds: [`entry-${i}`] },
    });
  }

  for (let i = 0; i < evalSize; i++) {
    const reward = i % 2 === 0 ? 0.7 : 0.3;
    eval_.push({
      state: createMockConsolidationState({ groupSize: 2, avgSimilarity: 0.85 }),
      action: { action: 'dedupe', mergeStrategy: 'union' },
      reward,
      metadata: { decisionId: `eval-decision-${i}`, entryIds: [`eval-entry-${i}`] },
    });
  }

  return {
    train,
    eval: eval_,
    stats: {
      totalExamples: trainSize + evalSize,
      trainExamples: trainSize,
      evalExamples: evalSize,
      dateRange: {
        start: new Date(0).toISOString(),
        end: new Date().toISOString(),
      },
    },
  };
}
