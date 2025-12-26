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
 */

import { CircuitBreakerError } from '../core/errors.js';
import { defaultContainer } from '../core/container.js';
import { createComponentLogger } from './logger.js';
import { config } from '../config/index.js';

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
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private nextAttemptTime: number | null = null;
  private totalCalls = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<CircuitBreakerConfig>;
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

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
        // Wrap the error with circuit breaker context for better debugging
        const wrappedError = new Error(`[CircuitBreaker:${this.config.name}] ${err.message}`);
        wrappedError.cause = err;
        wrappedError.name = 'CircuitBreakerWrappedError';
        throw wrappedError;
      }
      throw error;
    }
  }

  /**
   * Handle successful call
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
   * Handle failed call
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
   * Transition to a new state
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
   * Force the circuit to close (for testing/admin)
   */
  forceClose(): void {
    this.transitionTo('CLOSED');
  }

  /**
   * Force the circuit to open (for testing/admin)
   */
  forceOpen(): void {
    this.transitionTo('OPEN');
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
