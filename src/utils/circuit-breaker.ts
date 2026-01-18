/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by failing fast when a service is down.
 * States: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (testing)
 *
 * Configuration via environment variables:
 * - AGENT_MEMORY_CB_FAILURE_THRESHOLD: Number of failures before opening (default: 5)
 * - AGENT_MEMORY_CB_RESET_TIMEOUT_MS: Time before attempting to close (default: 30000)
 * - AGENT_MEMORY_CB_SUCCESS_THRESHOLD: Successes needed to close (default: 2)
 *
 * For distributed deployments, use the stateAdapter option to share state via Redis.
 *
 * NOTE: Non-null assertions used for Map access after has() checks in state management.
 */

import { CircuitBreakerError } from '../core/errors.js';
import { defaultContainer } from '../core/container.js';
import { createComponentLogger } from './logger.js';
import { config } from '../config/index.js';
import type {
  ICircuitBreakerStateAdapter,
  CircuitBreakerStateConfig,
} from '../core/adapters/interfaces.js';

const logger = createComponentLogger('circuit-breaker');

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Name of the service being protected */
  name: string;
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms before attempting to close the circuit */
  resetTimeoutMs: number;
  /** Number of successful calls in HALF_OPEN state to close the circuit */
  successThreshold: number;
  /** Optional: Function to determine if an error should count as a failure */
  isFailure?: (error: Error) => boolean;
  /**
   * Optional: State adapter for distributed circuit breaker.
   * When provided, state is managed by the adapter (e.g., Redis) for sharing across instances.
   * When not provided, uses local in-memory state (default behavior).
   */
  stateAdapter?: ICircuitBreakerStateAdapter;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
}

/**
 * Default circuit breaker configuration.
 * Values are loaded from centralized config (configurable via environment variables).
 */
const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
  failureThreshold: config.circuitBreaker.failureThreshold,
  resetTimeoutMs: config.circuitBreaker.resetTimeoutMs,
  successThreshold: config.circuitBreaker.successThreshold,
  isFailure: () => true,
};

/**
 * Circuit Breaker implementation
 *
 * Supports both local (in-memory) and distributed (via state adapter) modes:
 * - Local mode (default): State is kept in memory, suitable for single-instance deployments.
 * - Distributed mode: State is managed by an adapter (e.g., Redis) for sharing across instances.
 */
export class CircuitBreaker {
  // Local state (used when no stateAdapter is provided)
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private nextAttemptTime: number | null = null;

  // Stats (always tracked locally for metrics)
  private totalCalls = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;

  private config: Required<Omit<CircuitBreakerConfig, 'stateAdapter'>> & {
    stateAdapter?: ICircuitBreakerStateAdapter;
  };
  private stateAdapter?: ICircuitBreakerStateAdapter;

  constructor(cbConfig: CircuitBreakerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...cbConfig } as Required<
      Omit<CircuitBreakerConfig, 'stateAdapter'>
    > & { stateAdapter?: ICircuitBreakerStateAdapter };
    this.stateAdapter = cbConfig.stateAdapter;

    if (this.stateAdapter) {
      logger.debug({ service: cbConfig.name }, 'Circuit breaker using distributed state adapter');
    }
  }

  /**
   * Get state adapter config for distributed mode.
   */
  private getStateConfig(): CircuitBreakerStateConfig {
    return {
      failureThreshold: this.config.failureThreshold,
      resetTimeoutMs: this.config.resetTimeoutMs,
      successThreshold: this.config.successThreshold,
    };
  }

  /**
   * Convert distributed state to local CircuitState.
   */
  private toCircuitState(state: 'closed' | 'open' | 'half-open'): CircuitState {
    switch (state) {
      case 'closed':
        return 'CLOSED';
      case 'open':
        return 'OPEN';
      case 'half-open':
        return 'HALF_OPEN';
    }
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    // Distributed mode: check state from adapter
    if (this.stateAdapter) {
      return this.executeWithAdapter(fn, this.stateAdapter);
    }

    // Local mode: use in-memory state
    return this.executeLocal(fn);
  }

  /**
   * Execute with distributed state adapter.
   */
  private async executeWithAdapter<T>(
    fn: () => Promise<T>,
    adapter: ICircuitBreakerStateAdapter
  ): Promise<T> {
    // Get current state from adapter
    const currentState = await adapter.getState(this.config.name);

    // Check if circuit is open
    if (currentState?.state === 'open') {
      const now = Date.now();
      if (currentState.nextAttemptTime && now < currentState.nextAttemptTime) {
        throw new CircuitBreakerError(this.config.name, currentState.nextAttemptTime);
      }
      // Ready to transition to half-open - will happen on next getState
    }

    try {
      const result = await fn();
      await this.onSuccessWithAdapter(adapter);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this.config.isFailure(err)) {
        await this.onFailureWithAdapter(err, adapter);
        const wrappedError = new Error(`[CircuitBreaker:${this.config.name}] ${err.message}`);
        wrappedError.cause = err;
        wrappedError.name = 'CircuitBreakerWrappedError';
        throw wrappedError;
      }
      throw error;
    }
  }

  /**
   * Execute with local in-memory state.
   */
  private async executeLocal<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'OPEN') {
      if (Date.now() < (this.nextAttemptTime ?? 0)) {
        throw new CircuitBreakerError(this.config.name, this.nextAttemptTime ?? 0);
      }
      // Transition to HALF_OPEN
      this.transitionTo('HALF_OPEN');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this.config.isFailure(err)) {
        this.onFailure(err);
        const wrappedError = new Error(`[CircuitBreaker:${this.config.name}] ${err.message}`);
        wrappedError.cause = err;
        wrappedError.name = 'CircuitBreakerWrappedError';
        throw wrappedError;
      }
      throw error;
    }
  }

  /**
   * Handle successful call (local mode)
   */
  private onSuccess(): void {
    this.successes++;
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo('CLOSED');
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  /**
   * Handle successful call (distributed mode)
   */
  private async onSuccessWithAdapter(adapter: ICircuitBreakerStateAdapter): Promise<void> {
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();

    const newState = await adapter.recordSuccess(this.config.name, this.getStateConfig());

    // Update local state for stats
    this.state = this.toCircuitState(newState.state);
    this.failures = newState.failures;
    this.successes = newState.successes;
  }

  /**
   * Handle failed call (local mode)
   */
  private onFailure(error: Error): void {
    this.failures++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.successes = 0;

    logger.warn({ service: this.config.name, error: error.message }, 'Circuit breaker failure');

    if (this.state === 'HALF_OPEN') {
      // Immediately open on failure in HALF_OPEN
      this.transitionTo('OPEN');
    } else if (this.state === 'CLOSED' && this.failures >= this.config.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  /**
   * Handle failed call (distributed mode)
   */
  private async onFailureWithAdapter(
    error: Error,
    adapter: ICircuitBreakerStateAdapter
  ): Promise<void> {
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    logger.warn({ service: this.config.name, error: error.message }, 'Circuit breaker failure');

    const newState = await adapter.recordFailure(this.config.name, this.getStateConfig());

    // Update local state for stats
    this.state = this.toCircuitState(newState.state);
    this.failures = newState.failures;
    this.successes = newState.successes;
    this.nextAttemptTime = newState.nextAttemptTime ?? null;
  }

  /**
   * Transition to a new state (local mode only)
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === 'OPEN') {
      this.nextAttemptTime = Date.now() + this.config.resetTimeoutMs;
      logger.warn(
        {
          service: this.config.name,
          failures: this.failures,
          resetTime: new Date(this.nextAttemptTime).toISOString(),
        },
        'Circuit breaker opened'
      );
    } else if (newState === 'CLOSED') {
      this.failures = 0;
      this.successes = 0;
      this.nextAttemptTime = null;
      logger.info({ service: this.config.name }, 'Circuit breaker closed');
    } else if (newState === 'HALF_OPEN') {
      this.successes = 0;
      logger.info({ service: this.config.name }, 'Circuit breaker half-open, testing...');
    }

    logger.debug({ service: this.config.name, from: oldState, to: newState }, 'State transition');
  }

  /**
   * Get current stats
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  /**
   * Get current stats with fresh distributed state (async version).
   * For distributed mode, fetches current state from adapter.
   */
  async getDistributedStats(): Promise<CircuitBreakerStats> {
    if (this.stateAdapter) {
      const state = await this.stateAdapter.getState(this.config.name);
      if (state) {
        return {
          state: this.toCircuitState(state.state),
          failures: state.failures,
          successes: state.successes,
          lastFailureTime: state.lastFailureTime ?? null,
          lastSuccessTime: this.lastSuccessTime,
          totalCalls: this.totalCalls,
          totalFailures: this.totalFailures,
          totalSuccesses: this.totalSuccesses,
        };
      }
    }

    return this.getStats();
  }

  /**
   * Get the service name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.state === 'OPEN';
  }

  /**
   * Check if circuit is open (async version for distributed mode).
   */
  async isOpenAsync(): Promise<boolean> {
    if (this.stateAdapter) {
      const state = await this.stateAdapter.getState(this.config.name);
      if (state) {
        return state.state === 'open';
      }
    }
    return this.isOpen();
  }

  /**
   * Force the circuit to close (for testing/admin)
   */
  forceClose(): void {
    this.transitionTo('CLOSED');
  }

  /**
   * Force the circuit to close (async version for distributed mode)
   */
  async forceCloseAsync(): Promise<void> {
    if (this.stateAdapter) {
      await this.stateAdapter.reset(this.config.name);
    }
    this.transitionTo('CLOSED');
  }

  /**
   * Force the circuit to open (for testing/admin)
   */
  forceOpen(): void {
    this.transitionTo('OPEN');
  }

  /**
   * Force the circuit to open (async version for distributed mode)
   */
  async forceOpenAsync(): Promise<void> {
    if (this.stateAdapter) {
      await this.stateAdapter.setState(this.config.name, {
        state: 'open',
        failures: this.config.failureThreshold,
        successes: 0,
        lastFailureTime: Date.now(),
        nextAttemptTime: Date.now() + this.config.resetTimeoutMs,
      });
    }
    this.transitionTo('OPEN');
  }

  /**
   * Check if using distributed state adapter.
   */
  isDistributed(): boolean {
    return this.stateAdapter !== undefined;
  }
}

// =============================================================================
// CIRCUIT BREAKER REGISTRY (delegated to Container for test isolation)
// =============================================================================

/**
 * Get or create a circuit breaker for a service
 * Uses Container for storage to enable test isolation
 */
export function getCircuitBreaker(config: CircuitBreakerConfig): CircuitBreaker {
  const existing = defaultContainer.getCircuitBreaker(config.name) as CircuitBreaker | undefined;
  if (existing) {
    return existing;
  }
  // Create new circuit breaker and register with container
  const breaker = new CircuitBreaker(config);
  defaultContainer.getCircuitBreaker(config.name, () => breaker);
  return breaker;
}

/**
 * Get all circuit breakers
 */
export function getAllCircuitBreakers(): Map<string, CircuitBreaker> {
  const containerBreakers = defaultContainer.getAllCircuitBreakers();
  const result = new Map<string, CircuitBreaker>();
  for (const [name, breaker] of containerBreakers) {
    result.set(name, breaker as CircuitBreaker);
  }
  return result;
}

/**
 * Get stats for all circuit breakers
 */
export function getAllCircuitBreakerStats(): Record<string, CircuitBreakerStats> {
  const stats: Record<string, CircuitBreakerStats> = {};
  const breakers = defaultContainer.getAllCircuitBreakers();
  for (const [name, breaker] of breakers) {
    stats[name] = (breaker as CircuitBreaker).getStats();
  }
  return stats;
}

/**
 * Reset all circuit breakers (for testing)
 */
export function resetAllCircuitBreakers(): void {
  defaultContainer.resetAllCircuitBreakers();
}
