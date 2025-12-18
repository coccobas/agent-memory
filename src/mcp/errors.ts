/**
 * Error utilities for consistent error handling and messaging
 */

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

  // Permission errors (6000-6999)
  PERMISSION_DENIED: 'E6000',

  // Extraction errors (7000-7999)
  EXTRACTION_UNAVAILABLE: 'E7000',
  EXTRACTION_FAILED: 'E7001',
  EXTRACTION_PARSE_ERROR: 'E7002',
  EXTRACTION_TIMEOUT: 'E7003',
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
 * Format error for MCP response
 */
export function formatError(error: unknown): {
  error: string;
  code?: string;
  context?: Record<string, unknown>;
} {
  if (error instanceof AgentMemoryError) {
    return error.toJSON();
  }

  if (error instanceof Error) {
    return {
      error: error.message,
      code: ErrorCodes.INTERNAL_ERROR,
    };
  }

  return {
    error: String(error),
    code: ErrorCodes.UNKNOWN_ERROR,
  };
}
