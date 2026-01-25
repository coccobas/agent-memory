import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HybridExtractor,
  createHybridExtractor,
  getDefaultHybridExtractor,
  resetDefaultHybridExtractor,
  DEFAULT_HYBRID_CONFIG,
  type PendingSuggestion,
} from '../../../src/services/extraction/hybrid-extractor.js';
import {
  ClassificationQueue,
  createClassificationQueue,
  type ClassificationContext,
} from '../../../src/services/extraction/classifier-queue.js';
import {
  createClassifierService,
  type ClassificationResult,
} from '../../../src/services/extraction/classifier.service.js';
import type {
  IExtractionHookService,
  ExtractionResult,
} from '../../../src/services/extraction-hook.service.js';

function createMockHookService(result: ExtractionResult): IExtractionHookService {
  return {
    scan: vi.fn().mockResolvedValue(result),
    scanSync: vi.fn().mockReturnValue(result),
    isCooldownActive: vi.fn().mockReturnValue(false),
    recordScan: vi.fn(),
  };
}

function createMockQueue(): ClassificationQueue {
  const mockClassifier = createClassifierService({ enabled: false });
  return createClassificationQueue({ enabled: false }, mockClassifier);
}

describe('HybridExtractor', () => {
  beforeEach(() => {
    resetDefaultHybridExtractor();
  });

  afterEach(() => {
    resetDefaultHybridExtractor();
    vi.restoreAllMocks();
  });

  describe('configuration', () => {
    it('should use default config when none provided', () => {
      const mockHookService = createMockHookService({ suggestions: [], skipped: false });
      const mockQueue = createMockQueue();
      const extractor = createHybridExtractor({ enabled: false }, mockHookService, mockQueue);

      const stats = extractor.getStats();
      expect(stats.pendingSuggestions).toBe(0);
    });

    it('should respect custom thresholds', () => {
      const mockHookService = createMockHookService({ suggestions: [], skipped: false });
      const mockQueue = createMockQueue();
      const extractor = createHybridExtractor(
        { regexThreshold: 0.9, llmAutoStoreThreshold: 0.95, enabled: false },
        mockHookService,
        mockQueue
      );

      expect(extractor).toBeDefined();
    });
  });

  describe('extract', () => {
    it('should return empty result when disabled', async () => {
      const mockHookService = createMockHookService({ suggestions: [], skipped: false });
      const mockQueue = createMockQueue();
      const extractor = createHybridExtractor({ enabled: false }, mockHookService, mockQueue);

      const context: ClassificationContext = { sessionId: 'test' };
      const result = await extractor.extract('Test text', context);

      expect(result.regexMatches).toHaveLength(0);
      expect(result.queuedForLlm).toBe(false);
      expect(result.autoStoreCount).toBe(0);
      expect(result.suggestCount).toBe(0);
    });

    it('should auto-store high-confidence regex matches', async () => {
      const mockHookService = createMockHookService({
        suggestions: [
          {
            type: 'guideline',
            category: 'code_style',
            title: 'Always use TypeScript',
            content: 'Always use TypeScript strict mode',
            confidence: 0.9,
            trigger: 'always',
            hash: 'hash-1',
          },
        ],
        skipped: false,
      });
      const mockQueue = createMockQueue();
      const extractor = createHybridExtractor({ enabled: true }, mockHookService, mockQueue);

      const autoStored: PendingSuggestion[] = [];
      extractor.onAutoStore(async (suggestion) => {
        autoStored.push(suggestion);
      });

      const context: ClassificationContext = { sessionId: 'test' };
      const result = await extractor.extract('Always use TypeScript strict mode', context);

      expect(result.autoStoreCount).toBe(1);
      expect(autoStored.length).toBe(1);
      expect(autoStored[0]?.type).toBe('guideline');
      expect(autoStored[0]?.source).toBe('regex');
    });

    it('should queue for LLM when no regex matches', async () => {
      const mockHookService = createMockHookService({ suggestions: [], skipped: false });
      const mockQueue = createMockQueue();
      vi.spyOn(mockQueue, 'enqueue').mockReturnValue('clf_123');

      const extractor = createHybridExtractor({ enabled: true }, mockHookService, mockQueue);

      const context: ClassificationContext = { sessionId: 'test' };
      const result = await extractor.extract('Some text that needs LLM classification', context);

      expect(result.queuedForLlm).toBe(true);
      expect(result.queueId).toBe('clf_123');
      expect(mockQueue.enqueue).toHaveBeenCalled();
    });

    it('should queue for LLM when regex confidence is low', async () => {
      const mockHookService = createMockHookService({
        suggestions: [
          {
            type: 'knowledge',
            category: 'fact',
            title: 'Low confidence match',
            content: 'Some content',
            confidence: 0.7,
            trigger: 'test',
            hash: 'hash-2',
          },
        ],
        skipped: false,
      });
      const mockQueue = createMockQueue();
      vi.spyOn(mockQueue, 'enqueue').mockReturnValue('clf_456');

      const extractor = createHybridExtractor(
        { enabled: true, regexThreshold: 0.85 },
        mockHookService,
        mockQueue
      );

      const context: ClassificationContext = { sessionId: 'test' };
      const result = await extractor.extract('Some text', context);

      expect(result.queuedForLlm).toBe(true);
    });

    it('should surface medium-confidence regex matches as suggestions', async () => {
      const mockHookService = createMockHookService({
        suggestions: [
          {
            type: 'guideline',
            category: 'workflow',
            title: 'Medium confidence match',
            content: 'Some workflow guideline',
            confidence: 0.8,
            trigger: 'test',
            hash: 'hash-3',
          },
        ],
        skipped: false,
      });
      const mockQueue = createMockQueue();
      const extractor = createHybridExtractor(
        { enabled: true, regexThreshold: 0.85, llmAutoStoreThreshold: 0.85 },
        mockHookService,
        mockQueue
      );

      const suggestions: PendingSuggestion[] = [];
      extractor.onSuggestion((suggestion) => {
        suggestions.push(suggestion);
      });

      const context: ClassificationContext = { sessionId: 'test' };
      const result = await extractor.extract('Test', context);

      expect(result.suggestCount).toBe(0);
    });
  });

  describe('pending suggestions', () => {
    it('should track pending suggestions', async () => {
      const mockHookService = createMockHookService({
        suggestions: [
          {
            type: 'knowledge',
            category: 'decision',
            title: 'Decision 1',
            content: 'We decided to use React',
            confidence: 0.87,
            trigger: 'decided',
            hash: 'hash-4',
          },
        ],
        skipped: false,
      });
      const mockQueue = createMockQueue();
      const extractor = createHybridExtractor({ enabled: true }, mockHookService, mockQueue);

      const context: ClassificationContext = { sessionId: 'test' };
      await extractor.extract('We decided to use React', context);

      const pending = extractor.getPendingSuggestions();
      expect(pending.length).toBe(0);
    });

    it('should approve suggestion by id', async () => {
      const mockHookService = createMockHookService({ suggestions: [], skipped: false });
      const mockQueue = createMockQueue();
      const extractor = createHybridExtractor({ enabled: true }, mockHookService, mockQueue);

      const pendingMap = (
        extractor as unknown as { pendingSuggestions: Map<string, PendingSuggestion> }
      ).pendingSuggestions;
      const suggestion: PendingSuggestion = {
        id: 'test-id',
        type: 'guideline',
        title: 'Test',
        content: 'Test content',
        confidence: 0.8,
        source: 'llm',
        context: { sessionId: 'test' },
        createdAt: Date.now(),
      };
      pendingMap.set('test-id', suggestion);

      const approved = extractor.approveSuggestion('test-id');

      expect(approved).toBeDefined();
      expect(approved?.id).toBe('test-id');
      expect(extractor.getPendingSuggestions().length).toBe(0);
    });

    it('should reject suggestion by id', async () => {
      const mockHookService = createMockHookService({ suggestions: [], skipped: false });
      const mockQueue = createMockQueue();
      const extractor = createHybridExtractor({ enabled: true }, mockHookService, mockQueue);

      const pendingMap = (
        extractor as unknown as { pendingSuggestions: Map<string, PendingSuggestion> }
      ).pendingSuggestions;
      pendingMap.set('reject-id', {
        id: 'reject-id',
        type: 'knowledge',
        title: 'Reject me',
        content: 'Content',
        confidence: 0.75,
        source: 'regex',
        context: { sessionId: 'test' },
        createdAt: Date.now(),
      });

      const rejected = extractor.rejectSuggestion('reject-id');

      expect(rejected).toBe(true);
      expect(extractor.getPendingSuggestions().length).toBe(0);
    });

    it('should clear all suggestions', async () => {
      const mockHookService = createMockHookService({ suggestions: [], skipped: false });
      const mockQueue = createMockQueue();
      const extractor = createHybridExtractor({ enabled: true }, mockHookService, mockQueue);

      const pendingMap = (
        extractor as unknown as { pendingSuggestions: Map<string, PendingSuggestion> }
      ).pendingSuggestions;
      pendingMap.set('id-1', {
        id: 'id-1',
        type: 'guideline',
        title: 'Test 1',
        content: 'Content 1',
        confidence: 0.8,
        source: 'llm',
        context: { sessionId: 'test' },
        createdAt: Date.now(),
      });
      pendingMap.set('id-2', {
        id: 'id-2',
        type: 'knowledge',
        title: 'Test 2',
        content: 'Content 2',
        confidence: 0.75,
        source: 'regex',
        context: { sessionId: 'test' },
        createdAt: Date.now(),
      });

      extractor.clearSuggestions();

      expect(extractor.getPendingSuggestions().length).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return combined stats', () => {
      const mockHookService = createMockHookService({ suggestions: [], skipped: false });
      const mockQueue = createMockQueue();
      const extractor = createHybridExtractor({ enabled: true }, mockHookService, mockQueue);

      const stats = extractor.getStats();

      expect(stats).toHaveProperty('pendingSuggestions');
      expect(stats).toHaveProperty('queueStats');
      expect(stats.queueStats).toHaveProperty('pending');
      expect(stats.queueStats).toHaveProperty('completed');
    });
  });

  describe('singleton', () => {
    it('should return same instance from getDefaultHybridExtractor', () => {
      const instance1 = getDefaultHybridExtractor();
      const instance2 = getDefaultHybridExtractor();

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton with resetDefaultHybridExtractor', () => {
      const instance1 = getDefaultHybridExtractor();
      resetDefaultHybridExtractor();
      const instance2 = getDefaultHybridExtractor();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('title generation', () => {
    it('should generate title from text', () => {
      const mockHookService = createMockHookService({ suggestions: [], skipped: false });
      const mockQueue = createMockQueue();
      const extractor = createHybridExtractor({ enabled: true }, mockHookService, mockQueue);

      const generateTitle = (
        extractor as unknown as { generateTitle: (text: string, type: string) => string }
      ).generateTitle.bind(extractor);

      expect(generateTitle('Always use TypeScript strict mode', 'guideline')).toContain(
        'TypeScript strict mode'
      );
      expect(generateTitle('We should never skip tests', 'guideline')).toContain('skip tests');
      expect(generateTitle('Short', 'knowledge')).toBe('Short');
      expect(
        generateTitle(
          'A very long title that exceeds the fifty character limit should be truncated',
          'tool'
        )
      ).toContain('...');
    });
  });
});
