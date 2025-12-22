/**
 * MCP-specific error formatting and helpers
 *
 * Transport-agnostic error definitions live in src/core/errors.ts
 * This module contains only MCP protocol-specific formatting.
 */

import {
  AgentMemoryError,
  ErrorCodes,
  sanitizeErrorMessage,
} from '../core/errors.js';

/**
 * Create an invalid action error (MCP-specific: includes tool context)
 */
export function createInvalidActionError(
  tool: string,
  action: string,
  validActions: string[]
): AgentMemoryError {
  return new AgentMemoryError(
    `Invalid action '${action}' for tool '${tool}'`,
    ErrorCodes.INVALID_ACTION,
    {
      tool,
      action,
      validActions,
      suggestion: `Valid actions are: ${validActions.join(', ')}`,
    }
  );
}

/**
 * Format error for MCP response
 *
 * Security: Sanitizes error messages in production to prevent
 * information disclosure (file paths, stack traces, system details).
 */
export function formatError(error: unknown): {
  error: string;
  code?: string;
  context?: Record<string, unknown>;
} {
  if (error instanceof AgentMemoryError) {
    const json = error.toJSON();
    return {
      ...json,
      error: sanitizeErrorMessage(json.error),
      // Also sanitize any context fields that might contain paths
      context: json.context
        ? Object.fromEntries(
            Object.entries(json.context).map(([k, v]) => [
              k,
              typeof v === 'string' ? sanitizeErrorMessage(v) : v,
            ])
          )
        : undefined,
    };
  }

  if (error instanceof Error) {
    return {
      error: sanitizeErrorMessage(error.message),
      code: ErrorCodes.INTERNAL_ERROR,
    };
  }

  return {
    error: sanitizeErrorMessage(String(error)),
    code: ErrorCodes.UNKNOWN_ERROR,
  };
}
