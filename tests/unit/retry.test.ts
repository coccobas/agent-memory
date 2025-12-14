import { describe, it, expect, vi } from 'vitest';
import { withRetry, isRetryableNetworkError } from '../../src/utils/retry.js';

describe('Retry Utility', () => {
  it('should return result if successful on first try', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 1, // Fast retry for tests
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should fail after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 1,
      })
    ).rejects.toThrow('always fail');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent error'));

    await expect(
      withRetry(fn, {
        retryableErrors: (err) => err.message !== 'permanent error',
        maxAttempts: 3,
      })
    ).rejects.toThrow('permanent error');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  describe('isRetryableNetworkError', () => {
    it('should identify network errors', () => {
      expect(isRetryableNetworkError(new Error('connection timeout'))).toBe(true);
      expect(isRetryableNetworkError(new Error('ECONNRESET'))).toBe(true);
      expect(isRetryableNetworkError(new Error('503 Service Unavailable'))).toBe(true);
    });

    it('should reject other errors', () => {
      expect(isRetryableNetworkError(new Error('Invalid input'))).toBe(false);
      expect(isRetryableNetworkError(new Error('SyntaxError'))).toBe(false);
    });
  });
});
