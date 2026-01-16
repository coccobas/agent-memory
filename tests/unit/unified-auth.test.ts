/**
 * Tests for the unified authentication system
 *
 * Tests the simplified auth model:
 * - AGENT_MEMORY_API_KEY: Single key for all authentication
 * - AGENT_MEMORY_DEV_MODE: Single flag to enable dev mode
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isDevMode,
  isPermissiveModeEnabled,
  getUnifiedApiKey,
  getUnifiedAuthConfig,
  shouldWarnDevMode,
  isApiKeyConfigured,
  validateAuthConfig,
  resetWarningFlags,
} from '../../src/config/auth.js';

describe('Unified Auth Config', () => {
  // Store original env vars
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original values
    originalEnv.AGENT_MEMORY_API_KEY = process.env.AGENT_MEMORY_API_KEY;
    originalEnv.AGENT_MEMORY_DEV_MODE = process.env.AGENT_MEMORY_DEV_MODE;
    originalEnv.AGENT_MEMORY_ADMIN_KEY = process.env.AGENT_MEMORY_ADMIN_KEY;
    originalEnv.AGENT_MEMORY_REST_API_KEY = process.env.AGENT_MEMORY_REST_API_KEY;
    originalEnv.AGENT_MEMORY_PERMISSIONS_MODE = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    originalEnv.AGENT_MEMORY_ALLOW_PERMISSIVE = process.env.AGENT_MEMORY_ALLOW_PERMISSIVE;
    originalEnv.NODE_ENV = process.env.NODE_ENV;

    // Clear all auth-related env vars
    delete process.env.AGENT_MEMORY_API_KEY;
    delete process.env.AGENT_MEMORY_DEV_MODE;
    delete process.env.AGENT_MEMORY_ADMIN_KEY;
    delete process.env.AGENT_MEMORY_REST_API_KEY;
    delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    delete process.env.AGENT_MEMORY_ALLOW_PERMISSIVE;

    // Reset warning flags
    resetWarningFlags();
  });

  afterEach(() => {
    // Restore original values
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetWarningFlags();
  });

  describe('isDevMode', () => {
    it('should return false when AGENT_MEMORY_DEV_MODE is not set', () => {
      expect(isDevMode()).toBe(false);
    });

    it('should return true when AGENT_MEMORY_DEV_MODE=true', () => {
      process.env.AGENT_MEMORY_DEV_MODE = 'true';
      expect(isDevMode()).toBe(true);
    });

    it('should return true when AGENT_MEMORY_DEV_MODE=1', () => {
      process.env.AGENT_MEMORY_DEV_MODE = '1';
      expect(isDevMode()).toBe(true);
    });

    it('should return false when AGENT_MEMORY_DEV_MODE=false', () => {
      process.env.AGENT_MEMORY_DEV_MODE = 'false';
      expect(isDevMode()).toBe(false);
    });

    it('should return false when AGENT_MEMORY_DEV_MODE=0', () => {
      process.env.AGENT_MEMORY_DEV_MODE = '0';
      expect(isDevMode()).toBe(false);
    });

    it('should NOT be affected by legacy PERMISSIONS_MODE (isDevMode only checks DEV_MODE)', () => {
      // isDevMode() only checks DEV_MODE flag, not legacy vars
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
      expect(isDevMode()).toBe(false);
    });
  });

  describe('isPermissiveModeEnabled', () => {
    it('should return false when no mode is enabled', () => {
      expect(isPermissiveModeEnabled()).toBe(false);
    });

    it('should return true when DEV_MODE=true', () => {
      process.env.AGENT_MEMORY_DEV_MODE = 'true';
      expect(isPermissiveModeEnabled()).toBe(true);
    });

    it('should return true when legacy PERMISSIONS_MODE=permissive', () => {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
      expect(isPermissiveModeEnabled()).toBe(true);
    });

    it('should return false when PERMISSIONS_MODE is not permissive', () => {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'strict';
      expect(isPermissiveModeEnabled()).toBe(false);
    });

    it('should return true when both DEV_MODE and PERMISSIONS_MODE are set', () => {
      process.env.AGENT_MEMORY_DEV_MODE = 'true';
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
      expect(isPermissiveModeEnabled()).toBe(true);
    });
  });

  describe('getUnifiedApiKey', () => {
    it('should return null when no key is configured', () => {
      expect(getUnifiedApiKey()).toBeNull();
    });

    it('should return AGENT_MEMORY_API_KEY when set', () => {
      process.env.AGENT_MEMORY_API_KEY = 'unified-key-123';
      expect(getUnifiedApiKey()).toBe('unified-key-123');
    });

    it('should fall back to AGENT_MEMORY_ADMIN_KEY', () => {
      process.env.AGENT_MEMORY_ADMIN_KEY = 'admin-key-456';
      expect(getUnifiedApiKey()).toBe('admin-key-456');
    });

    it('should fall back to AGENT_MEMORY_REST_API_KEY', () => {
      process.env.AGENT_MEMORY_REST_API_KEY = 'rest-key-789';
      expect(getUnifiedApiKey()).toBe('rest-key-789');
    });

    it('should prefer AGENT_MEMORY_API_KEY over legacy keys', () => {
      process.env.AGENT_MEMORY_API_KEY = 'unified-key-123';
      process.env.AGENT_MEMORY_ADMIN_KEY = 'admin-key-456';
      process.env.AGENT_MEMORY_REST_API_KEY = 'rest-key-789';
      expect(getUnifiedApiKey()).toBe('unified-key-123');
    });

    it('should return null for empty string', () => {
      process.env.AGENT_MEMORY_API_KEY = '';
      expect(getUnifiedApiKey()).toBeNull();
    });
  });

  describe('shouldWarnDevMode', () => {
    it('should return false when dev mode is disabled', () => {
      expect(shouldWarnDevMode()).toBe(false);
    });

    it('should return false when dev mode is enabled in development', () => {
      process.env.AGENT_MEMORY_DEV_MODE = 'true';
      process.env.NODE_ENV = 'development';
      expect(shouldWarnDevMode()).toBe(false);
    });

    it('should return true when dev mode is enabled in production', () => {
      process.env.AGENT_MEMORY_DEV_MODE = 'true';
      process.env.NODE_ENV = 'production';
      expect(shouldWarnDevMode()).toBe(true);
    });

    it('should return true when dev mode is enabled in staging', () => {
      process.env.AGENT_MEMORY_DEV_MODE = 'true';
      process.env.NODE_ENV = 'staging';
      expect(shouldWarnDevMode()).toBe(true);
    });
  });

  describe('isApiKeyConfigured', () => {
    it('should return false when no key is configured', () => {
      expect(isApiKeyConfigured()).toBe(false);
    });

    it('should return true when unified key is configured', () => {
      process.env.AGENT_MEMORY_API_KEY = 'some-key';
      expect(isApiKeyConfigured()).toBe(true);
    });

    it('should return true when legacy admin key is configured', () => {
      process.env.AGENT_MEMORY_ADMIN_KEY = 'some-key';
      expect(isApiKeyConfigured()).toBe(true);
    });
  });

  describe('getUnifiedAuthConfig', () => {
    it('should return production mode by default', () => {
      const config = getUnifiedAuthConfig();
      expect(config.mode).toBe('production');
      expect(config.devModeEnabled).toBe(false);
      expect(config.apiKey).toBeNull();
    });

    it('should return development mode when DEV_MODE=true', () => {
      process.env.AGENT_MEMORY_DEV_MODE = 'true';
      const config = getUnifiedAuthConfig();
      expect(config.mode).toBe('development');
      expect(config.devModeEnabled).toBe(true);
    });

    it('should include API key when configured', () => {
      process.env.AGENT_MEMORY_API_KEY = 'test-key';
      const config = getUnifiedAuthConfig();
      expect(config.apiKey).toBe('test-key');
    });
  });

  describe('validateAuthConfig', () => {
    it('should return warnings when no key and not in dev mode', () => {
      const result = validateAuthConfig();
      expect(result.valid).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('No API key configured');
    });

    it('should be valid when API key is configured', () => {
      process.env.AGENT_MEMORY_API_KEY = 'test-key';
      const result = validateAuthConfig();
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should be valid when dev mode is enabled (even without key)', () => {
      process.env.AGENT_MEMORY_DEV_MODE = 'true';
      process.env.NODE_ENV = 'development';
      const result = validateAuthConfig();
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn when dev mode is enabled in production-like environment', () => {
      process.env.AGENT_MEMORY_DEV_MODE = 'true';
      process.env.NODE_ENV = 'production';
      const result = validateAuthConfig();
      expect(result.valid).toBe(false);
      expect(result.warnings.some((w) => w.includes('production-like'))).toBe(true);
    });
  });
});

describe('Admin Key Integration', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.AGENT_MEMORY_API_KEY = process.env.AGENT_MEMORY_API_KEY;
    originalEnv.AGENT_MEMORY_DEV_MODE = process.env.AGENT_MEMORY_DEV_MODE;
    originalEnv.AGENT_MEMORY_ADMIN_KEY = process.env.AGENT_MEMORY_ADMIN_KEY;

    delete process.env.AGENT_MEMORY_API_KEY;
    delete process.env.AGENT_MEMORY_DEV_MODE;
    delete process.env.AGENT_MEMORY_ADMIN_KEY;

    resetWarningFlags();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetWarningFlags();
  });

  it('should use unified API key for admin operations', async () => {
    process.env.AGENT_MEMORY_API_KEY = 'unified-admin-key';

    // Import dynamically to get fresh module state
    const { requireAdminKey, AdminAuthError } = await import('../../src/utils/admin.js');

    // Should not throw with correct key
    expect(() => requireAdminKey({ admin_key: 'unified-admin-key' })).not.toThrow();
    expect(() => requireAdminKey({ api_key: 'unified-admin-key' })).not.toThrow();

    // Should throw with wrong key
    expect(() => requireAdminKey({ admin_key: 'wrong-key' })).toThrow(AdminAuthError);
  });

  it('should skip admin key validation in dev mode', async () => {
    process.env.AGENT_MEMORY_DEV_MODE = 'true';

    const { requireAdminKey } = await import('../../src/utils/admin.js');

    // Should not throw even with no key
    expect(() => requireAdminKey({})).not.toThrow();
    expect(() => requireAdminKey({ admin_key: 'any-key' })).not.toThrow();
  });
});
