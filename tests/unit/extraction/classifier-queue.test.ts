import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ClassificationQueue,
  createClassificationQueue,
  getDefaultClassificationQueue,
  resetDefaultClassificationQueue,
  DEFAULT_QUEUE_CONFIG,
  type QueuedClassification,
  type ClassificationContext,
} from '../../../src/services/extraction/classifier-queue.js';
import {
  ClassifierService,
  createClassifierService,
  type ClassificationResult,
} from '../../../src/services/extraction/classifier.service.js';

const mockClassificationResult: ClassificationResult = {
  type: 'guideline',
  confidence: 0.9,
  reasoning: 'test reasoning',
  processingTimeMs: 100,
  autoStore: true,
  suggest: false,
};

function createMockClassifier(
  result: ClassificationResult = mockClassificationResult
): ClassifierService {
  const classifier = createClassifierService({ enabled: false });
  vi.spyOn(classifier, 'isAvailable').mockReturnValue(true);
  vi.spyOn(classifier, 'classify').mockResolvedValue(result);
  return classifier;
}

describe('ClassificationQueue', () => {
  beforeEach(() => {
    resetDefaultClassificationQueue();
  });

  afterEach(() => {
    resetDefaultClassificationQueue();
    vi.restoreAllMocks();
  });

  describe('configuration', () => {
    it('should use default config when none provided', () => {
      const mockClassifier = createMockClassifier();
      const queue = createClassificationQueue({ enabled: false }, mockClassifier);
      const stats = queue.getStats();

      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
    });

    it('should respect maxQueueSize', () => {
      const mockClassifier = createMockClassifier();
      const queue = createClassificationQueue(
        { maxQueueSize: 2, enabled: true, processingIntervalMs: 100000 },
        mockClassifier
      );

      const context: ClassificationContext = { sessionId: 'test' };

      queue.enqueue('text 1', context);
      queue.enqueue('text 2', context);
      queue.enqueue('text 3', context);

      const stats = queue.getStats();
      expect(stats.total).toBe(2);
      queue.stop();
    });
  });

  describe('enqueue', () => {
    it('should add item to queue', () => {
      const mockClassifier = createMockClassifier();
      const queue = createClassificationQueue(
        { enabled: true, processingIntervalMs: 100000 },
        mockClassifier
      );
      const context: ClassificationContext = { sessionId: 'test-session' };

      const id = queue.enqueue('Test text for classification', context);

      expect(id).toMatch(/^clf_\d+_\d+$/);
      expect(queue.getStats().pending).toBe(1);
      queue.stop();
    });

    it('should return empty string when disabled', () => {
      const mockClassifier = createMockClassifier();
      const queue = createClassificationQueue({ enabled: false }, mockClassifier);
      const context: ClassificationContext = { sessionId: 'test' };

      const id = queue.enqueue('text', context);

      expect(id).toBe('');
    });

    it('should drop oldest item when queue is full', () => {
      const mockClassifier = createMockClassifier();
      const queue = createClassificationQueue(
        { maxQueueSize: 2, enabled: true, processingIntervalMs: 100000 },
        mockClassifier
      );
      const context: ClassificationContext = { sessionId: 'test' };

      const id1 = queue.enqueue('text 1', context);
      queue.enqueue('text 2', context);
      queue.enqueue('text 3', context);

      expect(queue.getResult(id1)).toBeUndefined();
      expect(queue.getStats().total).toBe(2);
      queue.stop();
    });
  });

  describe('getResult', () => {
    it('should return queued item by id', () => {
      const mockClassifier = createMockClassifier();
      const queue = createClassificationQueue(
        { enabled: true, processingIntervalMs: 100000 },
        mockClassifier
      );
      const context: ClassificationContext = { sessionId: 'test', projectId: 'proj-1' };

      const id = queue.enqueue('Test text', context);
      const result = queue.getResult(id);

      expect(result).toBeDefined();
      expect(result?.text).toBe('Test text');
      expect(result?.context.sessionId).toBe('test');
      expect(result?.context.projectId).toBe('proj-1');
      expect(result?.status).toBe('pending');
      queue.stop();
    });

    it('should return undefined for unknown id', () => {
      const mockClassifier = createMockClassifier();
      const queue = createClassificationQueue(
        { enabled: true, processingIntervalMs: 100000 },
        mockClassifier
      );

      expect(queue.getResult('unknown-id')).toBeUndefined();
      queue.stop();
    });
  });

  describe('onComplete callback', () => {
    it('should call callback when classification completes', async () => {
      const mockClassifier = createMockClassifier();
      const queue = createClassificationQueue(
        { enabled: true, processingIntervalMs: 10 },
        mockClassifier
      );

      const completedItems: QueuedClassification[] = [];
      queue.onComplete((item) => {
        completedItems.push(item);
      });

      const context: ClassificationContext = { sessionId: 'test' };
      queue.enqueue('Always use TypeScript', context);

      await new Promise((resolve) => setTimeout(resolve, 100));
      queue.stop();

      expect(completedItems.length).toBeGreaterThanOrEqual(1);
      expect(completedItems[0]?.result?.type).toBe('guideline');
    });
  });

  describe('getCompletedResults', () => {
    it('should return only completed items', async () => {
      const mockClassifier = createMockClassifier();
      const queue = createClassificationQueue(
        { enabled: true, processingIntervalMs: 10 },
        mockClassifier
      );

      const context: ClassificationContext = { sessionId: 'test' };
      queue.enqueue('Test text', context);

      await new Promise((resolve) => setTimeout(resolve, 100));
      queue.stop();

      const completed = queue.getCompletedResults();
      expect(completed.length).toBeGreaterThanOrEqual(1);
      expect(completed.every((item) => item.status === 'completed')).toBe(true);
    });
  });

  describe('clearCompleted', () => {
    it('should remove completed and failed items', async () => {
      const mockClassifier = createMockClassifier();
      const queue = createClassificationQueue(
        { enabled: true, processingIntervalMs: 10 },
        mockClassifier
      );

      const context: ClassificationContext = { sessionId: 'test' };
      queue.enqueue('Test text', context);

      await new Promise((resolve) => setTimeout(resolve, 100));
      queue.stop();

      expect(queue.getStats().completed).toBeGreaterThanOrEqual(1);

      queue.clearCompleted();

      expect(queue.getStats().completed).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', () => {
      const mockClassifier = createMockClassifier();
      const queue = createClassificationQueue(
        { enabled: true, processingIntervalMs: 100000 },
        mockClassifier
      );
      const context: ClassificationContext = { sessionId: 'test' };

      queue.enqueue('text 1', context);
      queue.enqueue('text 2', context);

      const stats = queue.getStats();

      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(2);
      expect(stats.processing).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      queue.stop();
    });
  });

  describe('stop and clear', () => {
    it('should stop processing interval', () => {
      const mockClassifier = createMockClassifier();
      const queue = createClassificationQueue(
        { enabled: true, processingIntervalMs: 10 },
        mockClassifier
      );

      queue.stop();

      const context: ClassificationContext = { sessionId: 'test' };
      queue.enqueue('text', context);

      expect(queue.getStats().pending).toBe(1);
    });

    it('should clear all items', () => {
      const mockClassifier = createMockClassifier();
      const queue = createClassificationQueue(
        { enabled: true, processingIntervalMs: 100000 },
        mockClassifier
      );
      const context: ClassificationContext = { sessionId: 'test' };

      queue.enqueue('text 1', context);
      queue.enqueue('text 2', context);

      queue.clear();

      expect(queue.getStats().total).toBe(0);
      queue.stop();
    });
  });

  describe('singleton', () => {
    it('should return same instance from getDefaultClassificationQueue', () => {
      const instance1 = getDefaultClassificationQueue();
      const instance2 = getDefaultClassificationQueue();

      expect(instance1).toBe(instance2);

      instance1.stop();
    });

    it('should reset singleton with resetDefaultClassificationQueue', () => {
      const instance1 = getDefaultClassificationQueue();
      instance1.stop();
      resetDefaultClassificationQueue();
      const instance2 = getDefaultClassificationQueue();
      instance2.stop();

      expect(instance1).not.toBe(instance2);
    });
  });
});
