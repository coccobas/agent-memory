/**
 * Unit tests for forgetting configuration schema
 */

import { describe, it, expect } from 'vitest';
import {
  forgettingConfigSchema,
  forgettingEnvMappings,
} from '../../src/config/registry/sections/forgetting.js';

describe('forgettingConfigSchema', () => {
  describe('defaults', () => {
    it('should provide default values', () => {
      const result = forgettingConfigSchema.parse({});

      expect(result.enabled).toBe(false);
      expect(result.schedule).toBe('0 3 * * *');
      expect(result.dryRunDefault).toBe(true);
      expect(result.maxEntriesPerRun).toBe(100);
      expect(result.excludeCritical).toBe(true);
      expect(result.excludeHighPriority).toBe(90);
    });

    it('should provide recency defaults', () => {
      const result = forgettingConfigSchema.parse({});

      expect(result.recency.enabled).toBe(true);
      expect(result.recency.staleDays).toBe(90);
      expect(result.recency.threshold).toBe(0.3);
    });

    it('should provide frequency defaults', () => {
      const result = forgettingConfigSchema.parse({});

      expect(result.frequency.enabled).toBe(true);
      expect(result.frequency.minAccessCount).toBe(2);
      expect(result.frequency.lookbackDays).toBe(180);
    });

    it('should provide importance defaults', () => {
      const result = forgettingConfigSchema.parse({});

      expect(result.importance.enabled).toBe(true);
      expect(result.importance.threshold).toBe(0.4);
    });
  });

  describe('validation', () => {
    it('should accept valid configuration', () => {
      const config = {
        enabled: true,
        schedule: '0 0 * * 0',
        recency: {
          enabled: true,
          staleDays: 30,
          threshold: 0.5,
        },
        frequency: {
          enabled: false,
          minAccessCount: 5,
          lookbackDays: 365,
        },
        importance: {
          enabled: true,
          threshold: 0.2,
        },
        dryRunDefault: false,
        maxEntriesPerRun: 50,
        excludeCritical: false,
        excludeHighPriority: 80,
      };

      const result = forgettingConfigSchema.parse(config);
      expect(result.enabled).toBe(true);
      expect(result.recency.staleDays).toBe(30);
    });

    it('should reject invalid staleDays', () => {
      expect(() =>
        forgettingConfigSchema.parse({
          recency: { staleDays: 0 },
        })
      ).toThrow();
    });

    it('should reject threshold out of range', () => {
      expect(() =>
        forgettingConfigSchema.parse({
          recency: { threshold: 1.5 },
        })
      ).toThrow();
    });

    it('should reject negative minAccessCount', () => {
      expect(() =>
        forgettingConfigSchema.parse({
          frequency: { minAccessCount: -1 },
        })
      ).toThrow();
    });

    it('should reject excludeHighPriority out of range', () => {
      expect(() =>
        forgettingConfigSchema.parse({
          excludeHighPriority: 150,
        })
      ).toThrow();
    });
  });
});

describe('forgettingEnvMappings', () => {
  it('should have all expected environment variable mappings', () => {
    expect(forgettingEnvMappings.enabled).toBe('AGENT_MEMORY_FORGETTING_ENABLED');
    expect(forgettingEnvMappings.schedule).toBe('AGENT_MEMORY_FORGETTING_SCHEDULE');
    expect(forgettingEnvMappings['recency.enabled']).toBe(
      'AGENT_MEMORY_FORGETTING_RECENCY_ENABLED'
    );
    expect(forgettingEnvMappings['recency.staleDays']).toBe(
      'AGENT_MEMORY_FORGETTING_RECENCY_STALE_DAYS'
    );
    expect(forgettingEnvMappings['recency.threshold']).toBe(
      'AGENT_MEMORY_FORGETTING_RECENCY_THRESHOLD'
    );
    expect(forgettingEnvMappings['frequency.enabled']).toBe(
      'AGENT_MEMORY_FORGETTING_FREQUENCY_ENABLED'
    );
    expect(forgettingEnvMappings['frequency.minAccessCount']).toBe(
      'AGENT_MEMORY_FORGETTING_FREQUENCY_MIN_ACCESS'
    );
    expect(forgettingEnvMappings['frequency.lookbackDays']).toBe(
      'AGENT_MEMORY_FORGETTING_FREQUENCY_LOOKBACK_DAYS'
    );
    expect(forgettingEnvMappings['importance.enabled']).toBe(
      'AGENT_MEMORY_FORGETTING_IMPORTANCE_ENABLED'
    );
    expect(forgettingEnvMappings['importance.threshold']).toBe(
      'AGENT_MEMORY_FORGETTING_IMPORTANCE_THRESHOLD'
    );
    expect(forgettingEnvMappings.dryRunDefault).toBe('AGENT_MEMORY_FORGETTING_DRY_RUN_DEFAULT');
    expect(forgettingEnvMappings.maxEntriesPerRun).toBe('AGENT_MEMORY_FORGETTING_MAX_ENTRIES');
    expect(forgettingEnvMappings.excludeCritical).toBe('AGENT_MEMORY_FORGETTING_EXCLUDE_CRITICAL');
    expect(forgettingEnvMappings.excludeHighPriority).toBe(
      'AGENT_MEMORY_FORGETTING_EXCLUDE_HIGH_PRIORITY'
    );
  });
});
