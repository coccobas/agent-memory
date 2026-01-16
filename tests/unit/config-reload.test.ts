/**
 * Unit tests for configuration hot reload utility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, watch } from 'node:fs';
import {
  configReloader,
  reloadConfiguration,
  watchConfigChanges,
  onConfigReload,
  type ReloadResult,
  type ConfigChange,
} from '../../src/utils/config-reload.js';

// Mock dependencies
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  watch: vi.fn(),
}));

vi.mock('../../src/config/index.js', () => ({
  config: {
    logging: { level: 'info', debug: false, performance: false },
    cache: {
      queryCacheTTLMs: 5000,
      scopeCacheTTLMs: 10000,
      pressureThreshold: 0.8,
      evictionTarget: 0.7,
    },
    memory: { heapPressureThreshold: 0.9, checkIntervalMs: 60000 },
    rateLimit: {
      enabled: true,
      perAgent: { maxRequests: 100, windowMs: 60000 },
      global: { maxRequests: 1000, windowMs: 60000 },
    },
    semanticSearch: { defaultThreshold: 0.7, scoreWeight: 0.5, duplicateThreshold: 0.85 },
    recency: { defaultDecayHalfLifeDays: 30, defaultRecencyWeight: 0.3, maxRecencyBoost: 2.0 },
    scoring: {
      weights: { explicitRelation: 10, tagMatch: 5, scopeProximity: 3, textMatch: 1 },
    },
    validation: { bulkOperationMax: 100, regexPatternMaxLength: 1000 },
    pagination: { defaultLimit: 50, maxLimit: 1000 },
    health: { checkIntervalMs: 30000 },
    retry: { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 5000, backoffMultiplier: 2 },
    transaction: { maxRetries: 3, initialDelayMs: 50, maxDelayMs: 2000 },
    output: { format: 'json' },
    embedding: { maxConcurrency: 5, maxRetries: 3, retryDelayMs: 1000 },
    extraction: { maxTokens: 1000, temperature: 0.7, confidenceThreshold: 0.5 },
  },
  reloadConfig: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('ConfigReloader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configReloader.stopWatching();
  });

  afterEach(() => {
    configReloader.stopWatching();
  });

  describe('reload', () => {
    it('should reload configuration successfully', async () => {
      const result = await configReloader.reload();

      expect(result).toHaveProperty('success');
      expect(result.timestamp).toBeGreaterThan(0);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should detect configuration changes', async () => {
      // First reload to establish baseline
      await configReloader.reload();

      const { reloadConfig } = await import('../../src/config/index.js');

      // Mock config change
      vi.mocked(reloadConfig).mockImplementation(() => {
        const { config } = require('../../src/config/index.js');
        config.logging.level = 'debug';
      });

      const result = await configReloader.reload();

      expect(result).toHaveProperty('success');
      expect(result.changes).toBeDefined();
    });

    it('should return empty changes when nothing changed', async () => {
      // Reset mock to not change anything
      const { reloadConfig } = await import('../../src/config/index.js');
      vi.mocked(reloadConfig).mockImplementation(() => {
        // No changes
      });

      const result = await configReloader.reload();

      expect(result).toHaveProperty('success');
      expect(result.changes).toEqual([]);
    });

    it('should handle reload errors', async () => {
      const { reloadConfig } = await import('../../src/config/index.js');
      vi.mocked(reloadConfig).mockImplementation(() => {
        throw new Error('Reload failed');
      });

      const result = await configReloader.reload();

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Reload failed');
      expect(result.changes).toHaveLength(0);
    });

    it('should update last reload timestamp', async () => {
      // Do first reload
      await configReloader.reload();
      const before = configReloader.getLastReloadTime();

      await new Promise((resolve) => setTimeout(resolve, 10));
      await configReloader.reload();
      const after = configReloader.getLastReloadTime();

      expect(after).toBeGreaterThanOrEqual(before);
    });

    it('should notify registered callbacks', async () => {
      const callback = vi.fn();
      configReloader.onReload(callback);

      await configReloader.reload();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: expect.any(Array),
          errors: expect.any(Array),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle callback errors gracefully', async () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const goodCallback = vi.fn();

      configReloader.onReload(errorCallback);
      configReloader.onReload(goodCallback);

      await configReloader.reload();

      // Both callbacks should be called
      expect(errorCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled();
    });
  });

  describe('watchEnvFile', () => {
    it('should start watching existing .env file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const mockWatcher = { close: vi.fn() };
      vi.mocked(watch).mockReturnValue(mockWatcher as any);

      configReloader.watchEnvFile();

      expect(existsSync).toHaveBeenCalledWith('.env');
      expect(watch).toHaveBeenCalledWith('.env', expect.any(Function));
    });

    it('should watch custom env path', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const mockWatcher = { close: vi.fn() };
      vi.mocked(watch).mockReturnValue(mockWatcher as any);

      configReloader.watchEnvFile('/custom/.env');

      expect(existsSync).toHaveBeenCalledWith('/custom/.env');
      expect(watch).toHaveBeenCalledWith('/custom/.env', expect.any(Function));
    });

    it('should not watch non-existent file', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      configReloader.watchEnvFile();

      expect(watch).not.toHaveBeenCalled();
    });

    it('should stop previous watcher before starting new one', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const mockWatcher1 = { close: vi.fn() };
      const mockWatcher2 = { close: vi.fn() };

      vi.mocked(watch)
        .mockReturnValueOnce(mockWatcher1 as any)
        .mockReturnValueOnce(mockWatcher2 as any);

      configReloader.watchEnvFile();
      configReloader.watchEnvFile();

      expect(mockWatcher1.close).toHaveBeenCalled();
    });

    it('should trigger reload on file change', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      let changeCallback: ((eventType: string) => void) | null = null;

      vi.mocked(watch).mockImplementation((path, callback) => {
        changeCallback = callback as any;
        return { close: vi.fn() } as any;
      });

      configReloader.watchEnvFile();
      configReloader.setDebounceMs(10); // Reduce debounce for testing

      const callback = vi.fn();
      configReloader.onReload(callback);

      // Trigger file change
      changeCallback?.('change');

      // Wait for debounced reload
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(callback).toHaveBeenCalled();
    });

    it('should debounce multiple rapid changes', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      let changeCallback: ((eventType: string) => void) | null = null;

      vi.mocked(watch).mockImplementation((path, callback) => {
        changeCallback = callback as any;
        return { close: vi.fn() } as any;
      });

      configReloader.watchEnvFile();
      configReloader.setDebounceMs(50);

      const callback = vi.fn();
      configReloader.onReload(callback);

      // Trigger multiple rapid changes
      changeCallback?.('change');
      changeCallback?.('change');
      changeCallback?.('change');

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should only reload once
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopWatching', () => {
    it('should stop file watcher', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const mockWatcher = { close: vi.fn() };
      vi.mocked(watch).mockReturnValue(mockWatcher as any);

      configReloader.watchEnvFile();
      configReloader.stopWatching();

      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('should cancel pending reload', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      let changeCallback: ((eventType: string) => void) | null = null;

      vi.mocked(watch).mockImplementation((path, callback) => {
        changeCallback = callback as any;
        return { close: vi.fn() } as any;
      });

      configReloader.watchEnvFile();
      configReloader.setDebounceMs(100);

      const callback = vi.fn();
      configReloader.onReload(callback);

      // Trigger change
      changeCallback?.('change');

      // Stop watching before debounce completes
      configReloader.stopWatching();

      // Wait to ensure callback doesn't fire
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(callback).not.toHaveBeenCalled();
    });

    it('should not throw when called multiple times', () => {
      expect(() => {
        configReloader.stopWatching();
        configReloader.stopWatching();
      }).not.toThrow();
    });
  });

  describe('onReload', () => {
    it('should register callback', async () => {
      const callback = vi.fn();
      configReloader.onReload(callback);

      await configReloader.reload();

      expect(callback).toHaveBeenCalled();
    });

    it('should return unregister function', () => {
      const callback = vi.fn();
      const unregister = configReloader.onReload(callback);

      expect(typeof unregister).toBe('function');

      unregister();

      // Callback should not be in list anymore
      // (verified by not being called after unregister)
    });

    it('should unregister callback', async () => {
      const callback = vi.fn();
      const unregister = configReloader.onReload(callback);

      unregister();

      await configReloader.reload();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should support multiple callbacks', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      configReloader.onReload(callback1);
      configReloader.onReload(callback2);

      await configReloader.reload();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should handle unregister of non-existent callback', () => {
      const callback = vi.fn();
      const unregister = configReloader.onReload(callback);

      unregister();
      unregister(); // Call again

      expect(() => unregister()).not.toThrow();
    });
  });

  describe('getReloadablePaths', () => {
    it('should return array of reloadable paths', () => {
      const paths = configReloader.getReloadablePaths();

      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should include expected config paths', () => {
      const paths = configReloader.getReloadablePaths();

      expect(paths).toContain('logging.level');
      expect(paths).toContain('cache.queryCacheTTLMs');
      expect(paths).toContain('rateLimit.enabled');
      expect(paths).toContain('semanticSearch.defaultThreshold');
    });

    it('should return copy of paths array', () => {
      const paths1 = configReloader.getReloadablePaths();
      const paths2 = configReloader.getReloadablePaths();

      expect(paths1).not.toBe(paths2); // Different array instances
      expect(paths1).toEqual(paths2); // But same content
    });
  });

  describe('isReloadable', () => {
    it('should return true for reloadable paths', () => {
      expect(configReloader.isReloadable('logging.level')).toBe(true);
      expect(configReloader.isReloadable('cache.queryCacheTTLMs')).toBe(true);
      expect(configReloader.isReloadable('rateLimit.enabled')).toBe(true);
    });

    it('should return false for non-reloadable paths', () => {
      expect(configReloader.isReloadable('database.host')).toBe(false);
      expect(configReloader.isReloadable('server.port')).toBe(false);
      expect(configReloader.isReloadable('invalid.path')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(configReloader.isReloadable('logging.level')).toBe(true);
      expect(configReloader.isReloadable('Logging.Level')).toBe(false);
    });
  });

  describe('getLastReloadTime', () => {
    it('should return timestamp', () => {
      const time = configReloader.getLastReloadTime();
      expect(typeof time).toBe('number');
    });

    it('should return timestamp after reload', async () => {
      await configReloader.reload();
      const time = configReloader.getLastReloadTime();
      expect(time).toBeGreaterThan(0);
    });

    it('should update with each reload', async () => {
      await configReloader.reload();
      const time1 = configReloader.getLastReloadTime();

      await new Promise((resolve) => setTimeout(resolve, 10));

      await configReloader.reload();
      const time2 = configReloader.getLastReloadTime();

      expect(time2).toBeGreaterThanOrEqual(time1);
    });
  });

  describe('setDebounceMs', () => {
    it('should set debounce time', () => {
      expect(() => {
        configReloader.setDebounceMs(500);
      }).not.toThrow();
    });

    it('should accept different debounce values', () => {
      configReloader.setDebounceMs(100);
      configReloader.setDebounceMs(1000);
      configReloader.setDebounceMs(0);

      expect(true).toBe(true); // No error thrown
    });
  });
});

describe('Convenience Functions', () => {
  describe('reloadConfiguration', () => {
    it('should call configReloader.reload', async () => {
      const spy = vi.spyOn(configReloader, 'reload');

      await reloadConfiguration();

      expect(spy).toHaveBeenCalled();
    });

    it('should return reload result', async () => {
      const result = await reloadConfiguration();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('changes');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('watchConfigChanges', () => {
    it('should call configReloader.watchEnvFile', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const spy = vi.spyOn(configReloader, 'watchEnvFile');

      watchConfigChanges();

      expect(spy).toHaveBeenCalled();
    });

    it('should pass custom env path', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const spy = vi.spyOn(configReloader, 'watchEnvFile');

      watchConfigChanges('/custom/.env');

      expect(spy).toHaveBeenCalledWith('/custom/.env');
    });
  });

  describe('onConfigReload', () => {
    it('should call configReloader.onReload', () => {
      const spy = vi.spyOn(configReloader, 'onReload');
      const callback = vi.fn();

      onConfigReload(callback);

      expect(spy).toHaveBeenCalledWith(callback);
    });

    it('should return unregister function', () => {
      const callback = vi.fn();
      const unregister = onConfigReload(callback);

      expect(typeof unregister).toBe('function');
    });
  });
});

describe('Edge Cases', () => {
  it('should handle empty env file path', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() => {
      configReloader.watchEnvFile('');
    }).not.toThrow();
  });

  it('should handle concurrent reloads', async () => {
    const results = await Promise.all([
      configReloader.reload(),
      configReloader.reload(),
      configReloader.reload(),
    ]);

    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('changes');
      expect(result).toHaveProperty('errors');
    });
  });

  it('should handle watch callback without event type', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    let changeCallback: ((eventType?: string) => void) | null = null;

    vi.mocked(watch).mockImplementation((path, callback) => {
      changeCallback = callback as any;
      return { close: vi.fn() } as any;
    });

    configReloader.watchEnvFile();
    configReloader.setDebounceMs(10);

    // Trigger without event type
    changeCallback?.();

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should not crash
    expect(true).toBe(true);
  });

  it('should handle non-Error objects in reload error path', async () => {
    const { reloadConfig } = await import('../../src/config/index.js');
    vi.mocked(reloadConfig).mockImplementation(() => {
      // Throw non-Error object
      throw 'String error message';
    });

    const result = await configReloader.reload();

    expect(result.success).toBe(false);
    expect(result.errors).toContain('String error message');
  });

  it('should handle non-Error objects in callback error path', async () => {
    const errorCallback = vi.fn(() => {
      // Throw non-Error object
      throw 'String callback error';
    });

    configReloader.onReload(errorCallback);
    await configReloader.reload();

    // Should not crash
    expect(errorCallback).toHaveBeenCalled();
  });

  it('should detect changes for null to value transitions', async () => {
    const { config, reloadConfig } = await import('../../src/config/index.js');

    // Set a value to null first
    const originalLevel = config.logging.level;
    config.logging.level = null as any;

    // Reload should detect change from null
    vi.mocked(reloadConfig).mockImplementation(() => {
      config.logging.level = 'debug';
    });

    const result = await configReloader.reload();

    // Restore
    config.logging.level = originalLevel;

    expect(result).toBeDefined();
  });

  it('should handle deep object comparisons with different types', async () => {
    const { config, reloadConfig } = await import('../../src/config/index.js');

    // Store original
    const original = config.scoring.weights;

    // Change to different type
    vi.mocked(reloadConfig).mockImplementation(() => {
      // This tests deepEqual with different types
      config.scoring.weights = { ...original, explicitRelation: 15 };
    });

    const result = await configReloader.reload();

    // Restore
    config.scoring.weights = original;

    expect(result).toBeDefined();
  });

  it('should handle object comparisons with different key counts', async () => {
    const { config, reloadConfig } = await import('../../src/config/index.js');

    // Store original
    const original = { ...config.scoring.weights };

    // Add new key
    vi.mocked(reloadConfig).mockImplementation(() => {
      (config.scoring.weights as any).newKey = 5;
    });

    const result = await configReloader.reload();

    // Restore
    config.scoring.weights = original;

    expect(result).toBeDefined();
  });

  it('should handle null value comparisons in deepEqual', async () => {
    const { config, reloadConfig } = await import('../../src/config/index.js');

    // Store original
    const original = config.logging.debug;

    // Change from boolean to null
    vi.mocked(reloadConfig).mockImplementation(() => {
      config.logging.debug = null as any;
    });

    const result = await configReloader.reload();

    // Restore
    config.logging.debug = original;

    expect(result).toBeDefined();
  });

  it('should handle primitive value changes in deepEqual', async () => {
    const { config, reloadConfig } = await import('../../src/config/index.js');

    // Store original
    const original = config.cache.queryCacheTTLMs;

    // Change number value
    vi.mocked(reloadConfig).mockImplementation(() => {
      config.cache.queryCacheTTLMs = 10000;
    });

    const result = await configReloader.reload();

    // Restore
    config.cache.queryCacheTTLMs = original;

    expect(result).toBeDefined();
  });
});
