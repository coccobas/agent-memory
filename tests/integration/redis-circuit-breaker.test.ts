/**
 * Integration tests for Redis Circuit Breaker.
 *
 * These tests require a running Redis instance.
 * Skip if AGENT_MEMORY_REDIS_ENABLED is not set.
 *
 * To run locally:
 *   docker run -d -p 6379:6379 redis:alpine
 *   AGENT_MEMORY_REDIS_ENABLED=true npm run test tests/integration/redis-circuit-breaker.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { config } from '../../src/config/index.js';
import { CircuitBreaker } from '../../src/utils/circuit-breaker.js';
import {
  LocalCircuitBreakerAdapter,
  createLocalCircuitBreakerAdapter,
} from '../../src/core/adapters/local-circuit-breaker.adapter.js';

// Skip Redis tests if not configured
const REDIS_ENABLED = process.env.AGENT_MEMORY_REDIS_ENABLED === 'true';

// =============================================================================
// LOCAL CIRCUIT BREAKER ADAPTER TESTS (Always run)
// =============================================================================

describe('LocalCircuitBreakerAdapter', () => {
  let adapter: LocalCircuitBreakerAdapter;

  const defaultConfig = {
    failureThreshold: 3,
    resetTimeoutMs: 1000,
    successThreshold: 2,
  };

  beforeEach(() => {
    adapter = createLocalCircuitBreakerAdapter();
  });

  describe('State Management', () => {
    it('should return null for unknown service', async () => {
      const state = await adapter.getState('unknown-service');
      expect(state).toBeNull();
    });

    it('should set and get state', async () => {
      const serviceName = 'test-service';
      const state = {
        state: 'open' as const,
        failures: 5,
        successes: 0,
        lastFailureTime: Date.now(),
        nextAttemptTime: Date.now() + 30000,
      };

      await adapter.setState(serviceName, state);
      const retrieved = await adapter.getState(serviceName);

      expect(retrieved).toEqual(state);
    });

    it('should reset service state', async () => {
      const serviceName = 'test-service';
      await adapter.setState(serviceName, {
        state: 'open',
        failures: 5,
        successes: 0,
      });

      await adapter.reset(serviceName);
      const state = await adapter.getState(serviceName);

      expect(state).toBeNull();
    });

    it('should reset all service states', async () => {
      await adapter.setState('service-1', { state: 'open', failures: 5, successes: 0 });
      await adapter.setState('service-2', { state: 'open', failures: 3, successes: 0 });

      await adapter.resetAll();

      expect(await adapter.getState('service-1')).toBeNull();
      expect(await adapter.getState('service-2')).toBeNull();
      expect(adapter.size()).toBe(0);
    });
  });

  describe('Recording Failures', () => {
    it('should increment failure count', async () => {
      const serviceName = 'test-service';

      const state1 = await adapter.recordFailure(serviceName, defaultConfig);
      expect(state1.failures).toBe(1);
      expect(state1.state).toBe('closed');

      const state2 = await adapter.recordFailure(serviceName, defaultConfig);
      expect(state2.failures).toBe(2);
      expect(state2.state).toBe('closed');
    });

    it('should open circuit when failure threshold is reached', async () => {
      const serviceName = 'test-service';

      // Record failures up to threshold
      for (let i = 0; i < 3; i++) {
        await adapter.recordFailure(serviceName, defaultConfig);
      }

      const state = await adapter.getState(serviceName);
      expect(state?.state).toBe('open');
      expect(state?.failures).toBe(3);
      expect(state?.nextAttemptTime).toBeDefined();
    });

    it('should immediately open circuit on failure in half-open state', async () => {
      const serviceName = 'test-service';

      // Set to half-open state
      await adapter.setState(serviceName, {
        state: 'half-open',
        failures: 3,
        successes: 0,
      });

      const state = await adapter.recordFailure(serviceName, defaultConfig);

      expect(state.state).toBe('open');
      expect(state.nextAttemptTime).toBeDefined();
    });

    it('should reset successes on failure', async () => {
      const serviceName = 'test-service';

      // Record some successes first
      await adapter.recordSuccess(serviceName, defaultConfig);
      await adapter.recordSuccess(serviceName, defaultConfig);

      const stateBeforeFailure = await adapter.getState(serviceName);
      expect(stateBeforeFailure?.successes).toBe(2);

      // Record a failure
      const state = await adapter.recordFailure(serviceName, defaultConfig);
      expect(state.successes).toBe(0);
    });

    it('should set lastFailureTime on failure', async () => {
      const serviceName = 'test-service';
      const beforeTime = Date.now();

      await adapter.recordFailure(serviceName, defaultConfig);

      const state = await adapter.getState(serviceName);
      expect(state?.lastFailureTime).toBeDefined();
      expect(state!.lastFailureTime!).toBeGreaterThanOrEqual(beforeTime);
    });
  });

  describe('Recording Successes', () => {
    it('should increment success count', async () => {
      const serviceName = 'test-service';

      const state1 = await adapter.recordSuccess(serviceName, defaultConfig);
      expect(state1.successes).toBe(1);

      const state2 = await adapter.recordSuccess(serviceName, defaultConfig);
      expect(state2.successes).toBe(2);
    });

    it('should reset failures on success in closed state', async () => {
      const serviceName = 'test-service';

      // Record some failures first
      await adapter.recordFailure(serviceName, defaultConfig);
      await adapter.recordFailure(serviceName, defaultConfig);

      const stateBeforeSuccess = await adapter.getState(serviceName);
      expect(stateBeforeSuccess?.failures).toBe(2);

      // Record a success
      const state = await adapter.recordSuccess(serviceName, defaultConfig);
      expect(state.failures).toBe(0);
    });

    it('should close circuit when success threshold is reached in half-open state', async () => {
      const serviceName = 'test-service';

      // Set to half-open state
      await adapter.setState(serviceName, {
        state: 'half-open',
        failures: 3,
        successes: 0,
      });

      // Record successes up to threshold
      await adapter.recordSuccess(serviceName, defaultConfig);
      const state = await adapter.recordSuccess(serviceName, defaultConfig);

      expect(state.state).toBe('closed');
      expect(state.failures).toBe(0);
      expect(state.successes).toBe(0);
    });

    it('should not close circuit before success threshold in half-open', async () => {
      const serviceName = 'test-service';

      // Set to half-open state
      await adapter.setState(serviceName, {
        state: 'half-open',
        failures: 3,
        successes: 0,
      });

      // Record one success (threshold is 2)
      const state = await adapter.recordSuccess(serviceName, defaultConfig);

      expect(state.state).toBe('half-open');
      expect(state.successes).toBe(1);
    });
  });

  describe('State Transition Check', () => {
    it('should transition from open to half-open after timeout', async () => {
      const serviceName = 'test-service';
      const shortConfig = { ...defaultConfig, resetTimeoutMs: 50 };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await adapter.recordFailure(serviceName, shortConfig);
      }

      const openState = await adapter.getState(serviceName);
      expect(openState?.state).toBe('open');

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check and transition
      const state = await adapter.checkAndTransition(serviceName);
      expect(state.state).toBe('half-open');
    });

    it('should not transition before timeout', async () => {
      const serviceName = 'test-service';
      const longConfig = { ...defaultConfig, resetTimeoutMs: 10000 };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await adapter.recordFailure(serviceName, longConfig);
      }

      const state = await adapter.checkAndTransition(serviceName);
      expect(state.state).toBe('open');
    });
  });

  describe('Integration with CircuitBreaker', () => {
    it('should work with CircuitBreaker class using local adapter', async () => {
      const localAdapter = createLocalCircuitBreakerAdapter();

      const breaker = new CircuitBreaker({
        name: 'test-service',
        failureThreshold: 2,
        resetTimeoutMs: 100,
        successThreshold: 1,
        stateAdapter: localAdapter,
      });

      // Should be closed initially
      expect(breaker.isDistributed()).toBe(true);

      // Execute successful call
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');

      // Record failures to open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Test error');
          });
        } catch {
          // Expected
        }
      }

      // Circuit should be open
      const stats = await breaker.getDistributedStats();
      expect(stats.state).toBe('OPEN');

      // Should throw CircuitBreakerError
      await expect(
        breaker.execute(async () => 'should not run')
      ).rejects.toThrow(/Circuit breaker open/);

      // Wait for reset
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be able to execute again (half-open)
      const retryResult = await breaker.execute(async () => 'retry success');
      expect(retryResult).toBe('retry success');
    });

    it('should work without adapter (local mode)', async () => {
      const breaker = new CircuitBreaker({
        name: 'local-test-service',
        failureThreshold: 2,
        resetTimeoutMs: 100,
        successThreshold: 1,
      });

      // Should not be distributed
      expect(breaker.isDistributed()).toBe(false);

      // Execute successful call
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');

      // Record failures
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Test error');
          });
        } catch {
          // Expected
        }
      }

      // Circuit should be open
      expect(breaker.isOpen()).toBe(true);
    });
  });
});

// =============================================================================
// REDIS CIRCUIT BREAKER ADAPTER TESTS (Only run with Redis)
// =============================================================================

describe.skipIf(!REDIS_ENABLED)('RedisCircuitBreakerAdapter Integration', () => {
  // Dynamic import to avoid loading ioredis when not used
  let RedisCircuitBreakerAdapter: typeof import('../../src/core/adapters/redis-circuit-breaker.adapter.js').RedisCircuitBreakerAdapter;

  beforeAll(async () => {
    const module = await import('../../src/core/adapters/redis-circuit-breaker.adapter.js');
    RedisCircuitBreakerAdapter = module.RedisCircuitBreakerAdapter;
  });

  describe('Basic State Operations', () => {
    let adapter: InstanceType<typeof RedisCircuitBreakerAdapter>;

    beforeEach(async () => {
      adapter = new RedisCircuitBreakerAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:cb:basic:',
        stateTTLMs: 60000,
      });
      await adapter.connect();
    });

    afterEach(async () => {
      await adapter.resetAll();
      await adapter.close();
    });

    it('should return null for unknown service', async () => {
      const state = await adapter.getState('unknown-service');
      expect(state).toBeNull();
    });

    it('should set and get state', async () => {
      const serviceName = 'test-service';
      const state = {
        state: 'open' as const,
        failures: 5,
        successes: 0,
        lastFailureTime: Date.now(),
        nextAttemptTime: Date.now() + 30000,
      };

      await adapter.setState(serviceName, state);
      const retrieved = await adapter.getState(serviceName);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.state).toBe('open');
      expect(retrieved?.failures).toBe(5);
      expect(retrieved?.successes).toBe(0);
    });

    it('should reset service state', async () => {
      const serviceName = 'test-service';
      await adapter.setState(serviceName, {
        state: 'open',
        failures: 5,
        successes: 0,
      });

      await adapter.reset(serviceName);
      const state = await adapter.getState(serviceName);

      expect(state).toBeNull();
    });

    it('should reset all service states', async () => {
      await adapter.setState('service-1', { state: 'open', failures: 5, successes: 0 });
      await adapter.setState('service-2', { state: 'open', failures: 3, successes: 0 });

      await adapter.resetAll();

      expect(await adapter.getState('service-1')).toBeNull();
      expect(await adapter.getState('service-2')).toBeNull();
    });
  });

  describe('Atomic State Transitions', () => {
    let adapter: InstanceType<typeof RedisCircuitBreakerAdapter>;

    const defaultConfig = {
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      successThreshold: 2,
    };

    beforeEach(async () => {
      adapter = new RedisCircuitBreakerAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:cb:transitions:',
        stateTTLMs: 60000,
      });
      await adapter.connect();
    });

    afterEach(async () => {
      await adapter.resetAll();
      await adapter.close();
    });

    it('should atomically record failures', async () => {
      const serviceName = 'test-service';

      const state1 = await adapter.recordFailure(serviceName, defaultConfig);
      expect(state1.failures).toBe(1);
      expect(state1.state).toBe('closed');

      const state2 = await adapter.recordFailure(serviceName, defaultConfig);
      expect(state2.failures).toBe(2);
      expect(state2.state).toBe('closed');

      const state3 = await adapter.recordFailure(serviceName, defaultConfig);
      expect(state3.failures).toBe(3);
      expect(state3.state).toBe('open');
    });

    it('should atomically record successes', async () => {
      const serviceName = 'test-service';

      // Set to half-open state
      await adapter.setState(serviceName, {
        state: 'half-open',
        failures: 3,
        successes: 0,
      });

      const state1 = await adapter.recordSuccess(serviceName, defaultConfig);
      expect(state1.successes).toBe(1);
      expect(state1.state).toBe('half-open');

      const state2 = await adapter.recordSuccess(serviceName, defaultConfig);
      expect(state2.successes).toBe(0); // Reset after close
      expect(state2.state).toBe('closed');
    });

    it('should handle open to half-open transition', async () => {
      const serviceName = 'test-service';
      const shortConfig = { ...defaultConfig, resetTimeoutMs: 50 };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await adapter.recordFailure(serviceName, shortConfig);
      }

      const openState = await adapter.getState(serviceName);
      expect(openState?.state).toBe('open');

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 100));

      // getState should trigger transition
      const halfOpenState = await adapter.getState(serviceName);
      expect(halfOpenState?.state).toBe('half-open');
    });
  });

  describe('Distributed State Sharing (Two Instances)', () => {
    let adapter1: InstanceType<typeof RedisCircuitBreakerAdapter>;
    let adapter2: InstanceType<typeof RedisCircuitBreakerAdapter>;

    const sharedConfig = {
      host: config.redis.host,
      port: config.redis.port,
      keyPrefix: 'test:cb:distributed:',
      stateTTLMs: 60000,
    };

    const cbConfig = {
      failureThreshold: 5,
      resetTimeoutMs: 1000,
      successThreshold: 2,
    };

    beforeEach(async () => {
      adapter1 = new RedisCircuitBreakerAdapter(sharedConfig);
      adapter2 = new RedisCircuitBreakerAdapter(sharedConfig);

      await adapter1.connect();
      await adapter2.connect();
    });

    afterEach(async () => {
      await adapter1.resetAll();
      await adapter1.close();
      await adapter2.close();
    });

    it('should share state between instances', async () => {
      const serviceName = 'shared-service';

      // Instance 1 records failures
      await adapter1.recordFailure(serviceName, cbConfig);
      await adapter1.recordFailure(serviceName, cbConfig);
      await adapter1.recordFailure(serviceName, cbConfig);

      // Instance 2 should see the failures
      const state = await adapter2.getState(serviceName);
      expect(state?.failures).toBe(3);
      expect(state?.state).toBe('closed');

      // Instance 2 continues recording failures
      await adapter2.recordFailure(serviceName, cbConfig);
      await adapter2.recordFailure(serviceName, cbConfig);

      // Both instances should see circuit is open
      const state1 = await adapter1.getState(serviceName);
      const state2 = await adapter2.getState(serviceName);

      expect(state1?.state).toBe('open');
      expect(state2?.state).toBe('open');
      expect(state1?.failures).toBe(5);
      expect(state2?.failures).toBe(5);
    });

    it('should coordinate open -> half-open -> closed transitions', async () => {
      const serviceName = 'coordinated-service';
      const shortCbConfig = { ...cbConfig, resetTimeoutMs: 50 };

      // Instance 1 opens circuit
      for (let i = 0; i < 5; i++) {
        await adapter1.recordFailure(serviceName, shortCbConfig);
      }

      // Both see it as open
      expect((await adapter1.getState(serviceName))?.state).toBe('open');
      expect((await adapter2.getState(serviceName))?.state).toBe('open');

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Instance 2 gets state - should transition to half-open
      const halfOpenState = await adapter2.getState(serviceName);
      expect(halfOpenState?.state).toBe('half-open');

      // Instance 1 records success
      await adapter1.recordSuccess(serviceName, shortCbConfig);

      // Instance 2 records another success (should close)
      const closedState = await adapter2.recordSuccess(serviceName, shortCbConfig);
      expect(closedState.state).toBe('closed');

      // Both see it as closed
      expect((await adapter1.getState(serviceName))?.state).toBe('closed');
      expect((await adapter2.getState(serviceName))?.state).toBe('closed');
    });

    it('should handle concurrent failures correctly', async () => {
      const serviceName = 'concurrent-service';

      // Simulate concurrent failures from both instances
      const promises: Promise<unknown>[] = [];

      for (let i = 0; i < 3; i++) {
        promises.push(adapter1.recordFailure(serviceName, cbConfig));
        promises.push(adapter2.recordFailure(serviceName, cbConfig));
      }

      await Promise.all(promises);

      // Should have 6 total failures (3 from each)
      const state = await adapter1.getState(serviceName);
      expect(state?.failures).toBe(6);
      expect(state?.state).toBe('open'); // Exceeded threshold of 5
    });

    it('should see reset from other instance', async () => {
      const serviceName = 'reset-coordination';

      // Instance 1 opens circuit
      for (let i = 0; i < 5; i++) {
        await adapter1.recordFailure(serviceName, cbConfig);
      }

      // Instance 2 sees it open
      expect((await adapter2.getState(serviceName))?.state).toBe('open');

      // Instance 1 resets
      await adapter1.reset(serviceName);

      // Instance 2 should see it reset
      const state = await adapter2.getState(serviceName);
      expect(state).toBeNull();
    });
  });

  describe('Integration with CircuitBreaker Class', () => {
    let adapter: InstanceType<typeof RedisCircuitBreakerAdapter>;

    beforeEach(async () => {
      adapter = new RedisCircuitBreakerAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:cb:integration:',
        stateTTLMs: 60000,
      });
      await adapter.connect();
    });

    afterEach(async () => {
      await adapter.resetAll();
      await adapter.close();
    });

    it('should work with CircuitBreaker class', async () => {
      const breaker = new CircuitBreaker({
        name: 'redis-test-service',
        failureThreshold: 2,
        resetTimeoutMs: 100,
        successThreshold: 1,
        stateAdapter: adapter,
      });

      // Should be distributed
      expect(breaker.isDistributed()).toBe(true);

      // Execute successful call
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');

      // Record failures to open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Test error');
          });
        } catch {
          // Expected
        }
      }

      // Circuit should be open
      const stats = await breaker.getDistributedStats();
      expect(stats.state).toBe('OPEN');

      // Should throw CircuitBreakerError
      await expect(
        breaker.execute(async () => 'should not run')
      ).rejects.toThrow(/Circuit breaker open/);

      // Wait for reset
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be able to execute again (half-open)
      const retryResult = await breaker.execute(async () => 'retry success');
      expect(retryResult).toBe('retry success');

      // Circuit should be closed now
      const finalStats = await breaker.getDistributedStats();
      expect(finalStats.state).toBe('CLOSED');
    });

    it('should share circuit state between multiple CircuitBreaker instances', async () => {
      const breaker1 = new CircuitBreaker({
        name: 'shared-circuit',
        failureThreshold: 3,
        resetTimeoutMs: 100,
        successThreshold: 1,
        stateAdapter: adapter,
      });

      const breaker2 = new CircuitBreaker({
        name: 'shared-circuit',
        failureThreshold: 3,
        resetTimeoutMs: 100,
        successThreshold: 1,
        stateAdapter: adapter,
      });

      // Breaker 1 records failures
      for (let i = 0; i < 2; i++) {
        try {
          await breaker1.execute(async () => {
            throw new Error('Error from breaker 1');
          });
        } catch {
          // Expected
        }
      }

      // Breaker 2 records one more failure - should open circuit
      try {
        await breaker2.execute(async () => {
          throw new Error('Error from breaker 2');
        });
      } catch {
        // Expected
      }

      // Both breakers should see circuit as open
      const stats1 = await breaker1.getDistributedStats();
      const stats2 = await breaker2.getDistributedStats();

      expect(stats1.state).toBe('OPEN');
      expect(stats2.state).toBe('OPEN');

      // Both should reject new requests
      await expect(
        breaker1.execute(async () => 'should fail')
      ).rejects.toThrow(/Circuit breaker open/);

      await expect(
        breaker2.execute(async () => 'should also fail')
      ).rejects.toThrow(/Circuit breaker open/);
    });
  });

  describe('Fallback Behavior', () => {
    it('should use local fallback when Redis is unavailable', async () => {
      const adapter = new RedisCircuitBreakerAdapter({
        host: 'invalid-host-that-does-not-exist.local',
        port: 9999,
        keyPrefix: 'test:cb:fallback:',
        failMode: 'local-fallback',
      });

      // Don't await connect - let it fail in background
      adapter.connect().catch(() => {});

      const cbConfig = {
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        successThreshold: 2,
      };

      // Should still work with local fallback
      const state1 = await adapter.recordFailure('fallback-service', cbConfig);
      expect(state1.failures).toBe(1);
      expect(state1.state).toBe('closed');

      const state2 = await adapter.recordSuccess('fallback-service', cbConfig);
      expect(state2.successes).toBe(1);

      await adapter.close();
    });

    it('should respect failMode: closed', async () => {
      const adapter = new RedisCircuitBreakerAdapter({
        host: 'invalid-host-that-does-not-exist.local',
        port: 9999,
        keyPrefix: 'test:cb:fail-closed:',
        failMode: 'closed',
      });

      // Don't await connect
      adapter.connect().catch(() => {});

      const cbConfig = {
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        successThreshold: 2,
      };

      // With failMode: closed, should return closed state
      const state = await adapter.recordFailure('fail-closed-service', cbConfig);
      expect(state.state).toBe('closed');

      await adapter.close();
    });

    it('should respect failMode: open', async () => {
      const adapter = new RedisCircuitBreakerAdapter({
        host: 'invalid-host-that-does-not-exist.local',
        port: 9999,
        keyPrefix: 'test:cb:fail-open:',
        failMode: 'open',
      });

      // Don't await connect
      adapter.connect().catch(() => {});

      const cbConfig = {
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        successThreshold: 2,
      };

      // With failMode: open, should return open state
      const state = await adapter.recordFailure('fail-open-service', cbConfig);
      expect(state.state).toBe('open');
      expect(state.nextAttemptTime).toBeDefined();

      await adapter.close();
    });
  });

  describe('Configuration and Helpers', () => {
    let adapter: InstanceType<typeof RedisCircuitBreakerAdapter>;

    beforeEach(async () => {
      adapter = new RedisCircuitBreakerAdapter({
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: 'test:cb:config:',
        stateTTLMs: 120000,
        failMode: 'local-fallback',
      });
      await adapter.connect();
    });

    afterEach(async () => {
      await adapter.close();
    });

    it('should expose configuration', () => {
      const cfg = adapter.getConfig();

      expect(cfg.keyPrefix).toBe('test:cb:config:');
      expect(cfg.stateTTLMs).toBe(120000);
      expect(cfg.failMode).toBe('local-fallback');
    });

    it('should expose Redis client', () => {
      const client = adapter.getClient();
      expect(client).not.toBeNull();
    });

    it('should report connection status', () => {
      expect(adapter.isRedisConnected()).toBe(true);
    });
  });
});
