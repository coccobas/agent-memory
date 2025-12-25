import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Semaphore,
  BoundedQueue,
  TokenBucketRateLimiter,
  MemoryPressureMonitor,
  backpressure,
  embeddingSemaphore,
  dbQuerySemaphore,
  apiRequestQueue,
  apiRateLimiter,
} from '../../src/utils/backpressure.js';
import { ResourceExhaustedError } from '../../src/core/errors.js';

describe('Semaphore', () => {
  describe('constructor', () => {
    it('should create semaphore with number argument', () => {
      const sem = new Semaphore(5);
      expect(sem.available()).toBe(5);
      expect(sem.getStats()).toEqual({
        current: 0,
        max: 5,
        waiting: 0,
      });
    });

    it('should create semaphore with options object', () => {
      const sem = new Semaphore({
        maxConcurrent: 10,
        name: 'test-semaphore',
        timeout: 5000,
      });
      expect(sem.available()).toBe(10);
      expect(sem.getStats().max).toBe(10);
    });

    it('should use default name when not provided', () => {
      const sem = new Semaphore(3);
      const stats = sem.getStats();
      expect(stats.max).toBe(3);
    });
  });

  describe('acquire', () => {
    it('should acquire permit immediately when available', async () => {
      const sem = new Semaphore(2);
      await sem.acquire();
      expect(sem.available()).toBe(1);
      expect(sem.waiting()).toBe(0);
    });

    it('should acquire multiple permits', async () => {
      const sem = new Semaphore(3);
      await sem.acquire();
      await sem.acquire();
      await sem.acquire();
      expect(sem.available()).toBe(0);
      expect(sem.getStats().current).toBe(3);
    });

    it('should wait when no permits available', async () => {
      const sem = new Semaphore(1);
      await sem.acquire();

      const promise = sem.acquire();
      expect(sem.waiting()).toBe(1);

      sem.release();
      await promise;
      expect(sem.waiting()).toBe(0);
    });

    it('should handle multiple waiters', async () => {
      const sem = new Semaphore(1);
      await sem.acquire();

      const waiter1 = sem.acquire();
      const waiter2 = sem.acquire();
      const waiter3 = sem.acquire();

      expect(sem.waiting()).toBe(3);

      sem.release();
      await waiter1;
      expect(sem.waiting()).toBe(2);

      sem.release();
      await waiter2;
      expect(sem.waiting()).toBe(1);

      sem.release();
      await waiter3;
      expect(sem.waiting()).toBe(0);
    });

    it('should timeout when configured', async () => {
      vi.useFakeTimers();

      const sem = new Semaphore({
        maxConcurrent: 1,
        timeout: 1000,
        name: 'timeout-test',
      });

      await sem.acquire();
      const promise = sem.acquire();

      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow(ResourceExhaustedError);
      await expect(promise).rejects.toThrow('Semaphore acquire timeout after 1000ms');

      vi.useRealTimers();
    });

    it('should clear timeout on successful acquire', async () => {
      vi.useFakeTimers();

      const sem = new Semaphore({
        maxConcurrent: 1,
        timeout: 1000,
      });

      await sem.acquire();
      const promise = sem.acquire();

      vi.advanceTimersByTime(500);
      sem.release();

      await promise;
      expect(sem.waiting()).toBe(0);

      vi.useRealTimers();
    });
  });

  describe('tryAcquire', () => {
    it('should acquire permit when available', () => {
      const sem = new Semaphore(2);
      expect(sem.tryAcquire()).toBe(true);
      expect(sem.available()).toBe(1);
    });

    it('should return false when no permits available', () => {
      const sem = new Semaphore(1);
      sem.tryAcquire();
      expect(sem.tryAcquire()).toBe(false);
      expect(sem.available()).toBe(0);
    });

    it('should not block when no permits available', () => {
      const sem = new Semaphore(0);
      const result = sem.tryAcquire();
      expect(result).toBe(false);
      expect(sem.waiting()).toBe(0);
    });
  });

  describe('release', () => {
    it('should increase available permits', () => {
      const sem = new Semaphore(2);
      sem.tryAcquire();
      expect(sem.available()).toBe(1);
      sem.release();
      expect(sem.available()).toBe(2);
    });

    it('should not exceed max permits', () => {
      const sem = new Semaphore(2);
      sem.release();
      sem.release();
      sem.release();
      expect(sem.available()).toBe(2);
    });

    it('should wake up waiters before increasing permits', async () => {
      const sem = new Semaphore(1);
      await sem.acquire();

      const promise = sem.acquire();
      expect(sem.waiting()).toBe(1);

      sem.release();
      await promise;

      expect(sem.available()).toBe(0);
      expect(sem.waiting()).toBe(0);
    });

    it('should handle multiple releases with waiters', async () => {
      const sem = new Semaphore(2);
      await sem.acquire();
      await sem.acquire();

      const waiter1 = sem.acquire();
      const waiter2 = sem.acquire();

      sem.release();
      sem.release();

      await Promise.all([waiter1, waiter2]);

      expect(sem.available()).toBe(0);
      expect(sem.waiting()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      const sem = new Semaphore(5);
      await sem.acquire();
      await sem.acquire();

      const stats = sem.getStats();
      expect(stats.current).toBe(2);
      expect(stats.max).toBe(5);
      expect(stats.waiting).toBe(0);

      sem.release();
      sem.release();
    });

    it('should track waiting count', async () => {
      const sem = new Semaphore(2);
      await sem.acquire();
      await sem.acquire();

      // Create a waiter
      const promise = sem.acquire();

      const stats = sem.getStats();
      expect(stats.current).toBe(2);
      expect(stats.max).toBe(2);
      expect(stats.waiting).toBe(1);

      sem.release();
      await promise;
    });
  });

  describe('integration scenarios', () => {
    it('should handle concurrent operations safely', async () => {
      const sem = new Semaphore(3);
      const results: number[] = [];
      const concurrentTasks = 10;

      const tasks = Array.from({ length: concurrentTasks }, async (_, i) => {
        await sem.acquire();
        try {
          results.push(i);
          await new Promise((resolve) => setTimeout(resolve, 10));
        } finally {
          sem.release();
        }
      });

      await Promise.all(tasks);

      expect(results).toHaveLength(concurrentTasks);
      expect(sem.available()).toBe(3);
    });

    it('should work with try-finally pattern', async () => {
      const sem = new Semaphore(1);

      const task = async () => {
        await sem.acquire();
        try {
          throw new Error('Task failed');
        } finally {
          sem.release();
        }
      };

      await expect(task()).rejects.toThrow('Task failed');
      expect(sem.available()).toBe(1);
    });
  });
});

describe('BoundedQueue', () => {
  describe('constructor', () => {
    it('should create queue with number argument', () => {
      const queue = new BoundedQueue<string>(10);
      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
      expect(queue.isFull()).toBe(false);
    });

    it('should create queue with options object', () => {
      const queue = new BoundedQueue<string>({
        maxSize: 5,
        name: 'test-queue',
      });
      expect(queue.getStats()).toEqual({
        size: 0,
        max: 5,
      });
    });
  });

  describe('offer', () => {
    it('should add item when queue not full', () => {
      const queue = new BoundedQueue<string>(3);
      expect(queue.offer('item1')).toBe(true);
      expect(queue.size()).toBe(1);
    });

    it('should reject item when queue is full', () => {
      const queue = new BoundedQueue<string>(2);
      queue.offer('item1');
      queue.offer('item2');

      expect(queue.offer('item3')).toBe(false);
      expect(queue.size()).toBe(2);
    });

    it('should maintain FIFO order', () => {
      const queue = new BoundedQueue<string>(5);
      queue.offer('first');
      queue.offer('second');
      queue.offer('third');

      expect(queue.poll()).toBe('first');
      expect(queue.poll()).toBe('second');
      expect(queue.poll()).toBe('third');
    });
  });

  describe('add', () => {
    it('should add item when queue not full', () => {
      const queue = new BoundedQueue<string>(3);
      queue.add('item1');
      expect(queue.size()).toBe(1);
    });

    it('should throw ResourceExhaustedError when queue is full', () => {
      const queue = new BoundedQueue<string>({ maxSize: 2, name: 'test-queue' });
      queue.add('item1');
      queue.add('item2');

      expect(() => queue.add('item3')).toThrow(ResourceExhaustedError);
      expect(() => queue.add('item3')).toThrow("Queue 'test-queue' is full (2 items)");
    });
  });

  describe('poll', () => {
    it('should return and remove first item', () => {
      const queue = new BoundedQueue<string>(5);
      queue.offer('first');
      queue.offer('second');

      expect(queue.poll()).toBe('first');
      expect(queue.size()).toBe(1);
      expect(queue.poll()).toBe('second');
      expect(queue.size()).toBe(0);
    });

    it('should return undefined when empty', () => {
      const queue = new BoundedQueue<string>(5);
      expect(queue.poll()).toBeUndefined();
    });

    it('should allow adding after polling', () => {
      const queue = new BoundedQueue<string>(2);
      queue.offer('item1');
      queue.offer('item2');
      queue.poll();

      expect(queue.offer('item3')).toBe(true);
      expect(queue.size()).toBe(2);
    });
  });

  describe('peek', () => {
    it('should return first item without removing', () => {
      const queue = new BoundedQueue<string>(5);
      queue.offer('first');
      queue.offer('second');

      expect(queue.peek()).toBe('first');
      expect(queue.size()).toBe(2);
      expect(queue.peek()).toBe('first');
    });

    it('should return undefined when empty', () => {
      const queue = new BoundedQueue<string>(5);
      expect(queue.peek()).toBeUndefined();
    });
  });

  describe('isEmpty and isFull', () => {
    it('should detect empty queue', () => {
      const queue = new BoundedQueue<string>(5);
      expect(queue.isEmpty()).toBe(true);

      queue.offer('item');
      expect(queue.isEmpty()).toBe(false);

      queue.poll();
      expect(queue.isEmpty()).toBe(true);
    });

    it('should detect full queue', () => {
      const queue = new BoundedQueue<string>(2);
      expect(queue.isFull()).toBe(false);

      queue.offer('item1');
      expect(queue.isFull()).toBe(false);

      queue.offer('item2');
      expect(queue.isFull()).toBe(true);

      queue.poll();
      expect(queue.isFull()).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all items', () => {
      const queue = new BoundedQueue<string>(5);
      queue.offer('item1');
      queue.offer('item2');
      queue.offer('item3');

      queue.clear();

      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
      expect(queue.poll()).toBeUndefined();
    });
  });

  describe('iterator', () => {
    it('should iterate over items without consuming', () => {
      const queue = new BoundedQueue<string>(5);
      queue.offer('item1');
      queue.offer('item2');
      queue.offer('item3');

      const items = Array.from(queue);

      expect(items).toEqual(['item1', 'item2', 'item3']);
      expect(queue.size()).toBe(3);
    });

    it('should support for-of loop', () => {
      const queue = new BoundedQueue<number>(5);
      queue.offer(1);
      queue.offer(2);
      queue.offer(3);

      const collected: number[] = [];
      for (const item of queue) {
        collected.push(item);
      }

      expect(collected).toEqual([1, 2, 3]);
      expect(queue.size()).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('should handle queue of size 0', () => {
      const queue = new BoundedQueue<string>(0);
      expect(queue.offer('item')).toBe(false);
      expect(queue.isFull()).toBe(true);
    });

    it('should handle queue of size 1', () => {
      const queue = new BoundedQueue<string>(1);
      expect(queue.offer('item1')).toBe(true);
      expect(queue.offer('item2')).toBe(false);
      expect(queue.poll()).toBe('item1');
      expect(queue.offer('item3')).toBe(true);
    });

    it('should handle complex objects', () => {
      interface Task {
        id: string;
        priority: number;
      }

      const queue = new BoundedQueue<Task>(3);
      const task1: Task = { id: 'task1', priority: 1 };
      const task2: Task = { id: 'task2', priority: 2 };

      queue.offer(task1);
      queue.offer(task2);

      expect(queue.poll()).toEqual(task1);
      expect(queue.poll()).toEqual(task2);
    });
  });
});

describe('TokenBucketRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with full tokens', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 5,
        name: 'test-limiter',
      });

      expect(limiter.available()).toBe(10);
      expect(limiter.getStats()).toEqual({
        tokens: 10,
        max: 10,
      });
    });

    it('should convert refill rate to per-millisecond', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 100,
        refillRate: 10, // 10 tokens per second = 0.01 per ms
      });

      expect(limiter.available()).toBe(100);
    });
  });

  describe('tryConsume', () => {
    it('should consume tokens when available', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 5,
      });

      expect(limiter.tryConsume(1)).toBe(true);
      expect(limiter.available()).toBe(9);

      expect(limiter.tryConsume(3)).toBe(true);
      expect(limiter.available()).toBe(6);
    });

    it('should return false when insufficient tokens', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 5,
        refillRate: 10,
      });

      expect(limiter.tryConsume(5)).toBe(true);
      expect(limiter.tryConsume(1)).toBe(false);
      expect(limiter.available()).toBe(0);
    });

    it('should consume default 1 token when not specified', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 5,
      });

      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.available()).toBe(9);
    });

    it('should refill tokens before consuming', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10, // 10 tokens per second
      });

      limiter.tryConsume(10);
      expect(limiter.available()).toBe(0);

      vi.advanceTimersByTime(500); // 0.5 seconds = 5 tokens

      expect(limiter.tryConsume(4)).toBe(true);
      expect(limiter.available()).toBe(1);
    });
  });

  describe('consume', () => {
    it('should consume immediately when tokens available', async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 5,
      });

      await limiter.consume(5);
      expect(limiter.available()).toBe(5);
    });

    it('should wait and consume when insufficient tokens', async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10, // 10 tokens per second = 0.01 per ms
      });

      limiter.tryConsume(10);
      expect(limiter.available()).toBe(0);

      const promise = limiter.consume(5);

      // Need to wait 500ms for 5 tokens
      vi.advanceTimersByTime(500);

      await promise;
      expect(limiter.available()).toBe(0);
    });

    it('should handle multiple concurrent consume calls', async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 20, // 20 tokens per second
      });

      limiter.tryConsume(10);

      const promise1 = limiter.consume(5);
      const promise2 = limiter.consume(5);

      vi.advanceTimersByTime(1000);

      await Promise.all([promise1, promise2]);
    });
  });

  describe('refill', () => {
    it('should refill tokens over time', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 100,
        refillRate: 10, // 10 tokens per second
      });

      limiter.tryConsume(100);
      expect(limiter.available()).toBe(0);

      vi.advanceTimersByTime(1000); // 1 second
      expect(limiter.available()).toBe(10);

      vi.advanceTimersByTime(5000); // 5 more seconds
      expect(limiter.available()).toBe(60);
    });

    it('should not exceed max tokens', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
      });

      vi.advanceTimersByTime(10000); // 10 seconds

      expect(limiter.available()).toBe(10);
    });

    it('should refill continuously', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 100,
        refillRate: 100, // 100 tokens per second
      });

      limiter.tryConsume(50);
      vi.advanceTimersByTime(100); // 0.1 seconds = 10 tokens

      expect(limiter.available()).toBe(60);

      vi.advanceTimersByTime(200); // 0.2 seconds = 20 more tokens
      expect(limiter.available()).toBe(80);
    });
  });

  describe('waitTime', () => {
    it('should return 0 when tokens available', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 5,
      });

      expect(limiter.waitTime(5)).toBe(0);
    });

    it('should calculate wait time when tokens insufficient', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10, // 10 tokens per second = 0.01 per ms
      });

      limiter.tryConsume(10);

      // Need 5 tokens, refill rate is 0.01/ms, so need 500ms
      expect(limiter.waitTime(5)).toBe(500);
    });

    it('should account for partial tokens', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
      });

      limiter.tryConsume(7);
      expect(limiter.available()).toBe(3);

      // Need 5 tokens, have 3, need 2 more
      // Refill rate: 0.01/ms, need 200ms
      expect(limiter.waitTime(5)).toBe(200);
    });
  });

  describe('getStats', () => {
    it('should return current token count', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 20,
        refillRate: 10,
      });

      limiter.tryConsume(5);

      const stats = limiter.getStats();
      expect(stats.tokens).toBe(15);
      expect(stats.max).toBe(20);
    });

    it('should floor fractional tokens', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 3, // Creates fractional tokens
      });

      limiter.tryConsume(10);
      vi.advanceTimersByTime(100); // Should add 0.3 tokens

      const stats = limiter.getStats();
      expect(stats.tokens).toBe(0); // Floored from 0.3
    });
  });

  describe('edge cases', () => {
    it('should handle very high refill rates', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 1000,
        refillRate: 10000, // 10000 tokens per second
      });

      limiter.tryConsume(1000);
      vi.advanceTimersByTime(50); // 0.05 seconds = 500 tokens

      expect(limiter.available()).toBe(500);
    });

    it('should handle very low refill rates', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 0.1, // 0.1 tokens per second
      });

      limiter.tryConsume(10);
      vi.advanceTimersByTime(10000); // 10 seconds = 1 token

      expect(limiter.available()).toBe(1);
    });

    it('should handle zero initial tokens scenario', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 5,
        refillRate: 5,
      });

      limiter.tryConsume(5);
      expect(limiter.tryConsume(1)).toBe(false);

      vi.advanceTimersByTime(1000);
      expect(limiter.tryConsume(1)).toBe(true);
    });
  });
});

describe('MemoryPressureMonitor', () => {
  let monitor: MemoryPressureMonitor;

  afterEach(() => {
    monitor?.stopMonitoring();
  });

  describe('constructor', () => {
    it('should use default threshold', () => {
      monitor = new MemoryPressureMonitor();
      expect(monitor).toBeDefined();
    });

    it('should accept custom threshold', () => {
      monitor = new MemoryPressureMonitor(0.9);
      expect(monitor).toBeDefined();
    });
  });

  describe('isUnderPressure', () => {
    it('should detect normal pressure', () => {
      monitor = new MemoryPressureMonitor(0.85);

      const v8Spy = vi.spyOn(require('node:v8'), 'getHeapStatistics');
      v8Spy.mockReturnValue({
        used_heap_size: 100 * 1024 * 1024, // 100 MB
        heap_size_limit: 1000 * 1024 * 1024, // 1000 MB
        total_heap_size: 500 * 1024 * 1024,
      });

      expect(monitor.isUnderPressure()).toBe(false);

      v8Spy.mockRestore();
    });

    it('should detect high pressure', () => {
      monitor = new MemoryPressureMonitor(0.85);

      const v8Spy = vi.spyOn(require('node:v8'), 'getHeapStatistics');
      v8Spy.mockReturnValue({
        used_heap_size: 900 * 1024 * 1024, // 900 MB
        heap_size_limit: 1000 * 1024 * 1024, // 1000 MB
        total_heap_size: 950 * 1024 * 1024,
      });

      expect(monitor.isUnderPressure()).toBe(true);

      v8Spy.mockRestore();
    });

    it('should use heap_size_limit not total_heap_size', () => {
      monitor = new MemoryPressureMonitor(0.85);

      const v8Spy = vi.spyOn(require('node:v8'), 'getHeapStatistics');
      v8Spy.mockReturnValue({
        used_heap_size: 450 * 1024 * 1024, // 450 MB
        total_heap_size: 500 * 1024 * 1024, // 500 MB (90% of total)
        heap_size_limit: 2000 * 1024 * 1024, // 2000 MB (22.5% of limit)
      });

      // Should not be under pressure (450/2000 = 22.5% < 85%)
      expect(monitor.isUnderPressure()).toBe(false);

      v8Spy.mockRestore();
    });
  });

  describe('getStats', () => {
    it('should return memory statistics', () => {
      monitor = new MemoryPressureMonitor(0.85);

      const v8Spy = vi.spyOn(require('node:v8'), 'getHeapStatistics');
      v8Spy.mockReturnValue({
        used_heap_size: 100 * 1024 * 1024,
        total_heap_size: 200 * 1024 * 1024,
        heap_size_limit: 1000 * 1024 * 1024,
      });

      const stats = monitor.getStats();

      expect(stats.heapUsedMB).toBe(100);
      expect(stats.heapTotalMB).toBe(200);
      expect(stats.heapLimitMB).toBe(1000);
      expect(stats.utilizationPercent).toBe(10); // 100/1000 = 10%
      expect(stats.underPressure).toBe(false);

      v8Spy.mockRestore();
    });

    it('should calculate utilization against heap limit', () => {
      monitor = new MemoryPressureMonitor(0.85);

      const v8Spy = vi.spyOn(require('node:v8'), 'getHeapStatistics');
      v8Spy.mockReturnValue({
        used_heap_size: 850 * 1024 * 1024,
        total_heap_size: 900 * 1024 * 1024,
        heap_size_limit: 1000 * 1024 * 1024,
      });

      const stats = monitor.getStats();

      expect(stats.utilizationPercent).toBe(85); // 850/1000 = 85%
      expect(stats.underPressure).toBe(false); // Exactly at threshold

      v8Spy.mockRestore();
    });
  });

  describe('onPressure', () => {
    it('should register pressure callback', () => {
      monitor = new MemoryPressureMonitor();
      const callback = vi.fn();

      const unsubscribe = monitor.onPressure(callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should unregister callback', () => {
      monitor = new MemoryPressureMonitor();
      const callback = vi.fn();

      const unsubscribe = monitor.onPressure(callback);
      unsubscribe();

      // Callback should not be called after unsubscribe
    });

    it('should support multiple callbacks', () => {
      monitor = new MemoryPressureMonitor();
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      monitor.onPressure(callback1);
      monitor.onPressure(callback2);
    });
  });

  describe('startMonitoring', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start periodic monitoring', () => {
      monitor = new MemoryPressureMonitor(0.85);
      const callback = vi.fn();

      monitor.onPressure(callback);
      monitor.startMonitoring(1000);

      const v8Spy = vi.spyOn(require('node:v8'), 'getHeapStatistics');
      v8Spy.mockReturnValue({
        used_heap_size: 900 * 1024 * 1024,
        heap_size_limit: 1000 * 1024 * 1024,
        total_heap_size: 950 * 1024 * 1024,
      });

      vi.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalled();

      v8Spy.mockRestore();
    });

    it('should not start multiple intervals', () => {
      monitor = new MemoryPressureMonitor();

      monitor.startMonitoring(1000);
      monitor.startMonitoring(1000);

      // Should not throw or create multiple intervals
    });

    it('should handle callback errors gracefully', () => {
      monitor = new MemoryPressureMonitor(0.85);
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const validCallback = vi.fn();

      monitor.onPressure(errorCallback);
      monitor.onPressure(validCallback);
      monitor.startMonitoring(1000);

      const v8Spy = vi.spyOn(require('node:v8'), 'getHeapStatistics');
      v8Spy.mockReturnValue({
        used_heap_size: 900 * 1024 * 1024,
        heap_size_limit: 1000 * 1024 * 1024,
        total_heap_size: 950 * 1024 * 1024,
      });

      vi.advanceTimersByTime(1000);

      expect(errorCallback).toHaveBeenCalled();
      expect(validCallback).toHaveBeenCalled();

      v8Spy.mockRestore();
    });

    it('should not call callbacks when no pressure', () => {
      monitor = new MemoryPressureMonitor(0.85);
      const callback = vi.fn();

      monitor.onPressure(callback);
      monitor.startMonitoring(1000);

      const v8Spy = vi.spyOn(require('node:v8'), 'getHeapStatistics');
      v8Spy.mockReturnValue({
        used_heap_size: 100 * 1024 * 1024,
        heap_size_limit: 1000 * 1024 * 1024,
        total_heap_size: 200 * 1024 * 1024,
      });

      vi.advanceTimersByTime(1000);

      expect(callback).not.toHaveBeenCalled();

      v8Spy.mockRestore();
    });
  });

  describe('stopMonitoring', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should stop monitoring interval', () => {
      monitor = new MemoryPressureMonitor();
      const callback = vi.fn();

      monitor.onPressure(callback);
      monitor.startMonitoring(1000);
      monitor.stopMonitoring();

      vi.advanceTimersByTime(1000);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should be safe to call when not monitoring', () => {
      monitor = new MemoryPressureMonitor();
      monitor.stopMonitoring();
      // Should not throw
    });

    it('should be safe to call multiple times', () => {
      monitor = new MemoryPressureMonitor();
      monitor.startMonitoring(1000);
      monitor.stopMonitoring();
      monitor.stopMonitoring();
      // Should not throw
    });
  });
});

describe('BackpressureManager', () => {
  beforeEach(() => {
    backpressure.reset();
  });

  describe('semaphore', () => {
    it('should create and retrieve semaphore', () => {
      const sem = backpressure.semaphore('test', 5);
      expect(sem).toBeDefined();
      expect(sem.available()).toBe(5);
    });

    it('should return existing semaphore', () => {
      const sem1 = backpressure.semaphore('test', 5);
      const sem2 = backpressure.semaphore('test');

      expect(sem1).toBe(sem2);
    });

    it('should create default semaphore when not exists', () => {
      const sem = backpressure.semaphore('nonexistent');
      expect(sem).toBeDefined();
      expect(sem.available()).toBe(10);
    });
  });

  describe('queue', () => {
    it('should create and retrieve queue', () => {
      const queue = backpressure.queue<string>('test', 100);
      expect(queue).toBeDefined();
      expect(queue.size()).toBe(0);
    });

    it('should return existing queue', () => {
      const queue1 = backpressure.queue<string>('test', 100);
      const queue2 = backpressure.queue<string>('test');

      expect(queue1).toBe(queue2);
    });

    it('should create default queue when not exists', () => {
      const queue = backpressure.queue<string>('nonexistent');
      expect(queue).toBeDefined();
      expect(queue.getStats().max).toBe(100);
    });
  });

  describe('rateLimiter', () => {
    it('should create and retrieve rate limiter', () => {
      const limiter = backpressure.rateLimiter('test', {
        maxTokens: 100,
        refillRate: 10,
      });
      expect(limiter).toBeDefined();
      expect(limiter.available()).toBe(100);
    });

    it('should return existing rate limiter', () => {
      const limiter1 = backpressure.rateLimiter('test', {
        maxTokens: 100,
        refillRate: 10,
      });
      const limiter2 = backpressure.rateLimiter('test');

      expect(limiter1).toBe(limiter2);
    });

    it('should create default rate limiter when not exists', () => {
      const limiter = backpressure.rateLimiter('nonexistent');
      expect(limiter).toBeDefined();
      expect(limiter.available()).toBe(100);
    });
  });

  describe('memory', () => {
    it('should return memory monitor', () => {
      const monitor = backpressure.memory();
      expect(monitor).toBeDefined();
      expect(monitor.getStats()).toBeDefined();
    });
  });

  describe('hasBackpressure', () => {
    it('should return false when no backpressure', () => {
      expect(backpressure.hasBackpressure()).toBe(false);
    });

    it('should detect memory pressure', () => {
      const v8Spy = vi.spyOn(require('node:v8'), 'getHeapStatistics');
      v8Spy.mockReturnValue({
        used_heap_size: 900 * 1024 * 1024,
        heap_size_limit: 1000 * 1024 * 1024,
        total_heap_size: 950 * 1024 * 1024,
      });

      expect(backpressure.hasBackpressure()).toBe(true);

      v8Spy.mockRestore();
    });

    it('should detect full queue', () => {
      const queue = backpressure.queue<string>('test', 2);
      queue.offer('item1');
      queue.offer('item2');

      expect(backpressure.hasBackpressure()).toBe(true);
    });

    it('should detect exhausted semaphore with waiters', async () => {
      const sem = backpressure.semaphore('test', 1);
      await sem.acquire();

      const promise = sem.acquire();

      expect(backpressure.hasBackpressure()).toBe(true);

      sem.release();
      await promise;
    });

    it('should not detect exhausted semaphore without waiters', async () => {
      const sem = backpressure.semaphore('test', 1);
      await sem.acquire();

      expect(backpressure.hasBackpressure()).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', () => {
      backpressure.semaphore('sem1', 5);
      backpressure.queue<string>('queue1', 10);
      backpressure.rateLimiter('limiter1', { maxTokens: 100, refillRate: 10 });

      const stats = backpressure.getStats();

      expect(stats.semaphores.sem1).toBeDefined();
      expect(stats.queues.queue1).toBeDefined();
      expect(stats.rateLimiters.limiter1).toBeDefined();
      expect(stats.memoryPressure).toBeDefined();
    });

    it('should include accurate component stats', () => {
      const sem = backpressure.semaphore('test-sem', 10);
      sem.tryAcquire();
      sem.tryAcquire();

      const queue = backpressure.queue<string>('test-queue', 20);
      queue.offer('item1');
      queue.offer('item2');
      queue.offer('item3');

      const stats = backpressure.getStats();

      expect(stats.semaphores['test-sem']).toEqual({
        current: 2,
        max: 10,
        waiting: 0,
      });

      expect(stats.queues['test-queue']).toEqual({
        size: 3,
        max: 20,
      });
    });
  });

  describe('monitoring', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start memory monitoring', () => {
      backpressure.startMonitoring();
      // Should not throw
      backpressure.stopMonitoring();
    });

    it('should stop memory monitoring', () => {
      backpressure.startMonitoring();
      backpressure.stopMonitoring();
      // Should not throw
    });
  });

  describe('reset', () => {
    it('should clear all resources', () => {
      backpressure.semaphore('sem1', 5);
      backpressure.queue<string>('queue1', 10);
      backpressure.rateLimiter('limiter1', { maxTokens: 100, refillRate: 10 });

      backpressure.reset();

      const stats = backpressure.getStats();
      expect(Object.keys(stats.semaphores)).toHaveLength(0);
      expect(Object.keys(stats.queues)).toHaveLength(0);
      expect(Object.keys(stats.rateLimiters)).toHaveLength(0);
    });
  });
});

describe('Predefined Limits', () => {
  it('should export embeddingSemaphore', () => {
    expect(embeddingSemaphore).toBeDefined();
    expect(embeddingSemaphore.available()).toBeGreaterThan(0);
  });

  it('should export dbQuerySemaphore', () => {
    expect(dbQuerySemaphore).toBeDefined();
    expect(dbQuerySemaphore.available()).toBeGreaterThan(0);
  });

  it('should export apiRequestQueue', () => {
    expect(apiRequestQueue).toBeDefined();
    expect(apiRequestQueue.isEmpty()).toBe(true);
  });

  it('should export apiRateLimiter', () => {
    expect(apiRateLimiter).toBeDefined();
    expect(apiRateLimiter.available()).toBeGreaterThan(0);
  });

  it('should handle apiRequestQueue items', () => {
    const item = {
      id: 'req-123',
      handler: 'test-handler',
      timestamp: Date.now(),
    };

    expect(apiRequestQueue.offer(item)).toBe(true);
    expect(apiRequestQueue.poll()).toEqual(item);
  });
});

describe('Integration Scenarios', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    backpressure.reset();
  });

  it('should handle concurrent request processing with semaphore and queue', async () => {
    vi.useRealTimers(); // Use real timers for this test

    const sem = new Semaphore(2);
    const queue = new BoundedQueue<string>(10);

    const results: string[] = [];
    const processItem = async (item: string) => {
      await sem.acquire();
      try {
        results.push(item);
      } finally {
        sem.release();
      }
    };

    // Add items to queue
    for (let i = 1; i <= 5; i++) {
      queue.offer(`item-${i}`);
    }

    // Process queue with concurrency limit
    const tasks: Promise<void>[] = [];
    while (!queue.isEmpty()) {
      const item = queue.poll();
      if (item) {
        tasks.push(processItem(item));
      }
    }

    await Promise.all(tasks);

    expect(results).toHaveLength(5);
    expect(sem.available()).toBe(2);

    vi.useFakeTimers(); // Restore fake timers for other tests
  });

  it('should apply backpressure when rate limit exceeded', () => {
    const limiter = new TokenBucketRateLimiter({
      maxTokens: 5,
      refillRate: 1, // 1 per second
    });

    // Consume all tokens
    for (let i = 0; i < 5; i++) {
      expect(limiter.tryConsume()).toBe(true);
    }

    // Next request should fail
    expect(limiter.tryConsume()).toBe(false);

    // Wait for refill
    vi.advanceTimersByTime(2000);

    // Should have 2 tokens now
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
  });

  it('should coordinate semaphore, queue, and rate limiter', async () => {
    vi.useRealTimers(); // Use real timers for this test

    const sem = new Semaphore(3);
    const queue = new BoundedQueue<number>(10);
    const limiter = new TokenBucketRateLimiter({
      maxTokens: 10,
      refillRate: 5,
    });

    const processed: number[] = [];

    const processItem = async (item: number) => {
      // Check rate limit
      if (!limiter.tryConsume()) {
        return false;
      }

      // Acquire semaphore
      await sem.acquire();
      try {
        processed.push(item);
      } finally {
        sem.release();
      }
      return true;
    };

    // Fill queue
    for (let i = 1; i <= 15; i++) {
      queue.offer(i);
    }

    // Process items
    const tasks: Promise<boolean>[] = [];
    while (!queue.isEmpty()) {
      const item = queue.poll();
      if (item !== undefined) {
        tasks.push(processItem(item));
      }
    }

    const results = await Promise.all(tasks);

    // Should process 10 items (rate limit)
    const successCount = results.filter((r) => r).length;
    expect(successCount).toBe(10);
    expect(processed).toHaveLength(10);

    vi.useFakeTimers(); // Restore fake timers for other tests
  });

  it('should handle memory pressure scenario', () => {
    const monitor = new MemoryPressureMonitor(0.8);
    const pressureEvents: number[] = [];

    monitor.onPressure(() => {
      pressureEvents.push(Date.now());
    });

    monitor.startMonitoring(100);

    const v8Spy = vi.spyOn(require('node:v8'), 'getHeapStatistics');

    // Normal memory
    v8Spy.mockReturnValue({
      used_heap_size: 500 * 1024 * 1024,
      heap_size_limit: 1000 * 1024 * 1024,
      total_heap_size: 600 * 1024 * 1024,
    });

    vi.advanceTimersByTime(100);
    expect(pressureEvents).toHaveLength(0);

    // High memory
    v8Spy.mockReturnValue({
      used_heap_size: 850 * 1024 * 1024,
      heap_size_limit: 1000 * 1024 * 1024,
      total_heap_size: 900 * 1024 * 1024,
    });

    vi.advanceTimersByTime(100);
    expect(pressureEvents).toHaveLength(1);

    vi.advanceTimersByTime(100);
    expect(pressureEvents).toHaveLength(2);

    monitor.stopMonitoring();
    v8Spy.mockRestore();
  });
});
