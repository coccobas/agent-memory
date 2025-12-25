import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DeadLetterQueue,
  DLQEntry,
  DLQOperationType,
  getEmbeddingDLQ,
  getVectorDLQ,
  getGeneralDLQ,
  resetAllDLQs,
} from '../../src/utils/dead-letter-queue.js';

describe('DeadLetterQueue', () => {
  let dlq: DeadLetterQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    dlq = new DeadLetterQueue({
      maxSize: 5,
      maxAttempts: 3,
      initialRetryDelayMs: 1000,
      maxRetryDelayMs: 60000,
      backoffMultiplier: 2,
      useCircuitBreaker: false, // Disable for simpler tests
    });
  });

  afterEach(() => {
    dlq.stopAutoRetry();
    dlq.clear();
    vi.useRealTimers();
  });

  describe('Basic Operations', () => {
    it('should add entry to queue', () => {
      const id = dlq.add({
        type: 'embedding',
        operation: 'generate',
        payload: { text: 'test' },
        error: new Error('Failed to generate'),
      });

      expect(id).toMatch(/^dlq_\d+_\d+$/);
      expect(dlq.size).toBe(1);

      const entry = dlq.get(id);
      expect(entry).toBeDefined();
      expect(entry?.type).toBe('embedding');
      expect(entry?.operation).toBe('generate');
      expect(entry?.attempts).toBe(1);
    });

    it('should add entry with string error', () => {
      const id = dlq.add({
        type: 'api',
        operation: 'fetch',
        payload: { url: 'https://example.com' },
        error: 'Network timeout',
      });

      const entry = dlq.get(id);
      expect(entry?.error).toBe('Network timeout');
    });

    it('should add entry with error code and metadata', () => {
      const id = dlq.add({
        type: 'vector',
        operation: 'insert',
        payload: { vector: [1, 2, 3] },
        error: new Error('Database error'),
        errorCode: 'DB_CONN_FAILED',
        metadata: { retryable: true, table: 'embeddings' },
      });

      const entry = dlq.get(id);
      expect(entry?.errorCode).toBe('DB_CONN_FAILED');
      expect(entry?.metadata).toEqual({ retryable: true, table: 'embeddings' });
    });

    it('should get entry by ID', () => {
      const id = dlq.add({
        type: 'sync',
        operation: 'upload',
        payload: { file: 'test.txt' },
        error: 'Upload failed',
      });

      const entry = dlq.get(id);
      expect(entry?.id).toBe(id);
      expect(entry?.type).toBe('sync');
    });

    it('should return undefined for non-existent ID', () => {
      const entry = dlq.get('nonexistent');
      expect(entry).toBeUndefined();
    });

    it('should remove entry from queue', () => {
      const id = dlq.add({
        type: 'other',
        operation: 'process',
        payload: { data: 'test' },
        error: 'Processing failed',
      });

      expect(dlq.size).toBe(1);
      const removed = dlq.remove(id);
      expect(removed).toBe(true);
      expect(dlq.size).toBe(0);
      expect(dlq.get(id)).toBeUndefined();
    });

    it('should return false when removing non-existent entry', () => {
      const removed = dlq.remove('nonexistent');
      expect(removed).toBe(false);
    });

    it('should clear all entries', () => {
      dlq.add({ type: 'embedding', operation: 'gen', payload: {}, error: 'err1' });
      dlq.add({ type: 'vector', operation: 'ins', payload: {}, error: 'err2' });
      dlq.add({ type: 'api', operation: 'call', payload: {}, error: 'err3' });

      expect(dlq.size).toBe(3);
      dlq.clear();
      expect(dlq.size).toBe(0);
    });
  });

  describe('Queue Size Limits and Overflow Handling', () => {
    it('should enforce maxSize by removing oldest entry', () => {
      // Add entries up to maxSize (5)
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const id = dlq.add({
          type: 'embedding',
          operation: `op${i}`,
          payload: { index: i },
          error: `error ${i}`,
        });
        ids.push(id);
        vi.advanceTimersByTime(10); // Ensure different timestamps
      }

      expect(dlq.size).toBe(5);

      // Add one more - should evict oldest
      const newId = dlq.add({
        type: 'embedding',
        operation: 'op5',
        payload: { index: 5 },
        error: 'error 5',
      });

      expect(dlq.size).toBe(5);
      expect(dlq.get(ids[0])).toBeUndefined(); // First entry removed
      expect(dlq.get(ids[1])).toBeDefined(); // Second entry still there
      expect(dlq.get(newId)).toBeDefined(); // New entry added
    });

    it('should handle multiple overflow cycles', () => {
      const ids: string[] = [];

      // Add 10 entries to a queue with maxSize 5
      for (let i = 0; i < 10; i++) {
        const id = dlq.add({
          type: 'embedding',
          operation: `op${i}`,
          payload: { index: i },
          error: `error ${i}`,
        });
        ids.push(id);
        vi.advanceTimersByTime(10);
      }

      expect(dlq.size).toBe(5);
      // First 5 should be evicted
      for (let i = 0; i < 5; i++) {
        expect(dlq.get(ids[i])).toBeUndefined();
      }
      // Last 5 should remain
      for (let i = 5; i < 10; i++) {
        expect(dlq.get(ids[i])).toBeDefined();
      }
    });

    it('should update oldest entry tracker correctly after eviction', () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push(dlq.add({
          type: 'embedding',
          operation: `op${i}`,
          payload: { index: i },
          error: `error ${i}`,
        }));
        vi.advanceTimersByTime(10);
      }

      // Add entry to trigger eviction
      dlq.add({
        type: 'embedding',
        operation: 'new',
        payload: {},
        error: 'new error',
      });

      // Verify oldest is now the second entry
      const stats = dlq.getStats();
      const oldestEntry = dlq.get(ids[1]);
      expect(oldestEntry).toBeDefined();
      expect(stats.oldestEntry).toBe(oldestEntry?.createdAt);
    });

    it('should handle removal of oldest entry', () => {
      const id1 = dlq.add({ type: 'embedding', operation: 'op1', payload: {}, error: 'err1' });
      vi.advanceTimersByTime(10);
      const id2 = dlq.add({ type: 'embedding', operation: 'op2', payload: {}, error: 'err2' });
      vi.advanceTimersByTime(10);
      const id3 = dlq.add({ type: 'embedding', operation: 'op3', payload: {}, error: 'err3' });

      // Remove oldest
      dlq.remove(id1);

      const stats = dlq.getStats();
      const entry2 = dlq.get(id2);
      expect(stats.oldestEntry).toBe(entry2?.createdAt);
    });

    it('should handle empty queue oldest entry tracker', () => {
      const stats = dlq.getStats();
      expect(stats.oldestEntry).toBeNull();
    });
  });

  describe('Retry Count Tracking', () => {
    it('should track attempt counts', async () => {
      const id = dlq.add({
        type: 'embedding',
        operation: 'generate',
        payload: { text: 'test' },
        error: 'Initial failure',
      });

      const handler = vi.fn().mockRejectedValue(new Error('Retry failed'));
      dlq.registerRetryHandler('generate', handler);

      await dlq.retry(id);

      const entry = dlq.get(id);
      expect(entry?.attempts).toBe(2); // Initial + 1 retry
    });

    it('should increment attempts on each retry', async () => {
      const id = dlq.add({
        type: 'api',
        operation: 'fetch',
        payload: { url: 'test' },
        error: 'Failed',
      });

      const handler = vi.fn().mockRejectedValue(new Error('Still failing'));
      dlq.registerRetryHandler('fetch', handler);

      // Retry 3 times
      for (let i = 0; i < 3; i++) {
        await dlq.retry(id);
      }

      const entry = dlq.get(id);
      expect(entry?.attempts).toBe(4); // Initial + 3 retries
    });

    it('should mark entry as exhausted after max attempts', async () => {
      const id = dlq.add({
        type: 'vector',
        operation: 'insert',
        payload: { data: 'test' },
        error: 'Insert failed',
      });

      const handler = vi.fn().mockRejectedValue(new Error('Persistent failure'));
      dlq.registerRetryHandler('insert', handler);

      // Retry until exhausted (maxAttempts = 3)
      await dlq.retry(id); // Attempt 2
      await dlq.retry(id); // Attempt 3 (exhausted)

      const entry = dlq.get(id);
      expect(entry?.attempts).toBe(3);

      const exhausted = dlq.getExhausted();
      expect(exhausted).toHaveLength(1);
      expect(exhausted[0].id).toBe(id);
    });

    it('should update lastAttemptAt on retry', async () => {
      const id = dlq.add({
        type: 'sync',
        operation: 'upload',
        payload: {},
        error: 'Upload failed',
      });

      const entry = dlq.get(id);
      const initialLastAttempt = entry?.lastAttemptAt;

      vi.advanceTimersByTime(5000);

      const handler = vi.fn().mockRejectedValue(new Error('Still failing'));
      dlq.registerRetryHandler('upload', handler);

      await dlq.retry(id);

      const updatedEntry = dlq.get(id);
      expect(updatedEntry?.lastAttemptAt).toBeGreaterThan(initialLastAttempt!);
    });
  });

  describe('Error Categorization', () => {
    it('should get entries by type', () => {
      dlq.add({ type: 'embedding', operation: 'gen1', payload: {}, error: 'err1' });
      dlq.add({ type: 'embedding', operation: 'gen2', payload: {}, error: 'err2' });
      dlq.add({ type: 'vector', operation: 'ins1', payload: {}, error: 'err3' });
      dlq.add({ type: 'api', operation: 'call1', payload: {}, error: 'err4' });

      const embeddings = dlq.getByType('embedding');
      expect(embeddings).toHaveLength(2);
      expect(embeddings.every(e => e.type === 'embedding')).toBe(true);

      const vectors = dlq.getByType('vector');
      expect(vectors).toHaveLength(1);
      expect(vectors[0].type).toBe('vector');
    });

    it('should return empty array for type with no entries', () => {
      dlq.add({ type: 'embedding', operation: 'gen', payload: {}, error: 'err' });

      const syncs = dlq.getByType('sync');
      expect(syncs).toHaveLength(0);
    });

    it('should categorize all operation types', () => {
      const types: DLQOperationType[] = ['embedding', 'vector', 'api', 'sync', 'other'];

      types.forEach((type, i) => {
        dlq.add({ type, operation: `op${i}`, payload: {}, error: `err${i}` });
      });

      types.forEach(type => {
        const entries = dlq.getByType(type);
        expect(entries).toHaveLength(1);
        expect(entries[0].type).toBe(type);
      });
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate next retry time with exponential backoff', async () => {
      // Use higher maxAttempts to test backoff calculation
      const dlqForBackoff = new DeadLetterQueue({
        maxSize: 10,
        maxAttempts: 10,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
        backoffMultiplier: 2,
        useCircuitBreaker: false,
      });

      const id = dlqForBackoff.add({
        type: 'api',
        operation: 'fetch',
        payload: {},
        error: 'Failed',
      });

      const handler = vi.fn().mockRejectedValue(new Error('Still failing'));
      dlqForBackoff.registerRetryHandler('fetch', handler);

      const entry1 = dlqForBackoff.get(id);
      const nextRetry1 = entry1?.nextRetryAt;
      expect(nextRetry1).toBe(entry1!.createdAt + 1000); // initialDelayMs (attempts=1)

      await dlqForBackoff.retry(id);

      const entry2 = dlqForBackoff.get(id);
      const delay2 = entry2!.nextRetryAt - entry2!.lastAttemptAt;
      expect(delay2).toBe(2000); // 1000 * 2^(2-1) = 1000 * 2^1 (attempts=2)

      await dlqForBackoff.retry(id);

      const entry3 = dlqForBackoff.get(id);
      const delay3 = entry3!.nextRetryAt - entry3!.lastAttemptAt;
      expect(delay3).toBe(4000); // 1000 * 2^(3-1) = 1000 * 2^2 (attempts=3)

      dlqForBackoff.clear();
    });

    it('should cap retry delay at maxRetryDelayMs', async () => {
      const dlqWithLowMax = new DeadLetterQueue({
        maxSize: 10,
        maxAttempts: 10,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 5000,
        backoffMultiplier: 2,
        useCircuitBreaker: false,
      });

      const id = dlqWithLowMax.add({
        type: 'api',
        operation: 'fetch',
        payload: {},
        error: 'Failed',
      });

      const handler = vi.fn().mockRejectedValue(new Error('Still failing'));
      dlqWithLowMax.registerRetryHandler('fetch', handler);

      // Retry multiple times to exceed max delay
      for (let i = 0; i < 5; i++) {
        await dlqWithLowMax.retry(id);
      }

      const entry = dlqWithLowMax.get(id);
      const delay = entry!.nextRetryAt - entry!.lastAttemptAt;
      expect(delay).toBe(5000); // Capped at maxRetryDelayMs

      dlqWithLowMax.clear();
    });

    it('should use default backoff multiplier', () => {
      const defaultDlq = new DeadLetterQueue(); // Uses DEFAULT_CONFIG

      const id = defaultDlq.add({
        type: 'embedding',
        operation: 'gen',
        payload: {},
        error: 'Failed',
      });

      const entry = defaultDlq.get(id);
      // Default initialRetryDelayMs is 1000
      expect(entry?.nextRetryAt).toBe(entry!.createdAt + 1000);

      defaultDlq.clear();
    });
  });

  describe('Retry Operations', () => {
    it('should successfully retry and remove from queue', async () => {
      const id = dlq.add({
        type: 'embedding',
        operation: 'generate',
        payload: { text: 'test' },
        error: 'Initial failure',
      });

      const handler = vi.fn().mockResolvedValue(undefined);
      dlq.registerRetryHandler('generate', handler);

      const result = await dlq.retry(id);

      expect(result.success).toBe(true);
      expect(result.removed).toBe(true);
      expect(dlq.get(id)).toBeUndefined();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should keep entry in queue after failed retry', async () => {
      const id = dlq.add({
        type: 'vector',
        operation: 'insert',
        payload: { data: 'test' },
        error: 'Insert failed',
      });

      const handler = vi.fn().mockRejectedValue(new Error('Retry failed'));
      dlq.registerRetryHandler('insert', handler);

      const result = await dlq.retry(id);

      expect(result.success).toBe(false);
      expect(result.removed).toBe(false);
      expect(dlq.get(id)).toBeDefined();
    });

    it('should return error when entry not found', async () => {
      const result = await dlq.retry('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Entry not found');
      expect(result.removed).toBe(false);
    });

    it('should return error when handler not registered', async () => {
      const id = dlq.add({
        type: 'api',
        operation: 'unknown',
        payload: {},
        error: 'Failed',
      });

      const result = await dlq.retry(id);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('No handler');
      expect(result.removed).toBe(false);
    });

    it('should pass entry to retry handler', async () => {
      const payload = { text: 'test data' };
      const id = dlq.add({
        type: 'embedding',
        operation: 'generate',
        payload,
        error: 'Failed',
      });

      const handler = vi.fn().mockResolvedValue(undefined);
      dlq.registerRetryHandler('generate', handler);

      await dlq.retry(id);

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        id,
        type: 'embedding',
        operation: 'generate',
        payload,
      }));
    });

    it('should update error message on failed retry', async () => {
      const id = dlq.add({
        type: 'sync',
        operation: 'upload',
        payload: {},
        error: 'Initial error',
      });

      const handler = vi.fn().mockRejectedValue(new Error('New error message'));
      dlq.registerRetryHandler('upload', handler);

      await dlq.retry(id);

      const entry = dlq.get(id);
      expect(entry?.error).toBe('New error message');
    });
  });

  describe('Retry Scheduling', () => {
    it('should get entries ready for retry', () => {
      const now = Date.now();

      // Add entry that's ready
      const id1 = dlq.add({
        type: 'embedding',
        operation: 'gen1',
        payload: {},
        error: 'err1',
      });
      const entry1 = dlq.get(id1);
      entry1!.nextRetryAt = now - 1000; // Ready now

      // Add entry not ready yet
      const id2 = dlq.add({
        type: 'embedding',
        operation: 'gen2',
        payload: {},
        error: 'err2',
      });
      const entry2 = dlq.get(id2);
      entry2!.nextRetryAt = now + 5000; // Not ready

      const ready = dlq.getReadyForRetry();
      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe(id1);
    });

    it('should sort ready entries by nextRetryAt', () => {
      const now = Date.now();

      const id1 = dlq.add({
        type: 'embedding',
        operation: 'gen1',
        payload: {},
        error: 'err1',
      });
      const entry1 = dlq.get(id1);
      entry1!.nextRetryAt = now - 1000;

      const id2 = dlq.add({
        type: 'embedding',
        operation: 'gen2',
        payload: {},
        error: 'err2',
      });
      const entry2 = dlq.get(id2);
      entry2!.nextRetryAt = now - 5000;

      const ready = dlq.getReadyForRetry();
      expect(ready).toHaveLength(2);
      expect(ready[0].id).toBe(id2); // Older retry time first
      expect(ready[1].id).toBe(id1);
    });

    it('should exclude exhausted entries from ready list', () => {
      const now = Date.now();

      const id = dlq.add({
        type: 'embedding',
        operation: 'gen',
        payload: {},
        error: 'err',
      });

      const entry = dlq.get(id);
      entry!.attempts = 3; // Max attempts
      entry!.nextRetryAt = now - 1000; // Would be ready, but exhausted

      const ready = dlq.getReadyForRetry();
      expect(ready).toHaveLength(0);
    });
  });

  describe('Exhausted Entries', () => {
    it('should get all exhausted entries', () => {
      const id1 = dlq.add({
        type: 'embedding',
        operation: 'gen1',
        payload: {},
        error: 'err1',
      });
      const entry1 = dlq.get(id1);
      entry1!.attempts = 3;

      const id2 = dlq.add({
        type: 'vector',
        operation: 'ins1',
        payload: {},
        error: 'err2',
      });
      const entry2 = dlq.get(id2);
      entry2!.attempts = 3;

      // Not exhausted
      dlq.add({
        type: 'api',
        operation: 'call1',
        payload: {},
        error: 'err3',
      });

      const exhausted = dlq.getExhausted();
      expect(exhausted).toHaveLength(2);
      expect(exhausted.every(e => e.attempts >= e.maxAttempts)).toBe(true);
    });

    it('should clear only exhausted entries', () => {
      const id1 = dlq.add({
        type: 'embedding',
        operation: 'gen1',
        payload: {},
        error: 'err1',
      });
      const entry1 = dlq.get(id1);
      entry1!.attempts = 3; // Exhausted

      const id2 = dlq.add({
        type: 'vector',
        operation: 'ins1',
        payload: {},
        error: 'err2',
      });
      // entry2 not exhausted (attempts = 1)

      const id3 = dlq.add({
        type: 'api',
        operation: 'call1',
        payload: {},
        error: 'err3',
      });
      const entry3 = dlq.get(id3);
      entry3!.attempts = 3; // Exhausted

      const cleared = dlq.clearExhausted();
      expect(cleared).toBe(2);
      expect(dlq.size).toBe(1);
      expect(dlq.get(id1)).toBeUndefined();
      expect(dlq.get(id2)).toBeDefined();
      expect(dlq.get(id3)).toBeUndefined();
    });

    it('should update oldest entry tracker when clearing exhausted', () => {
      const id1 = dlq.add({
        type: 'embedding',
        operation: 'gen1',
        payload: {},
        error: 'err1',
      });
      vi.advanceTimersByTime(10);

      const id2 = dlq.add({
        type: 'embedding',
        operation: 'gen2',
        payload: {},
        error: 'err2',
      });

      const entry1 = dlq.get(id1);
      entry1!.attempts = 3; // Exhausted

      dlq.clearExhausted();

      const stats = dlq.getStats();
      const entry2 = dlq.get(id2);
      expect(stats.oldestEntry).toBe(entry2?.createdAt);
    });

    it('should return 0 when clearing exhausted with no exhausted entries', () => {
      dlq.add({ type: 'embedding', operation: 'gen', payload: {}, error: 'err' });

      const cleared = dlq.clearExhausted();
      expect(cleared).toBe(0);
      expect(dlq.size).toBe(1);
    });
  });

  describe('Batch Processing', () => {
    it('should process all ready retries', async () => {
      const now = Date.now();

      const id1 = dlq.add({
        type: 'embedding',
        operation: 'generate',
        payload: { text: 'test1' },
        error: 'err1',
      });
      const id2 = dlq.add({
        type: 'embedding',
        operation: 'generate',
        payload: { text: 'test2' },
        error: 'err2',
      });
      const id3 = dlq.add({
        type: 'embedding',
        operation: 'generate',
        payload: { text: 'test3' },
        error: 'err3',
      });

      // Make all ready
      dlq.get(id1)!.nextRetryAt = now - 1000;
      dlq.get(id2)!.nextRetryAt = now - 1000;
      dlq.get(id3)!.nextRetryAt = now - 1000;

      const handler = vi.fn()
        .mockResolvedValueOnce(undefined) // id1 succeeds
        .mockRejectedValueOnce(new Error('fail')) // id2 fails
        .mockResolvedValueOnce(undefined); // id3 succeeds

      dlq.registerRetryHandler('generate', handler);

      const result = await dlq.processRetries();

      expect(result.processed).toBe(3);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(dlq.size).toBe(1); // Only failed entry remains
      expect(dlq.get(id2)).toBeDefined();
    });

    it('should return zero results when no entries ready', async () => {
      dlq.add({
        type: 'embedding',
        operation: 'generate',
        payload: {},
        error: 'err',
      });

      const handler = vi.fn().mockResolvedValue(undefined);
      dlq.registerRetryHandler('generate', handler);

      const result = await dlq.processRetries();

      expect(result.processed).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Auto Retry', () => {
    it('should start auto retry interval', () => {
      dlq.startAutoRetry(5000);

      // Verify interval was set (can't directly test setInterval, but can test side effects)
      // If called again, should not create duplicate
      dlq.startAutoRetry(5000); // Should be ignored

      dlq.stopAutoRetry();
    });

    it('should stop auto retry interval', () => {
      dlq.startAutoRetry(5000);
      dlq.stopAutoRetry();

      // Calling stop again should be safe
      dlq.stopAutoRetry();
    });

    it('should process retries on interval', async () => {
      const now = Date.now();
      const id = dlq.add({
        type: 'embedding',
        operation: 'generate',
        payload: {},
        error: 'err',
      });
      dlq.get(id)!.nextRetryAt = now - 1000;

      let handlerResolveFn: (() => void) | null = null;
      const handlerPromise = new Promise<void>((resolve) => {
        handlerResolveFn = resolve;
      });

      const handler = vi.fn().mockImplementation(async () => {
        if (handlerResolveFn) handlerResolveFn();
        return undefined;
      });

      dlq.registerRetryHandler('generate', handler);

      dlq.startAutoRetry(1000);

      // Advance timer to trigger interval
      await vi.advanceTimersByTimeAsync(1100);

      // Wait for handler to be called
      await handlerPromise;

      expect(handler).toHaveBeenCalled();

      dlq.stopAutoRetry();
    }, 10000); // Increase timeout to 10s

    it('should handle errors during auto retry gracefully', async () => {
      const now = Date.now();
      const id = dlq.add({
        type: 'embedding',
        operation: 'generate',
        payload: {},
        error: 'err',
      });
      dlq.get(id)!.nextRetryAt = now - 1000;

      // Handler that throws
      const handler = vi.fn().mockRejectedValue(new Error('Handler error'));
      dlq.registerRetryHandler('generate', handler);

      dlq.startAutoRetry(1000);

      // Should not throw
      await vi.advanceTimersByTimeAsync(1100);

      dlq.stopAutoRetry();
    });
  });

  describe('Statistics', () => {
    it('should return correct statistics', () => {
      dlq.add({ type: 'embedding', operation: 'gen1', payload: {}, error: 'err1' });
      vi.advanceTimersByTime(10);
      dlq.add({ type: 'embedding', operation: 'gen2', payload: {}, error: 'err2' });
      vi.advanceTimersByTime(10);
      dlq.add({ type: 'vector', operation: 'ins1', payload: {}, error: 'err3' });
      vi.advanceTimersByTime(10);
      dlq.add({ type: 'api', operation: 'call1', payload: {}, error: 'err4' });

      const stats = dlq.getStats();

      expect(stats.total).toBe(4);
      expect(stats.byType.embedding).toBe(2);
      expect(stats.byType.vector).toBe(1);
      expect(stats.byType.api).toBe(1);
      expect(stats.byType.sync).toBe(0);
      expect(stats.byType.other).toBe(0);
    });

    it('should track operations', () => {
      dlq.add({ type: 'embedding', operation: 'generate', payload: {}, error: 'err1' });
      dlq.add({ type: 'embedding', operation: 'generate', payload: {}, error: 'err2' });
      dlq.add({ type: 'vector', operation: 'insert', payload: {}, error: 'err3' });

      const stats = dlq.getStats();

      expect(stats.byOperation.generate).toBe(2);
      expect(stats.byOperation.insert).toBe(1);
    });

    it('should calculate average attempts', () => {
      const id1 = dlq.add({ type: 'embedding', operation: 'gen', payload: {}, error: 'err1' });
      const id2 = dlq.add({ type: 'vector', operation: 'ins', payload: {}, error: 'err2' });
      const id3 = dlq.add({ type: 'api', operation: 'call', payload: {}, error: 'err3' });

      dlq.get(id1)!.attempts = 1;
      dlq.get(id2)!.attempts = 2;
      dlq.get(id3)!.attempts = 3;

      const stats = dlq.getStats();
      expect(stats.avgAttempts).toBe(2); // (1 + 2 + 3) / 3
    });

    it('should count exhausted entries', () => {
      const id1 = dlq.add({ type: 'embedding', operation: 'gen', payload: {}, error: 'err1' });
      const id2 = dlq.add({ type: 'vector', operation: 'ins', payload: {}, error: 'err2' });
      dlq.add({ type: 'api', operation: 'call', payload: {}, error: 'err3' });

      dlq.get(id1)!.attempts = 3;
      dlq.get(id2)!.attempts = 3;

      const stats = dlq.getStats();
      expect(stats.exhausted).toBe(2);
    });

    it('should return oldest entry timestamp', () => {
      const now = Date.now();

      dlq.add({ type: 'embedding', operation: 'gen1', payload: {}, error: 'err1' });
      vi.advanceTimersByTime(1000);

      dlq.add({ type: 'embedding', operation: 'gen2', payload: {}, error: 'err2' });

      const stats = dlq.getStats();
      expect(stats.oldestEntry).toBeGreaterThanOrEqual(now);
      expect(stats.oldestEntry).toBeLessThan(now + 1000);
    });

    it('should return null oldestEntry for empty queue', () => {
      const stats = dlq.getStats();
      expect(stats.oldestEntry).toBeNull();
    });

    it('should handle stats for empty queue', () => {
      const stats = dlq.getStats();

      expect(stats.total).toBe(0);
      expect(stats.avgAttempts).toBe(0);
      expect(stats.exhausted).toBe(0);
      expect(stats.oldestEntry).toBeNull();
    });
  });

  describe('Handler Registration', () => {
    it('should register retry handler', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      dlq.registerRetryHandler('test-operation', handler);

      // Verify by trying to use it
      const id = dlq.add({
        type: 'other',
        operation: 'test-operation',
        payload: {},
        error: 'err',
      });

      dlq.retry(id);
      expect(handler).toHaveBeenCalled();
    });

    it('should allow multiple handlers for different operations', () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      dlq.registerRetryHandler('op1', handler1);
      dlq.registerRetryHandler('op2', handler2);

      const id1 = dlq.add({ type: 'other', operation: 'op1', payload: {}, error: 'err' });
      const id2 = dlq.add({ type: 'other', operation: 'op2', payload: {}, error: 'err' });

      dlq.retry(id1);
      dlq.retry(id2);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should override handler when registered twice', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      dlq.registerRetryHandler('operation', handler1);
      dlq.registerRetryHandler('operation', handler2);

      const id = dlq.add({ type: 'other', operation: 'operation', payload: {}, error: 'err' });

      await dlq.retry(id);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should use circuit breaker when enabled', async () => {
      const dlqWithCB = new DeadLetterQueue({
        maxSize: 10,
        maxAttempts: 3,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
        backoffMultiplier: 2,
        useCircuitBreaker: true,
      });

      const id = dlqWithCB.add({
        type: 'api',
        operation: 'fetch',
        payload: {},
        error: 'Failed',
      });

      const handler = vi.fn().mockResolvedValue(undefined);
      dlqWithCB.registerRetryHandler('fetch', handler);

      const result = await dlqWithCB.retry(id);

      expect(result.success).toBe(true);
      expect(handler).toHaveBeenCalled();

      dlqWithCB.clear();
    });

    it('should handle circuit breaker failures', async () => {
      const dlqWithCB = new DeadLetterQueue({
        maxSize: 10,
        maxAttempts: 5,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
        backoffMultiplier: 2,
        useCircuitBreaker: true,
      });

      const id = dlqWithCB.add({
        type: 'api',
        operation: 'fetch',
        payload: {},
        error: 'Failed',
      });

      const handler = vi.fn().mockRejectedValue(new Error('CB failure'));
      dlqWithCB.registerRetryHandler('fetch', handler);

      const result = await dlqWithCB.retry(id);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('CB failure');

      dlqWithCB.clear();
    });
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const defaultDlq = new DeadLetterQueue();

      const id = defaultDlq.add({
        type: 'embedding',
        operation: 'gen',
        payload: {},
        error: 'err',
      });

      const entry = defaultDlq.get(id);
      expect(entry?.maxAttempts).toBe(5); // Default
      expect(entry?.nextRetryAt).toBe(entry!.createdAt + 1000); // Default initialDelayMs

      defaultDlq.clear();
    });

    it('should accept partial configuration', () => {
      const customDlq = new DeadLetterQueue({
        maxSize: 100,
        maxAttempts: 10,
      });

      const id = customDlq.add({
        type: 'embedding',
        operation: 'gen',
        payload: {},
        error: 'err',
      });

      const entry = customDlq.get(id);
      expect(entry?.maxAttempts).toBe(10);

      customDlq.clear();
    });

    it('should allow custom backoff configuration', async () => {
      const customDlq = new DeadLetterQueue({
        maxSize: 10,
        maxAttempts: 5,
        initialRetryDelayMs: 500,
        maxRetryDelayMs: 10000,
        backoffMultiplier: 3,
        useCircuitBreaker: false,
      });

      const id = customDlq.add({
        type: 'api',
        operation: 'fetch',
        payload: {},
        error: 'err',
      });

      const handler = vi.fn().mockRejectedValue(new Error('fail'));
      customDlq.registerRetryHandler('fetch', handler);

      await customDlq.retry(id);

      const entry = customDlq.get(id);
      const delay = entry!.nextRetryAt - entry!.lastAttemptAt;
      expect(delay).toBe(1500); // 500 * 3^1

      customDlq.clear();
    });
  });

  describe('Edge Cases', () => {
    it('should handle ID collision prevention', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const id = dlq.add({
          type: 'embedding',
          operation: `op${i}`,
          payload: { index: i },
          error: `err ${i}`,
        });
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
    });

    it('should handle empty payload', () => {
      const id = dlq.add({
        type: 'other',
        operation: 'test',
        payload: {},
        error: 'err',
      });

      const entry = dlq.get(id);
      expect(entry?.payload).toEqual({});
    });

    it('should handle complex payload types', () => {
      const complexPayload = {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        nullValue: null,
        undefinedValue: undefined,
      };

      const id = dlq.add({
        type: 'other',
        operation: 'test',
        payload: complexPayload,
        error: 'err',
      });

      const entry = dlq.get(id);
      expect(entry?.payload).toEqual(complexPayload);
    });

    it('should handle very long error messages', () => {
      const longError = 'x'.repeat(10000);

      const id = dlq.add({
        type: 'embedding',
        operation: 'gen',
        payload: {},
        error: longError,
      });

      const entry = dlq.get(id);
      expect(entry?.error).toBe(longError);
    });

    it('should handle concurrent adds', () => {
      // Use a larger queue for this test
      const largeDlq = new DeadLetterQueue({
        maxSize: 20,
        maxAttempts: 3,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
        backoffMultiplier: 2,
        useCircuitBreaker: false,
      });

      const ids: string[] = [];

      // Simulate concurrent adds
      for (let i = 0; i < 10; i++) {
        ids.push(largeDlq.add({
          type: 'embedding',
          operation: `op${i}`,
          payload: {},
          error: `err${i}`,
        }));
      }

      // All should be unique and present
      expect(new Set(ids).size).toBe(10);
      ids.forEach(id => {
        expect(largeDlq.get(id)).toBeDefined();
      });

      largeDlq.clear();
    });

    it('should maintain integrity after multiple clear operations', () => {
      dlq.add({ type: 'embedding', operation: 'gen', payload: {}, error: 'err' });
      dlq.clear();
      dlq.add({ type: 'vector', operation: 'ins', payload: {}, error: 'err' });
      dlq.clear();
      dlq.add({ type: 'api', operation: 'call', payload: {}, error: 'err' });

      expect(dlq.size).toBe(1);
      const stats = dlq.getStats();
      expect(stats.total).toBe(1);
    });
  });
});

describe('Singleton DLQ Instances', () => {
  afterEach(() => {
    resetAllDLQs();
  });

  describe('getEmbeddingDLQ', () => {
    it('should return singleton instance', () => {
      const dlq1 = getEmbeddingDLQ();
      const dlq2 = getEmbeddingDLQ();

      expect(dlq1).toBe(dlq2);
    });

    it('should accept embedding-specific payloads', () => {
      const dlq = getEmbeddingDLQ();

      const id = dlq.add({
        type: 'embedding',
        operation: 'generate',
        payload: {
          entryType: 'knowledge',
          entryId: '123',
          text: 'test text',
        },
        error: 'Generation failed',
      });

      const entry = dlq.get(id);
      expect(entry?.payload.text).toBe('test text');
      expect(entry?.payload.entryType).toBe('knowledge');
    });
  });

  describe('getVectorDLQ', () => {
    it('should return singleton instance', () => {
      const dlq1 = getVectorDLQ();
      const dlq2 = getVectorDLQ();

      expect(dlq1).toBe(dlq2);
    });

    it('should accept vector-specific payloads', () => {
      const dlq = getVectorDLQ();

      const id = dlq.add({
        type: 'vector',
        operation: 'insert',
        payload: {
          entryType: 'guideline',
          entryId: '456',
          embedding: [0.1, 0.2, 0.3],
        },
        error: 'Insert failed',
      });

      const entry = dlq.get(id);
      expect(entry?.payload.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(entry?.payload.entryType).toBe('guideline');
    });
  });

  describe('getGeneralDLQ', () => {
    it('should return singleton instance', () => {
      const dlq1 = getGeneralDLQ();
      const dlq2 = getGeneralDLQ();

      expect(dlq1).toBe(dlq2);
    });

    it('should accept any payload type', () => {
      const dlq = getGeneralDLQ();

      const id = dlq.add({
        type: 'other',
        operation: 'custom',
        payload: { custom: 'data', value: 42 },
        error: 'Operation failed',
      });

      const entry = dlq.get(id);
      expect(entry?.payload).toEqual({ custom: 'data', value: 42 });
    });
  });

  describe('resetAllDLQs', () => {
    it('should reset all singleton instances', () => {
      const embeddingDlq = getEmbeddingDLQ();
      const vectorDlq = getVectorDLQ();
      const generalDlq = getGeneralDLQ();

      embeddingDlq.add({
        type: 'embedding',
        operation: 'gen',
        payload: { entryType: 'knowledge', entryId: '1', text: 'test' },
        error: 'err',
      });
      vectorDlq.add({
        type: 'vector',
        operation: 'ins',
        payload: { entryType: 'guideline', entryId: '2', embedding: [1, 2] },
        error: 'err',
      });
      generalDlq.add({
        type: 'other',
        operation: 'op',
        payload: { data: 'test' },
        error: 'err',
      });

      expect(embeddingDlq.size).toBeGreaterThan(0);
      expect(vectorDlq.size).toBeGreaterThan(0);
      expect(generalDlq.size).toBeGreaterThan(0);

      resetAllDLQs();

      // After reset, new instances should be created
      const newEmbeddingDlq = getEmbeddingDLQ();
      const newVectorDlq = getVectorDLQ();
      const newGeneralDlq = getGeneralDLQ();

      expect(newEmbeddingDlq.size).toBe(0);
      expect(newVectorDlq.size).toBe(0);
      expect(newGeneralDlq.size).toBe(0);
    });

    it('should stop auto retry on all instances', () => {
      const embeddingDlq = getEmbeddingDLQ();
      const vectorDlq = getVectorDLQ();
      const generalDlq = getGeneralDLQ();

      embeddingDlq.startAutoRetry(1000);
      vectorDlq.startAutoRetry(1000);
      generalDlq.startAutoRetry(1000);

      resetAllDLQs();

      // Should not throw and should be safe
      const newEmbeddingDlq = getEmbeddingDLQ();
      newEmbeddingDlq.stopAutoRetry(); // Should be no-op
    });

    it('should allow resetAllDLQs to be called multiple times', () => {
      resetAllDLQs();
      resetAllDLQs();
      resetAllDLQs();

      const dlq = getGeneralDLQ();
      expect(dlq.size).toBe(0);
    });
  });

  describe('Singleton Isolation', () => {
    it('should maintain separate queues for each singleton', () => {
      const embeddingDlq = getEmbeddingDLQ();
      const vectorDlq = getVectorDLQ();
      const generalDlq = getGeneralDLQ();

      embeddingDlq.add({
        type: 'embedding',
        operation: 'gen',
        payload: { entryType: 'knowledge', entryId: '1', text: 'test' },
        error: 'err1',
      });

      vectorDlq.add({
        type: 'vector',
        operation: 'ins',
        payload: { entryType: 'guideline', entryId: '2', embedding: [1, 2] },
        error: 'err2',
      });

      generalDlq.add({
        type: 'api',
        operation: 'call',
        payload: { url: 'test' },
        error: 'err3',
      });

      expect(embeddingDlq.size).toBe(1);
      expect(vectorDlq.size).toBe(1);
      expect(generalDlq.size).toBe(1);

      const embeddingStats = embeddingDlq.getStats();
      expect(embeddingStats.byType.embedding).toBe(1);
      expect(embeddingStats.byType.vector).toBe(0);

      const vectorStats = vectorDlq.getStats();
      expect(vectorStats.byType.vector).toBe(1);
      expect(vectorStats.byType.embedding).toBe(0);
    });
  });
});
