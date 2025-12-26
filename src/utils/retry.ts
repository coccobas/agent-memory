/**
 * Retry utility with exponential backoff
 *
 * Configuration via environment variables:
 * - AGENT_MEMORY_RETRY_MAX_ATTEMPTS: Maximum retry attempts (default: 3)
 * - AGENT_MEMORY_RETRY_INITIAL_DELAY_MS: Initial delay in ms (default: 100)
 * - AGENT_MEMORY_RETRY_MAX_DELAY_MS: Maximum delay in ms (default: 5000)
 * - AGENT_MEMORY_RETRY_BACKOFF_MULTIPLIER: Backoff multiplier (default: 2)
 */

import { logger } from './logger.js';
import { config } from '../config/index.js';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Default retry options loaded from centralized configuration.
 * Values are configurable via environment variables.
 */
const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: config.retry.maxAttempts,
  initialDelayMs: config.retry.initialDelayMs,
  maxDelayMs: config.retry.maxDelayMs,
  backoffMultiplier: config.retry.backoffMultiplier,
  retryableErrors: () => true,
  onRetry: () => {},
};

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error = new Error('Retry failed');
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === opts.maxAttempts || !opts.retryableErrors(lastError)) {
        throw lastError;
      }

      opts.onRetry(lastError, attempt);
      logger.warn({ error: lastError.message, attempt }, 'Retrying operation');

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * REMOVED: withRetrySync
 *
 * The synchronous retry function has been removed as it used Atomics.wait which blocks
 * the Node.js event loop, causing severe performance issues.
 *
 * Use the async withRetry function instead, which uses proper async delays that don't
 * block the event loop.
 *
 * If you need synchronous retry logic for SQLite operations, consider:
 * 1. Making the operation async (recommended)
 * 2. Using a worker thread for truly blocking operations
 * 3. Implementing retry logic at a higher level where async is available
 */

export function isRetryableDbError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('database is locked') ||
    message.includes('busy') ||
    message.includes('cannot start a transaction within a transaction') ||
    message.includes('disk i/o error')
  );
}

export function isRetryableNetworkError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('socket hang up') ||
    message.includes('network') ||
    message.includes('rate limit') ||
    message.includes('503') ||
    message.includes('502') ||
    message.includes('504')
  );
}
