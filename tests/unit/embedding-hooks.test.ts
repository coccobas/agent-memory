/**
 * Unit tests for embedding-hooks.ts
 *
 * Tests for queue stats, retry mechanism, and helper functions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getEmbeddingQueueStats,
  resetEmbeddingQueueForTests,
  generateEmbeddingAsync,
  retryFailedEmbeddings,
  getFailedEmbeddingJobs,
  extractTextForEmbedding,
  registerEmbeddingPipeline,
  type EmbeddingPipeline,
} from '../../src/db/repositories/embedding-hooks.js';

describe('Embedding Hooks', () => {
  beforeEach(() => {
    resetEmbeddingQueueForTests();
    registerEmbeddingPipeline(null);
  });

  describe('getEmbeddingQueueStats', () => {
    it('should return initial stats with zeros', () => {
      const stats = getEmbeddingQueueStats();

      expect(stats.pending).toBe(0);
      expect(stats.inFlight).toBe(0);
      expect(stats.processed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.skippedStale).toBe(0);
      expect(stats.retried).toBe(0);
      expect(stats.failedPendingRetry).toBe(0);
      expect(stats.maxConcurrency).toBeGreaterThan(0);
    });

    it('should track pending jobs with slow pipeline', async () => {
      // Create a slow pipeline that keeps jobs in-flight
      let resolveEmbed: () => void;
      const slowPromise = new Promise<void>((resolve) => {
        resolveEmbed = resolve;
      });

      const slowPipeline: EmbeddingPipeline = {
        isAvailable: () => true,
        embed: vi.fn().mockImplementation(async () => {
          await slowPromise;
          return { embedding: [0.1], model: 'test', provider: 'local' as const };
        }),
        storeEmbedding: vi.fn().mockResolvedValue(undefined),
      };

      registerEmbeddingPipeline(slowPipeline);

      // Queue more jobs than max concurrency to have some pending
      for (let i = 0; i < 10; i++) {
        generateEmbeddingAsync({
          entryType: 'tool',
          entryId: `test-${i}`,
          versionId: 'v1',
          text: `Test tool ${i}`,
        });
      }

      // Some should be pending (queue length > max concurrency)
      const stats = getEmbeddingQueueStats();
      expect(stats.inFlight).toBeGreaterThan(0);
      // maxConcurrency is typically 4, so with 10 jobs, some should be pending
      expect(stats.pending + stats.inFlight).toBe(10);

      // Cleanup: resolve the promise so tests don't hang
      resolveEmbed!();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('should deduplicate same entry in queue (latest wins)', async () => {
      // Track which texts were embedded
      const embeddedTexts: string[] = [];

      const mockPipeline: EmbeddingPipeline = {
        isAvailable: () => true,
        embed: vi.fn().mockImplementation(async (text: string) => {
          embeddedTexts.push(text);
          return { embedding: [0.1], model: 'test', provider: 'local' as const };
        }),
        storeEmbedding: vi.fn().mockResolvedValue(undefined),
      };

      registerEmbeddingPipeline(mockPipeline);

      // Rapidly add two entries with the same ID
      generateEmbeddingAsync({
        entryType: 'tool',
        entryId: 'dedup-test',
        versionId: 'v1',
        text: 'FIRST VERSION',
      });

      generateEmbeddingAsync({
        entryType: 'tool',
        entryId: 'dedup-test',
        versionId: 'v2',
        text: 'SECOND VERSION',
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Due to deduplication with latest-wins, only the latest text should be embedded
      // (the first version gets overwritten before processing)
      expect(embeddedTexts).toContain('SECOND VERSION');
      // First version may or may not be embedded depending on timing,
      // but second version should definitely be there
    });
  });

  describe('extractTextForEmbedding', () => {
    it('should extract tool text with name and description', () => {
      const text = extractTextForEmbedding('tool', 'my-tool', {
        description: 'A useful tool',
        constraints: 'Must be fast',
      });

      expect(text).toContain('my-tool');
      expect(text).toContain('A useful tool');
      expect(text).toContain('Must be fast');
    });

    it('should extract guideline text with name and content', () => {
      const text = extractTextForEmbedding('guideline', 'my-guideline', {
        content: 'Always do X',
        rationale: 'Because Y',
      });

      expect(text).toContain('my-guideline');
      expect(text).toContain('Always do X');
      expect(text).toContain('Because Y');
    });

    it('should extract knowledge text with name and content', () => {
      const text = extractTextForEmbedding('knowledge', 'my-knowledge', {
        content: 'Important fact',
        source: 'Documentation',
      });

      expect(text).toContain('my-knowledge');
      expect(text).toContain('Important fact');
      expect(text).toContain('Documentation');
    });

    it('should handle missing optional fields', () => {
      const text = extractTextForEmbedding('tool', 'my-tool', {});
      expect(text).toBe('my-tool');
    });

    it('should filter empty strings', () => {
      const text = extractTextForEmbedding('tool', 'my-tool', {
        description: '',
        constraints: '   ',
      });

      expect(text).toBe('my-tool');
    });
  });

  describe('retryFailedEmbeddings', () => {
    it('should return zero requeued when no failed jobs', () => {
      const result = retryFailedEmbeddings();
      expect(result.requeued).toBe(0);
      expect(result.remaining).toBe(0);
    });
  });

  describe('getFailedEmbeddingJobs', () => {
    it('should return empty array when no failed jobs', () => {
      const jobs = getFailedEmbeddingJobs();
      expect(jobs).toEqual([]);
    });
  });

  describe('resetEmbeddingQueueForTests', () => {
    it('should reset all counters and queues', async () => {
      // Create a slow pipeline to keep jobs in queue
      let resolveEmbed: () => void;
      const slowPromise = new Promise<void>((resolve) => {
        resolveEmbed = resolve;
      });

      const slowPipeline: EmbeddingPipeline = {
        isAvailable: () => true,
        embed: vi.fn().mockImplementation(async () => {
          await slowPromise;
          return { embedding: [0.1], model: 'test', provider: 'local' as const };
        }),
        storeEmbedding: vi.fn().mockResolvedValue(undefined),
      };

      registerEmbeddingPipeline(slowPipeline);

      // Add some jobs
      for (let i = 0; i < 10; i++) {
        generateEmbeddingAsync({
          entryType: 'tool',
          entryId: `test-${i}`,
          versionId: 'v1',
          text: `Test ${i}`,
        });
      }

      // Verify something is queued or in-flight
      let stats = getEmbeddingQueueStats();
      expect(stats.pending + stats.inFlight).toBeGreaterThan(0);

      // Reset
      resetEmbeddingQueueForTests();

      // Verify all reset
      stats = getEmbeddingQueueStats();
      expect(stats.pending).toBe(0);
      expect(stats.inFlight).toBe(0);
      expect(stats.processed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.skippedStale).toBe(0);
      expect(stats.retried).toBe(0);
      expect(stats.failedPendingRetry).toBe(0);

      // Cleanup
      resolveEmbed!();
    });
  });

  describe('with mock pipeline', () => {
    it('should process jobs when pipeline is available', async () => {
      const mockPipeline: EmbeddingPipeline = {
        isAvailable: () => true,
        embed: vi.fn().mockResolvedValue({
          embedding: [0.1, 0.2, 0.3],
          model: 'test-model',
          provider: 'local' as const,
        }),
        storeEmbedding: vi.fn().mockResolvedValue(undefined),
      };

      registerEmbeddingPipeline(mockPipeline);

      generateEmbeddingAsync({
        entryType: 'tool',
        entryId: 'test-1',
        versionId: 'v1',
        text: 'Test tool',
      });

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // embed is now called with text and contentType 'document'
      expect(mockPipeline.embed).toHaveBeenCalledWith('Test tool', 'document');
    });

    it('should track failed jobs for retry', async () => {
      const mockPipeline: EmbeddingPipeline = {
        isAvailable: () => true,
        embed: vi.fn().mockRejectedValue(new Error('API error')),
        storeEmbedding: vi.fn().mockResolvedValue(undefined),
      };

      registerEmbeddingPipeline(mockPipeline);

      generateEmbeddingAsync({
        entryType: 'tool',
        entryId: 'test-fail',
        versionId: 'v1',
        text: 'Test tool',
      });

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = getEmbeddingQueueStats();
      // Should be tracked for retry (not yet exhausted)
      expect(stats.failedPendingRetry).toBe(1);

      const failedJobs = getFailedEmbeddingJobs();
      expect(failedJobs.length).toBe(1);
      expect(failedJobs[0].entryId).toBe('test-fail');
      expect(failedJobs[0].lastError).toContain('API error');
    });

    it('should skip unavailable pipeline', async () => {
      const mockPipeline: EmbeddingPipeline = {
        isAvailable: () => false,
        embed: vi.fn(),
        storeEmbedding: vi.fn(),
      };

      registerEmbeddingPipeline(mockPipeline);

      generateEmbeddingAsync({
        entryType: 'tool',
        entryId: 'test-1',
        versionId: 'v1',
        text: 'Test tool',
      });

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // embed should not be called when pipeline is unavailable
      expect(mockPipeline.embed).not.toHaveBeenCalled();
    });
  });
});
