import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExtractionPolicy,
  RetrievalPolicy,
  ConsolidationPolicy,
} from '../../src/services/rl/index.js';
import type {
  ExtractionState,
  RetrievalState,
  ConsolidationState,
} from '../../src/services/rl/types.js';

describe('RL Policies', () => {
  describe('ExtractionPolicy', () => {
    let policy: ExtractionPolicy;

    beforeEach(() => {
      policy = new ExtractionPolicy({ enabled: true });
    });

    it('should create policy', () => {
      expect(policy).toBeInstanceOf(ExtractionPolicy);
      expect(policy.isEnabled()).toBe(false); // No model path
    });

    it('should be enabled with model path', () => {
      const policyWithModel = new ExtractionPolicy({
        enabled: true,
        modelPath: '/models/extraction.onnx',
      });

      expect(policyWithModel.isEnabled()).toBe(true);
    });

    it('should skip duplicate content', async () => {
      const state: ExtractionState = {
        contextFeatures: {
          turnNumber: 5,
          tokenCount: 100,
          toolCallCount: 0,
          hasError: false,
          userTurnCount: 3,
          assistantTurnCount: 2,
        },
        memoryState: {
          totalEntries: 50,
          recentExtractions: 2,
          similarEntryExists: true,
          sessionCaptureCount: 1,
        },
        contentFeatures: {
          hasDecision: false,
          hasRule: false,
          hasFact: false,
          hasCommand: false,
          noveltyScore: 0.8,
          complexity: 0.5,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.decision).toBe('skip');
      expect(decision.metadata?.reason).toBe('duplicate_content');
      expect(decision.confidence).toBeGreaterThan(0.8);
    });

    it('should store error content', async () => {
      const state: ExtractionState = {
        contextFeatures: {
          turnNumber: 5,
          tokenCount: 100,
          toolCallCount: 2,
          hasError: true,
          userTurnCount: 3,
          assistantTurnCount: 2,
        },
        memoryState: {
          totalEntries: 50,
          recentExtractions: 2,
          similarEntryExists: false,
          sessionCaptureCount: 1,
        },
        contentFeatures: {
          hasDecision: false,
          hasRule: false,
          hasFact: false,
          hasCommand: false,
          noveltyScore: 0.5,
          complexity: 0.5,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.decision).toBe('store');
      expect(decision.action.entryType).toBe('knowledge');
      expect(decision.action.priority).toBe(75);
      expect(decision.metadata?.reason).toBe('error_occurred');
    });

    it('should store guidelines with high priority', async () => {
      const state: ExtractionState = {
        contextFeatures: {
          turnNumber: 5,
          tokenCount: 100,
          toolCallCount: 0,
          hasError: false,
          userTurnCount: 3,
          assistantTurnCount: 2,
        },
        memoryState: {
          totalEntries: 50,
          recentExtractions: 2,
          similarEntryExists: false,
          sessionCaptureCount: 1,
        },
        contentFeatures: {
          hasDecision: false,
          hasRule: true,
          hasFact: false,
          hasCommand: false,
          noveltyScore: 0.8,
          complexity: 0.6,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.decision).toBe('store');
      expect(decision.action.entryType).toBe('guideline');
      expect(decision.action.priority).toBe(70);
      expect(decision.metadata?.reason).toBe('strong_content_signal');
    });

    it('should store commands as tools', async () => {
      const state: ExtractionState = {
        contextFeatures: {
          turnNumber: 5,
          tokenCount: 100,
          toolCallCount: 0,
          hasError: false,
          userTurnCount: 3,
          assistantTurnCount: 2,
        },
        memoryState: {
          totalEntries: 50,
          recentExtractions: 2,
          similarEntryExists: false,
          sessionCaptureCount: 1,
        },
        contentFeatures: {
          hasDecision: false,
          hasRule: false,
          hasFact: false,
          hasCommand: true,
          noveltyScore: 0.8,
          complexity: 0.6,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.decision).toBe('store');
      expect(decision.action.entryType).toBe('tool');
      expect(decision.action.priority).toBe(60);
    });

    it('should defer early conversation turns', async () => {
      const state: ExtractionState = {
        contextFeatures: {
          turnNumber: 2,
          tokenCount: 50,
          toolCallCount: 0,
          hasError: false,
          userTurnCount: 1,
          assistantTurnCount: 1,
        },
        memoryState: {
          totalEntries: 50,
          recentExtractions: 0,
          similarEntryExists: false,
          sessionCaptureCount: 0,
        },
        contentFeatures: {
          hasDecision: false,
          hasRule: false,
          hasFact: false,
          hasCommand: false,
          noveltyScore: 0.4,
          complexity: 0.3,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.decision).toBe('defer');
      expect(decision.metadata?.reason).toBe('early_conversation');
    });

    it('should store high novelty content', async () => {
      const state: ExtractionState = {
        contextFeatures: {
          turnNumber: 5,
          tokenCount: 200,
          toolCallCount: 0,
          hasError: false,
          userTurnCount: 3,
          assistantTurnCount: 2,
        },
        memoryState: {
          totalEntries: 50,
          recentExtractions: 2,
          similarEntryExists: false,
          sessionCaptureCount: 1,
        },
        contentFeatures: {
          hasDecision: false,
          hasRule: false,
          hasFact: true,
          hasCommand: false,
          noveltyScore: 0.9,
          complexity: 0.7,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.decision).toBe('store');
      expect(decision.action.entryType).toBe('knowledge');
      expect(decision.action.priority).toBeGreaterThan(80);
      expect(decision.metadata?.reason).toBe('high_novelty');
    });

    it('should skip when capture rate limit reached', async () => {
      const state: ExtractionState = {
        contextFeatures: {
          turnNumber: 10,
          tokenCount: 100,
          toolCallCount: 0,
          hasError: false,
          userTurnCount: 5,
          assistantTurnCount: 5,
        },
        memoryState: {
          totalEntries: 50,
          recentExtractions: 10,
          similarEntryExists: false,
          sessionCaptureCount: 6,
        },
        contentFeatures: {
          hasDecision: false,
          hasRule: false,
          hasFact: false,
          hasCommand: false,
          noveltyScore: 0.3,
          complexity: 0.4,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.decision).toBe('skip');
      expect(decision.metadata?.reason).toBe('capture_rate_limit');
    });

    it('should update config', () => {
      expect(policy.isEnabled()).toBe(false);

      policy.updateConfig({
        enabled: true,
        modelPath: '/models/extraction.onnx',
      });

      expect(policy.isEnabled()).toBe(true);
    });
  });

  describe('RetrievalPolicy', () => {
    let policy: RetrievalPolicy;

    beforeEach(() => {
      policy = new RetrievalPolicy({ enabled: true });
    });

    it('should create policy', () => {
      expect(policy).toBeInstanceOf(RetrievalPolicy);
    });

    it('should retrieve for complex queries with keywords', async () => {
      const state: RetrievalState = {
        queryFeatures: {
          queryLength: 100,
          hasKeywords: true,
          queryComplexity: 0.8,
          semanticCategory: 'technical',
        },
        contextFeatures: {
          turnNumber: 5,
          conversationDepth: 10,
          recentToolCalls: 2,
          hasErrors: false,
        },
        memoryStats: {
          totalEntries: 100,
          recentRetrievals: 5,
          avgRetrievalSuccess: 0.8,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.shouldRetrieve).toBe(true);
      expect(decision.action.scope).toBe('project');
      expect(decision.action.maxResults).toBe(20);
      expect(decision.metadata?.reason).toBe('complex_query_with_keywords');
      expect(decision.confidence).toBeGreaterThan(0.9);
    });

    it('should retrieve for error recovery', async () => {
      const state: RetrievalState = {
        queryFeatures: {
          queryLength: 50,
          hasKeywords: false,
          queryComplexity: 0.5,
          semanticCategory: 'unknown',
        },
        contextFeatures: {
          turnNumber: 3,
          conversationDepth: 5,
          recentToolCalls: 1,
          hasErrors: true,
        },
        memoryStats: {
          totalEntries: 100,
          recentRetrievals: 2,
          avgRetrievalSuccess: 0.6,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.shouldRetrieve).toBe(true);
      expect(decision.action.types).toContain('knowledge');
      expect(decision.action.types).toContain('tool');
      expect(decision.metadata?.reason).toBe('error_recovery');
    });

    it('should skip simple queries', async () => {
      const state: RetrievalState = {
        queryFeatures: {
          queryLength: 15,
          hasKeywords: false,
          queryComplexity: 0.2,
          semanticCategory: 'greeting',
        },
        contextFeatures: {
          turnNumber: 1,
          conversationDepth: 1,
          recentToolCalls: 0,
          hasErrors: false,
        },
        memoryStats: {
          totalEntries: 100,
          recentRetrievals: 0,
          avgRetrievalSuccess: 0.5,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.shouldRetrieve).toBe(false);
      expect(decision.metadata?.reason).toBe('simple_query');
    });

    it('should retrieve when recent retrievals were successful', async () => {
      const state: RetrievalState = {
        queryFeatures: {
          queryLength: 50,
          hasKeywords: false,
          queryComplexity: 0.5,
          semanticCategory: 'unknown',
        },
        contextFeatures: {
          turnNumber: 5,
          conversationDepth: 8,
          recentToolCalls: 1,
          hasErrors: false,
        },
        memoryStats: {
          totalEntries: 100,
          recentRetrievals: 3,
          avgRetrievalSuccess: 0.85,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.shouldRetrieve).toBe(true);
      expect(decision.metadata?.reason).toBe('recent_success');
    });

    it('should retrieve for deep conversations', async () => {
      const state: RetrievalState = {
        queryFeatures: {
          queryLength: 40,
          hasKeywords: false,
          queryComplexity: 0.4,
          semanticCategory: 'unknown',
        },
        contextFeatures: {
          turnNumber: 15,
          conversationDepth: 25,
          recentToolCalls: 0,
          hasErrors: false,
        },
        memoryStats: {
          totalEntries: 100,
          recentRetrievals: 5,
          avgRetrievalSuccess: 0.5,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.shouldRetrieve).toBe(true);
      expect(decision.metadata?.reason).toBe('deep_conversation');
    });

    it('should retrieve for tool-heavy conversations', async () => {
      const state: RetrievalState = {
        queryFeatures: {
          queryLength: 60,
          hasKeywords: false,
          queryComplexity: 0.5,
          semanticCategory: 'unknown',
        },
        contextFeatures: {
          turnNumber: 5,
          conversationDepth: 8,
          recentToolCalls: 5,
          hasErrors: false,
        },
        memoryStats: {
          totalEntries: 100,
          recentRetrievals: 2,
          avgRetrievalSuccess: 0.6,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.shouldRetrieve).toBe(true);
      expect(decision.action.types).toContain('tool');
      expect(decision.action.types).toContain('guideline');
      expect(decision.metadata?.reason).toBe('tool_heavy');
    });

    it('should skip when memory is empty', async () => {
      const state: RetrievalState = {
        queryFeatures: {
          queryLength: 50,
          hasKeywords: false,
          queryComplexity: 0.5,
          semanticCategory: 'unknown',
        },
        contextFeatures: {
          turnNumber: 3,
          conversationDepth: 5,
          recentToolCalls: 0,
          hasErrors: false,
        },
        memoryStats: {
          totalEntries: 0,
          recentRetrievals: 0,
          avgRetrievalSuccess: 0,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.shouldRetrieve).toBe(false);
      expect(decision.metadata?.reason).toBe('low_utility_memory');
    });

    it('should skip when memory has low utility', async () => {
      const state: RetrievalState = {
        queryFeatures: {
          queryLength: 50,
          hasKeywords: false,
          queryComplexity: 0.5,
          semanticCategory: 'unknown',
        },
        contextFeatures: {
          turnNumber: 10,
          conversationDepth: 5, // Must be <= 10 to avoid triggering 'deep_conversation' path first
          recentToolCalls: 1,
          hasErrors: false,
        },
        memoryStats: {
          totalEntries: 100,
          recentRetrievals: 10,
          avgRetrievalSuccess: 0.2,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.shouldRetrieve).toBe(false);
      expect(decision.metadata?.reason).toBe('low_utility_memory');
    });

    it('should default to retrieve with moderate scope', async () => {
      const state: RetrievalState = {
        queryFeatures: {
          queryLength: 50,
          hasKeywords: false,
          queryComplexity: 0.5,
          semanticCategory: 'unknown',
        },
        contextFeatures: {
          turnNumber: 5,
          conversationDepth: 8,
          recentToolCalls: 1,
          hasErrors: false,
        },
        memoryStats: {
          totalEntries: 50,
          recentRetrievals: 2,
          avgRetrievalSuccess: 0.5,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.shouldRetrieve).toBe(true);
      expect(decision.action.scope).toBe('project');
      expect(decision.action.maxResults).toBe(15);
      expect(decision.metadata?.reason).toBe('default_retrieve');
    });
  });

  describe('ConsolidationPolicy', () => {
    let policy: ConsolidationPolicy;

    beforeEach(() => {
      policy = new ConsolidationPolicy({ enabled: true });
    });

    it('should create policy', () => {
      expect(policy).toBeInstanceOf(ConsolidationPolicy);
    });

    it('should merge highly similar entries', async () => {
      const state: ConsolidationState = {
        groupFeatures: {
          groupSize: 3,
          avgSimilarity: 0.95,
          minSimilarity: 0.92,
          maxSimilarity: 0.98,
          entryTypes: ['knowledge', 'knowledge', 'knowledge'],
        },
        usageStats: {
          totalRetrievals: 10,
          avgRetrievalRank: 5,
          successRate: 0.7,
          lastAccessedDaysAgo: 2,
        },
        scopeStats: {
          scopeType: 'project',
          totalEntriesInScope: 100,
          duplicateRatio: 0.2,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.action).toBe('merge');
      expect(decision.metadata?.reason).toBe('similar_same_type');
    });

    it('should dedupe identical entries', async () => {
      const state: ConsolidationState = {
        groupFeatures: {
          groupSize: 2,
          avgSimilarity: 0.99,
          minSimilarity: 0.99,
          maxSimilarity: 0.99,
          entryTypes: ['knowledge', 'knowledge'],
        },
        usageStats: {
          totalRetrievals: 5,
          avgRetrievalRank: 8,
          successRate: 0.6,
          lastAccessedDaysAgo: 5,
        },
        scopeStats: {
          scopeType: 'project',
          totalEntriesInScope: 100,
          duplicateRatio: 0.15,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.action).toBe('dedupe');
      expect(decision.metadata?.reason).toBe('exact_duplicates');
    });

    it('should archive unused entries', async () => {
      const state: ConsolidationState = {
        groupFeatures: {
          groupSize: 1,
          avgSimilarity: 0,
          minSimilarity: 0,
          maxSimilarity: 0,
          entryTypes: ['knowledge'],
        },
        usageStats: {
          totalRetrievals: 0, // Must be 0 for 'unused_old_entries' path
          avgRetrievalRank: 20,
          successRate: 0.2,
          lastAccessedDaysAgo: 95,
        },
        scopeStats: {
          scopeType: 'project',
          totalEntriesInScope: 100,
          duplicateRatio: 0.1,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.action).toBe('archive');
      expect(decision.metadata?.reason).toBe('unused_old_entries');
    });

    it('should abstract large similar groups', async () => {
      const state: ConsolidationState = {
        groupFeatures: {
          groupSize: 8,
          avgSimilarity: 0.75,
          minSimilarity: 0.65,
          maxSimilarity: 0.85,
          entryTypes: ['knowledge', 'knowledge', 'knowledge', 'knowledge'],
        },
        usageStats: {
          totalRetrievals: 55, // Must be > 50 for 'pattern_abstraction' path
          avgRetrievalRank: 10,
          successRate: 0.8,
          lastAccessedDaysAgo: 3,
        },
        scopeStats: {
          scopeType: 'project',
          totalEntriesInScope: 100,
          duplicateRatio: 0.2, // Must be <= 0.3 to avoid 'reduce_duplicates' merge path
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.action).toBe('abstract');
      expect(decision.metadata?.reason).toBe('pattern_abstraction');
    });

    it('should keep valuable entries', async () => {
      const state: ConsolidationState = {
        groupFeatures: {
          groupSize: 1,
          avgSimilarity: 0,
          minSimilarity: 0,
          maxSimilarity: 0,
          entryTypes: ['guideline'],
        },
        usageStats: {
          totalRetrievals: 50,
          avgRetrievalRank: 2,
          successRate: 0.95,
          lastAccessedDaysAgo: 10, // Must be >= 7 to skip 'active_successful' path
        },
        scopeStats: {
          scopeType: 'project',
          totalEntriesInScope: 100,
          duplicateRatio: 0.05,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.action).toBe('keep');
      expect(decision.metadata?.reason).toBe('high_quality');
    });

    it('should keep diverse entries', async () => {
      const state: ConsolidationState = {
        groupFeatures: {
          groupSize: 3,
          avgSimilarity: 0.4,
          minSimilarity: 0.3,
          maxSimilarity: 0.5,
          entryTypes: ['knowledge', 'guideline', 'tool'],
        },
        usageStats: {
          totalRetrievals: 10,
          avgRetrievalRank: 8,
          successRate: 0.7,
          lastAccessedDaysAgo: 10,
        },
        scopeStats: {
          scopeType: 'project',
          totalEntriesInScope: 100,
          duplicateRatio: 0.1,
        },
      };

      const decision = await policy.decideWithFallback(state);

      expect(decision.action.action).toBe('keep');
      expect(decision.metadata?.reason).toBe('default_keep');
    });
  });
});
