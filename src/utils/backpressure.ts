/**
 * Backpressure and Resource Limits Utility
 *
 * Provides mechanisms to prevent system overload:
 * - Bounded queues with rejection on overflow
 * - Semaphore for limiting concurrent operations
 * - Rate limiting with token bucket algorithm
 * - Memory pressure detection
 *
 * Usage:
 *   // Semaphore for concurrent limit
 *   const sem = new Semaphore(10);
 *   await sem.acquire();
 *   try {
 *     await doWork();
 *   } finally {
 *     sem.release();
 *   }
 *
 *   // Bounded queue
 *   const queue = new BoundedQueue<Job>(100);
 *   if (!queue.offer(job)) {
 *     // Queue full - apply backpressure
 *   }
 */

import v8 from 'node:v8';
import { createComponentLogger } from './logger.js';
import { ResourceExhaustedError } from '../core/errors.js';
import { config } from '../config/index.js';

const logger = createComponentLogger('backpressure');

// =============================================================================
// TYPES
// =============================================================================

export interface SemaphoreOptions {
  maxConcurrent: number;
  timeout?: number; // Optional timeout in ms for acquire
  name?: string;
}

export interface BoundedQueueOptions {
  maxSize: number;
  name?: string;
}

export interface RateLimiterOptions {
  maxTokens: number;
  refillRate: number; // Tokens per second
  name?: string;
}

export interface BackpressureStats {
  semaphores: Record<string, { current: number; max: number; waiting: number }>;
  queues: Record<string, { size: number; max: number }>;
  rateLimiters: Record<string, { tokens: number; max: number }>;
  memoryPressure: {
    heapUsedMB: number;
    heapTotalMB: number;
    heapLimitMB: number;
    utilizationPercent: number;
    underPressure: boolean;
  };
}

// =============================================================================
// SEMAPHORE
// =============================================================================

/**
 * Semaphore for limiting concurrent operations
 */
export class Semaphore {
  private permits: number;
  private readonly maxPermits: number;
  private readonly timeout?: number;
  private readonly name: string;
  private waitQueue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeoutId?: NodeJS.Timeout;
  }> = [];

  constructor(options: SemaphoreOptions | number) {
    if (typeof options === 'number') {
      this.maxPermits = options;
      this.permits = options;
      this.name = 'default';
    } else {
      this.maxPermits = options.maxConcurrent;
      this.permits = options.maxConcurrent;
      this.timeout = options.timeout;
      this.name = options.name ?? 'default';
    }
    // Used for logging/debugging
    void this.name;
  }

  /**
   * Acquire a permit, waiting if necessary
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    // Need to wait
    return new Promise((resolve, reject) => {
      const waiter: {
        resolve: () => void;
        reject: (error: Error) => void;
        timeoutId?: NodeJS.Timeout;
      } = {
        resolve: () => {
          if (waiter.timeoutId) {
            clearTimeout(waiter.timeoutId);
          }
          resolve();
        },
        reject,
      };

      if (this.timeout) {
        waiter.timeoutId = setTimeout(() => {
          const index = this.waitQueue.indexOf(waiter);
          if (index >= 0) {
            this.waitQueue.splice(index, 1);
            reject(
              new ResourceExhaustedError(
                'semaphore',
                `Semaphore acquire timeout after ${this.timeout}ms`
              )
            );
          }
        }, this.timeout);
      }

      this.waitQueue.push(waiter);
    });
  }

  /**
   * Try to acquire a permit without waiting
   */
  tryAcquire(): boolean {
    if (this.permits > 0) {
      this.permits--;
      return true;
    }
    return false;
  }

  /**
   * Release a permit
   */
  release(): void {
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift();
      waiter?.resolve();
    } else if (this.permits < this.maxPermits) {
      this.permits++;
    }
  }

  /**
   * Get current number of available permits
   */
  available(): number {
    return this.permits;
  }

  /**
   * Get number of waiters
   */
  waiting(): number {
    return this.waitQueue.length;
  }

  /**
   * Get stats
   */
  getStats(): { current: number; max: number; waiting: number } {
    return {
      current: this.maxPermits - this.permits,
      max: this.maxPermits,
      waiting: this.waitQueue.length,
    };
  }
}

// =============================================================================
// BOUNDED QUEUE
// =============================================================================

/**
 * Bounded queue that rejects when full
 */
export class BoundedQueue<T> {
  private queue: T[] = [];
  private readonly maxSize: number;
  private readonly name: string;

  constructor(options: BoundedQueueOptions | number) {
    if (typeof options === 'number') {
      this.maxSize = options;
      this.name = 'default';
    } else {
      this.maxSize = options.maxSize;
      this.name = options.name ?? 'default';
    }
    // Used for logging
    void this.name;
  }

  /**
   * Try to add an item to the queue
   * Returns false if queue is full
   */
  offer(item: T): boolean {
    if (this.queue.length >= this.maxSize) {
      logger.warn(
        { queue: this.name, size: this.queue.length, max: this.maxSize },
        'Queue full, rejecting item'
      );
      return false;
    }
    this.queue.push(item);
    return true;
  }

  /**
   * Add an item, throwing if queue is full
   */
  add(item: T): void {
    if (!this.offer(item)) {
      throw new ResourceExhaustedError(
        'queue',
        `Queue '${this.name}' is full (${this.maxSize} items)`
      );
    }
  }

  /**
   * Remove and return the first item, or undefined if empty
   */
  poll(): T | undefined {
    return this.queue.shift();
  }

  /**
   * Return the first item without removing it
   */
  peek(): T | undefined {
    return this.queue[0];
  }

  /**
   * Get current size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Check if queue is full
   */
  isFull(): boolean {
    return this.queue.length >= this.maxSize;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Get stats
   */
  getStats(): { size: number; max: number } {
    return {
      size: this.queue.length,
      max: this.maxSize,
    };
  }

  /**
   * Iterate over items (does not consume)
   */
  [Symbol.iterator](): Iterator<T> {
    return this.queue[Symbol.iterator]();
  }
}

// =============================================================================
// TOKEN BUCKET RATE LIMITER
// =============================================================================

/**
 * Token bucket rate limiter
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private lastRefill: number;
  private readonly name: string;

  constructor(options: RateLimiterOptions) {
    this.maxTokens = options.maxTokens;
    this.tokens = options.maxTokens;
    this.refillRate = options.refillRate / 1000; // Convert to per-ms
    this.lastRefill = Date.now();
    this.name = options.name ?? 'default';
    // Used for identification in stats
    void this.name;
  }

  /**
   * Try to consume tokens
   * Returns true if tokens were available
   */
  tryConsume(tokens: number = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Consume tokens, waiting if necessary
   */
  async consume(tokens: number = 1): Promise<void> {
    if (this.tryConsume(tokens)) {
      return;
    }

    // Calculate wait time
    const deficit = tokens - this.tokens;
    const waitMs = Math.ceil(deficit / this.refillRate);

    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return this.consume(tokens);
  }

  /**
   * Get current token count
   */
  available(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * Get time until tokens are available
   */
  waitTime(tokens: number = 1): number {
    this.refill();
    if (this.tokens >= tokens) {
      return 0;
    }
    const deficit = tokens - this.tokens;
    return Math.ceil(deficit / this.refillRate);
  }

  /**
   * Get stats
   */
  getStats(): { tokens: number; max: number } {
    this.refill();
    return {
      tokens: Math.floor(this.tokens),
      max: this.maxTokens,
    };
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

// =============================================================================
// MEMORY PRESSURE MONITOR
// =============================================================================

/**
 * Monitor memory pressure and trigger backpressure
 *
 * Uses V8's heap_size_limit (the actual max heap) rather than heapTotal
 * (the currently allocated heap) to avoid false positives when the heap
 * is small but has room to grow.
 */
export class MemoryPressureMonitor {
  private readonly threshold: number;
  private pressureCallbacks: Array<() => void> = [];
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(threshold: number = config.memory?.heapPressureThreshold ?? 0.85) {
    this.threshold = threshold;
  }

  /**
   * Check if system is under memory pressure
   *
   * Compares heapUsed against V8's heap_size_limit (the max heap size)
   * rather than heapTotal (currently allocated) for accurate pressure detection.
   */
  isUnderPressure(): boolean {
    const heapStats = v8.getHeapStatistics();
    const utilization = heapStats.used_heap_size / heapStats.heap_size_limit;
    return utilization > this.threshold;
  }

  /**
   * Get current memory stats
   *
   * Returns both heapTotal (currently allocated) and heapLimit (V8 max)
   * for visibility, but utilization is calculated against the limit.
   */
  getStats(): {
    heapUsedMB: number;
    heapTotalMB: number;
    heapLimitMB: number;
    utilizationPercent: number;
    underPressure: boolean;
  } {
    const heapStats = v8.getHeapStatistics();
    const utilization = heapStats.used_heap_size / heapStats.heap_size_limit;
    return {
      heapUsedMB: Math.round(heapStats.used_heap_size / 1024 / 1024),
      heapTotalMB: Math.round(heapStats.total_heap_size / 1024 / 1024),
      heapLimitMB: Math.round(heapStats.heap_size_limit / 1024 / 1024),
      utilizationPercent: Math.round(utilization * 100),
      underPressure: utilization > this.threshold,
    };
  }

  /**
   * Register a callback for pressure events
   */
  onPressure(callback: () => void): () => void {
    this.pressureCallbacks.push(callback);
    return () => {
      const index = this.pressureCallbacks.indexOf(callback);
      if (index >= 0) {
        this.pressureCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Start periodic pressure monitoring
   */
  startMonitoring(intervalMs: number = config.memory?.checkIntervalMs ?? 30000): void {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(() => {
      if (this.isUnderPressure()) {
        logger.warn(this.getStats(), 'Memory pressure detected');
        for (const callback of this.pressureCallbacks) {
          try {
            callback();
          } catch (error) {
            logger.error(
              { error: error instanceof Error ? error.message : String(error) },
              'Pressure callback failed'
            );
          }
        }
      }
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// =============================================================================
// BACKPRESSURE MANAGER
// =============================================================================

/**
 * Central backpressure manager
 */
class BackpressureManager {
  private semaphores: Map<string, Semaphore> = new Map();
  private queues: Map<string, BoundedQueue<unknown>> = new Map();
  private rateLimiters: Map<string, TokenBucketRateLimiter> = new Map();
  private memoryMonitor: MemoryPressureMonitor;

  constructor() {
    this.memoryMonitor = new MemoryPressureMonitor();
  }

  /**
   * Get or create a semaphore
   */
  semaphore(name: string, maxConcurrent?: number): Semaphore {
    let sem = this.semaphores.get(name);
    if (!sem && maxConcurrent !== undefined) {
      sem = new Semaphore({ maxConcurrent, name });
      this.semaphores.set(name, sem);
    }
    return sem ?? new Semaphore({ maxConcurrent: 10, name });
  }

  /**
   * Get or create a bounded queue
   */
  queue<T>(name: string, maxSize?: number): BoundedQueue<T> {
    let queue = this.queues.get(name) as BoundedQueue<T> | undefined;
    if (!queue && maxSize !== undefined) {
      queue = new BoundedQueue<T>({ maxSize, name });
      this.queues.set(name, queue as BoundedQueue<unknown>);
    }
    return queue ?? new BoundedQueue<T>({ maxSize: 100, name });
  }

  /**
   * Get or create a rate limiter
   */
  rateLimiter(
    name: string,
    options?: { maxTokens: number; refillRate: number }
  ): TokenBucketRateLimiter {
    let limiter = this.rateLimiters.get(name);
    if (!limiter && options) {
      limiter = new TokenBucketRateLimiter({ ...options, name });
      this.rateLimiters.set(name, limiter);
    }
    return limiter ?? new TokenBucketRateLimiter({ maxTokens: 100, refillRate: 10, name });
  }

  /**
   * Get memory monitor
   */
  memory(): MemoryPressureMonitor {
    return this.memoryMonitor;
  }

  /**
   * Check if any backpressure is active
   */
  hasBackpressure(): boolean {
    // Check memory pressure
    if (this.memoryMonitor.isUnderPressure()) {
      return true;
    }

    // Check full queues
    for (const queue of this.queues.values()) {
      if (queue.isFull()) {
        return true;
      }
    }

    // Check exhausted semaphores with waiters
    for (const sem of this.semaphores.values()) {
      if (sem.available() === 0 && sem.waiting() > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get comprehensive stats
   */
  getStats(): BackpressureStats {
    const semaphores: Record<string, { current: number; max: number; waiting: number }> = {};
    for (const [name, sem] of this.semaphores) {
      semaphores[name] = sem.getStats();
    }

    const queues: Record<string, { size: number; max: number }> = {};
    for (const [name, queue] of this.queues) {
      queues[name] = queue.getStats();
    }

    const rateLimiters: Record<string, { tokens: number; max: number }> = {};
    for (const [name, limiter] of this.rateLimiters) {
      rateLimiters[name] = limiter.getStats();
    }

    return {
      semaphores,
      queues,
      rateLimiters,
      memoryPressure: this.memoryMonitor.getStats(),
    };
  }

  /**
   * Start all monitoring
   */
  startMonitoring(): void {
    this.memoryMonitor.startMonitoring();
  }

  /**
   * Stop all monitoring
   */
  stopMonitoring(): void {
    this.memoryMonitor.stopMonitoring();
  }

  /**
   * Reset (for testing)
   */
  reset(): void {
    this.semaphores.clear();
    this.queues.clear();
    this.rateLimiters.clear();
    this.memoryMonitor.stopMonitoring();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const backpressure = new BackpressureManager();

// =============================================================================
// PREDEFINED LIMITS
// =============================================================================

// Embedding concurrency limit
export const embeddingSemaphore = backpressure.semaphore(
  'embedding',
  config.embedding?.maxConcurrency ?? 4
);

// Database query concurrency limit
export const dbQuerySemaphore = backpressure.semaphore(
  'db-query',
  config.postgresql?.poolMax ?? 20
);

// API request queue
export const apiRequestQueue = backpressure.queue<{
  id: string;
  handler: string;
  timestamp: number;
}>('api-requests', 1000);

// API rate limiter (requests per second)
export const apiRateLimiter = backpressure.rateLimiter('api', {
  maxTokens: config.rateLimit?.global?.maxRequests ?? 1000,
  refillRate:
    (config.rateLimit?.global?.maxRequests ?? 1000) /
    ((config.rateLimit?.global?.windowMs ?? 60000) / 1000),
});
