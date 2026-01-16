/**
 * Unit tests for yield utility
 */

import { describe, it, expect, vi } from 'vitest';
import { yieldToEventLoop } from '../../src/utils/yield.js';

describe('yieldToEventLoop', () => {
  it('should return a promise', () => {
    const result = yieldToEventLoop();
    expect(result).toBeInstanceOf(Promise);
  });

  it('should resolve without value', async () => {
    const result = await yieldToEventLoop();
    expect(result).toBeUndefined();
  });

  it('should yield to event loop', async () => {
    const executionOrder: string[] = [];

    // Synchronous code
    executionOrder.push('sync-1');

    // Yield to event loop
    const yieldPromise = yieldToEventLoop();

    // More synchronous code
    executionOrder.push('sync-2');

    // Wait for yield
    await yieldPromise;
    executionOrder.push('after-yield');

    // Verify execution order
    expect(executionOrder).toEqual(['sync-1', 'sync-2', 'after-yield']);
  });

  it('should allow other async operations to run', async () => {
    let otherTaskRan = false;

    // Schedule another task
    setImmediate(() => {
      otherTaskRan = true;
    });

    // Yield to event loop
    await yieldToEventLoop();

    // Other task should have run
    expect(otherTaskRan).toBe(true);
  });

  it('should work in loops to prevent blocking', async () => {
    const iterations = 100;
    const yieldInterval = 10;
    let yieldsOccurred = 0;

    for (let i = 0; i < iterations; i++) {
      if (i % yieldInterval === 0) {
        await yieldToEventLoop();
        yieldsOccurred++;
      }
    }

    expect(yieldsOccurred).toBe(iterations / yieldInterval);
  });

  it('should maintain async context', async () => {
    const contextValue = 'test-context';

    const result = await (async () => {
      const value = contextValue;
      await yieldToEventLoop();
      return value;
    })();

    expect(result).toBe(contextValue);
  });

  it('should allow multiple concurrent yields', async () => {
    const results = await Promise.all([yieldToEventLoop(), yieldToEventLoop(), yieldToEventLoop()]);

    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expect(result).toBeUndefined();
    });
  });

  it('should use setImmediate internally', async () => {
    const setImmediateSpy = vi.spyOn(global, 'setImmediate');

    await yieldToEventLoop();

    expect(setImmediateSpy).toHaveBeenCalled();

    setImmediateSpy.mockRestore();
  });

  it('should not block CPU-intensive operations', async () => {
    const start = Date.now();
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      if (i % 100 === 0) {
        await yieldToEventLoop();
      }
    }

    const elapsed = Date.now() - start;

    // Should complete reasonably quickly even with yields
    expect(elapsed).toBeLessThan(1000);
  });

  it('should handle errors in subsequent operations', async () => {
    await yieldToEventLoop();

    await expect(async () => {
      throw new Error('Test error');
    }).rejects.toThrow('Test error');
  });

  it('should work with async/await pattern', async () => {
    const func = async () => {
      await yieldToEventLoop();
      return 'completed';
    };

    const result = await func();
    expect(result).toBe('completed');
  });

  it('should work with Promise.then pattern', () => {
    return yieldToEventLoop().then(() => {
      expect(true).toBe(true);
    });
  });

  it('should allow chaining', async () => {
    let counter = 0;

    await yieldToEventLoop()
      .then(() => {
        counter++;
      })
      .then(() => yieldToEventLoop())
      .then(() => {
        counter++;
      });

    expect(counter).toBe(2);
  });

  it('should handle rapid consecutive calls', async () => {
    await yieldToEventLoop();
    await yieldToEventLoop();
    await yieldToEventLoop();
    await yieldToEventLoop();
    await yieldToEventLoop();

    expect(true).toBe(true); // Should complete without error
  });

  it('should interleave with microtasks', async () => {
    const order: string[] = [];

    Promise.resolve().then(() => order.push('microtask-1'));

    await yieldToEventLoop();
    order.push('after-yield');

    Promise.resolve().then(() => order.push('microtask-2'));

    // Wait for microtasks
    await new Promise((resolve) => setImmediate(resolve));

    // Microtask-1 should run before yield, microtask-2 after
    expect(order).toContain('microtask-1');
    expect(order).toContain('after-yield');
    expect(order).toContain('microtask-2');
  });

  it('should work in nested async functions', async () => {
    const outer = async () => {
      await yieldToEventLoop();

      const inner = async () => {
        await yieldToEventLoop();
        return 'inner';
      };

      return await inner();
    };

    const result = await outer();
    expect(result).toBe('inner');
  });

  it('should handle use in CPU-bound batch processing', async () => {
    const data = Array.from({ length: 1000 }, (_, i) => i);
    const results: number[] = [];
    const batchSize = 100;

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      results.push(...batch.map((x) => x * 2));

      // Yield after each batch
      await yieldToEventLoop();
    }

    expect(results).toHaveLength(1000);
    expect(results[0]).toBe(0);
    expect(results[999]).toBe(1998);
  });
});

describe('yieldToEventLoop - Real-world scenarios', () => {
  it('should prevent event loop starvation in long-running tasks', async () => {
    const checkpoints: number[] = [];
    let eventLoopRan = false;

    // Schedule a task that should run during the loop
    setImmediate(() => {
      eventLoopRan = true;
    });

    // Long-running task with yields
    for (let i = 0; i < 50; i++) {
      checkpoints.push(i);

      if (i % 10 === 0) {
        await yieldToEventLoop();
      }
    }

    expect(checkpoints).toHaveLength(50);
    expect(eventLoopRan).toBe(true);
  });

  it('should improve responsiveness in data processing', async () => {
    const largeArray = Array.from({ length: 10000 }, (_, i) => i);
    const processed: number[] = [];

    for (let i = 0; i < largeArray.length; i++) {
      processed.push(largeArray[i]! * 2);

      // Yield every 100 iterations
      if (i % 100 === 0) {
        await yieldToEventLoop();
      }
    }

    expect(processed).toHaveLength(10000);
  });

  it('should work with recursive async functions', async () => {
    const recursiveProcess = async (depth: number): Promise<number> => {
      if (depth === 0) return 0;

      await yieldToEventLoop();

      return 1 + (await recursiveProcess(depth - 1));
    };

    const result = await recursiveProcess(50);
    expect(result).toBe(50);
  });

  it('should maintain proper error handling across yields', async () => {
    const processWithYield = async (shouldError: boolean) => {
      await yieldToEventLoop();

      if (shouldError) {
        throw new Error('Processing error');
      }

      await yieldToEventLoop();
      return 'success';
    };

    await expect(processWithYield(true)).rejects.toThrow('Processing error');
    await expect(processWithYield(false)).resolves.toBe('success');
  });
});
