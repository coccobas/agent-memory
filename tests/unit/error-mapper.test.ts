/**
 * Unit tests for error-mapper utilities
 */

import { describe, it, expect } from 'vitest';
import { mapError, type MappedError } from '../../src/utils/error-mapper.js';
import { AgentMemoryError, ErrorCodes } from '../../src/core/errors.js';

describe('Error Mapper', () => {
  describe('mapError - AgentMemoryError', () => {
    it('should map AgentMemoryError with all properties', () => {
      const error = new AgentMemoryError('Test error message', ErrorCodes.INVALID_PARAMETER, {
        field: 'testField',
        value: 'testValue',
      });

      const result = mapError(error);

      expect(result.message).toBe('Test error message');
      expect(result.code).toBe(ErrorCodes.INVALID_PARAMETER);
      expect(result.statusCode).toBe(400);
      expect(result.details).toEqual({
        field: 'testField',
        value: 'testValue',
      });
    });

    it('should map validation errors to 400 status', () => {
      const validationCodes = [
        ErrorCodes.MISSING_REQUIRED_FIELD,
        ErrorCodes.INVALID_SCOPE_TYPE,
        ErrorCodes.INVALID_ACTION,
        ErrorCodes.INVALID_FILE_PATH,
        ErrorCodes.INVALID_PARAMETER,
        ErrorCodes.SIZE_LIMIT_EXCEEDED,
        ErrorCodes.VECTOR_INVALID_INPUT,
      ];

      validationCodes.forEach((code) => {
        const error = new AgentMemoryError('Validation error', code);
        const result = mapError(error);
        expect(result.statusCode).toBe(400);
        expect(result.code).toBe(code);
      });
    });

    it('should map permission errors to 403 status', () => {
      const error = new AgentMemoryError('Permission denied', ErrorCodes.PERMISSION_DENIED);
      const result = mapError(error);

      expect(result.statusCode).toBe(403);
      expect(result.code).toBe(ErrorCodes.PERMISSION_DENIED);
    });

    it('should map not found errors to 404 status', () => {
      const notFoundCodes = [ErrorCodes.NOT_FOUND, ErrorCodes.LOCK_NOT_FOUND];

      notFoundCodes.forEach((code) => {
        const error = new AgentMemoryError('Not found', code);
        const result = mapError(error);
        expect(result.statusCode).toBe(404);
        expect(result.code).toBe(code);
      });
    });

    it('should map conflict errors to 409 status', () => {
      const conflictCodes = [
        ErrorCodes.ALREADY_EXISTS,
        ErrorCodes.CONFLICT,
        ErrorCodes.FILE_LOCKED,
      ];

      conflictCodes.forEach((code) => {
        const error = new AgentMemoryError('Conflict', code);
        const result = mapError(error);
        expect(result.statusCode).toBe(409);
        expect(result.code).toBe(code);
      });
    });

    it('should map service unavailable errors to 503 status', () => {
      const unavailableCodes = [
        ErrorCodes.SERVICE_UNAVAILABLE,
        ErrorCodes.EXTRACTION_UNAVAILABLE,
        ErrorCodes.EMBEDDING_DISABLED,
      ];

      unavailableCodes.forEach((code) => {
        const error = new AgentMemoryError('Service unavailable', code);
        const result = mapError(error);
        expect(result.statusCode).toBe(503);
        expect(result.code).toBe(code);
      });
    });

    it('should map unknown error codes to 500 status', () => {
      const serverErrorCodes = [
        ErrorCodes.UNKNOWN_ERROR,
        ErrorCodes.INTERNAL_ERROR,
        ErrorCodes.DATABASE_ERROR,
        ErrorCodes.MIGRATION_ERROR,
        ErrorCodes.CONNECTION_ERROR,
        ErrorCodes.TRANSACTION_ERROR,
        ErrorCodes.EMBEDDING_FAILED,
        ErrorCodes.VECTOR_DB_ERROR,
      ];

      serverErrorCodes.forEach((code) => {
        const error = new AgentMemoryError('Server error', code);
        const result = mapError(error);
        expect(result.statusCode).toBe(500);
        expect(result.code).toBe(code);
      });
    });

    it('should handle AgentMemoryError without context', () => {
      const error = new AgentMemoryError('Simple error', ErrorCodes.INTERNAL_ERROR);
      const result = mapError(error);

      expect(result.message).toBe('Simple error');
      expect(result.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(result.statusCode).toBe(500);
      expect(result.details).toBeUndefined();
    });

    it('should handle AgentMemoryError with complex context', () => {
      const error = new AgentMemoryError('Complex error', ErrorCodes.DATABASE_ERROR, {
        query: 'SELECT * FROM table',
        params: [1, 2, 3],
        nested: {
          data: 'value',
        },
      });

      const result = mapError(error);

      expect(result.details).toEqual({
        query: 'SELECT * FROM table',
        params: [1, 2, 3],
        nested: {
          data: 'value',
        },
      });
    });
  });

  describe('mapError - HTTP/Fastify errors', () => {
    it('should map errors with statusCode property', () => {
      const error = {
        statusCode: 400,
        message: 'Bad Request',
      };

      const result = mapError(error);

      // Non-Error objects get default message 'Request failed'
      expect(result.message).toBe('Request failed');
      expect(result.code).toBe('HTTP_ERROR');
      expect(result.statusCode).toBe(400);
    });

    it('should handle various HTTP status codes', () => {
      const statusCodes = [400, 401, 403, 404, 409, 500, 503];

      statusCodes.forEach((statusCode) => {
        const error = { statusCode, message: `Error ${statusCode}` };
        const result = mapError(error);
        expect(result.statusCode).toBe(statusCode);
        expect(result.code).toBe('HTTP_ERROR');
      });
    });

    it('should handle Error objects with statusCode', () => {
      const error = Object.assign(new Error('Custom HTTP error'), { statusCode: 422 });

      const result = mapError(error);

      expect(result.message).toBe('Custom HTTP error');
      expect(result.statusCode).toBe(422);
      expect(result.code).toBe('HTTP_ERROR');
    });

    it('should default message for non-Error objects with statusCode', () => {
      const error = { statusCode: 500 };

      const result = mapError(error);

      expect(result.message).toBe('Request failed');
      expect(result.statusCode).toBe(500);
    });
  });

  describe('mapError - Standard Error objects', () => {
    it('should map generic Error objects', () => {
      const error = new Error('Generic error message');

      const result = mapError(error);

      expect(result.message).toBe('Generic error message');
      expect(result.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(result.statusCode).toBe(500);
    });

    it('should detect validation errors by message content', () => {
      const validationErrors = [
        new Error('Validation error: field is invalid'),
        new Error('name is required'),
        new Error('Field is required'),
      ];

      validationErrors.forEach((error) => {
        const result = mapError(error);
        expect(result.code).toBe(ErrorCodes.INVALID_PARAMETER);
        expect(result.statusCode).toBe(400);
      });
    });

    it('should detect not found errors by message content', () => {
      const notFoundErrors = [
        new Error('Resource not found'),
        new Error('User not found'),
        new Error('Item with ID 123 not found'),
      ];

      notFoundErrors.forEach((error) => {
        const result = mapError(error);
        expect(result.code).toBe(ErrorCodes.NOT_FOUND);
        expect(result.statusCode).toBe(404);
      });
    });

    it('should detect permission errors by message content', () => {
      const permissionErrors = [
        new Error('Permission denied'),
        new Error('Permission denied: insufficient access'),
      ];

      permissionErrors.forEach((error) => {
        const result = mapError(error);
        expect(result.code).toBe(ErrorCodes.PERMISSION_DENIED);
        expect(result.statusCode).toBe(403);
      });
    });

    it('should handle errors with multiple matching keywords', () => {
      // "is required" should match validation pattern first
      const error = new Error('Field is required');
      const result = mapError(error);

      expect(result.code).toBe(ErrorCodes.INVALID_PARAMETER);
      expect(result.statusCode).toBe(400);
    });

    it('should handle TypeError', () => {
      const error = new TypeError('Cannot read property of undefined');
      const result = mapError(error);

      expect(result.message).toBe('Cannot read property of undefined');
      expect(result.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(result.statusCode).toBe(500);
    });

    it('should handle RangeError', () => {
      const error = new RangeError('Value out of range');
      const result = mapError(error);

      expect(result.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(result.statusCode).toBe(500);
    });

    it('should handle SyntaxError', () => {
      const error = new SyntaxError('Unexpected token');
      const result = mapError(error);

      expect(result.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(result.statusCode).toBe(500);
    });
  });

  describe('mapError - Unknown/non-Error types', () => {
    it('should handle string errors', () => {
      const error = 'Something went wrong';

      const result = mapError(error);

      expect(result.message).toBe('Something went wrong');
      expect(result.code).toBe(ErrorCodes.UNKNOWN_ERROR);
      expect(result.statusCode).toBe(500);
    });

    it('should handle number errors', () => {
      const error = 42;

      const result = mapError(error);

      expect(result.message).toBe('42');
      expect(result.code).toBe(ErrorCodes.UNKNOWN_ERROR);
      expect(result.statusCode).toBe(500);
    });

    it('should handle null', () => {
      const error = null;

      const result = mapError(error);

      expect(result.message).toBe('null');
      expect(result.code).toBe(ErrorCodes.UNKNOWN_ERROR);
      expect(result.statusCode).toBe(500);
    });

    it('should handle undefined', () => {
      const error = undefined;

      const result = mapError(error);

      expect(result.message).toBe('undefined');
      expect(result.code).toBe(ErrorCodes.UNKNOWN_ERROR);
      expect(result.statusCode).toBe(500);
    });

    it('should handle boolean errors', () => {
      const error = false;

      const result = mapError(error);

      expect(result.message).toBe('false');
      expect(result.code).toBe(ErrorCodes.UNKNOWN_ERROR);
      expect(result.statusCode).toBe(500);
    });

    it('should handle object without Error interface', () => {
      const error = { someProperty: 'value' };

      const result = mapError(error);

      expect(result.message).toBe('[object Object]');
      expect(result.code).toBe(ErrorCodes.UNKNOWN_ERROR);
      expect(result.statusCode).toBe(500);
    });

    it('should handle array errors', () => {
      const error = ['error', 'array'];

      const result = mapError(error);

      expect(result.message).toBe('error,array');
      expect(result.code).toBe(ErrorCodes.UNKNOWN_ERROR);
      expect(result.statusCode).toBe(500);
    });

    it('should handle symbol errors', () => {
      const error = Symbol('error');

      const result = mapError(error);

      expect(result.message).toContain('Symbol');
      expect(result.code).toBe(ErrorCodes.UNKNOWN_ERROR);
      expect(result.statusCode).toBe(500);
    });
  });

  describe('mapError - edge cases', () => {
    it('should handle empty error message', () => {
      const error = new Error('');

      const result = mapError(error);

      expect(result.message).toBe('');
      expect(result.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(result.statusCode).toBe(500);
    });

    it('should handle very long error messages', () => {
      const longMessage = 'a'.repeat(10000);
      const error = new Error(longMessage);

      const result = mapError(error);

      expect(result.message).toBe(longMessage);
      expect(result.code).toBe(ErrorCodes.INTERNAL_ERROR);
    });

    it('should handle unicode in error messages', () => {
      const error = new Error('Error with unicode: 世界 😀');

      const result = mapError(error);

      expect(result.message).toBe('Error with unicode: 世界 😀');
    });

    it('should handle special characters in error messages', () => {
      const error = new Error('Error with special chars: @#$%^&*()');

      const result = mapError(error);

      expect(result.message).toContain('@#$%^&*()');
    });

    it('should handle newlines in error messages', () => {
      const error = new Error('Line 1\nLine 2\nLine 3');

      const result = mapError(error);

      expect(result.message).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should handle error with circular reference in context', () => {
      const context: Record<string, unknown> = { key: 'value' };
      context.self = context; // Circular reference

      const error = new AgentMemoryError('Circular error', ErrorCodes.INTERNAL_ERROR, context);

      const result = mapError(error);

      expect(result.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(result.details).toBe(context);
    });
  });

  describe('mapError - return type validation', () => {
    it('should always return MappedError with required properties', () => {
      const errors = [
        new AgentMemoryError('Test', ErrorCodes.INTERNAL_ERROR),
        new Error('Test'),
        'string error',
        123,
        null,
        undefined,
      ];

      errors.forEach((error) => {
        const result: MappedError = mapError(error);

        expect(result).toHaveProperty('message');
        expect(result).toHaveProperty('code');
        expect(result).toHaveProperty('statusCode');

        expect(typeof result.message).toBe('string');
        expect(typeof result.code).toBe('string');
        expect(typeof result.statusCode).toBe('number');

        // StatusCode should be valid HTTP status
        expect(result.statusCode).toBeGreaterThanOrEqual(400);
        expect(result.statusCode).toBeLessThan(600);
      });
    });

    it('should include details only when present', () => {
      const errorWithDetails = new AgentMemoryError('Test', ErrorCodes.INTERNAL_ERROR, {
        key: 'value',
      });
      const errorWithoutDetails = new Error('Test');

      const result1 = mapError(errorWithDetails);
      const result2 = mapError(errorWithoutDetails);

      expect(result1.details).toBeDefined();
      expect(result2.details).toBeUndefined();
    });
  });

  describe('mapError - heuristic message matching', () => {
    it('should prioritize "is required" over other patterns', () => {
      const error = new Error('Username is required and not found');
      const result = mapError(error);

      // Should match validation pattern first
      expect(result.code).toBe(ErrorCodes.INVALID_PARAMETER);
      expect(result.statusCode).toBe(400);
    });

    it('should handle case sensitivity in pattern matching', () => {
      const errors = [
        new Error('VALIDATION ERROR: field invalid'),
        new Error('validation error: field invalid'),
        new Error('Validation error: field invalid'),
      ];

      errors.forEach((error) => {
        const result = mapError(error);
        // Pattern matching is case-sensitive, only "Validation error" (capital V) matches
        // Other variants don't match and fall through to INTERNAL_ERROR
        if (error.message.includes('Validation error')) {
          expect(result.code).toBe(ErrorCodes.INVALID_PARAMETER);
        } else {
          expect(result.code).toBe(ErrorCodes.INTERNAL_ERROR);
        }
      });
    });

    it('should match partial phrases', () => {
      const error = new Error('The requested resource not found in database');
      const result = mapError(error);

      expect(result.code).toBe(ErrorCodes.NOT_FOUND);
      expect(result.statusCode).toBe(404);
    });

    it('should not false-positive on similar words', () => {
      const error = new Error('Notification sent successfully');
      const result = mapError(error);

      // Should not match "not found" pattern
      expect(result.code).not.toBe(ErrorCodes.NOT_FOUND);
      expect(result.code).toBe(ErrorCodes.INTERNAL_ERROR);
    });
  });

  describe('mapError - all ErrorCodes coverage', () => {
    it('should have status code mapping for all error codes', () => {
      const allErrorCodes = Object.values(ErrorCodes);

      allErrorCodes.forEach((code) => {
        const error = new AgentMemoryError(`Test error for ${code}`, code);
        const result = mapError(error);

        expect(result.statusCode).toBeGreaterThanOrEqual(400);
        expect(result.statusCode).toBeLessThan(600);
        expect(result.code).toBe(code);
      });
    });

    it('should map database errors correctly', () => {
      const dbErrors = [
        ErrorCodes.DATABASE_ERROR,
        ErrorCodes.MIGRATION_ERROR,
        ErrorCodes.CONNECTION_ERROR,
        ErrorCodes.CONNECTION_POOL_EXHAUSTED,
        ErrorCodes.TRANSACTION_ERROR,
        ErrorCodes.QUERY_TIMEOUT,
      ];

      dbErrors.forEach((code) => {
        const error = new AgentMemoryError('DB Error', code);
        const result = mapError(error);
        expect(result.statusCode).toBe(500);
      });
    });

    it('should map network/external errors correctly', () => {
      const networkErrors = [
        ErrorCodes.NETWORK_ERROR,
        ErrorCodes.EXTERNAL_SERVICE_ERROR,
        ErrorCodes.TIMEOUT,
        ErrorCodes.RETRY_EXHAUSTED,
      ];

      networkErrors.forEach((code) => {
        const error = new AgentMemoryError('Network Error', code);
        const result = mapError(error);
        expect(result.statusCode).toBe(500);
      });
    });

    it('should map system errors correctly', () => {
      const systemErrors = [
        ErrorCodes.CIRCUIT_BREAKER_OPEN,
        ErrorCodes.RATE_LIMITED,
        ErrorCodes.RESOURCE_EXHAUSTED,
        ErrorCodes.QUEUE_FULL,
      ];

      systemErrors.forEach((code) => {
        const error = new AgentMemoryError('System Error', code);
        const result = mapError(error);
        expect(result.statusCode).toBe(500);
      });
    });

    it('should map extraction errors correctly', () => {
      const extractionErrors = [
        ErrorCodes.EXTRACTION_FAILED,
        ErrorCodes.EXTRACTION_PARSE_ERROR,
        ErrorCodes.EXTRACTION_TIMEOUT,
      ];

      extractionErrors.forEach((code) => {
        const error = new AgentMemoryError('Extraction Error', code);
        const result = mapError(error);
        expect(result.statusCode).toBe(500);
      });
    });

    it('should map embedding errors correctly', () => {
      const embeddingErrors = [
        ErrorCodes.EMBEDDING_FAILED,
        ErrorCodes.EMBEDDING_EMPTY_TEXT,
        ErrorCodes.EMBEDDING_PROVIDER_ERROR,
      ];

      embeddingErrors.forEach((code) => {
        const error = new AgentMemoryError('Embedding Error', code);
        const result = mapError(error);
        expect(result.statusCode).toBe(500);
      });
    });

    it('should map vector errors correctly', () => {
      const vectorErrors = [ErrorCodes.VECTOR_DB_ERROR, ErrorCodes.VECTOR_NOT_INITIALIZED];

      vectorErrors.forEach((code) => {
        const error = new AgentMemoryError('Vector Error', code);
        const result = mapError(error);
        expect(result.statusCode).toBe(500);
      });
    });

    it('should map lock errors correctly', () => {
      const lockErrors = [ErrorCodes.LOCK_EXPIRED];

      lockErrors.forEach((code) => {
        const error = new AgentMemoryError('Lock Error', code);
        const result = mapError(error);
        expect(result.statusCode).toBe(500);
      });
    });
  });
});
