import { describe, it, expect } from 'vitest';
import { sanitizeForLogging, sanitizeError, createSafeLogger } from '../../src/utils/sanitize.js';

describe('sanitize utilities', () => {
  describe('sanitizeForLogging', () => {
    it('should return null as-is', () => {
      expect(sanitizeForLogging(null)).toBe(null);
    });

    it('should return undefined as-is', () => {
      expect(sanitizeForLogging(undefined)).toBe(undefined);
    });

    it('should return primitives as-is', () => {
      expect(sanitizeForLogging(42)).toBe(42);
      expect(sanitizeForLogging(true)).toBe(true);
      expect(sanitizeForLogging(false)).toBe(false);
      expect(sanitizeForLogging(0)).toBe(0);
    });

    it('should mask OpenAI API keys', () => {
      const text = 'Using key: sk-abc123def456ghi789jkl012mno345pqr678';
      const result = sanitizeForLogging(text);
      expect(result).toContain('sk-');
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('abc123def456ghi789jkl012mno345pqr678');
    });

    it('should mask Anthropic API keys', () => {
      const text = 'API key: sk-ant-abc123def456ghi789jkl012';
      const result = sanitizeForLogging(text);
      expect(result).toContain('sk-');
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('sk-ant-abc123def456ghi789jkl012');
    });

    it('should mask AWS access keys', () => {
      const text = 'Access key: AKIAIOSFODNN7EXAMPLE';
      const result = sanitizeForLogging(text);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
    });

    it('should mask GitHub personal access tokens', () => {
      const text = 'Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      const result = sanitizeForLogging(text);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('1234567890abcdefghijklmnopqrstuvwxyz');
    });

    it('should mask GitHub fine-grained tokens', () => {
      const text = 'Token: github_pat_abcdefghijklmnopqrstuvwxyz';
      const result = sanitizeForLogging(text);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('github_pat_abcdefghijklmnopqrstuvwxyz');
    });

    it('should mask Stripe API keys', () => {
      const text = 'Key: sk_live_abc123def456ghi789jkl012';
      const result = sanitizeForLogging(text);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('sk_live_abc123def456ghi789jkl012');
    });

    it('should mask JWT tokens', () => {
      const text =
        'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = sanitizeForLogging(text);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain(
        'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ'
      );
    });

    it('should mask Bearer tokens', () => {
      const text = 'Authorization: Bearer abc123def456ghi789';
      const result = sanitizeForLogging(text);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('abc123def456ghi789');
    });

    it('should mask database connection strings', () => {
      const text = 'DB: mongodb://user:password123@localhost:27017/db';
      const result = sanitizeForLogging(text);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('password123');
    });

    it('should handle strings without sensitive data', () => {
      const text = 'This is a normal log message with no secrets';
      const result = sanitizeForLogging(text);
      expect(result).toBe(text);
    });

    it('should sanitize arrays recursively', () => {
      const arr = ['normal', 'sk-abc123def456ghi789jkl012mno345pqr678', 42];
      const result = sanitizeForLogging(arr) as unknown[];
      expect(result).toHaveLength(3);
      expect(result[0]).toBe('normal');
      expect(result[1]).toContain('***REDACTED***');
      expect(result[2]).toBe(42);
    });

    it('should sanitize nested arrays', () => {
      const arr = ['normal', ['nested', 'sk-abc123def456ghi789jkl012mno345pqr678'], 42];
      const result = sanitizeForLogging(arr) as unknown[];
      expect(result).toHaveLength(3);
      expect(result[0]).toBe('normal');
      expect((result[1] as unknown[])[0]).toBe('nested');
      expect((result[1] as unknown[])[1]).toContain('***REDACTED***');
    });

    it('should redact values with sensitive key names', () => {
      const obj = {
        username: 'john',
        apiKey: 'secret123',
        password: 'hunter2',
        token: 'abc123',
      };
      const result = sanitizeForLogging(obj) as Record<string, unknown>;
      expect(result.username).toBe('john');
      expect(result.apiKey).toBe('***REDACTED***');
      expect(result.password).toBe('***REDACTED***');
      expect(result.token).toBe('***REDACTED***');
    });

    it('should handle api_key variations', () => {
      const obj = {
        api_key: 'secret',
        'api-key': 'secret',
        apiKey: 'secret',
      };
      const result = sanitizeForLogging(obj) as Record<string, unknown>;
      expect(result.api_key).toBe('***REDACTED***');
      expect(result['api-key']).toBe('***REDACTED***');
      expect(result.apiKey).toBe('***REDACTED***');
    });

    it('should handle credential and secret keys', () => {
      const obj = {
        credentials: 'creds',
        secret: 'shh',
        authToken: 'token',
        bearer: 'bearer',
      };
      const result = sanitizeForLogging(obj) as Record<string, unknown>;
      expect(result.credentials).toBe('***REDACTED***');
      expect(result.secret).toBe('***REDACTED***');
      expect(result.authToken).toBe('***REDACTED***');
      expect(result.bearer).toBe('***REDACTED***');
    });

    it('should sanitize nested objects', () => {
      const obj = {
        user: {
          name: 'john',
          apiKey: 'secret123',
        },
        settings: {
          theme: 'dark',
          password: 'hunter2',
        },
      };
      const result = sanitizeForLogging(obj) as Record<string, Record<string, unknown>>;
      expect(result.user.name).toBe('john');
      expect(result.user.apiKey).toBe('***REDACTED***');
      expect(result.settings.theme).toBe('dark');
      expect(result.settings.password).toBe('***REDACTED***');
    });

    it('should sanitize nested objects with API keys in values', () => {
      const obj = {
        config: {
          url: 'https://api.example.com',
          key: 'sk-abc123def456ghi789jkl012mno345pqr678',
        },
      };
      const result = sanitizeForLogging(obj) as Record<string, Record<string, unknown>>;
      expect(result.config.url).toBe('https://api.example.com');
      expect(result.config.key).toContain('***REDACTED***');
    });

    it('should handle arrays within objects', () => {
      const obj = {
        keys: ['key1', 'sk-abc123def456ghi789jkl012mno345pqr678'],
      };
      const result = sanitizeForLogging(obj) as Record<string, unknown[]>;
      expect(result.keys[0]).toBe('key1');
      expect(result.keys[1]).toContain('***REDACTED***');
    });

    it('should handle objects within arrays', () => {
      const arr = [
        { name: 'user1', apiKey: 'secret' },
        { name: 'user2', password: 'pass' },
      ];
      const result = sanitizeForLogging(arr) as Record<string, unknown>[];
      expect(result[0].name).toBe('user1');
      expect(result[0].apiKey).toBe('***REDACTED***');
      expect(result[1].name).toBe('user2');
      expect(result[1].password).toBe('***REDACTED***');
    });

    it('should preserve first few characters of masked strings', () => {
      const text = 'Key: sk-abc123def456ghi789jkl012mno345pqr678';
      const result = sanitizeForLogging(text) as string;
      expect(result).toContain('sk-');
      expect(result).toContain('...');
      expect(result).toContain('***REDACTED***');
    });

    it('should handle empty strings', () => {
      expect(sanitizeForLogging('')).toBe('');
    });

    it('should handle empty arrays', () => {
      expect(sanitizeForLogging([])).toEqual([]);
    });

    it('should handle empty objects', () => {
      expect(sanitizeForLogging({})).toEqual({});
    });

    it('should handle multiple API keys in same string', () => {
      const text =
        'Keys: sk-abc123def456ghi789jkl012mno345pqr678 and sk-xyz987uvw654tsr321pqo098lmn765kjh432';
      const result = sanitizeForLogging(text) as string;
      const redactedCount = (result.match(/\*\*\*REDACTED\*\*\*/g) || []).length;
      expect(redactedCount).toBe(2);
    });

    it('should handle Google API keys', () => {
      const text = 'Key: AIzaSyDAbcDefGhiJklMnoPqrStUvWxYz012345';
      const result = sanitizeForLogging(text);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('SyDAbcDefGhiJklMnoPqrStUvWxYz012345');
    });

    it('should handle Slack tokens', () => {
      const text = 'Slack: xoxb-1234567890-abcdefghijk';
      const result = sanitizeForLogging(text);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('xoxb-1234567890-abcdefghijk');
    });

    it('should handle npm tokens', () => {
      const text = 'Token: npm_abc123def456ghi789jkl012mno345pqr678';
      const result = sanitizeForLogging(text);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('npm_abc123def456ghi789jkl012mno345pqr678');
    });

    it('should handle private key markers', () => {
      const text = '-----BEGIN PRIVATE KEY----- sensitive data';
      const result = sanitizeForLogging(text);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('-----BEGIN PRIVATE KEY-----');
    });

    it('should handle RSA private key markers', () => {
      const text = '-----BEGIN RSA PRIVATE KEY----- sensitive data';
      const result = sanitizeForLogging(text);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('-----BEGIN RSA PRIVATE KEY-----');
    });
  });

  describe('sanitizeError', () => {
    it('should sanitize Error objects', () => {
      const error = new Error('API key: sk-abc123def456ghi789jkl012mno345pqr678');
      const result = sanitizeError(error) as Record<string, unknown>;
      expect(result.name).toBe('Error');
      expect(result.message).toContain('***REDACTED***');
      expect(result.message).not.toContain('sk-abc123def456ghi789jkl012mno345pqr678');
    });

    it('should preserve error name', () => {
      const error = new TypeError('Invalid type');
      const result = sanitizeError(error) as Record<string, unknown>;
      expect(result.name).toBe('TypeError');
    });

    it('should sanitize error message', () => {
      const error = new Error('Failed with token: ghp_abc123def456ghi789jkl012mno345pqrstu');
      const result = sanitizeError(error) as Record<string, unknown>;
      expect(result.message).toContain('***REDACTED***');
    });

    it('should sanitize error stack trace', () => {
      const error = new Error('Test error');
      // Manually set stack to include sensitive data
      error.stack = 'Error: Test\n  at sk-abc123def456ghi789jkl012mno345pqr678';
      const result = sanitizeError(error) as Record<string, unknown>;
      expect(result.stack).toContain('***REDACTED***');
    });

    it('should handle errors without stack traces', () => {
      const error = new Error('Test');
      delete (error as { stack?: string }).stack;
      const result = sanitizeError(error) as Record<string, unknown>;
      expect(result.stack).toBeUndefined();
    });

    it('should sanitize additional error properties', () => {
      const error = new Error('Test') as Error & { apiKey?: string };
      error.apiKey = 'sk-abc123def456ghi789jkl012mno345pqr678';
      const result = sanitizeError(error) as Record<string, unknown>;
      // The apiKey property is masked because it's a sensitive key name
      expect(result.apiKey).toContain('***REDACTED***');
    });

    it('should handle non-Error values', () => {
      const value = { message: 'Not an error', apiKey: 'secret' };
      const result = sanitizeError(value) as Record<string, unknown>;
      expect(result.message).toBe('Not an error');
      expect(result.apiKey).toBe('***REDACTED***');
    });

    it('should handle null', () => {
      expect(sanitizeError(null)).toBe(null);
    });

    it('should handle undefined', () => {
      expect(sanitizeError(undefined)).toBe(undefined);
    });

    it('should handle string errors', () => {
      const error = 'Error with key: sk-abc123def456ghi789jkl012mno345pqr678';
      const result = sanitizeError(error);
      expect(result).toContain('***REDACTED***');
    });
  });

  describe('createSafeLogger', () => {
    it('should wrap logger methods to sanitize arguments', () => {
      const logs: unknown[][] = [];
      const mockLogger = {
        info: (...args: unknown[]) => logs.push(['info', ...args]),
        error: (...args: unknown[]) => logs.push(['error', ...args]),
      };

      const safeLogger = createSafeLogger(mockLogger);
      safeLogger.info('Test', { apiKey: 'secret' });

      expect(logs).toHaveLength(1);
      expect(logs[0][0]).toBe('info');
      expect(logs[0][1]).toBe('Test');
      const sanitized = logs[0][2] as Record<string, unknown>;
      expect(sanitized.apiKey).toBe('***REDACTED***');
    });

    it('should preserve non-function properties', () => {
      const mockLogger = {
        level: 'info',
        log: (...args: unknown[]) => args,
      };

      const safeLogger = createSafeLogger(mockLogger);
      expect(safeLogger.level).toBe('info');
    });

    it('should handle multiple arguments', () => {
      const logs: unknown[][] = [];
      const mockLogger = {
        log: (...args: unknown[]) => logs.push(args),
      };

      const safeLogger = createSafeLogger(mockLogger);
      safeLogger.log('Message', { token: 'secret' }, ['api_key', 'value']);

      expect(logs).toHaveLength(1);
      expect(logs[0][0]).toBe('Message');
      expect((logs[0][1] as Record<string, unknown>).token).toBe('***REDACTED***');
      expect((logs[0][2] as unknown[])[0]).toBe('api_key');
    });

    it('should sanitize Error objects specially', () => {
      const logs: unknown[][] = [];
      const mockLogger = {
        error: (...args: unknown[]) => logs.push(args),
      };

      const safeLogger = createSafeLogger(mockLogger);
      const error = new Error('Failed with sk-abc123def456ghi789jkl012mno345pqr678');
      safeLogger.error(error);

      expect(logs).toHaveLength(1);
      const sanitizedError = logs[0][0] as Record<string, unknown>;
      expect(sanitizedError.name).toBe('Error');
      expect(sanitizedError.message).toContain('***REDACTED***');
    });

    it('should handle loggers with many methods', () => {
      const mockLogger = {
        trace: (...args: unknown[]) => args,
        debug: (...args: unknown[]) => args,
        info: (...args: unknown[]) => args,
        warn: (...args: unknown[]) => args,
        error: (...args: unknown[]) => args,
        fatal: (...args: unknown[]) => args,
      };

      const safeLogger = createSafeLogger(mockLogger);
      expect(typeof safeLogger.trace).toBe('function');
      expect(typeof safeLogger.debug).toBe('function');
      expect(typeof safeLogger.info).toBe('function');
      expect(typeof safeLogger.warn).toBe('function');
      expect(typeof safeLogger.error).toBe('function');
      expect(typeof safeLogger.fatal).toBe('function');
    });

    it('should maintain context when calling wrapped methods', () => {
      let capturedThis: unknown;
      const mockLogger = {
        name: 'TestLogger',
        log: function (this: unknown, ...args: unknown[]) {
          capturedThis = this;
          return args;
        },
      };

      const safeLogger = createSafeLogger(mockLogger);
      safeLogger.log('test');

      expect(capturedThis).toBe(mockLogger);
    });
  });
});
