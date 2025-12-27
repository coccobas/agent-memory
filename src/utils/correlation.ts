/**
 * Correlation ID Utility
 *
 * Provides request correlation ID tracking using AsyncLocalStorage.
 * This allows tracing requests across async operations without
 * explicitly passing the correlation ID.
 *
 * Usage:
 *   // Start a new context
 *   withCorrelationId('my-correlation-id', async () => {
 *     // All logs and operations within this context will include the correlation ID
 *     logger.info({ correlationId: getCorrelationId() }, 'Processing request');
 *   });
 *
 *   // Or generate a new ID automatically
 *   withNewCorrelationId(async () => {
 *     // ...
 *   });
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomBytes } from 'crypto';
import { createValidationError } from '../core/errors.js';

// =============================================================================
// VALIDATION CONSTANTS
// =============================================================================

const MAX_CORRELATION_ID_LENGTH = 128;
const MAX_METADATA_SIZE_BYTES = 4096;
const CORRELATION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

// =============================================================================
// TYPES
// =============================================================================

export interface CorrelationContext {
  correlationId: string;
  parentId?: string;
  startTime: number;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// ASYNC LOCAL STORAGE
// =============================================================================

const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate a correlation ID
 * @throws Error if the correlation ID is invalid
 */
function validateCorrelationId(id: string): void {
  if (!id || typeof id !== 'string') {
    throw createValidationError('correlationId', 'must be a non-empty string');
  }
  if (id.length > MAX_CORRELATION_ID_LENGTH) {
    throw createValidationError('correlationId', `exceeds maximum length of ${MAX_CORRELATION_ID_LENGTH} characters`);
  }
  if (!CORRELATION_ID_PATTERN.test(id)) {
    throw createValidationError('correlationId', 'must contain only alphanumeric characters, underscores, and hyphens');
  }
}

/**
 * Validate correlation metadata
 * @throws Error if metadata is invalid or too large
 */
function validateMetadata(metadata: Record<string, unknown> | undefined): void {
  if (!metadata) return;
  try {
    const serialized = JSON.stringify(metadata);
    if (serialized.length > MAX_METADATA_SIZE_BYTES) {
      throw createValidationError('metadata', `exceeds maximum size of ${MAX_METADATA_SIZE_BYTES} bytes`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('maximum size')) throw error;
    throw createValidationError('metadata', 'must be JSON-serializable');
  }
}

// =============================================================================
// CORRELATION ID FUNCTIONS
// =============================================================================

/**
 * Generate a new correlation ID
 * Format: cor_<timestamp>_<random>
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(6).toString('hex');
  return `cor_${timestamp}_${random}`;
}

/**
 * Get the current correlation ID from context
 * Returns undefined if not in a correlation context
 */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId;
}

/**
 * Get the current correlation context
 */
export function getCorrelationContext(): CorrelationContext | undefined {
  return correlationStorage.getStore();
}

/**
 * Run a function within a correlation ID context
 *
 * @param correlationId - The correlation ID to use
 * @param fn - The function to run
 * @param options - Additional context options
 * @returns The result of the function
 */
export function withCorrelationId<T>(
  correlationId: string,
  fn: () => T,
  options?: { parentId?: string; metadata?: Record<string, unknown> }
): T {
  // Validate inputs
  validateCorrelationId(correlationId);
  if (options?.parentId) {
    validateCorrelationId(options.parentId);
  }
  validateMetadata(options?.metadata);

  const context: CorrelationContext = {
    correlationId,
    parentId: options?.parentId,
    startTime: Date.now(),
    metadata: options?.metadata,
  };
  return correlationStorage.run(context, fn);
}

/**
 * Run a function within a new correlation ID context
 *
 * @param fn - The function to run
 * @param options - Additional context options
 * @returns The result of the function
 */
export function withNewCorrelationId<T>(
  fn: () => T,
  options?: { parentId?: string; metadata?: Record<string, unknown> }
): T {
  const correlationId = generateCorrelationId();
  return withCorrelationId(correlationId, fn, options);
}

/**
 * Run an async function within a correlation ID context
 *
 * @param correlationId - The correlation ID to use
 * @param fn - The async function to run
 * @param options - Additional context options
 * @returns A promise resolving to the function result
 */
export async function withCorrelationIdAsync<T>(
  correlationId: string,
  fn: () => Promise<T>,
  options?: { parentId?: string; metadata?: Record<string, unknown> }
): Promise<T> {
  // Validate inputs
  validateCorrelationId(correlationId);
  if (options?.parentId) {
    validateCorrelationId(options.parentId);
  }
  validateMetadata(options?.metadata);

  const context: CorrelationContext = {
    correlationId,
    parentId: options?.parentId,
    startTime: Date.now(),
    metadata: options?.metadata,
  };
  return correlationStorage.run(context, fn);
}

/**
 * Run an async function within a new correlation ID context
 *
 * @param fn - The async function to run
 * @param options - Additional context options
 * @returns A promise resolving to the function result
 */
export async function withNewCorrelationIdAsync<T>(
  fn: () => Promise<T>,
  options?: { parentId?: string; metadata?: Record<string, unknown> }
): Promise<T> {
  const correlationId = generateCorrelationId();
  return withCorrelationIdAsync(correlationId, fn, options);
}

/**
 * Get the elapsed time since the correlation context started
 * Returns 0 if not in a correlation context
 */
export function getCorrelationElapsedMs(): number {
  const context = correlationStorage.getStore();
  if (!context) return 0;
  return Date.now() - context.startTime;
}

/**
 * Add metadata to the current correlation context
 */
export function addCorrelationMetadata(key: string, value: unknown): void {
  const context = correlationStorage.getStore();
  if (context) {
    if (!context.metadata) {
      context.metadata = {};
    }
    context.metadata[key] = value;
  }
}

/**
 * Create a child correlation context (for sub-operations)
 * The child will have its own ID but reference the parent
 */
export function withChildCorrelationId<T>(
  fn: () => T,
  options?: { metadata?: Record<string, unknown> }
): T {
  const parentContext = correlationStorage.getStore();
  const childId = generateCorrelationId();
  return withCorrelationId(childId, fn, {
    parentId: parentContext?.correlationId,
    metadata: options?.metadata,
  });
}

/**
 * Create a child correlation context for async operations
 */
export async function withChildCorrelationIdAsync<T>(
  fn: () => Promise<T>,
  options?: { metadata?: Record<string, unknown> }
): Promise<T> {
  const parentContext = correlationStorage.getStore();
  const childId = generateCorrelationId();
  return withCorrelationIdAsync(childId, fn, {
    parentId: parentContext?.correlationId,
    metadata: options?.metadata,
  });
}

// =============================================================================
// LOGGING HELPERS
// =============================================================================

/**
 * Get correlation context fields for logging
 * Returns an object that can be spread into log statements
 */
export function getCorrelationLogFields(): Record<string, unknown> {
  const context = correlationStorage.getStore();
  if (!context) {
    return {};
  }

  const fields: Record<string, unknown> = {
    correlationId: context.correlationId,
  };

  if (context.parentId) {
    fields.parentCorrelationId = context.parentId;
  }

  return fields;
}

/**
 * Create a logger mixin that automatically includes correlation context
 * Use with pino's mixin option
 */
export function correlationLoggerMixin(): Record<string, unknown> {
  return getCorrelationLogFields();
}
