/**
 * Retry utility with exponential backoff
 */

import { logger } from './logger.js';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  retryableErrors: () => true,
  onRetry: () => {},
};

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error;
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

  throw lastError!;
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
