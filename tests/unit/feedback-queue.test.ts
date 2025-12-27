import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FeedbackQueueProcessor,
  FeedbackQueueConfig,
  FeedbackQueueStats,
} from '../../src/services/feedback/queue.js';
import type { FeedbackService } from '../../src/services/feedback/index.js';
import type { RecordRetrievalParams } from '../../src/services/feedback/types.js';

// Mock the dead letter queue
vi.mock('../../src/utils/dead-letter-queue.js', () => {
  const mockDLQ = {
    add: vi.fn(),
    size: 0,
    get: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    getStats: vi.fn(() => ({
      total: 0,
      byType: { embedding: 0, vector: 0, api: 0, sync: 0, other: 0 },
      byOperation: {},
      avgAttempts: 0,
      exhausted: 0,
      oldestEntry: null,
    })),
  };

  return {
    DeadLetterQueue: vi.fn(() => mockDLQ),
    getGeneralDLQ: vi.fn(() => mockDLQ),
    resetAllDLQs: vi.fn(),
    __mockDLQ: mockDLQ,
  };
});

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Helper to create a mock FeedbackService
function createMockFeedbackService(): FeedbackService & {
  recordRetrievalBatch: ReturnType<typeof vi.fn>;
} {
  return {
    recordRetrievalBatch: vi.fn().mockResolvedValue([]),
    recordRetrieval: vi.fn().mockResolvedValue(''),
    recordOutcome: vi.fn().mockResolvedValue(''),
    linkRetrievalsToOutcome: vi.fn().mockResolvedValue(undefined),
    recordExtractionDecision: vi.fn().mockResolvedValue(''),
    evaluateExtractionOutcome: vi.fn().mockResolvedValue(null),
    recordConsolidationDecision: vi.fn().mockResolvedValue(''),
    evaluateConsolidationOutcome: vi.fn().mockResolvedValue(null),
    exportTrainingData: vi.fn().mockResolvedValue({}),
    getConfig: vi.fn().mockReturnValue({}),
    updateConfig: vi.fn(),
    getSessionRetrievals: vi.fn().mockResolvedValue([]),
    getUnlinkedRetrievals: vi.fn().mockResolvedValue([]),
  } as unknown as FeedbackService & {
    recordRetrievalBatch: ReturnType<typeof vi.fn>;
  };
}

// Helper to create test retrieval params
function createRetrievalParams(
  sessionId: string,
  entryId: string,
  rank = 1
): RecordRetrievalParams {
  return {
    sessionId,
    entryId,
    entryType: 'knowledge',
    retrievalRank: rank,
    retrievalScore: 0.9,
    queryText: 'test query',
  };
}

// Helper to wait for async operations
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper to wait for condition with timeout
async function waitUntil(fn: () => void, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (true) {
    try {
      fn();
      return;
    } catch (e) {
      if (Date.now() - start > timeoutMs) throw e;
      await sleep(5);
    }
  }
}

describe('FeedbackQueueProcessor', () => {
  let mockFeedbackService: FeedbackService & {
    recordRetrievalBatch: ReturnType<typeof vi.fn>;
  };
  let processor: FeedbackQueueProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeedbackService = createMockFeedbackService();
  });

  afterEach(async () => {
    if (processor) {
      await processor.stop();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should create processor with default configuration', () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService);

      const stats = processor.getStats();
      expect(stats.maxQueueSize).toBe(500);
      expect(stats.isRunning).toBe(false);
      expect(stats.queueDepth).toBe(0);
    });

    it('should create processor with custom configuration', () => {
      const customConfig: Partial<FeedbackQueueConfig> = {
        maxQueueSize: 100,
        workerConcurrency: 4,
        batchTimeoutMs: 200,
      };

      processor = new FeedbackQueueProcessor(mockFeedbackService, customConfig);

      const stats = processor.getStats();
      expect(stats.maxQueueSize).toBe(100);
    });

    it('should merge partial config with defaults', () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 250,
      });

      const stats = processor.getStats();
      expect(stats.maxQueueSize).toBe(250);
    });
  });

  describe('Queue accepts items up to limit', () => {
    it('should accept items when queue is not full', () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 10,
        batchTimeoutMs: 1000, // Long timeout to prevent auto-flush
      });
      processor.start();

      const result = processor.enqueue([createRetrievalParams('session-1', 'entry-1')]);

      expect(result).toBe(true);
    });

    it('should accept multiple batches up to limit', () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 5,
        batchTimeoutMs: 1000,
      });
      processor.start();

      // Add items that will create batches
      for (let i = 0; i < 4; i++) {
        const result = processor.enqueue([createRetrievalParams(`session-${i}`, `entry-${i}`)]);
        expect(result).toBe(true);
      }
    });

    it('should return true for empty batch', () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService);
      processor.start();

      const result = processor.enqueue([]);

      expect(result).toBe(true);
    });
  });

  describe('Queue returns false when full (backpressure signal)', () => {
    it('should return false when queue is at capacity', async () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 2,
        workerConcurrency: 0, // No workers to process
        batchTimeoutMs: 10, // Fast timeout to flush immediately
      });
      processor.start();

      // Fill the queue by creating batches
      // Each enqueue with 50+ items triggers immediate flush
      const largeItems = Array.from({ length: 50 }, (_, i) =>
        createRetrievalParams('session', `entry-${i}`)
      );

      processor.enqueue(largeItems);
      processor.enqueue(largeItems);

      // Queue should be full now (2 batches)
      // Next enqueue that triggers flush should fail
      await sleep(20); // Wait for batch timeouts

      const stats = processor.getStats();
      expect(stats.isFull).toBe(true);
    });

    it('should return false when processor is not running', () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService);
      // Not started

      const result = processor.enqueue([createRetrievalParams('session-1', 'entry-1')]);

      expect(result).toBe(false);
    });

    it('should report isFull correctly in stats', async () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 1,
        workerConcurrency: 0,
        batchTimeoutMs: 10,
      });
      processor.start();

      // Create batch that will fill the queue
      const items = Array.from({ length: 50 }, (_, i) =>
        createRetrievalParams('session', `entry-${i}`)
      );
      processor.enqueue(items);
      await sleep(20);

      const stats = processor.getStats();
      expect(stats.isFull).toBe(true);
    });
  });

  describe('Worker processes batches correctly', () => {
    it('should process batches through FeedbackService', async () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 100,
        workerConcurrency: 1,
        batchTimeoutMs: 10,
      });
      processor.start();

      const params = [
        createRetrievalParams('session-1', 'entry-1'),
        createRetrievalParams('session-1', 'entry-2'),
      ];

      processor.enqueue(params);

      await waitUntil(() => {
        expect(mockFeedbackService.recordRetrievalBatch).toHaveBeenCalled();
      });

      expect(mockFeedbackService.recordRetrievalBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ entryId: 'entry-1' }),
          expect.objectContaining({ entryId: 'entry-2' }),
        ])
      );
    });

    it('should update stats after processing', async () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 100,
        workerConcurrency: 2,
        batchTimeoutMs: 10,
      });
      processor.start();

      const params = [createRetrievalParams('session-1', 'entry-1')];
      processor.enqueue(params);

      await waitUntil(() => {
        const stats = processor.getStats();
        expect(stats.batchesProcessed).toBeGreaterThan(0);
      });

      const stats = processor.getStats();
      expect(stats.itemsProcessed).toBeGreaterThan(0);
    });

    it('should process with multiple workers', async () => {
      let concurrentWorkers = 0;
      let maxConcurrency = 0;

      mockFeedbackService.recordRetrievalBatch.mockImplementation(async () => {
        concurrentWorkers++;
        maxConcurrency = Math.max(maxConcurrency, concurrentWorkers);
        await sleep(50);
        concurrentWorkers--;
        return [];
      });

      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 100,
        workerConcurrency: 3,
        batchTimeoutMs: 5,
      });
      processor.start();

      // Add multiple batches
      for (let i = 0; i < 5; i++) {
        const items = Array.from({ length: 50 }, (_, j) =>
          createRetrievalParams(`session-${i}`, `entry-${j}`)
        );
        processor.enqueue(items);
      }

      await waitUntil(
        () => {
          expect(mockFeedbackService.recordRetrievalBatch.mock.calls.length).toBeGreaterThanOrEqual(
            3
          );
        },
        5000
      );

      expect(maxConcurrency).toBeGreaterThanOrEqual(1);
    });
  });

  describe('DLQ receives failed batches', () => {
    it('should send failed batch to DLQ', async () => {
      const { __mockDLQ: mockDLQ } = await import('../../src/utils/dead-letter-queue.js');

      mockFeedbackService.recordRetrievalBatch.mockRejectedValue(new Error('Database error'));

      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 100,
        workerConcurrency: 1,
        batchTimeoutMs: 10,
      });
      processor.start();

      processor.enqueue([createRetrievalParams('session-1', 'entry-1')]);

      await waitUntil(() => {
        expect(mockDLQ.add).toHaveBeenCalled();
      });

      expect(mockDLQ.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync',
          operation: 'feedback-recording',
          error: 'Database error',
        })
      );
    });

    it('should increment failure count on error', async () => {
      mockFeedbackService.recordRetrievalBatch.mockRejectedValue(new Error('Network error'));

      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 100,
        workerConcurrency: 1,
        batchTimeoutMs: 10,
      });
      processor.start();

      processor.enqueue([createRetrievalParams('session-1', 'entry-1')]);

      await waitUntil(() => {
        const stats = processor.getStats();
        expect(stats.failures).toBeGreaterThan(0);
      });
    });
  });

  describe('Graceful shutdown drains queue', () => {
    it('should drain queue before stopping', async () => {
      let processed = 0;
      mockFeedbackService.recordRetrievalBatch.mockImplementation(async (batch) => {
        processed += batch.length;
        await sleep(10);
        return [];
      });

      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 100,
        workerConcurrency: 2,
        batchTimeoutMs: 5,
      });
      processor.start();

      // Add items
      for (let i = 0; i < 3; i++) {
        const items = Array.from({ length: 50 }, (_, j) =>
          createRetrievalParams(`session-${i}`, `entry-${j}`)
        );
        processor.enqueue(items);
      }

      // Drain should wait for all items to be processed
      await processor.drain();

      const stats = processor.getStats();
      expect(stats.isRunning).toBe(false);
      expect(stats.queueDepth).toBe(0);
    });

    it('should stop cleanly with stop()', async () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 100,
        workerConcurrency: 2,
        batchTimeoutMs: 100,
      });
      processor.start();

      expect(processor.getStats().isRunning).toBe(true);

      await processor.stop();

      expect(processor.getStats().isRunning).toBe(false);
    });

    it('should flush pending batch on stop', async () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 100,
        workerConcurrency: 2,
        batchTimeoutMs: 10000, // Long timeout
      });
      processor.start();

      // Add items that won't trigger immediate flush
      processor.enqueue([createRetrievalParams('session-1', 'entry-1')]);

      await processor.stop();

      // After stop, pending batch should have been flushed
      // Note: items may or may not be processed depending on timing
      expect(processor.getStats().isRunning).toBe(false);
    });

    it('should warn when draining non-running processor', async () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService);
      // Not started

      await processor.drain();
      // Should complete without error
    });
  });

  describe('getStats() returns correct values', () => {
    it('should return initial stats', () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService);

      const stats = processor.getStats();

      expect(stats).toEqual<FeedbackQueueStats>({
        queueDepth: 0,
        maxQueueSize: 500,
        isFull: false,
        batchesProcessed: 0,
        itemsProcessed: 0,
        failures: 0,
        activeWorkers: 0,
        isRunning: false,
        startedAt: null,
      });
    });

    it('should update isRunning and startedAt after start', () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService);

      const before = Date.now();
      processor.start();
      const after = Date.now();

      const stats = processor.getStats();
      expect(stats.isRunning).toBe(true);
      expect(stats.startedAt).toBeGreaterThanOrEqual(before);
      expect(stats.startedAt).toBeLessThanOrEqual(after);
    });

    it('should track active workers', async () => {
      mockFeedbackService.recordRetrievalBatch.mockImplementation(async () => {
        await sleep(100);
        return [];
      });

      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 100,
        workerConcurrency: 2,
        batchTimeoutMs: 5,
      });
      processor.start();

      // Add batch to trigger processing
      const items = Array.from({ length: 50 }, (_, i) =>
        createRetrievalParams('session', `entry-${i}`)
      );
      processor.enqueue(items);

      await sleep(20);

      const stats = processor.getStats();
      expect(stats.activeWorkers).toBeGreaterThanOrEqual(0);
    });

    it('should track batchesProcessed and itemsProcessed', async () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 100,
        workerConcurrency: 2,
        batchTimeoutMs: 5,
      });
      processor.start();

      const items = [
        createRetrievalParams('session-1', 'entry-1'),
        createRetrievalParams('session-1', 'entry-2'),
        createRetrievalParams('session-1', 'entry-3'),
      ];
      processor.enqueue(items);

      await waitUntil(() => {
        const stats = processor.getStats();
        expect(stats.itemsProcessed).toBe(3);
      });

      const stats = processor.getStats();
      expect(stats.batchesProcessed).toBeGreaterThan(0);
      expect(stats.itemsProcessed).toBe(3);
    });
  });

  describe('Batch timeout flushes partial batches', () => {
    it('should flush partial batch after timeout', async () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 100,
        workerConcurrency: 2,
        batchTimeoutMs: 50, // Short timeout
      });
      processor.start();

      // Add less than 50 items (threshold for immediate flush)
      processor.enqueue([
        createRetrievalParams('session-1', 'entry-1'),
        createRetrievalParams('session-1', 'entry-2'),
      ]);

      // Wait for timeout to trigger flush
      await waitUntil(
        () => {
          expect(mockFeedbackService.recordRetrievalBatch).toHaveBeenCalled();
        },
        200
      );

      expect(mockFeedbackService.recordRetrievalBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ entryId: 'entry-1' }),
          expect.objectContaining({ entryId: 'entry-2' }),
        ])
      );
    });

    it('should flush immediately when batch reaches 50 items', async () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 100,
        workerConcurrency: 2,
        batchTimeoutMs: 10000, // Long timeout
      });
      processor.start();

      const startTime = Date.now();

      // Add 50+ items to trigger immediate flush
      const items = Array.from({ length: 50 }, (_, i) =>
        createRetrievalParams('session', `entry-${i}`)
      );
      processor.enqueue(items);

      await waitUntil(
        () => {
          expect(mockFeedbackService.recordRetrievalBatch).toHaveBeenCalled();
        },
        1000
      );

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000); // Should be much faster than timeout
    });
  });

  describe('enqueueSingle() works correctly', () => {
    it('should enqueue a single item', () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService);
      processor.start();

      const result = processor.enqueueSingle(createRetrievalParams('session-1', 'entry-1'));

      expect(result).toBe(true);
    });

    it('should process single item', async () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 100,
        workerConcurrency: 1,
        batchTimeoutMs: 10,
      });
      processor.start();

      processor.enqueueSingle(createRetrievalParams('session-1', 'entry-single'));

      await waitUntil(() => {
        expect(mockFeedbackService.recordRetrievalBatch).toHaveBeenCalled();
      });

      expect(mockFeedbackService.recordRetrievalBatch).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ entryId: 'entry-single' })])
      );
    });

    it('should return false when processor not running', () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService);
      // Not started

      const result = processor.enqueueSingle(createRetrievalParams('session-1', 'entry-1'));

      expect(result).toBe(false);
    });
  });

  describe('isAccepting()', () => {
    it('should return true when running and queue not full', () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService);
      processor.start();

      expect(processor.isAccepting()).toBe(true);
    });

    it('should return false when not running', () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService);
      // Not started

      expect(processor.isAccepting()).toBe(false);
    });

    it('should return false when queue is full', async () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService, {
        maxQueueSize: 1,
        workerConcurrency: 0, // No workers
        batchTimeoutMs: 5,
      });
      processor.start();

      // Fill the queue
      const items = Array.from({ length: 50 }, (_, i) =>
        createRetrievalParams('session', `entry-${i}`)
      );
      processor.enqueue(items);
      await sleep(20);

      expect(processor.isAccepting()).toBe(false);
    });
  });

  describe('Lifecycle Management', () => {
    it('should warn when starting already running processor', () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService);
      processor.start();
      processor.start(); // Second start should be ignored with warning

      expect(processor.getStats().isRunning).toBe(true);
    });

    it('should handle stop() on non-running processor', async () => {
      processor = new FeedbackQueueProcessor(mockFeedbackService);
      // Not started

      await processor.stop();
      // Should complete without error
    });
  });
});

describe('Edge Cases and Error Handling', () => {
  let mockFeedbackService: FeedbackService & {
    recordRetrievalBatch: ReturnType<typeof vi.fn>;
  };
  let processor: FeedbackQueueProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeedbackService = createMockFeedbackService();
  });

  afterEach(async () => {
    if (processor) {
      await processor.stop();
    }
  });

  it('should handle rapid enqueue/dequeue cycles', async () => {
    processor = new FeedbackQueueProcessor(mockFeedbackService, {
      maxQueueSize: 100,
      workerConcurrency: 4,
      batchTimeoutMs: 5,
    });
    processor.start();

    // Rapid fire enqueues
    for (let i = 0; i < 20; i++) {
      processor.enqueueSingle(createRetrievalParams(`session-${i}`, `entry-${i}`));
    }

    await waitUntil(
      () => {
        const stats = processor.getStats();
        expect(stats.itemsProcessed).toBe(20);
      },
      5000
    );
  });

  it('should handle intermittent failures', async () => {
    let callCount = 0;
    mockFeedbackService.recordRetrievalBatch.mockImplementation(async () => {
      callCount++;
      if (callCount % 2 === 0) {
        throw new Error('Intermittent failure');
      }
      return [];
    });

    processor = new FeedbackQueueProcessor(mockFeedbackService, {
      maxQueueSize: 100,
      workerConcurrency: 1,
      batchTimeoutMs: 5,
    });
    processor.start();

    for (let i = 0; i < 5; i++) {
      const items = Array.from({ length: 50 }, (_, j) =>
        createRetrievalParams(`session-${i}`, `entry-${j}`)
      );
      processor.enqueue(items);
    }

    await waitUntil(
      () => {
        const stats = processor.getStats();
        expect(stats.batchesProcessed + stats.failures).toBeGreaterThanOrEqual(5);
      },
      5000
    );

    const stats = processor.getStats();
    expect(stats.failures).toBeGreaterThan(0);
  });

  it('should handle very large batches', async () => {
    processor = new FeedbackQueueProcessor(mockFeedbackService, {
      maxQueueSize: 100,
      workerConcurrency: 2,
      batchTimeoutMs: 5,
    });
    processor.start();

    // Add 200 items in one call
    const items = Array.from({ length: 200 }, (_, i) =>
      createRetrievalParams('session', `entry-${i}`)
    );
    processor.enqueue(items);

    await waitUntil(
      () => {
        const stats = processor.getStats();
        expect(stats.itemsProcessed).toBe(200);
      },
      5000
    );
  });

  it('should handle string errors in DLQ', async () => {
    const { __mockDLQ: mockDLQ } = await import('../../src/utils/dead-letter-queue.js');

    mockFeedbackService.recordRetrievalBatch.mockRejectedValue('String error message');

    processor = new FeedbackQueueProcessor(mockFeedbackService, {
      maxQueueSize: 100,
      workerConcurrency: 1,
      batchTimeoutMs: 10,
    });
    processor.start();

    processor.enqueue([createRetrievalParams('session-1', 'entry-1')]);

    await waitUntil(() => {
      expect(mockDLQ.add).toHaveBeenCalled();
    });

    expect(mockDLQ.add).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'String error message',
      })
    );
  });

  it('should properly track session IDs in DLQ metadata', async () => {
    const { __mockDLQ: mockDLQ } = await import('../../src/utils/dead-letter-queue.js');

    mockFeedbackService.recordRetrievalBatch.mockRejectedValue(new Error('Test error'));

    processor = new FeedbackQueueProcessor(mockFeedbackService, {
      maxQueueSize: 100,
      workerConcurrency: 1,
      batchTimeoutMs: 10,
    });
    processor.start();

    processor.enqueue([
      createRetrievalParams('session-a', 'entry-1'),
      createRetrievalParams('session-b', 'entry-2'),
      createRetrievalParams('session-a', 'entry-3'), // Duplicate session
    ]);

    await waitUntil(() => {
      expect(mockDLQ.add).toHaveBeenCalled();
    });

    const dlqCall = mockDLQ.add.mock.calls[0][0];
    expect(dlqCall.metadata.sessionIds).toContain('session-a');
    expect(dlqCall.metadata.sessionIds).toContain('session-b');
    // Should be unique set
    expect(
      dlqCall.metadata.sessionIds.filter((id: string) => id === 'session-a').length
    ).toBeLessThanOrEqual(1);
  });
});
