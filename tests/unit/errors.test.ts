/**
 * Unit tests for error utilities
 */

import { describe, it, expect } from 'vitest';
import {
  AgentMemoryError,
  ErrorCodes,
  createValidationError,
  createNotFoundError,
  createConflictError,
  createFileLockError,
} from '../../src/core/errors.js';
import { createInvalidActionError, formatError } from '../../src/mcp/errors.js';

describe('AgentMemoryError', () => {
  it('should create error with message and code', () => {
    const error = new AgentMemoryError('Test error', ErrorCodes.NOT_FOUND);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe(ErrorCodes.NOT_FOUND);
    expect(error.name).toBe('AgentMemoryError');
  });

  it('should include context in error', () => {
    const context = { field: 'test', value: 123 };
    const error = new AgentMemoryError('Test error', ErrorCodes.NOT_FOUND, context);
    expect(error.context).toEqual(context);
  });

  it('should serialize to JSON correctly', () => {
    const context = { field: 'test' };
    const error = new AgentMemoryError('Test error', ErrorCodes.NOT_FOUND, context);
    const json = error.toJSON();
    expect(json).toEqual({
      error: 'Test error',
      code: ErrorCodes.NOT_FOUND,
      context,
    });
  });
});

describe('createValidationError', () => {
  it('should create validation error with field and message', () => {
    const error = createValidationError('name', 'is required');
    expect(error.message).toContain('Validation error: name - is required');
    expect(error.code).toBe(ErrorCodes.MISSING_REQUIRED_FIELD);
    expect(error.context?.field).toBe('name');
  });

  it('should include suggestion when provided', () => {
    const error = createValidationError('name', 'is required', 'Provide a valid name');
    expect(error.message).toContain('Suggestion: Provide a valid name');
    expect(error.context?.suggestion).toBe('Provide a valid name');
  });
});

describe('createNotFoundError', () => {
  it('should create not found error without identifier', () => {
    const error = createNotFoundError('tool');
    expect(error.message).toBe('tool not found');
    expect(error.code).toBe(ErrorCodes.NOT_FOUND);
    expect(error.context?.resource).toBe('tool');
  });

  it('should create not found error with identifier', () => {
    const error = createNotFoundError('tool', 'tool-123');
    expect(error.message).toBe('tool not found: tool-123');
    expect(error.context?.identifier).toBe('tool-123');
  });
});

describe('createConflictError', () => {
  it('should create conflict error with details', () => {
    const error = createConflictError('guideline', 'Version mismatch');
    expect(error.message).toContain('Conflict detected: guideline - Version mismatch');
    expect(error.code).toBe(ErrorCodes.CONFLICT);
    expect(error.context?.resource).toBe('guideline');
  });
});

describe('createFileLockError', () => {
  it('should create file lock error without lockedBy', () => {
    const error = createFileLockError('/path/to/file.ts');
    expect(error.message).toBe('File is locked: /path/to/file.ts');
    expect(error.code).toBe(ErrorCodes.FILE_LOCKED);
    expect(error.context?.filePath).toBe('/path/to/file.ts');
  });

  it('should create file lock error with lockedBy', () => {
    const error = createFileLockError('/path/to/file.ts', 'agent-123');
    expect(error.message).toBe('File is locked: /path/to/file.ts (locked by: agent-123)');
    expect(error.context?.lockedBy).toBe('agent-123');
  });
});

describe('createInvalidActionError', () => {
  it('should create invalid action error', () => {
    const error = createInvalidActionError('memory_tool', 'invalid', ['add', 'update']);
    expect(error.message).toBe("Invalid action 'invalid' for tool 'memory_tool'");
    expect(error.code).toBe(ErrorCodes.INVALID_ACTION);
    expect(error.context?.tool).toBe('memory_tool');
    expect(error.context?.action).toBe('invalid');
    expect(error.context?.validActions).toEqual(['add', 'update']);
  });
});

describe('formatError', () => {
  it('should format AgentMemoryError correctly', () => {
    const error = new AgentMemoryError('Test error', ErrorCodes.NOT_FOUND, { test: true });
    const formatted = formatError(error);
    expect(formatted).toEqual({
      error: 'Test error',
      code: ErrorCodes.NOT_FOUND,
      context: { test: true },
    });
  });

  it('should format regular Error correctly', () => {
    const error = new Error('Regular error');
    const formatted = formatError(error);
    expect(formatted).toEqual({
      error: 'Regular error',
      code: ErrorCodes.INTERNAL_ERROR,
    });
  });

  it('should format unknown error types', () => {
    const formatted = formatError('String error');
    expect(formatted).toEqual({
      error: 'String error',
      code: ErrorCodes.UNKNOWN_ERROR,
    });
  });

  it('should format null/undefined errors', () => {
    const formatted1 = formatError(null);
    expect(formatted1.error).toBe('null');
    expect(formatted1.code).toBe(ErrorCodes.UNKNOWN_ERROR);

    const formatted2 = formatError(undefined);
    expect(formatted2.error).toBe('undefined');
    expect(formatted2.code).toBe(ErrorCodes.UNKNOWN_ERROR);
  });
});
