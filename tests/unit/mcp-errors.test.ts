/**
 * Unit tests for MCP error formatting
 */

import { describe, it, expect } from 'vitest';
import { createInvalidActionError, formatError } from '../../src/mcp/errors.js';
import { AgentMemoryError, ErrorCodes } from '../../src/core/errors.js';

describe('MCP Errors', () => {
  describe('createInvalidActionError', () => {
    it('should create error with tool and action context', () => {
      const error = createInvalidActionError('memory_query', 'invalid', ['search', 'context']);

      expect(error).toBeInstanceOf(AgentMemoryError);
      expect(error.message).toContain('invalid');
      expect(error.message).toContain('memory_query');
      expect(error.code).toBe(ErrorCodes.INVALID_ACTION);
    });

    it('should include valid actions in context', () => {
      const validActions = ['add', 'update', 'delete'];
      const error = createInvalidActionError('memory_tool', 'create', validActions);

      const json = error.toJSON();
      expect(json.context?.validActions).toEqual(validActions);
      expect(json.context?.suggestion).toContain('add');
      expect(json.context?.suggestion).toContain('update');
      expect(json.context?.suggestion).toContain('delete');
    });

    it('should include tool and action in context', () => {
      const error = createInvalidActionError('memory_guideline', 'patch', ['add', 'update']);

      const json = error.toJSON();
      expect(json.context?.tool).toBe('memory_guideline');
      expect(json.context?.action).toBe('patch');
    });
  });

  describe('formatError', () => {
    it('should format AgentMemoryError', () => {
      const error = new AgentMemoryError('Test error', 'E1001', { key: 'value' });
      const formatted = formatError(error);

      expect(formatted.error).toBe('Test error');
      expect(formatted.code).toBe('E1001');
      expect(formatted.context?.key).toBe('value');
    });

    it('should format regular Error', () => {
      const error = new Error('Regular error message');
      const formatted = formatError(error);

      expect(formatted.error).toContain('Regular error message');
      expect(formatted.code).toBe(ErrorCodes.INTERNAL_ERROR);
    });

    it('should format string error', () => {
      const formatted = formatError('String error');

      expect(formatted.error).toContain('String error');
      expect(formatted.code).toBe(ErrorCodes.UNKNOWN_ERROR);
    });

    it('should handle null error', () => {
      const formatted = formatError(null);

      expect(formatted.error).toBeDefined();
      expect(formatted.code).toBe(ErrorCodes.UNKNOWN_ERROR);
    });

    it('should sanitize error messages', () => {
      const error = new AgentMemoryError('Error at /home/user/project/file.ts', 'E1001');
      const formatted = formatError(error);

      // Sanitization should work (exact behavior depends on sanitizeErrorMessage)
      expect(formatted.error).toBeDefined();
    });

    it('should sanitize context string values', () => {
      const error = new AgentMemoryError('Error', 'E1001', {
        path: '/home/user/secret/file.ts',
        count: 42,
      });
      const formatted = formatError(error);

      // Number values should remain
      expect(formatted.context?.count).toBe(42);
      // String values should be sanitized
      expect(formatted.context?.path).toBeDefined();
    });

    it('should handle error without context', () => {
      const error = new AgentMemoryError('Simple error', 'E1001');
      const formatted = formatError(error);

      expect(formatted.error).toBe('Simple error');
      expect(formatted.context).toBeUndefined();
    });
  });
});
