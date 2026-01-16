/**
 * Local Circuit Breaker State Adapter
 *
 * In-memory implementation of ICircuitBreakerStateAdapter.
 * Wraps existing circuit breaker state logic for single-instance deployments.
 *
 * For distributed deployments, use RedisCircuitBreakerAdapter instead.
 */

import type {
  ICircuitBreakerStateAdapter,
  CircuitBreakerState,
  CircuitBreakerStateConfig,
} from './interfaces.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('local-circuit-breaker');

/**
 * Default circuit breaker state.
 */
function createDefaultState(): CircuitBreakerState {
  return {
    state: 'closed',
    failures: 0,
    successes: 0,
  };
}

/**
 * Local in-memory circuit breaker state adapter.
 * Provides atomic state management for single-instance deployments.
 */
export class LocalCircuitBreakerAdapter implements ICircuitBreakerStateAdapter {
  private states = new Map<string, CircuitBreakerState>();

  /**
   * Get the current state for a service.
   */
  async getState(serviceName: string): Promise<CircuitBreakerState | null> {
    const state = this.states.get(serviceName);
    return Promise.resolve(state ?? null);
  }

  /**
   * Set the state for a service.
   */
  async setState(serviceName: string, state: CircuitBreakerState): Promise<void> {
    this.states.set(serviceName, { ...state });
    logger.debug({ serviceName, state: state.state }, 'State set');
    return Promise.resolve();
  }

  /**
   * Record a failure and return the updated state.
   * Handles state transitions based on configuration.
   */
  async recordFailure(
    serviceName: string,
    config: CircuitBreakerStateConfig
  ): Promise<CircuitBreakerState> {
    const currentState = this.states.get(serviceName) ?? createDefaultState();
    const now = Date.now();

    // Update failure tracking
    const updatedState: CircuitBreakerState = {
      ...currentState,
      failures: currentState.failures + 1,
      successes: 0, // Reset successes on failure
      lastFailureTime: now,
    };

    // Handle state transitions
    if (currentState.state === 'half-open') {
      // Immediately open on failure in half-open state
      updatedState.state = 'open';
      updatedState.nextAttemptTime = now + config.resetTimeoutMs;
      logger.warn(
        { serviceName, failures: updatedState.failures },
        'Circuit breaker opened (from half-open)'
      );
    } else if (
      currentState.state === 'closed' &&
      updatedState.failures >= config.failureThreshold
    ) {
      // Open when failure threshold is reached
      updatedState.state = 'open';
      updatedState.nextAttemptTime = now + config.resetTimeoutMs;
      logger.warn(
        {
          serviceName,
          failures: updatedState.failures,
          resetTime: new Date(updatedState.nextAttemptTime).toISOString(),
        },
        'Circuit breaker opened'
      );
    }

    this.states.set(serviceName, updatedState);
    return Promise.resolve(updatedState);
  }

  /**
   * Record a success and return the updated state.
   * Handles state transitions based on configuration.
   */
  async recordSuccess(
    serviceName: string,
    config: CircuitBreakerStateConfig
  ): Promise<CircuitBreakerState> {
    const currentState = this.states.get(serviceName) ?? createDefaultState();

    // Update success tracking
    const updatedState: CircuitBreakerState = {
      ...currentState,
      successes: currentState.successes + 1,
    };

    // Handle state transitions
    if (currentState.state === 'half-open') {
      if (updatedState.successes >= config.successThreshold) {
        // Close circuit after enough successes in half-open
        updatedState.state = 'closed';
        updatedState.failures = 0;
        updatedState.successes = 0;
        updatedState.nextAttemptTime = undefined;
        logger.info({ serviceName }, 'Circuit breaker closed');
      }
    } else if (currentState.state === 'closed') {
      // Reset failure count on success in closed state
      updatedState.failures = 0;
    }

    this.states.set(serviceName, updatedState);
    return Promise.resolve(updatedState);
  }

  /**
   * Reset the circuit breaker state for a service.
   */
  async reset(serviceName: string): Promise<void> {
    this.states.delete(serviceName);
    logger.debug({ serviceName }, 'Circuit breaker reset');
    return Promise.resolve();
  }

  /**
   * Reset all circuit breaker states.
   */
  async resetAll(): Promise<void> {
    const count = this.states.size;
    this.states.clear();
    logger.info({ count }, 'All circuit breakers reset');
    return Promise.resolve();
  }

  /**
   * Check if circuit should transition from open to half-open.
   * Call this before executing to handle timeout-based transitions.
   */
  async checkAndTransition(serviceName: string): Promise<CircuitBreakerState> {
    const currentState = this.states.get(serviceName) ?? createDefaultState();

    if (currentState.state === 'open') {
      const now = Date.now();
      if (currentState.nextAttemptTime && now >= currentState.nextAttemptTime) {
        // Transition to half-open
        const updatedState: CircuitBreakerState = {
          ...currentState,
          state: 'half-open',
          successes: 0,
        };
        this.states.set(serviceName, updatedState);
        logger.info({ serviceName }, 'Circuit breaker half-open, testing...');
        return updatedState;
      }
    }

    return currentState;
  }

  /**
   * Get all service names with circuit breaker state.
   */
  getServiceNames(): string[] {
    return Array.from(this.states.keys());
  }

  /**
   * Get count of tracked services.
   */
  size(): number {
    return this.states.size;
  }
}

/**
 * Factory function to create a LocalCircuitBreakerAdapter instance.
 *
 * @returns Configured LocalCircuitBreakerAdapter instance
 *
 * @example
 * ```typescript
 * const adapter = createLocalCircuitBreakerAdapter();
 *
 * // Record a failure
 * const state = await adapter.recordFailure('my-service', {
 *   failureThreshold: 5,
 *   resetTimeoutMs: 30000,
 *   successThreshold: 2,
 * });
 *
 * // Check state
 * if (state.state === 'open') {
 *   console.log(`Circuit open until ${new Date(state.nextAttemptTime!)}`);
 * }
 * ```
 */
export function createLocalCircuitBreakerAdapter(): LocalCircuitBreakerAdapter {
  return new LocalCircuitBreakerAdapter();
}
