/**
 * Tests for Safe Async Utility
 *
 * Tests the graceful degradation functions for non-critical async/sync operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeAsync, safeSync, type SafeAsyncContext } from '../../src/utils/safe-async.js';

// Create mock logger and spy
const mockWarn = vi.fn();

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    warn: (...args: unknown[]) => mockWarn(...args),
  }),
}));

describe('Safe Async Utility', () => {
  beforeEach(() => {
    mockWarn.mockClear();
  });

  describe('safeAsync', () => {
    describe('successful operations', () => {
      it('should return result when operation succeeds', async () => {
        const operation = vi.fn().mockResolvedValue('success');
        const context: SafeAsyncContext = { name: 'testOperation' };

        const result = await safeAsync(operation, context, 'fallback');

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalled();
      });

      it('should not log warning on success', async () => {
        const operation = vi.fn().mockResolvedValue('success');
        const context: SafeAsyncContext = { name: 'testOperation' };

        await safeAsync(operation, context, 'fallback');

        expect(mockWarn).not.toHaveBeenCalled();
      });

      it('should return complex object from operation', async () => {
        const expected = { id: '123', data: { nested: true } };
        const operation = vi.fn().mockResolvedValue(expected);
        const context: SafeAsyncContext = { name: 'complexOperation' };

        const result = await safeAsync(operation, context, null);

        expect(result).toBe(expected);
      });

      it('should handle array return values', async () => {
        const expected = [1, 2, 3];
        const operation = vi.fn().mockResolvedValue(expected);
        const context: SafeAsyncContext = { name: 'arrayOperation' };

        const result = await safeAsync(operation, context, []);

        expect(result).toBe(expected);
      });

      it('should handle boolean return values', async () => {
        const operation = vi.fn().mockResolvedValue(true);
        const context: SafeAsyncContext = { name: 'boolOperation' };

        const result = await safeAsync(operation, context, false);

        expect(result).toBe(true);
      });

      it('should handle null return value', async () => {
        const operation = vi.fn().mockResolvedValue(null);
        const context: SafeAsyncContext = { name: 'nullOperation' };

        const result = await safeAsync(operation, context, 'default');

        expect(result).toBeNull();
      });

      it('should handle undefined return value', async () => {
        const operation = vi.fn().mockResolvedValue(undefined);
        const context: SafeAsyncContext = { name: 'undefinedOperation' };

        const result = await safeAsync(operation, context, 'default');

        expect(result).toBeUndefined();
      });
    });

    describe('failed operations', () => {
      it('should return fallback when operation rejects', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
        const context: SafeAsyncContext = { name: 'failingOperation' };

        const result = await safeAsync(operation, context, 'fallback');

        expect(result).toBe('fallback');
      });

      it('should log warning with error message', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Specific error'));
        const context: SafeAsyncContext = { name: 'errorOperation' };

        await safeAsync(operation, context, 'fallback');

        expect(mockWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Specific error',
            name: 'errorOperation',
          }),
          'errorOperation failed (non-critical), using fallback'
        );
      });

      it('should include context properties in log', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Error'));
        const context: SafeAsyncContext = {
          name: 'contextOperation',
          entryId: 'entry-123',
          userId: 'user-456',
        };

        await safeAsync(operation, context, null);

        expect(mockWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'contextOperation',
            entryId: 'entry-123',
            userId: 'user-456',
          }),
          expect.any(String)
        );
      });

      it('should handle non-Error rejection', async () => {
        const operation = vi.fn().mockRejectedValue('string error');
        const context: SafeAsyncContext = { name: 'stringErrorOp' };

        const result = await safeAsync(operation, context, 'fallback');

        expect(result).toBe('fallback');
        expect(mockWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'string error',
          }),
          expect.any(String)
        );
      });

      it('should handle rejection with undefined', async () => {
        const operation = vi.fn().mockRejectedValue(undefined);
        const context: SafeAsyncContext = { name: 'undefinedError' };

        const result = await safeAsync(operation, context, 'fallback');

        expect(result).toBe('fallback');
        expect(mockWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'undefined',
          }),
          expect.any(String)
        );
      });

      it('should handle rejection with number', async () => {
        const operation = vi.fn().mockRejectedValue(404);
        const context: SafeAsyncContext = { name: 'numberError' };

        const result = await safeAsync(operation, context, -1);

        expect(result).toBe(-1);
        expect(mockWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            error: '404',
          }),
          expect.any(String)
        );
      });
    });

    describe('fallback values', () => {
      it('should return object fallback', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Failed'));
        const fallback = { isDuplicate: false, score: 0 };
        const context: SafeAsyncContext = { name: 'objectFallback' };

        const result = await safeAsync(operation, context, fallback);

        expect(result).toBe(fallback);
      });

      it('should return array fallback', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Failed'));
        const fallback: string[] = [];
        const context: SafeAsyncContext = { name: 'arrayFallback' };

        const result = await safeAsync(operation, context, fallback);

        expect(result).toBe(fallback);
      });

      it('should return boolean fallback', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Failed'));
        const context: SafeAsyncContext = { name: 'boolFallback' };

        const result = await safeAsync(operation, context, false);

        expect(result).toBe(false);
      });

      it('should return null fallback', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Failed'));
        const context: SafeAsyncContext = { name: 'nullFallback' };

        const result = await safeAsync(operation, context, null);

        expect(result).toBeNull();
      });

      it('should return number fallback', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Failed'));
        const context: SafeAsyncContext = { name: 'numberFallback' };

        const result = await safeAsync(operation, context, 0);

        expect(result).toBe(0);
      });
    });

    describe('use cases', () => {
      it('should handle duplicate detection use case', async () => {
        const checkForDuplicates = vi.fn().mockRejectedValue(new Error('DB timeout'));
        const context: SafeAsyncContext = { name: 'checkForDuplicates', entryId: 'entry-1' };
        const fallback = { isDuplicate: false };

        const result = await safeAsync(() => checkForDuplicates('entry-1'), context, fallback);

        expect(result).toEqual({ isDuplicate: false });
      });

      it('should handle red flag detection use case', async () => {
        const detectRedFlags = vi.fn().mockRejectedValue(new Error('Service unavailable'));
        const context: SafeAsyncContext = { name: 'detectRedFlags', contentLength: 500 };
        const fallback: string[] = [];

        const result = await safeAsync(() => detectRedFlags('some content'), context, fallback);

        expect(result).toEqual([]);
      });

      it('should handle analytics collection use case', async () => {
        const recordAnalytics = vi.fn().mockRejectedValue(new Error('Analytics service down'));
        const context: SafeAsyncContext = { name: 'recordAnalytics', eventType: 'page_view' };

        const result = await safeAsync(
          () => recordAnalytics({ event: 'view' }),
          context,
          undefined
        );

        expect(result).toBeUndefined();
      });
    });
  });

  describe('safeSync', () => {
    describe('successful operations', () => {
      it('should return result when operation succeeds', () => {
        const operation = vi.fn().mockReturnValue('success');
        const context: SafeAsyncContext = { name: 'syncOperation' };

        const result = safeSync(operation, context, 'fallback');

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalled();
      });

      it('should not log warning on success', () => {
        const operation = vi.fn().mockReturnValue('success');
        const context: SafeAsyncContext = { name: 'syncOperation' };

        safeSync(operation, context, 'fallback');

        expect(mockWarn).not.toHaveBeenCalled();
      });

      it('should return complex object from operation', () => {
        const expected = { id: '123', nested: { value: true } };
        const operation = vi.fn().mockReturnValue(expected);
        const context: SafeAsyncContext = { name: 'complexSync' };

        const result = safeSync(operation, context, null);

        expect(result).toBe(expected);
      });

      it('should return array from operation', () => {
        const expected = [1, 2, 3];
        const operation = vi.fn().mockReturnValue(expected);
        const context: SafeAsyncContext = { name: 'arraySync' };

        const result = safeSync(operation, context, []);

        expect(result).toBe(expected);
      });

      it('should return boolean from operation', () => {
        const operation = vi.fn().mockReturnValue(true);
        const context: SafeAsyncContext = { name: 'boolSync' };

        const result = safeSync(operation, context, false);

        expect(result).toBe(true);
      });

      it('should return null from operation', () => {
        const operation = vi.fn().mockReturnValue(null);
        const context: SafeAsyncContext = { name: 'nullSync' };

        const result = safeSync(operation, context, 'default');

        expect(result).toBeNull();
      });

      it('should return undefined from operation', () => {
        const operation = vi.fn().mockReturnValue(undefined);
        const context: SafeAsyncContext = { name: 'undefinedSync' };

        const result = safeSync(operation, context, 'default');

        expect(result).toBeUndefined();
      });
    });

    describe('failed operations', () => {
      it('should return fallback when operation throws', () => {
        const operation = vi.fn().mockImplementation(() => {
          throw new Error('Sync error');
        });
        const context: SafeAsyncContext = { name: 'throwingSync' };

        const result = safeSync(operation, context, 'fallback');

        expect(result).toBe('fallback');
      });

      it('should log warning with error message', () => {
        const operation = vi.fn().mockImplementation(() => {
          throw new Error('Specific sync error');
        });
        const context: SafeAsyncContext = { name: 'errorSync' };

        safeSync(operation, context, 'fallback');

        expect(mockWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Specific sync error',
            name: 'errorSync',
          }),
          'errorSync failed (non-critical), using fallback'
        );
      });

      it('should include context properties in log', () => {
        const operation = vi.fn().mockImplementation(() => {
          throw new Error('Error');
        });
        const context: SafeAsyncContext = {
          name: 'contextSync',
          key: 'value',
          count: 42,
        };

        safeSync(operation, context, null);

        expect(mockWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'contextSync',
            key: 'value',
            count: 42,
          }),
          expect.any(String)
        );
      });

      it('should handle non-Error throws', () => {
        const operation = vi.fn().mockImplementation(() => {
          throw 'string error';
        });
        const context: SafeAsyncContext = { name: 'stringErrorSync' };

        const result = safeSync(operation, context, 'fallback');

        expect(result).toBe('fallback');
        expect(mockWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'string error',
          }),
          expect.any(String)
        );
      });

      it('should handle throw with undefined', () => {
        const operation = vi.fn().mockImplementation(() => {
          throw undefined;
        });
        const context: SafeAsyncContext = { name: 'undefinedSync' };

        const result = safeSync(operation, context, 'fallback');

        expect(result).toBe('fallback');
        expect(mockWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'undefined',
          }),
          expect.any(String)
        );
      });

      it('should handle throw with number', () => {
        const operation = vi.fn().mockImplementation(() => {
          throw 500;
        });
        const context: SafeAsyncContext = { name: 'numberSync' };

        const result = safeSync(operation, context, -1);

        expect(result).toBe(-1);
        expect(mockWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            error: '500',
          }),
          expect.any(String)
        );
      });
    });

    describe('fallback values', () => {
      it('should return object fallback', () => {
        const operation = vi.fn().mockImplementation(() => {
          throw new Error('Failed');
        });
        const fallback = { result: false, count: 0 };
        const context: SafeAsyncContext = { name: 'objectFallbackSync' };

        const result = safeSync(operation, context, fallback);

        expect(result).toBe(fallback);
      });

      it('should return array fallback', () => {
        const operation = vi.fn().mockImplementation(() => {
          throw new Error('Failed');
        });
        const fallback: number[] = [];
        const context: SafeAsyncContext = { name: 'arrayFallbackSync' };

        const result = safeSync(operation, context, fallback);

        expect(result).toBe(fallback);
      });

      it('should return boolean fallback', () => {
        const operation = vi.fn().mockImplementation(() => {
          throw new Error('Failed');
        });
        const context: SafeAsyncContext = { name: 'boolFallbackSync' };

        const result = safeSync(operation, context, false);

        expect(result).toBe(false);
      });

      it('should return null fallback', () => {
        const operation = vi.fn().mockImplementation(() => {
          throw new Error('Failed');
        });
        const context: SafeAsyncContext = { name: 'nullFallbackSync' };

        const result = safeSync(operation, context, null);

        expect(result).toBeNull();
      });

      it('should return number fallback', () => {
        const operation = vi.fn().mockImplementation(() => {
          throw new Error('Failed');
        });
        const context: SafeAsyncContext = { name: 'numberFallbackSync' };

        const result = safeSync(operation, context, 0);

        expect(result).toBe(0);
      });
    });

    describe('use cases', () => {
      it('should handle JSON parse with fallback', () => {
        const parseJson = vi.fn().mockImplementation(() => JSON.parse('invalid json'));
        const context: SafeAsyncContext = { name: 'parseJson' };

        const result = safeSync(() => parseJson(), context, {});

        expect(result).toEqual({});
      });

      it('should handle regex match with fallback', () => {
        const matchRegex = vi.fn().mockImplementation(() => {
          throw new Error('Invalid regex');
        });
        const context: SafeAsyncContext = { name: 'matchRegex' };

        const result = safeSync(() => matchRegex(), context, null);

        expect(result).toBeNull();
      });

      it('should handle computation with fallback', () => {
        const compute = vi.fn().mockImplementation(() => {
          throw new Error('Division by zero');
        });
        const context: SafeAsyncContext = { name: 'compute' };

        const result = safeSync(() => compute(), context, 0);

        expect(result).toBe(0);
      });
    });
  });

  describe('SafeAsyncContext', () => {
    it('should require name property', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Error'));
      const context: SafeAsyncContext = { name: 'requiredName' };

      await safeAsync(operation, context, null);

      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'requiredName' }),
        expect.any(String)
      );
    });

    it('should allow additional context properties', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Error'));
      const context: SafeAsyncContext = {
        name: 'withExtras',
        customField: 'customValue',
        numericField: 123,
        boolField: true,
        nestedField: { key: 'value' },
      };

      await safeAsync(operation, context, null);

      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'withExtras',
          customField: 'customValue',
          numericField: 123,
          boolField: true,
          nestedField: { key: 'value' },
        }),
        expect.any(String)
      );
    });
  });
});
