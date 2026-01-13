import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry, isRetryableDbError, isRetryableNetworkError, extractRetryAfterMs } from '../../src/utils/retry.js';

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Retry Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('withRetry', () => {
    it('should return result on successful first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn, { initialDelayMs: 1 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, { initialDelayMs: 1 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Always fails'));

      await expect(withRetry(fn, { maxAttempts: 2, initialDelayMs: 1 })).rejects.toThrow('Always fails');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should call onRetry callback', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Failure'))
        .mockResolvedValue('success');
      const onRetry = vi.fn();

      await withRetry(fn, { onRetry, initialDelayMs: 1 });

      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    });

    it('should respect retryableErrors filter', async () => {
      const nonRetryableError = new Error('non-retryable');

      const fn = vi.fn().mockRejectedValue(nonRetryableError);
      const retryableErrors = vi.fn((error) => error.message === 'retryable');

      // Should throw immediately without retrying
      await expect(withRetry(fn, { retryableErrors, initialDelayMs: 1 })).rejects.toThrow('non-retryable');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle non-Error throws', async () => {
      const fn = vi.fn().mockRejectedValue('string error');

      await expect(withRetry(fn, { maxAttempts: 1 })).rejects.toThrow('string error');
    });
  });

  describe('isRetryableDbError', () => {
    it('should return true for database locked error', () => {
      const error = new Error('database is locked');
      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should return true for busy error', () => {
      const error = new Error('SQLite busy');
      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should return true for transaction error', () => {
      const error = new Error('cannot start a transaction within a transaction');
      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should return true for disk i/o error', () => {
      const error = new Error('disk i/o error');
      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      const error = new Error('syntax error');
      expect(isRetryableDbError(error)).toBe(false);
    });
  });

  describe('isRetryableNetworkError', () => {
    it('should return true for timeout', () => {
      expect(isRetryableNetworkError(new Error('Request timeout'))).toBe(true);
    });

    it('should return true for ECONNRESET', () => {
      expect(isRetryableNetworkError(new Error('ECONNRESET'))).toBe(true);
    });

    it('should return true for ECONNREFUSED', () => {
      expect(isRetryableNetworkError(new Error('ECONNREFUSED'))).toBe(true);
    });

    it('should return true for socket hang up', () => {
      expect(isRetryableNetworkError(new Error('socket hang up'))).toBe(true);
    });

    it('should return true for network error', () => {
      expect(isRetryableNetworkError(new Error('network error'))).toBe(true);
    });

    it('should return true for rate limit', () => {
      expect(isRetryableNetworkError(new Error('rate limit exceeded'))).toBe(true);
    });

    it('should return true for 502/503/504 errors', () => {
      expect(isRetryableNetworkError(new Error('502 Bad Gateway'))).toBe(true);
      expect(isRetryableNetworkError(new Error('503 Service Unavailable'))).toBe(true);
      expect(isRetryableNetworkError(new Error('504 Gateway Timeout'))).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      expect(isRetryableNetworkError(new Error('404 Not Found'))).toBe(false);
      expect(isRetryableNetworkError(new Error('400 Bad Request'))).toBe(false);
    });
  });

  describe('extractRetryAfterMs (Bug #315)', () => {
    it('should return undefined for null/undefined', () => {
      expect(extractRetryAfterMs(null)).toBeUndefined();
      expect(extractRetryAfterMs(undefined)).toBeUndefined();
    });

    it('should return undefined for non-object', () => {
      expect(extractRetryAfterMs('string')).toBeUndefined();
      expect(extractRetryAfterMs(123)).toBeUndefined();
    });

    it('should return undefined for object without headers', () => {
      expect(extractRetryAfterMs({})).toBeUndefined();
      expect(extractRetryAfterMs({ message: 'error' })).toBeUndefined();
    });

    it('should parse Retry-After header in seconds', () => {
      const error = { headers: { 'retry-after': '5' } };
      expect(extractRetryAfterMs(error)).toBe(5000);
    });

    it('should return undefined for invalid Retry-After', () => {
      expect(extractRetryAfterMs({ headers: { 'retry-after': 'invalid' } })).toBeUndefined();
      expect(extractRetryAfterMs({ headers: { 'retry-after': '0' } })).toBeUndefined();
      expect(extractRetryAfterMs({ headers: { 'retry-after': '-5' } })).toBeUndefined();
    });

    it('should parse OpenAI x-ratelimit-reset-requests header', () => {
      // Simple seconds
      expect(extractRetryAfterMs({ headers: { 'x-ratelimit-reset-requests': '10s' } })).toBe(10000);
      // Milliseconds
      expect(extractRetryAfterMs({ headers: { 'x-ratelimit-reset-requests': '500ms' } })).toBe(500);
      // Minutes and seconds
      expect(extractRetryAfterMs({ headers: { 'x-ratelimit-reset-requests': '1m30s' } })).toBe(90000);
      // Just minutes
      expect(extractRetryAfterMs({ headers: { 'x-ratelimit-reset-requests': '2m' } })).toBe(120000);
    });

    it('should parse OpenAI x-ratelimit-reset-tokens header', () => {
      expect(extractRetryAfterMs({ headers: { 'x-ratelimit-reset-tokens': '5s' } })).toBe(5000);
      expect(extractRetryAfterMs({ headers: { 'x-ratelimit-reset-tokens': '1m' } })).toBe(60000);
    });

    it('should prefer Retry-After over other headers', () => {
      const error = {
        headers: {
          'retry-after': '10',
          'x-ratelimit-reset-requests': '30s',
          'x-ratelimit-reset-tokens': '60s',
        },
      };
      expect(extractRetryAfterMs(error)).toBe(10000);
    });

    it('should work with real-world OpenAI error shape', () => {
      // Simulating OpenAI SDK error structure
      const openaiError = {
        message: 'Rate limit exceeded',
        status: 429,
        headers: {
          'retry-after': '2',
          'x-ratelimit-limit-requests': '10000',
          'x-ratelimit-remaining-requests': '0',
          'x-ratelimit-reset-requests': '1s',
        },
      };
      expect(extractRetryAfterMs(openaiError)).toBe(2000);
    });
  });
});
