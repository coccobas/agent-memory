import { describe, it, expect } from 'vitest';
import {
  buildExtractionState,
  type ExtractionStateParams,
} from '../../src/services/rl/state/extraction.state.js';
import {
  buildRetrievalState,
  type RetrievalStateParams,
} from '../../src/services/rl/state/retrieval.state.js';
import {
  buildConsolidationState,
  type ConsolidationStateParams,
} from '../../src/services/rl/state/consolidation.state.js';
import type { TurnData, TurnMetrics } from '../../src/services/capture/types.js';

describe('RL State Builders', () => {
  describe('buildExtractionState', () => {
    it('should build state from conversation context', () => {
      const turns: TurnData[] = [
        {
          role: 'user',
          content: 'How do I configure the system?',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: 'You should always use environment variables for configuration.',
          timestamp: new Date().toISOString(),
        },
      ];

      const metrics: TurnMetrics = {
        turnCount: 2,
        totalTokens: 150,
        toolCallCount: 0,
        errorCount: 0,
        userTurnCount: 1,
        assistantTurnCount: 1,
      };

      const params: ExtractionStateParams = {
        turns,
        metrics,
        memoryContext: {
          totalEntries: 100,
          recentExtractions: 5,
          sessionCaptureCount: 2,
        },
      };

      const state = buildExtractionState(params);

      expect(state.contextFeatures.turnNumber).toBe(2);
      expect(state.contextFeatures.tokenCount).toBe(150);
      expect(state.contextFeatures.hasError).toBe(false);
      expect(state.memoryState.totalEntries).toBe(100);
      expect(state.memoryState.sessionCaptureCount).toBe(2);
      expect(state.contentFeatures.hasRule).toBe(true);
    });

    it('should detect decision content', () => {
      const turns: TurnData[] = [
        {
          role: 'user',
          content: 'Why did you choose that approach?',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: 'We decided to use Redis because of better performance.',
          timestamp: new Date().toISOString(),
        },
      ];

      const metrics: TurnMetrics = {
        turnCount: 2,
        totalTokens: 100,
        toolCallCount: 0,
        errorCount: 0,
        userTurnCount: 1,
        assistantTurnCount: 1,
      };

      const params: ExtractionStateParams = {
        turns,
        metrics,
        memoryContext: {
          totalEntries: 50,
          recentExtractions: 1,
          sessionCaptureCount: 0,
        },
      };

      const state = buildExtractionState(params);

      expect(state.contentFeatures.hasDecision).toBe(true);
    });

    it('should detect command content', () => {
      const turns: TurnData[] = [
        {
          role: 'user',
          content: 'How do I run tests?',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: 'Run `npm test` to execute the test suite.',
          timestamp: new Date().toISOString(),
        },
      ];

      const metrics: TurnMetrics = {
        turnCount: 2,
        totalTokens: 80,
        toolCallCount: 0,
        errorCount: 0,
        userTurnCount: 1,
        assistantTurnCount: 1,
      };

      const params: ExtractionStateParams = {
        turns,
        metrics,
        memoryContext: {
          totalEntries: 50,
          recentExtractions: 1,
          sessionCaptureCount: 0,
        },
      };

      const state = buildExtractionState(params);

      expect(state.contentFeatures.hasCommand).toBe(true);
    });

    it('should detect similar entries', () => {
      const turns: TurnData[] = [
        {
          role: 'user',
          content: 'Test',
          timestamp: new Date().toISOString(),
        },
      ];

      const metrics: TurnMetrics = {
        turnCount: 1,
        totalTokens: 50,
        toolCallCount: 0,
        errorCount: 0,
        userTurnCount: 1,
        assistantTurnCount: 0,
      };

      const params: ExtractionStateParams = {
        turns,
        metrics,
        memoryContext: {
          totalEntries: 50,
          recentExtractions: 1,
          sessionCaptureCount: 0,
        },
        similarityCheck: {
          hasSimilar: true,
          maxSimilarity: 0.95,
        },
      };

      const state = buildExtractionState(params);

      expect(state.memoryState.similarEntryExists).toBe(true);
    });

    it('should compute complexity from content', () => {
      const longComplexContent = `
        This is a complex explanation with multiple sentences.
        It includes technical terms like AsyncFunction and Promise.
        The implementation uses async/await patterns for better code clarity.
        Here's a function example: async function test() { return await fetch(); }
      `;

      const turns: TurnData[] = [
        {
          role: 'assistant',
          content: longComplexContent,
          timestamp: new Date().toISOString(),
        },
      ];

      const metrics: TurnMetrics = {
        turnCount: 1,
        totalTokens: 200,
        toolCallCount: 0,
        errorCount: 0,
        userTurnCount: 0,
        assistantTurnCount: 1,
      };

      const params: ExtractionStateParams = {
        turns,
        metrics,
        memoryContext: {
          totalEntries: 50,
          recentExtractions: 1,
          sessionCaptureCount: 0,
        },
      };

      const state = buildExtractionState(params);

      expect(state.contentFeatures.complexity).toBeGreaterThanOrEqual(0.5);
    });

    it('should compute novelty from content', () => {
      const novelContent = `
        This is a detailed technical explanation with CamelCase identifiers.
        It includes code blocks:
        \`\`\`typescript
        interface Config {
          apiKey: string;
        }
        \`\`\`
        The system uses advanced patterns for optimization.
      `;

      const turns: TurnData[] = [
        {
          role: 'assistant',
          content: novelContent,
          timestamp: new Date().toISOString(),
        },
      ];

      const metrics: TurnMetrics = {
        turnCount: 1,
        totalTokens: 300,
        toolCallCount: 0,
        errorCount: 0,
        userTurnCount: 0,
        assistantTurnCount: 1,
      };

      const params: ExtractionStateParams = {
        turns,
        metrics,
        memoryContext: {
          totalEntries: 50,
          recentExtractions: 1,
          sessionCaptureCount: 0,
        },
      };

      const state = buildExtractionState(params);

      expect(state.contentFeatures.noveltyScore).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('buildRetrievalState', () => {
    it('should build state from query context', () => {
      const params: RetrievalStateParams = {
        queryText: 'How does the authentication system work?',
        conversationContext: {
          turnNumber: 5,
          conversationDepth: 10,
          recentToolCalls: 2,
          hasErrors: false,
        },
        memoryStats: {
          totalEntries: 150,
          recentRetrievals: 3,
          avgRetrievalSuccess: 0.75,
          lastRetrievalTime: Date.now() - 60000,
        },
      };

      const state = buildRetrievalState(params);

      expect(state.queryFeatures.queryLength).toBeGreaterThan(30);
      expect(state.queryFeatures.hasKeywords).toBe(true);
      expect(state.contextFeatures.turnNumber).toBe(5);
      expect(state.contextFeatures.conversationDepth).toBe(10);
      expect(state.memoryStats.totalEntries).toBe(150);
    });

    it('should detect keywords in query', () => {
      const params: RetrievalStateParams = {
        queryText: 'What configuration settings are available?',
        conversationContext: {
          turnNumber: 1,
          conversationDepth: 1,
          recentToolCalls: 0,
          hasErrors: false,
        },
        memoryStats: {
          totalEntries: 50,
          recentRetrievals: 0,
          avgRetrievalSuccess: 0,
        },
      };

      const state = buildRetrievalState(params);

      expect(state.queryFeatures.hasKeywords).toBe(true);
    });

    it('should compute query complexity', () => {
      const complexQuery =
        'Explain how the system handles authentication, authorization, and session management in a multi-tenant environment with Redis caching.';

      const params: RetrievalStateParams = {
        queryText: complexQuery,
        conversationContext: {
          turnNumber: 3,
          conversationDepth: 5,
          recentToolCalls: 1,
          hasErrors: false,
        },
        memoryStats: {
          totalEntries: 100,
          recentRetrievals: 2,
          avgRetrievalSuccess: 0.6,
        },
      };

      const state = buildRetrievalState(params);

      expect(state.queryFeatures.queryComplexity).toBeGreaterThan(0.5);
    });

    it('should categorize semantic type', () => {
      const howQuery = 'How does it work?';

      const params: RetrievalStateParams = {
        queryText: howQuery,
        conversationContext: {
          turnNumber: 1,
          conversationDepth: 1,
          recentToolCalls: 0,
          hasErrors: false,
        },
        memoryStats: {
          totalEntries: 50,
          recentRetrievals: 0,
          avgRetrievalSuccess: 0,
        },
      };

      const state = buildRetrievalState(params);

      expect(state.queryFeatures.semanticCategory).toBe('question');
    });

    it('should handle empty memory stats', () => {
      const params: RetrievalStateParams = {
        queryText: 'Test query',
        conversationContext: {
          turnNumber: 1,
          conversationDepth: 1,
          recentToolCalls: 0,
          hasErrors: false,
        },
        memoryStats: {
          totalEntries: 0,
          recentRetrievals: 0,
          avgRetrievalSuccess: 0,
        },
      };

      const state = buildRetrievalState(params);

      expect(state.memoryStats.totalEntries).toBe(0);
      expect(state.memoryStats.avgRetrievalSuccess).toBe(0);
    });
  });

  describe('buildConsolidationState', () => {
    it('should build state from entry group', () => {
      const params: ConsolidationStateParams = {
        group: {
          entries: [
            { id: '1', type: 'knowledge', similarity: 0.9 },
            { id: '2', type: 'knowledge', similarity: 0.85 },
            { id: '3', type: 'knowledge', similarity: 0.88 },
          ],
          avgSimilarity: 0.876,
        },
        usageStats: {
          totalRetrievals: 15,
          avgRetrievalRank: 5,
          successCount: 12,
          failureCount: 3,
          lastAccessedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
        scopeContext: {
          scopeType: 'project',
          totalEntriesInScope: 200,
          duplicateCount: 30,
        },
      };

      const state = buildConsolidationState(params);

      expect(state.groupFeatures.groupSize).toBe(3);
      expect(state.groupFeatures.avgSimilarity).toBeCloseTo(0.876, 2);
      expect(state.groupFeatures.minSimilarity).toBe(0.85);
      expect(state.groupFeatures.maxSimilarity).toBe(0.9);
      expect(state.usageStats.totalRetrievals).toBe(15);
      expect(state.scopeStats.scopeType).toBe('project');
    });

    it('should handle single entry', () => {
      const params: ConsolidationStateParams = {
        group: {
          entries: [{ id: '1', type: 'guideline', similarity: 0 }],
          avgSimilarity: 0,
        },
        usageStats: {
          totalRetrievals: 50,
          avgRetrievalRank: 2,
          successCount: 45,
          failureCount: 5,
          lastAccessedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        },
        scopeContext: {
          scopeType: 'project',
          totalEntriesInScope: 100,
          duplicateCount: 5,
        },
      };

      const state = buildConsolidationState(params);

      expect(state.groupFeatures.groupSize).toBe(1);
      expect(state.groupFeatures.avgSimilarity).toBe(0);
      expect(state.groupFeatures.entryTypes).toEqual(['guideline']);
    });

    it('should track entry types', () => {
      const params: ConsolidationStateParams = {
        group: {
          entries: [
            { id: '1', type: 'knowledge', similarity: 0.8 },
            { id: '2', type: 'guideline', similarity: 0.75 },
            { id: '3', type: 'tool', similarity: 0.85 },
          ],
          avgSimilarity: 0.8,
        },
        usageStats: {
          totalRetrievals: 10,
          avgRetrievalRank: 8,
          successCount: 6,
          failureCount: 4,
          lastAccessedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        },
        scopeContext: {
          scopeType: 'project',
          totalEntriesInScope: 100,
          duplicateCount: 10,
        },
      };

      const state = buildConsolidationState(params);

      expect(state.groupFeatures.entryTypes).toContain('knowledge');
      expect(state.groupFeatures.entryTypes).toContain('guideline');
      expect(state.groupFeatures.entryTypes).toContain('tool');
      expect(state.groupFeatures.entryTypes.length).toBe(3);
    });

    it('should compute similarity statistics', () => {
      const params: ConsolidationStateParams = {
        group: {
          entries: [
            { id: '1', type: 'knowledge', similarity: 0.6 },
            { id: '2', type: 'knowledge', similarity: 0.9 },
            { id: '3', type: 'knowledge', similarity: 0.75 },
          ],
          avgSimilarity: 0.75,
        },
        usageStats: {
          totalRetrievals: 20,
          avgRetrievalRank: 6,
          successCount: 14,
          failureCount: 6,
          lastAccessedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        scopeContext: {
          scopeType: 'project',
          totalEntriesInScope: 150,
          duplicateCount: 30,
        },
      };

      const state = buildConsolidationState(params);

      expect(state.groupFeatures.minSimilarity).toBe(0.6);
      expect(state.groupFeatures.maxSimilarity).toBe(0.9);
      expect(state.groupFeatures.avgSimilarity).toBeCloseTo(0.75, 2);
    });

    it('should include scope statistics', () => {
      const params: ConsolidationStateParams = {
        group: {
          entries: [{ id: '1', type: 'knowledge', similarity: 0.8 }],
          avgSimilarity: 0.8,
        },
        usageStats: {
          totalRetrievals: 5,
          avgRetrievalRank: 10,
          successCount: 3,
          failureCount: 3,
          lastAccessedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        },
        scopeContext: {
          scopeType: 'global',
          totalEntriesInScope: 500,
          duplicateCount: 125,
        },
      };

      const state = buildConsolidationState(params);

      expect(state.scopeStats.scopeType).toBe('global');
      expect(state.scopeStats.totalEntriesInScope).toBe(500);
      expect(state.scopeStats.duplicateRatio).toBe(0.25);
    });
  });
});
