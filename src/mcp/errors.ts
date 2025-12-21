/**
 * Error utilities for consistent error handling and messaging
 */

import { config } from '../config/index.js';

// Security: Check if running in production mode
const isProduction = config.runtime.nodeEnv === 'production';

/**
 * Sanitize error messages to remove sensitive information in production.
 * This prevents exposure of internal paths, stack traces, and system details.
 *
 * Security: Prevents information disclosure attacks.
 */
function sanitizeErrorMessage(message: string): string {
  if (!isProduction) {
    return message; // Show full details in development
  }

  // Redact file system paths (Unix and Windows)
  let sanitized = message
    // Unix paths: /Users/..., /home/..., /var/..., /etc/...
    .replace(/\/(?:Users|home|var|tmp|etc|opt|usr|private)\/[^\s:,)'"]+/gi, '[REDACTED_PATH]')
    // Windows paths: C:\Users\..., D:\...
    .replace(/[A-Z]:\\[^\s:,)'"]+/gi, '[REDACTED_PATH]')
    // Stack trace lines
    .replace(/at\s+[\w.<>]+\s+\([^)]+\)/g, '[REDACTED_STACK]')
    .replace(/at\s+[^\s]+:[0-9]+:[0-9]+/g, '[REDACTED_STACK]');

  return sanitized;
}

export class AgentMemoryError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AgentMemoryError';
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      context: this.context,
    };
  }
}

/**
 * Error codes for programmatic handling
 */
export const ErrorCodes = {
  // Validation errors (1000-1999)
  MISSING_REQUIRED_FIELD: 'E1000',
  INVALID_SCOPE_TYPE: 'E1001',
  INVALID_ACTION: 'E1002',
  INVALID_FILE_PATH: 'E1003',
  INVALID_PARAMETER: 'E1004',
  SIZE_LIMIT_EXCEEDED: 'E1005',

  // Resource errors (2000-2999)
  NOT_FOUND: 'E2000',
  ALREADY_EXISTS: 'E2001',
  CONFLICT: 'E2002',

  // Lock errors (3000-3999)
  FILE_LOCKED: 'E3000',
  LOCK_NOT_FOUND: 'E3001',
  LOCK_EXPIRED: 'E3002',

  // Database errors (4000-4999)
  DATABASE_ERROR: 'E4000',
  MIGRATION_ERROR: 'E4001',

  // System errors (5000-5999)
  UNKNOWN_ERROR: 'E5000',
  INTERNAL_ERROR: 'E5001',
  SERVICE_UNAVAILABLE: 'E5002',

  // Permission errors (6000-6999)
  PERMISSION_DENIED: 'E6000',

  // Extraction errors (7000-7999)
  EXTRACTION_UNAVAILABLE: 'E7000',
  EXTRACTION_FAILED: 'E7001',
  EXTRACTION_PARSE_ERROR: 'E7002',
  EXTRACTION_TIMEOUT: 'E7003',

  // Embedding errors (8000-8999)
  EMBEDDING_DISABLED: 'E8000',
  EMBEDDING_FAILED: 'E8001',
  EMBEDDING_EMPTY_TEXT: 'E8002',
  EMBEDDING_PROVIDER_ERROR: 'E8003',

  // Vector errors (9000-9999)
  VECTOR_DB_ERROR: 'E9000',
  VECTOR_NOT_INITIALIZED: 'E9001',
  VECTOR_INVALID_INPUT: 'E9002',
} as const;

/**
 * Create a validation error with helpful context
 */
export function createValidationError(
  field: string,
  message: string,
  suggestion?: string
): AgentMemoryError {
  return new AgentMemoryError(
    `Validation error: ${field} - ${message}${suggestion ? `. Suggestion: ${suggestion}` : ''}`,
    ErrorCodes.MISSING_REQUIRED_FIELD,
    { field, suggestion }
  );
}

/**
 * Create a not found error with resource details
 */
export function createNotFoundError(resource: string, identifier?: string): AgentMemoryError {
  const message = identifier ? `${resource} not found: ${identifier}` : `${resource} not found`;

  return new AgentMemoryError(message, ErrorCodes.NOT_FOUND, {
    resource,
    identifier,
    suggestion: `Check that the ${resource} exists and you have the correct ID`,
  });
}

/**
 * Create a conflict error with version details
 */
export function createConflictError(resource: string, details: string): AgentMemoryError {
  return new AgentMemoryError(`Conflict detected: ${resource} - ${details}`, ErrorCodes.CONFLICT, {
    resource,
    suggestion: 'Check for recent updates and resolve the conflict using memory_conflict tool',
  });
}

/**
 * Create a file lock error
 */
export function createFileLockError(filePath: string, lockedBy?: string): AgentMemoryError {
  const message = lockedBy
    ? `File is locked: ${filePath} (locked by: ${lockedBy})`
    : `File is locked: ${filePath}`;

  return new AgentMemoryError(message, ErrorCodes.FILE_LOCKED, {
    filePath,
    lockedBy,
    suggestion: 'Wait for the lock to be released or use force_unlock if the lock is stale',
  });
}

/**
 * Create an invalid action error
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
 * Create a permission denied error
 */
export function createPermissionError(
  action: string,
  resource: string,
  identifier?: string
): AgentMemoryError {
  const message = identifier
    ? `Permission denied: ${action} access required for ${resource} ${identifier}`
    : `Permission denied: ${action} access required`;

  return new AgentMemoryError(message, ErrorCodes.PERMISSION_DENIED, {
    action,
    resource,
    identifier,
    suggestion: `Ensure you have ${action} permissions for this ${resource}`,
  });
}

/**
 * Create an extraction error
 */
export function createExtractionError(
  provider: string,
  message: string,
  details?: Record<string, unknown>
): AgentMemoryError {
  return new AgentMemoryError(
    `Extraction failed (${provider}): ${message}`,
    ErrorCodes.EXTRACTION_FAILED,
    {
      provider,
      ...details,
      suggestion: 'Check LLM provider configuration and API keys',
    }
  );
}

/**
 * Create an extraction unavailable error
 */
export function createExtractionUnavailableError(): AgentMemoryError {
  return new AgentMemoryError(
    'Extraction service not available. Configure AGENT_MEMORY_EXTRACTION_PROVIDER.',
    ErrorCodes.EXTRACTION_UNAVAILABLE,
    {
      suggestion:
        'Set AGENT_MEMORY_EXTRACTION_PROVIDER to openai, anthropic, or ollama and provide the necessary API key',
    }
  );
}

/**
 * Create an embedding disabled error
 */
export function createEmbeddingDisabledError(): AgentMemoryError {
  return new AgentMemoryError('Embeddings are disabled', ErrorCodes.EMBEDDING_DISABLED, {
    suggestion: 'Enable embeddings by setting AGENT_MEMORY_ENABLE_EMBEDDINGS=true',
  });
}

/**
 * Create an embedding error
 */
export function createEmbeddingError(
  message: string,
  details?: Record<string, unknown>
): AgentMemoryError {
  return new AgentMemoryError(`Embedding failed: ${message}`, ErrorCodes.EMBEDDING_FAILED, {
    ...details,
    suggestion: 'Check embedding provider configuration and API keys',
  });
}

/**
 * Create an embedding empty text error
 */
export function createEmbeddingEmptyTextError(): AgentMemoryError {
  return new AgentMemoryError('Cannot embed empty text', ErrorCodes.EMBEDDING_EMPTY_TEXT, {
    suggestion: 'Provide non-empty text for embedding',
  });
}

/**
 * Create an embedding provider error
 */
export function createEmbeddingProviderError(
  provider: string,
  message: string
): AgentMemoryError {
  return new AgentMemoryError(
    `${provider} embedding error: ${message}`,
    ErrorCodes.EMBEDDING_PROVIDER_ERROR,
    { provider, suggestion: `Check ${provider} API key and configuration` }
  );
}

/**
 * Create a vector database error
 */
export function createVectorDbError(
  operation: string,
  message: string,
  details?: Record<string, unknown>
): AgentMemoryError {
  return new AgentMemoryError(
    `Vector database error during ${operation}: ${message}`,
    ErrorCodes.VECTOR_DB_ERROR,
    { operation, ...details, suggestion: 'Check vector database configuration' }
  );
}

/**
 * Create a vector not initialized error
 */
export function createVectorNotInitializedError(): AgentMemoryError {
  return new AgentMemoryError(
    'Vector database connection not initialized',
    ErrorCodes.VECTOR_NOT_INITIALIZED,
    { suggestion: 'Ensure vector database is properly configured and connected' }
  );
}

/**
 * Create a vector invalid input error
 */
export function createVectorInvalidInputError(
  fieldName: string,
  reason: string
): AgentMemoryError {
  return new AgentMemoryError(
    `Invalid ${fieldName}: ${reason}`,
    ErrorCodes.VECTOR_INVALID_INPUT,
    { field: fieldName, suggestion: 'Provide valid input for the vector operation' }
  );
}

/**
 * Create a size limit exceeded error
 */
export function createSizeLimitError(
  field: string,
  maxSize: number,
  actualSize: number,
  unit: string = 'characters'
): AgentMemoryError {
  return new AgentMemoryError(
    `${field} exceeds maximum ${unit} of ${maxSize} (got ${actualSize})`,
    ErrorCodes.SIZE_LIMIT_EXCEEDED,
    { field, maxSize, actualSize, unit }
  );
}

/**
 * Create a service unavailable error
 */
export function createServiceUnavailableError(
  service: string,
  reason?: string
): AgentMemoryError {
  const message = reason
    ? `${service} is unavailable: ${reason}`
    : `${service} is unavailable`;
  return new AgentMemoryError(message, ErrorCodes.SERVICE_UNAVAILABLE, {
    service,
    suggestion: `Check ${service} configuration and dependencies`,
  });
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
