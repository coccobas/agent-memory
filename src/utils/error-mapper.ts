import { AgentMemoryError, ErrorCodes } from '../core/errors.js';
import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('error-mapper');

export interface MappedError {
  message: string;
  code: string;
  statusCode: number; // HTTP Status hint
  details?: Record<string, unknown>;
}

/**
 * Map any error to a standardized internal format
 */
export function mapError(error: unknown): MappedError {
  // 1. Handle Known AgentMemoryError
  if (error instanceof AgentMemoryError) {
    return {
      message: error.message,
      code: error.code,
      statusCode: getStatusCodeForErrorCode(error.code),
      details: error.context,
    };
  }

  // 2. Handle Fastify/HTTP style errors with status codes
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const statusCode = (error as { statusCode: number }).statusCode;
    const message = error instanceof Error ? error.message : 'Request failed';
    return {
      message,
      code: 'HTTP_ERROR',
      statusCode,
    };
  }

  // 3. Handle Standard Errors
  if (error instanceof Error) {
    const message = error.message;

    // Heuristic mapping for common errors
    if (message.includes('Validation error') || message.includes('is required')) {
      return { message, code: ErrorCodes.INVALID_PARAMETER, statusCode: 400 };
    }
    if (message.includes('not found')) {
      return { message, code: ErrorCodes.NOT_FOUND, statusCode: 404 };
    }
    if (message.includes('Permission denied')) {
      return { message, code: ErrorCodes.PERMISSION_DENIED, statusCode: 403 };
    }

    logger.warn({ error: message }, 'Unmapped internal error');
    return {
      message: error.message,
      code: ErrorCodes.INTERNAL_ERROR,
      statusCode: 500,
    };
  }

  // 4. Fallback
  logger.warn({ error: String(error) }, 'Unmapped unknown error');
  return {
    message: String(error),
    code: ErrorCodes.UNKNOWN_ERROR,
    statusCode: 500,
  };
}

function getStatusCodeForErrorCode(code: string): number {
  switch (code) {
    case ErrorCodes.MISSING_REQUIRED_FIELD:
    case ErrorCodes.INVALID_SCOPE_TYPE:
    case ErrorCodes.INVALID_ACTION:
    case ErrorCodes.INVALID_FILE_PATH:
    case ErrorCodes.INVALID_PARAMETER:
    case ErrorCodes.SIZE_LIMIT_EXCEEDED:
    case ErrorCodes.VECTOR_INVALID_INPUT:
      return 400;

    case ErrorCodes.PERMISSION_DENIED:
      return 403;

    case ErrorCodes.NOT_FOUND:
    case ErrorCodes.LOCK_NOT_FOUND:
      return 404;

    case ErrorCodes.ALREADY_EXISTS:
    case ErrorCodes.CONFLICT:
    case ErrorCodes.FILE_LOCKED:
      return 409;

    case ErrorCodes.SERVICE_UNAVAILABLE:
    case ErrorCodes.EXTRACTION_UNAVAILABLE:
    case ErrorCodes.EMBEDDING_DISABLED:
      return 503;

    default:
      return 500;
  }
}
