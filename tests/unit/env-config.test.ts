/**
 * Unit tests for environment configuration loading
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

describe('loadEnv', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Reset the loaded flag
    delete process.env.__AGENT_MEMORY_ENV_LOADED;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should set DOTENV_CONFIG_QUIET to true', () => {
    loadEnv('/non/existent/path');
    expect(process.env.DOTENV_CONFIG_QUIET).toBe('true');
  });

  it('should mark environment as loaded', () => {
    loadEnv('/non/existent/path');
    expect(process.env.__AGENT_MEMORY_ENV_LOADED).toBe('1');
  });

  it('should only load once', () => {
    // First load
    loadEnv('/some/path');

    // Modify DOTENV_CONFIG_QUIET to detect if it gets set again
    process.env.DOTENV_CONFIG_QUIET = 'modified';

    // Second load - should be a no-op due to guard
    loadEnv('/some/other/path');

    // Should not have been reset because the guard returned early
    expect(process.env.DOTENV_CONFIG_QUIET).toBe('modified');
  });

  it('should resolve .env path correctly', () => {
    // Since the path doesn't exist, dotenv shouldn't be called
    // but the function should still complete without error
    delete process.env.__AGENT_MEMORY_ENV_LOADED;
    expect(() => loadEnv('/test/project/root')).not.toThrow();
  });

  it('should guard against repeated loading', () => {
    process.env.__AGENT_MEMORY_ENV_LOADED = '1';

    // Should return early without doing anything
    loadEnv('/any/path');

    // DOTENV_CONFIG_QUIET should not have been set since guard returned early
    expect(process.env.DOTENV_CONFIG_QUIET).toBeUndefined();
  });
});
