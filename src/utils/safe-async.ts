/**
 * Safe Async Utility
 *
 * Provides a wrapper for non-critical async operations that should
 * gracefully degrade to a fallback value on failure rather than
 * throwing errors that would abort the entire operation.
 *
 * Use this for:
 * - Duplicate detection (non-critical optimization)
 * - Red flag detection (warning generation)
 * - Analytics/metrics collection
 *
 * Do NOT use for:
 * - Validation (must fail if invalid)
 * - Database writes (must fail on error)
 * - Authentication/authorization checks
 */

import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('safe-async');

export interface SafeAsyncContext {
  /** Name of the operation (for logging) */
  name: string;
  /** Additional context for logging */
  [key: string]: unknown;
}

/**
 * Execute an async operation with graceful degradation.
 *
 * On success, returns the operation result.
 * On failure, logs a warning and returns the fallback value.
 *
 * @param operation - The async operation to execute
 * @param context - Context object with operation name and additional metadata
 * @param fallback - Value to return on failure
 * @returns The operation result or fallback value
 *
 * @example
 * ```typescript
 * // Duplicate detection with fallback to "not duplicate"
 * const isDuplicate = await safeAsync(
 *   () => checkForDuplicates(entry),
 *   { name: 'checkForDuplicates', entryId: entry.id },
 *   { isDuplicate: false }
 * );
 *
 * // Red flag detection with fallback to empty array
 * const redFlags = await safeAsync(
 *   () => redFlagService.detectRedFlags(content),
 *   { name: 'detectRedFlags', contentLength: content.length },
 *   []
 * );
 * ```
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  context: SafeAsyncContext,
  fallback: T
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        ...context,
      },
      `${context.name} failed (non-critical), using fallback`
    );
    return fallback;
  }
}

/**
 * Execute a synchronous operation with graceful degradation.
 *
 * On success, returns the operation result.
 * On failure, logs a warning and returns the fallback value.
 *
 * @param operation - The sync operation to execute
 * @param context - Context object with operation name and additional metadata
 * @param fallback - Value to return on failure
 * @returns The operation result or fallback value
 */
export function safeSync<T>(operation: () => T, context: SafeAsyncContext, fallback: T): T {
  try {
    return operation();
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        ...context,
      },
      `${context.name} failed (non-critical), using fallback`
    );
    return fallback;
  }
}
