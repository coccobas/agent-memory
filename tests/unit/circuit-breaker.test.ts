import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerConfig,
  getCircuitBreaker,
  getAllCircuitBreakers,
  getAllCircuitBreakerStats,
  resetAllCircuitBreakers,
} from '../../src/utils/circuit-breaker.js';
import { CircuitBreakerError } from '../../src/core/errors.js';

describe('CircuitBreaker', () => {
  let config: CircuitBreakerConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    config = {
      name: 'test-service',
      failureThreshold: 3,
      resetTimeoutMs: 5000,
      successThreshold: 2,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic Functionality', () => {
    it('should execute successful function in CLOSED state', async () => {
      const breaker = new CircuitBreaker(config);
      const fn = vi.fn().mockResolvedValue('success');

      const result = await breaker.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(breaker.getStats().state).toBe('CLOSED');
      expect(breaker.getStats().totalSuccesses).toBe(1);
      expect(breaker.getStats().totalCalls).toBe(1);
    });

    it('should propagate errors from function', async () => {
      const breaker = new CircuitBreaker(config);
      const error = new Error('test error');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(breaker.execute(fn)).rejects.toThrow('test error');
      expect(breaker.getStats().totalFailures).toBe(1);
    });

    it('should return service name', () => {
      const breaker = new CircuitBreaker(config);
      expect(breaker.getName()).toBe('test-service');
    });

    it('should initialize with default config values', () => {
      const minimalConfig: CircuitBreakerConfig = {
        name: 'minimal-service',
        failureThreshold: 3,
        resetTimeoutMs: 5000,
        successThreshold: 2,
      };
      const breaker = new CircuitBreaker(minimalConfig);

      expect(breaker.getName()).toBe('minimal-service');
      expect(breaker.getStats().state).toBe('CLOSED');
    });
  });

  describe('State Transitions: CLOSED -> OPEN', () => {
    it('should open circuit after reaching failure threshold', async () => {
      const breaker = new CircuitBreaker(config);
      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Execute failures up to threshold
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }

      expect(breaker.getStats().state).toBe('OPEN');
      expect(breaker.getStats().failures).toBe(config.failureThreshold);
      expect(breaker.isOpen()).toBe(true);
    });

    it('should not open circuit before reaching failure threshold', async () => {
      const breaker = new CircuitBreaker(config);
      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Execute failures below threshold
      for (let i = 0; i < config.failureThreshold - 1; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }

      expect(breaker.getStats().state).toBe('CLOSED');
      expect(breaker.isOpen()).toBe(false);
    });

    it('should reset failure count after success in CLOSED state', async () => {
      const breaker = new CircuitBreaker(config);
      const errorFn = vi.fn().mockRejectedValue(new Error('failure'));
      const successFn = vi.fn().mockResolvedValue('success');

      // Two failures
      await expect(breaker.execute(errorFn)).rejects.toThrow('failure');
      await expect(breaker.execute(errorFn)).rejects.toThrow('failure');
      expect(breaker.getStats().failures).toBe(2);

      // Success resets count
      await breaker.execute(successFn);
      expect(breaker.getStats().failures).toBe(0);
      expect(breaker.getStats().state).toBe('CLOSED');

      // Two more failures shouldn't open circuit
      await expect(breaker.execute(errorFn)).rejects.toThrow('failure');
      await expect(breaker.execute(errorFn)).rejects.toThrow('failure');
      expect(breaker.getStats().state).toBe('CLOSED');
    });
  });

  describe('State Transitions: OPEN -> HALF_OPEN', () => {
    it('should transition to HALF_OPEN after reset timeout', async () => {
      const breaker = new CircuitBreaker(config);
      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }
      expect(breaker.getStats().state).toBe('OPEN');

      // Advance time to just before reset timeout
      vi.advanceTimersByTime(config.resetTimeoutMs - 100);

      // Should still throw CircuitBreakerError
      await expect(breaker.execute(fn)).rejects.toThrow(CircuitBreakerError);
      expect(breaker.getStats().state).toBe('OPEN');

      // Advance time past reset timeout
      vi.advanceTimersByTime(200);

      // Next call should transition to HALF_OPEN
      fn.mockResolvedValue('success');
      await breaker.execute(fn);
      expect(breaker.getStats().state).toBe('HALF_OPEN');
    });

    it('should throw CircuitBreakerError when circuit is OPEN', async () => {
      const breaker = new CircuitBreaker(config);
      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }

      // Try to execute while circuit is open
      fn.mockResolvedValue('success');
      await expect(breaker.execute(fn)).rejects.toThrow(CircuitBreakerError);
      expect(fn).toHaveBeenCalledTimes(config.failureThreshold); // Not called again
    });

    it('should include reset time in CircuitBreakerError', async () => {
      const breaker = new CircuitBreaker(config);
      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }

      const currentTime = Date.now();
      const expectedResetTime = currentTime + config.resetTimeoutMs;

      try {
        await breaker.execute(fn);
        expect.fail('Should have thrown CircuitBreakerError');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerError);
        if (error instanceof CircuitBreakerError) {
          expect(error.service).toBe(config.name);
          expect(error.resetTime).toBe(expectedResetTime);
        }
      }
    });
  });

  describe('State Transitions: HALF_OPEN -> CLOSED', () => {
    it('should close circuit after success threshold in HALF_OPEN state', async () => {
      const breaker = new CircuitBreaker(config);
      const fn = vi.fn();

      // Open the circuit
      fn.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }
      expect(breaker.getStats().state).toBe('OPEN');

      // Advance time past reset timeout
      vi.advanceTimersByTime(config.resetTimeoutMs + 100);

      // Execute successful calls to reach success threshold
      fn.mockResolvedValue('success');
      for (let i = 0; i < config.successThreshold; i++) {
        await breaker.execute(fn);
      }

      expect(breaker.getStats().state).toBe('CLOSED');
      expect(breaker.getStats().failures).toBe(0);
      expect(breaker.getStats().successes).toBe(0); // Reset on transition
    });

    it('should not close circuit before reaching success threshold', async () => {
      const breaker = new CircuitBreaker(config);
      const fn = vi.fn();

      // Open the circuit
      fn.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }

      // Advance time and execute successful calls below threshold
      vi.advanceTimersByTime(config.resetTimeoutMs + 100);
      fn.mockResolvedValue('success');
      for (let i = 0; i < config.successThreshold - 1; i++) {
        await breaker.execute(fn);
      }

      expect(breaker.getStats().state).toBe('HALF_OPEN');
    });
  });

  describe('State Transitions: HALF_OPEN -> OPEN', () => {
    it('should immediately open on failure in HALF_OPEN state', async () => {
      const breaker = new CircuitBreaker(config);
      const fn = vi.fn();

      // Open the circuit
      fn.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }

      // Advance time to allow transition to HALF_OPEN
      vi.advanceTimersByTime(config.resetTimeoutMs + 100);

      // Succeed once to transition to HALF_OPEN
      fn.mockResolvedValue('success');
      await breaker.execute(fn);
      expect(breaker.getStats().state).toBe('HALF_OPEN');

      // Fail once should immediately open circuit
      fn.mockRejectedValue(new Error('failure'));
      await expect(breaker.execute(fn)).rejects.toThrow('failure');
      expect(breaker.getStats().state).toBe('OPEN');
    });

    it('should reset success count when transitioning from HALF_OPEN to OPEN', async () => {
      const breaker = new CircuitBreaker(config);
      const fn = vi.fn();

      // Open the circuit
      fn.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }

      // Transition to HALF_OPEN with a success
      vi.advanceTimersByTime(config.resetTimeoutMs + 100);
      fn.mockResolvedValue('success');
      await breaker.execute(fn);
      expect(breaker.getStats().successes).toBe(1);

      // Fail - should reset success count
      fn.mockRejectedValue(new Error('failure'));
      await expect(breaker.execute(fn)).rejects.toThrow('failure');
      expect(breaker.getStats().successes).toBe(0);
      expect(breaker.getStats().state).toBe('OPEN');
    });
  });

  describe('Custom isFailure Predicate', () => {
    it('should use custom isFailure function to determine failures', async () => {
      const customConfig: CircuitBreakerConfig = {
        ...config,
        isFailure: (error: Error) => error.message.includes('retryable'),
      };
      const breaker = new CircuitBreaker(customConfig);

      // Non-retryable errors should not count as failures
      const nonRetryableFn = vi.fn().mockRejectedValue(new Error('permanent error'));
      for (let i = 0; i < 5; i++) {
        await expect(breaker.execute(nonRetryableFn)).rejects.toThrow('permanent error');
      }
      expect(breaker.getStats().state).toBe('CLOSED');
      expect(breaker.getStats().failures).toBe(0);

      // Retryable errors should count
      const retryableFn = vi.fn().mockRejectedValue(new Error('retryable error'));
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(retryableFn)).rejects.toThrow('retryable error');
      }
      expect(breaker.getStats().state).toBe('OPEN');
      expect(breaker.getStats().failures).toBe(config.failureThreshold);
    });

    it('should still throw original error even if not counted as failure', async () => {
      const customConfig: CircuitBreakerConfig = {
        ...config,
        isFailure: () => false, // Never count as failure
      };
      const breaker = new CircuitBreaker(customConfig);
      const fn = vi.fn().mockRejectedValue(new Error('not a failure'));

      await expect(breaker.execute(fn)).rejects.toThrow('not a failure');
      expect(breaker.getStats().failures).toBe(0);
      expect(breaker.getStats().totalFailures).toBe(0);
    });
  });

  describe('Statistics and Metrics', () => {
    it('should track total calls, successes, and failures', async () => {
      const breaker = new CircuitBreaker(config);
      const successFn = vi.fn().mockResolvedValue('success');
      const failureFn = vi.fn().mockRejectedValue(new Error('failure'));

      await breaker.execute(successFn);
      await breaker.execute(successFn);
      await expect(breaker.execute(failureFn)).rejects.toThrow('failure');

      const stats = breaker.getStats();
      expect(stats.totalCalls).toBe(3);
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.totalFailures).toBe(1);
    });

    it('should track last success and failure times', async () => {
      const breaker = new CircuitBreaker(config);
      const successFn = vi.fn().mockResolvedValue('success');
      const failureFn = vi.fn().mockRejectedValue(new Error('failure'));

      const initialStats = breaker.getStats();
      expect(initialStats.lastSuccessTime).toBeNull();
      expect(initialStats.lastFailureTime).toBeNull();

      const beforeSuccess = Date.now();
      await breaker.execute(successFn);
      const afterSuccess = Date.now();

      let stats = breaker.getStats();
      expect(stats.lastSuccessTime).toBeGreaterThanOrEqual(beforeSuccess);
      expect(stats.lastSuccessTime).toBeLessThanOrEqual(afterSuccess);

      vi.advanceTimersByTime(1000);

      const beforeFailure = Date.now();
      await expect(breaker.execute(failureFn)).rejects.toThrow('failure');
      const afterFailure = Date.now();

      stats = breaker.getStats();
      expect(stats.lastFailureTime).toBeGreaterThanOrEqual(beforeFailure);
      expect(stats.lastFailureTime).toBeLessThanOrEqual(afterFailure);
    });

    it('should return current state in stats', async () => {
      const breaker = new CircuitBreaker(config);

      expect(breaker.getStats().state).toBe('CLOSED');

      // Open the circuit
      const fn = vi.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }

      expect(breaker.getStats().state).toBe('OPEN');

      // Transition to HALF_OPEN
      vi.advanceTimersByTime(config.resetTimeoutMs + 100);
      fn.mockResolvedValue('success');
      await breaker.execute(fn);

      expect(breaker.getStats().state).toBe('HALF_OPEN');
    });

    it('should track current window failures and successes', async () => {
      const breaker = new CircuitBreaker(config);
      const successFn = vi.fn().mockResolvedValue('success');
      const failureFn = vi.fn().mockRejectedValue(new Error('failure'));

      await breaker.execute(successFn);
      expect(breaker.getStats().successes).toBe(1); // Success counter increments in CLOSED state

      await expect(breaker.execute(failureFn)).rejects.toThrow('failure');
      expect(breaker.getStats().failures).toBe(1);
      expect(breaker.getStats().successes).toBe(0); // Reset on failure

      await expect(breaker.execute(failureFn)).rejects.toThrow('failure');
      expect(breaker.getStats().failures).toBe(2);
    });
  });

  describe('Force Open/Close', () => {
    it('should force circuit to close', async () => {
      const breaker = new CircuitBreaker(config);
      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }
      expect(breaker.getStats().state).toBe('OPEN');

      // Force close
      breaker.forceClose();

      expect(breaker.getStats().state).toBe('CLOSED');
      expect(breaker.getStats().failures).toBe(0);
      expect(breaker.getStats().successes).toBe(0);
      expect(breaker.isOpen()).toBe(false);

      // Should execute normally
      fn.mockResolvedValue('success');
      const result = await breaker.execute(fn);
      expect(result).toBe('success');
    });

    it('should force circuit to open', async () => {
      const breaker = new CircuitBreaker(config);
      expect(breaker.getStats().state).toBe('CLOSED');

      // Force open
      breaker.forceOpen();

      expect(breaker.getStats().state).toBe('OPEN');
      expect(breaker.isOpen()).toBe(true);

      // Should throw CircuitBreakerError
      const fn = vi.fn().mockResolvedValue('success');
      await expect(breaker.execute(fn)).rejects.toThrow(CircuitBreakerError);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle concurrent requests correctly', async () => {
      const breaker = new CircuitBreaker(config);
      const fn = vi.fn().mockResolvedValue('success');

      // Execute multiple concurrent requests
      const promises = Array(10)
        .fill(null)
        .map(() => breaker.execute(fn));

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(results.every((r) => r === 'success')).toBe(true);
      expect(breaker.getStats().totalCalls).toBe(10);
      expect(breaker.getStats().totalSuccesses).toBe(10);
    });

    it('should handle concurrent failures correctly', async () => {
      const breaker = new CircuitBreaker(config);
      const fn = vi.fn().mockRejectedValue(new Error('concurrent failure'));

      // Execute concurrent requests that will fail
      const promises = Array(config.failureThreshold)
        .fill(null)
        .map(() => breaker.execute(fn).catch((e) => e));

      const results = await Promise.all(promises);

      expect(results.every((r) => r instanceof Error)).toBe(true);
      expect(breaker.getStats().state).toBe('OPEN');
      expect(breaker.getStats().totalFailures).toBe(config.failureThreshold);
    });

    it('should handle mixed concurrent success and failure', async () => {
      const breaker = new CircuitBreaker(config);
      const successFn = vi.fn().mockResolvedValue('success');
      const failureFn = vi.fn().mockRejectedValue(new Error('failure'));

      // Mix of success and failures
      const promises = [
        breaker.execute(successFn),
        breaker.execute(failureFn).catch((e) => e),
        breaker.execute(successFn),
        breaker.execute(failureFn).catch((e) => e),
      ];

      const results = await Promise.all(promises);

      expect(results.filter((r) => r === 'success')).toHaveLength(2);
      expect(results.filter((r) => r instanceof Error)).toHaveLength(2);
      expect(breaker.getStats().totalCalls).toBe(4);
      expect(breaker.getStats().totalSuccesses).toBe(2);
      expect(breaker.getStats().totalFailures).toBe(2);
    });
  });

  describe('Timeout Configuration', () => {
    it('should respect custom reset timeout', async () => {
      const customConfig: CircuitBreakerConfig = {
        ...config,
        resetTimeoutMs: 10000,
      };
      const breaker = new CircuitBreaker(customConfig);
      const fn = vi.fn();

      // Open the circuit
      fn.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }

      // Advance time to just before custom timeout
      vi.advanceTimersByTime(9500);
      await expect(breaker.execute(fn)).rejects.toThrow(CircuitBreakerError);

      // Advance past custom timeout
      vi.advanceTimersByTime(1000);
      fn.mockResolvedValue('success');
      await breaker.execute(fn);

      expect(breaker.getStats().state).toBe('HALF_OPEN');
    });

    it('should use short reset timeout for fast recovery', async () => {
      const customConfig: CircuitBreakerConfig = {
        ...config,
        resetTimeoutMs: 100,
      };
      const breaker = new CircuitBreaker(customConfig);
      const fn = vi.fn();

      // Open the circuit
      fn.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }

      // Quick recovery
      vi.advanceTimersByTime(150);
      fn.mockResolvedValue('success');
      await breaker.execute(fn);

      expect(breaker.getStats().state).toBe('HALF_OPEN');
    });
  });

  describe('Edge Cases', () => {
    it('should handle failure threshold of 1', async () => {
      const edgeConfig: CircuitBreakerConfig = {
        ...config,
        failureThreshold: 1,
      };
      const breaker = new CircuitBreaker(edgeConfig);
      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      await expect(breaker.execute(fn)).rejects.toThrow('failure');
      expect(breaker.getStats().state).toBe('OPEN');
    });

    it('should handle success threshold of 1', async () => {
      const edgeConfig: CircuitBreakerConfig = {
        ...config,
        successThreshold: 1,
      };
      const breaker = new CircuitBreaker(edgeConfig);
      const fn = vi.fn();

      // Open the circuit
      fn.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }

      // One success should close
      vi.advanceTimersByTime(config.resetTimeoutMs + 100);
      fn.mockResolvedValue('success');
      await breaker.execute(fn);

      expect(breaker.getStats().state).toBe('CLOSED');
    });

    it('should handle large failure threshold', async () => {
      const edgeConfig: CircuitBreakerConfig = {
        ...config,
        failureThreshold: 100,
      };
      const breaker = new CircuitBreaker(edgeConfig);
      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Execute many failures
      for (let i = 0; i < 99; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }
      expect(breaker.getStats().state).toBe('CLOSED');

      // One more should open
      await expect(breaker.execute(fn)).rejects.toThrow('failure');
      expect(breaker.getStats().state).toBe('OPEN');
    });

    it('should handle errors that are not Error instances', async () => {
      const breaker = new CircuitBreaker(config);
      const fn = vi.fn().mockRejectedValue('string error');

      // Non-Error values are now converted to Error and wrapped with context
      // This provides better debugging information for non-standard throws
      await expect(breaker.execute(fn)).rejects.toMatchObject({
        name: 'CircuitBreakerWrappedError',
        message: expect.stringContaining('string error'),
      });
      // Non-Error values now count as failures since they're converted to Error
      expect(breaker.getStats().failures).toBe(1);
      expect(breaker.getStats().state).toBe('CLOSED');
    });

    it('should maintain state across multiple cycles', async () => {
      const breaker = new CircuitBreaker(config);
      const fn = vi.fn();

      // First cycle: Open and recover
      fn.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }
      expect(breaker.getStats().state).toBe('OPEN');

      vi.advanceTimersByTime(config.resetTimeoutMs + 100);
      fn.mockResolvedValue('success');
      for (let i = 0; i < config.successThreshold; i++) {
        await breaker.execute(fn);
      }
      expect(breaker.getStats().state).toBe('CLOSED');

      // Second cycle: Open and recover again
      fn.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('failure');
      }
      expect(breaker.getStats().state).toBe('OPEN');

      vi.advanceTimersByTime(config.resetTimeoutMs + 100);
      fn.mockResolvedValue('success');
      for (let i = 0; i < config.successThreshold; i++) {
        await breaker.execute(fn);
      }
      expect(breaker.getStats().state).toBe('CLOSED');

      // Verify total metrics
      expect(breaker.getStats().totalFailures).toBe(config.failureThreshold * 2);
      expect(breaker.getStats().totalSuccesses).toBe(config.successThreshold * 2);
    });
  });

  describe('Circuit Breaker Registry', () => {
    it('should create and retrieve circuit breaker from registry', () => {
      const breaker1 = getCircuitBreaker(config);
      const breaker2 = getCircuitBreaker(config); // Same name

      expect(breaker1).toBe(breaker2); // Should return same instance
      expect(breaker1.getName()).toBe(config.name);
    });

    it('should create different breakers for different services', () => {
      const config1: CircuitBreakerConfig = {
        ...config,
        name: 'service-1',
      };
      const config2: CircuitBreakerConfig = {
        ...config,
        name: 'service-2',
      };

      const breaker1 = getCircuitBreaker(config1);
      const breaker2 = getCircuitBreaker(config2);

      expect(breaker1).not.toBe(breaker2);
      expect(breaker1.getName()).toBe('service-1');
      expect(breaker2.getName()).toBe('service-2');
    });

    it('should get all circuit breakers from registry', () => {
      const config1: CircuitBreakerConfig = { ...config, name: 'service-1' };
      const config2: CircuitBreakerConfig = { ...config, name: 'service-2' };

      getCircuitBreaker(config1);
      getCircuitBreaker(config2);

      const allBreakers = getAllCircuitBreakers();

      expect(allBreakers.size).toBeGreaterThanOrEqual(2);
      expect(allBreakers.has('service-1')).toBe(true);
      expect(allBreakers.has('service-2')).toBe(true);
    });

    it('should get stats for all circuit breakers', async () => {
      const config1: CircuitBreakerConfig = { ...config, name: 'stats-service-1' };
      const config2: CircuitBreakerConfig = { ...config, name: 'stats-service-2' };

      const breaker1 = getCircuitBreaker(config1);
      const breaker2 = getCircuitBreaker(config2);

      // Execute some operations
      const fn = vi.fn().mockResolvedValue('success');
      await breaker1.execute(fn);
      await breaker2.execute(fn);

      const allStats = getAllCircuitBreakerStats();

      expect(allStats['stats-service-1']).toBeDefined();
      expect(allStats['stats-service-2']).toBeDefined();
      expect(allStats['stats-service-1'].totalCalls).toBe(1);
      expect(allStats['stats-service-2'].totalCalls).toBe(1);
    });

    it('should reset all circuit breakers', async () => {
      const config1: CircuitBreakerConfig = { ...config, name: 'reset-service-1' };
      const config2: CircuitBreakerConfig = { ...config, name: 'reset-service-2' };

      const breaker1 = getCircuitBreaker(config1);
      const breaker2 = getCircuitBreaker(config2);

      // Open both circuits
      const fn = vi.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker1.execute(fn)).rejects.toThrow('failure');
        await expect(breaker2.execute(fn)).rejects.toThrow('failure');
      }

      expect(breaker1.getStats().state).toBe('OPEN');
      expect(breaker2.getStats().state).toBe('OPEN');

      // Reset all
      resetAllCircuitBreakers();

      expect(breaker1.getStats().state).toBe('CLOSED');
      expect(breaker2.getStats().state).toBe('CLOSED');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle alternating success and failure patterns', async () => {
      const breaker = new CircuitBreaker(config);
      let shouldSucceed = true;
      const fn = vi.fn().mockImplementation(() => {
        if (shouldSucceed) {
          return Promise.resolve('success');
        }
        return Promise.reject(new Error('failure'));
      });

      for (let i = 0; i < 10; i++) {
        if (shouldSucceed) {
          await breaker.execute(fn);
        } else {
          await expect(breaker.execute(fn)).rejects.toThrow('failure');
        }
        shouldSucceed = !shouldSucceed;
      }

      // Should still be closed due to success resets
      expect(breaker.getStats().state).toBe('CLOSED');
    });

    it('should handle rapid state transitions', async () => {
      const breaker = new CircuitBreaker({
        ...config,
        failureThreshold: 2,
        successThreshold: 1,
        resetTimeoutMs: 100,
      });

      const fn = vi.fn();

      // Open
      fn.mockRejectedValue(new Error('failure'));
      await expect(breaker.execute(fn)).rejects.toThrow('failure');
      await expect(breaker.execute(fn)).rejects.toThrow('failure');
      expect(breaker.getStats().state).toBe('OPEN');

      // HALF_OPEN
      vi.advanceTimersByTime(150);
      fn.mockResolvedValue('success');
      await breaker.execute(fn);
      expect(breaker.getStats().state).toBe('CLOSED');

      // Open again
      fn.mockRejectedValue(new Error('failure'));
      await expect(breaker.execute(fn)).rejects.toThrow('failure');
      await expect(breaker.execute(fn)).rejects.toThrow('failure');
      expect(breaker.getStats().state).toBe('OPEN');

      // HALF_OPEN then back to OPEN
      vi.advanceTimersByTime(150);
      fn.mockResolvedValue('success');
      await breaker.execute(fn);
      expect(breaker.getStats().state).toBe('CLOSED');
    });

    it('should correctly track metrics through complete lifecycle', async () => {
      const breaker = new CircuitBreaker(config);
      const successFn = vi.fn().mockResolvedValue('success');
      const failureFn = vi.fn().mockRejectedValue(new Error('failure'));

      // Phase 1: Normal operations (2 successes)
      await breaker.execute(successFn);
      await breaker.execute(successFn);

      // Phase 2: Some failures (1 failure)
      await expect(breaker.execute(failureFn)).rejects.toThrow('failure');

      // Phase 3: Recovery (1 success)
      await breaker.execute(successFn);

      // Phase 4: Circuit opens (3 failures)
      for (let i = 0; i < config.failureThreshold; i++) {
        await expect(breaker.execute(failureFn)).rejects.toThrow('failure');
      }

      // Phase 5: Circuit rejects calls (increments totalCalls but not successes)
      await expect(breaker.execute(successFn)).rejects.toThrow(CircuitBreakerError);

      // Phase 6: Circuit recovers (2 successes)
      vi.advanceTimersByTime(config.resetTimeoutMs + 100);
      for (let i = 0; i < config.successThreshold; i++) {
        await breaker.execute(successFn);
      }

      const stats = breaker.getStats();
      expect(stats.state).toBe('CLOSED');
      expect(stats.totalCalls).toBe(2 + 1 + 1 + config.failureThreshold + 1 + config.successThreshold); // 10 total
      expect(stats.totalSuccesses).toBe(2 + 1 + config.successThreshold); // 5 successes (not counting rejected call)
      expect(stats.totalFailures).toBe(1 + config.failureThreshold); // 4 failures
    });
  });
});
