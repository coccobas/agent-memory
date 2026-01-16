/**
 * Unit tests for admin key verification
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AdminAuthError, getConfiguredAdminKey, requireAdminKey } from '../../src/utils/admin.js';
import { resetWarningFlags } from '../../src/config/auth.js';

describe('Admin Key Utilities', () => {
  // Store original env values to restore after each test
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save all auth-related env vars
    originalEnv.AGENT_MEMORY_ADMIN_KEY = process.env.AGENT_MEMORY_ADMIN_KEY;
    originalEnv.AGENT_MEMORY_API_KEY = process.env.AGENT_MEMORY_API_KEY;
    originalEnv.AGENT_MEMORY_DEV_MODE = process.env.AGENT_MEMORY_DEV_MODE;
    originalEnv.AGENT_MEMORY_REST_API_KEY = process.env.AGENT_MEMORY_REST_API_KEY;
    originalEnv.AGENT_MEMORY_PERMISSIONS_MODE = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    originalEnv.AGENT_MEMORY_ALLOW_PERMISSIVE = process.env.AGENT_MEMORY_ALLOW_PERMISSIVE;

    // Clear all auth-related vars for clean test state
    delete process.env.AGENT_MEMORY_API_KEY;
    delete process.env.AGENT_MEMORY_DEV_MODE;
    delete process.env.AGENT_MEMORY_REST_API_KEY;
    delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    delete process.env.AGENT_MEMORY_ALLOW_PERMISSIVE;

    // Reset warning flags
    resetWarningFlags();
  });

  afterEach(() => {
    // Restore all original values
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetWarningFlags();
  });

  describe('AdminAuthError', () => {
    it('should have correct name', () => {
      const error = new AdminAuthError('test message');
      expect(error.name).toBe('AdminAuthError');
    });

    it('should be an instance of Error', () => {
      const error = new AdminAuthError('test message');
      expect(error).toBeInstanceOf(Error);
    });

    it('should preserve message', () => {
      const error = new AdminAuthError('custom message');
      expect(error.message).toBe('custom message');
    });
  });

  describe('getConfiguredAdminKey', () => {
    it('should return null when no key configured', () => {
      delete process.env.AGENT_MEMORY_ADMIN_KEY;
      expect(getConfiguredAdminKey()).toBeNull();
    });

    it('should return null for empty key', () => {
      process.env.AGENT_MEMORY_ADMIN_KEY = '';
      expect(getConfiguredAdminKey()).toBeNull();
    });

    it('should return key when configured', () => {
      process.env.AGENT_MEMORY_ADMIN_KEY = 'my-secret-key';
      expect(getConfiguredAdminKey()).toBe('my-secret-key');
    });

    it('should return key with special characters', () => {
      process.env.AGENT_MEMORY_ADMIN_KEY = 'key-with-$pecial!ch@rs';
      expect(getConfiguredAdminKey()).toBe('key-with-$pecial!ch@rs');
    });
  });

  describe('requireAdminKey', () => {
    it('should throw when no key configured', () => {
      // All keys should be cleared by beforeEach
      expect(() => requireAdminKey({})).toThrow(AdminAuthError);
      expect(() => requireAdminKey({})).toThrow('API key not configured');
    });

    it('should throw when key not provided in params', () => {
      process.env.AGENT_MEMORY_ADMIN_KEY = 'secret-key';

      expect(() => requireAdminKey({})).toThrow(AdminAuthError);
      expect(() => requireAdminKey({})).toThrow('invalid API key');
    });

    it('should throw when wrong key provided via admin_key', () => {
      process.env.AGENT_MEMORY_ADMIN_KEY = 'correct-key';

      expect(() => requireAdminKey({ admin_key: 'wrong-key' })).toThrow(AdminAuthError);
      expect(() => requireAdminKey({ admin_key: 'wrong-key' })).toThrow('invalid API key');
    });

    it('should throw when wrong key provided via adminKey', () => {
      process.env.AGENT_MEMORY_ADMIN_KEY = 'correct-key';

      expect(() => requireAdminKey({ adminKey: 'wrong-key' })).toThrow(AdminAuthError);
    });

    it('should not throw when correct key provided via admin_key', () => {
      process.env.AGENT_MEMORY_ADMIN_KEY = 'my-admin-key';

      expect(() => requireAdminKey({ admin_key: 'my-admin-key' })).not.toThrow();
    });

    it('should not throw when correct key provided via adminKey', () => {
      process.env.AGENT_MEMORY_ADMIN_KEY = 'my-admin-key';

      expect(() => requireAdminKey({ adminKey: 'my-admin-key' })).not.toThrow();
    });

    it('should not throw when correct key provided via api_key', () => {
      process.env.AGENT_MEMORY_API_KEY = 'my-unified-key';

      expect(() => requireAdminKey({ api_key: 'my-unified-key' })).not.toThrow();
    });

    it('should not throw when correct key provided via apiKey', () => {
      process.env.AGENT_MEMORY_API_KEY = 'my-unified-key';

      expect(() => requireAdminKey({ apiKey: 'my-unified-key' })).not.toThrow();
    });

    it('should prefer admin_key over adminKey', () => {
      process.env.AGENT_MEMORY_ADMIN_KEY = 'correct-key';

      // admin_key takes precedence
      expect(() =>
        requireAdminKey({
          admin_key: 'correct-key',
          adminKey: 'wrong-key',
        })
      ).not.toThrow();
    });

    it('should use unified API_KEY over legacy ADMIN_KEY', () => {
      process.env.AGENT_MEMORY_API_KEY = 'unified-key';
      process.env.AGENT_MEMORY_ADMIN_KEY = 'legacy-key';

      // Should accept the unified key, not the legacy key
      expect(() => requireAdminKey({ admin_key: 'unified-key' })).not.toThrow();
      expect(() => requireAdminKey({ admin_key: 'legacy-key' })).toThrow(AdminAuthError);
    });

    it('should bypass validation when DEV_MODE=true', () => {
      process.env.AGENT_MEMORY_DEV_MODE = 'true';
      // No key configured at all

      // Should not throw even with no key
      expect(() => requireAdminKey({})).not.toThrow();
      expect(() => requireAdminKey({ admin_key: 'any-key' })).not.toThrow();
    });

    it('should reject empty key even if configured matches', () => {
      process.env.AGENT_MEMORY_ADMIN_KEY = '';

      expect(() => requireAdminKey({ admin_key: '' })).toThrow(AdminAuthError);
    });

    it('should use timing-safe comparison', () => {
      process.env.AGENT_MEMORY_ADMIN_KEY = 'secret123456789';

      // Both should fail, but timing should be similar
      const start1 = performance.now();
      try {
        requireAdminKey({ admin_key: 'wrong' });
      } catch {
        /* expected */
      }
      const time1 = performance.now() - start1;

      const start2 = performance.now();
      try {
        requireAdminKey({ admin_key: 'wrongwrongwrongwrong' });
      } catch {
        /* expected */
      }
      const time2 = performance.now() - start2;

      // Times should be roughly similar (within 10ms)
      expect(Math.abs(time1 - time2)).toBeLessThan(10);
    });

    it('should handle non-string admin_key values', () => {
      process.env.AGENT_MEMORY_ADMIN_KEY = 'valid-key';

      expect(() => requireAdminKey({ admin_key: 123 })).toThrow(AdminAuthError);
      expect(() => requireAdminKey({ admin_key: null })).toThrow(AdminAuthError);
      expect(() => requireAdminKey({ admin_key: undefined })).toThrow(AdminAuthError);
      expect(() => requireAdminKey({ admin_key: { key: 'value' } })).toThrow(AdminAuthError);
    });

    it('should handle long keys', () => {
      const longKey = 'a'.repeat(1000);
      process.env.AGENT_MEMORY_ADMIN_KEY = longKey;

      expect(() => requireAdminKey({ admin_key: longKey })).not.toThrow();
    });

    it('should handle special characters in keys', () => {
      const specialKey = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      process.env.AGENT_MEMORY_ADMIN_KEY = specialKey;

      expect(() => requireAdminKey({ admin_key: specialKey })).not.toThrow();
    });

    it('should handle unicode in keys', () => {
      const unicodeKey = '管理者キー🔐';
      process.env.AGENT_MEMORY_ADMIN_KEY = unicodeKey;

      expect(() => requireAdminKey({ admin_key: unicodeKey })).not.toThrow();
    });
  });
});
