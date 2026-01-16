import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  transactionWithDb,
  transactionWithRetry,
  isRetryableDbError,
} from '../../src/db/connection.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock config
vi.mock('../../src/config/index.js', () => ({
  config: {
    health: { checkIntervalMs: 60000 },
    transaction: {
      maxRetries: 3,
      initialDelayMs: 50,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    },
  },
}));

describe('Database Connection - Standalone Functions', () => {
  describe('transactionWithDb', () => {
    it('should run transaction with sqlite', () => {
      const mockSqlite = {
        transaction: vi.fn(
          <T>(fn: () => T) =>
            () =>
              fn()
        ),
      };
      const fn = vi.fn(() => 'result');

      const result = transactionWithDb(mockSqlite as any, fn);

      expect(result).toBe('result');
      expect(mockSqlite.transaction).toHaveBeenCalledWith(fn);
    });

    it('should run function directly without sqlite (PostgreSQL mode)', () => {
      const fn = vi.fn(() => 'pg result');

      const result = transactionWithDb(undefined, fn);

      expect(result).toBe('pg result');
      expect(fn).toHaveBeenCalled();
    });

    it('should propagate errors from transaction', () => {
      const mockSqlite = {
        transaction: vi.fn(() => () => {
          throw new Error('Transaction failed');
        }),
      };
      const fn = vi.fn(() => 'never');

      expect(() => transactionWithDb(mockSqlite as any, fn)).toThrow('Transaction failed');
    });
  });

  describe('isRetryableDbError', () => {
    it('should return false for non-Error values', () => {
      expect(isRetryableDbError('not an error')).toBe(false);
      expect(isRetryableDbError(null)).toBe(false);
      expect(isRetryableDbError(undefined)).toBe(false);
      expect(isRetryableDbError(123)).toBe(false);
      expect(isRetryableDbError({})).toBe(false);
    });

    it('should return true for SQLITE_BUSY error message', () => {
      const error = new Error('SQLITE_BUSY: database is locked');
      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should return true for SQLITE_LOCKED error message', () => {
      const error = new Error('SQLITE_LOCKED');
      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should return true for database is locked message (case insensitive)', () => {
      expect(isRetryableDbError(new Error('database is locked'))).toBe(true);
      expect(isRetryableDbError(new Error('Database Is Locked'))).toBe(true);
    });

    it('should return true for database is busy message', () => {
      expect(isRetryableDbError(new Error('database is busy'))).toBe(true);
      expect(isRetryableDbError(new Error('DATABASE IS BUSY'))).toBe(true);
    });

    it('should return true for SQLITE_PROTOCOL error code', () => {
      const error = new Error('Some error') as Error & { code: string };
      error.code = 'SQLITE_PROTOCOL';
      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should return true for SQLITE_BUSY error code', () => {
      const error = new Error('Some error') as Error & { code: string };
      error.code = 'SQLITE_BUSY';
      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should return true for SQLITE_LOCKED error code', () => {
      const error = new Error('Some error') as Error & { code: string };
      error.code = 'SQLITE_LOCKED';
      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      expect(isRetryableDbError(new Error('SQLITE_CONSTRAINT: unique violation'))).toBe(false);
      expect(isRetryableDbError(new Error('SQLITE_ERROR'))).toBe(false);
    });

    it('should return false for generic errors', () => {
      expect(isRetryableDbError(new Error('Something went wrong'))).toBe(false);
      expect(isRetryableDbError(new Error('Connection refused'))).toBe(false);
    });

    it('should handle error with empty code property', () => {
      const error = new Error('test') as Error & { code: string };
      error.code = '';
      expect(isRetryableDbError(error)).toBe(false);
    });
  });

  describe('transactionWithRetry', () => {
    it('should run function directly without sqlite (PostgreSQL mode)', async () => {
      const fn = vi.fn(() => 'pg result');

      const result = await transactionWithRetry(undefined, fn);

      expect(result).toBe('pg result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should run transaction successfully on first attempt', async () => {
      const mockSqlite = {
        transaction: vi.fn(
          <T>(fn: () => T) =>
            () =>
              fn()
        ),
      };
      const fn = vi.fn(() => 'success');

      const result = await transactionWithRetry(mockSqlite as any, fn);

      expect(result).toBe('success');
      expect(mockSqlite.transaction).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      let attempts = 0;
      const mockSqlite = {
        transaction: vi.fn(<T>(fn: () => T) => () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('SQLITE_BUSY');
          }
          return fn();
        }),
      };
      const fn = vi.fn(() => 'success after retry');

      const result = await transactionWithRetry(mockSqlite as any, fn, {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      });

      expect(result).toBe('success after retry');
      expect(mockSqlite.transaction).toHaveBeenCalledTimes(2);
    });

    it('should apply exponential backoff with cap', async () => {
      let attempts = 0;
      const mockSqlite = {
        transaction: vi.fn(<T>(fn: () => T) => () => {
          attempts++;
          if (attempts < 4) {
            throw new Error('SQLITE_BUSY');
          }
          return fn();
        }),
      };
      const fn = vi.fn(() => 'success');

      const start = Date.now();
      await transactionWithRetry(mockSqlite as any, fn, {
        maxRetries: 5,
        initialDelayMs: 10,
        maxDelayMs: 50,
        backoffMultiplier: 2,
      });
      const elapsed = Date.now() - start;

      // Should have delays: 10 + 20 + 40 (capped at 50) = 70ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(70);
    });

    it('should throw after max retries exhausted', async () => {
      const mockSqlite = {
        transaction: vi.fn(() => () => {
          throw new Error('SQLITE_BUSY');
        }),
      };
      const fn = vi.fn(() => 'never');

      await expect(
        transactionWithRetry(mockSqlite as any, fn, {
          maxRetries: 2,
          initialDelayMs: 10,
        })
      ).rejects.toThrow('SQLITE_BUSY');

      // 1 initial + 2 retries = 3 attempts
      expect(mockSqlite.transaction).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const mockSqlite = {
        transaction: vi.fn(() => () => {
          throw new Error('SQLITE_CONSTRAINT: unique violation');
        }),
      };
      const fn = vi.fn(() => 'never');

      await expect(transactionWithRetry(mockSqlite as any, fn)).rejects.toThrow(
        'SQLITE_CONSTRAINT'
      );

      expect(mockSqlite.transaction).toHaveBeenCalledTimes(1);
    });

    it('should not retry generic errors', async () => {
      const mockSqlite = {
        transaction: vi.fn(() => () => {
          throw new Error('Unknown error');
        }),
      };
      const fn = vi.fn(() => 'never');

      await expect(transactionWithRetry(mockSqlite as any, fn)).rejects.toThrow('Unknown error');
      expect(mockSqlite.transaction).toHaveBeenCalledTimes(1);
    });

    it('should convert non-Error throws to Error', async () => {
      const mockSqlite = {
        transaction: vi.fn(() => () => {
          throw 'string error';
        }),
      };
      const fn = vi.fn(() => 'never');

      await expect(transactionWithRetry(mockSqlite as any, fn)).rejects.toThrow('string error');
    });

    it('should preserve error type through retries', async () => {
      let attempts = 0;
      const mockSqlite = {
        transaction: vi.fn(() => () => {
          attempts++;
          const error = new Error('SQLITE_BUSY') as Error & { code: string };
          error.code = 'SQLITE_BUSY';
          throw error;
        }),
      };
      const fn = vi.fn(() => 'never');

      try {
        await transactionWithRetry(mockSqlite as any, fn, {
          maxRetries: 1,
          initialDelayMs: 5,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('SQLITE_BUSY');
      }
    });

    it('should use default retry options from config', async () => {
      let attempts = 0;
      const mockSqlite = {
        transaction: vi.fn(<T>(fn: () => T) => () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('SQLITE_BUSY');
          }
          return fn();
        }),
      };
      const fn = vi.fn(() => 'success');

      // Uses default options from mocked config
      const result = await transactionWithRetry(mockSqlite as any, fn);

      expect(result).toBe('success');
    });

    it('should succeed on last possible retry', async () => {
      let attempts = 0;
      const mockSqlite = {
        transaction: vi.fn(<T>(fn: () => T) => () => {
          attempts++;
          if (attempts <= 3) {
            throw new Error('SQLITE_BUSY');
          }
          return fn();
        }),
      };
      const fn = vi.fn(() => 'last retry success');

      const result = await transactionWithRetry(mockSqlite as any, fn, {
        maxRetries: 3, // 4 total attempts
        initialDelayMs: 5,
      });

      expect(result).toBe('last retry success');
      expect(mockSqlite.transaction).toHaveBeenCalledTimes(4);
    });
  });
});
