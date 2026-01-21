/**
 * Tests for StaleContextDetector
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  StaleContextDetector,
  createStaleContextDetector,
  type StalenessEntry,
  type StaleDetectorConfig,
  DEFAULT_STALE_DETECTOR_CONFIG,
} from '../../../src/services/context/stale-detector.js';

describe('StaleContextDetector', () => {
  let detector: StaleContextDetector;

  beforeEach(() => {
    detector = createStaleContextDetector();
  });

  describe('analyze', () => {
    it('should return all entries as valid when none are stale', () => {
      const entries: StalenessEntry[] = [
        {
          id: 'entry-1',
          type: 'guideline',
          title: 'Fresh Entry',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'entry-2',
          type: 'knowledge',
          title: 'Another Fresh Entry',
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
        },
      ];

      const result = detector.analyze(entries);

      expect(result.validEntries).toHaveLength(2);
      expect(result.excludedEntries).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.stats.staleCount).toBe(0);
    });

    it('should detect old entries as stale', () => {
      const entries: StalenessEntry[] = [
        {
          id: 'old-entry',
          type: 'guideline',
          title: 'Old Entry',
          createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(), // 120 days ago
        },
      ];

      const result = detector.analyze(entries);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].reason).toBe('old_age');
      expect(result.warnings[0].ageDays).toBeGreaterThan(90);
      expect(result.stats.staleCount).toBe(1);
    });

    it('should detect entries not accessed recently', () => {
      const config: Partial<StaleDetectorConfig> = {
        notAccessedDays: 30,
      };
      const customDetector = createStaleContextDetector(config);

      const entries: StalenessEntry[] = [
        {
          id: 'not-accessed',
          type: 'knowledge',
          title: 'Not Accessed',
          createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
          accessedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days ago
        },
      ];

      const result = customDetector.analyze(entries);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].reason).toBe('not_accessed');
    });

    it('should exclude stale entries when excludeFromInjection is true', () => {
      const config: Partial<StaleDetectorConfig> = {
        excludeFromInjection: true,
        staleAgeDays: 30,
      };
      const customDetector = createStaleContextDetector(config);

      const entries: StalenessEntry[] = [
        {
          id: 'fresh',
          type: 'guideline',
          title: 'Fresh',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'old',
          type: 'guideline',
          title: 'Old',
          createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
        },
      ];

      const result = customDetector.analyze(entries);

      expect(result.validEntries).toHaveLength(1);
      expect(result.validEntries[0].id).toBe('fresh');
      expect(result.excludedEntries).toHaveLength(1);
      expect(result.excludedEntries[0].id).toBe('old');
      expect(result.stats.excludedCount).toBe(1);
    });

    it('should skip analysis when disabled', () => {
      const config: Partial<StaleDetectorConfig> = {
        enabled: false,
      };
      const disabledDetector = createStaleContextDetector(config);

      const entries: StalenessEntry[] = [
        {
          id: 'old-entry',
          type: 'guideline',
          createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(), // 200 days ago
        },
      ];

      const result = disabledDetector.analyze(entries);

      expect(result.validEntries).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
      expect(result.stats.staleCount).toBe(0);
    });
  });

  describe('analyzeEntry', () => {
    it('should return null for fresh entry', () => {
      const entry: StalenessEntry = {
        id: 'fresh',
        type: 'guideline',
        createdAt: new Date().toISOString(),
      };

      const warning = detector.analyzeEntry(entry);

      expect(warning).toBeNull();
    });

    it('should return warning for stale entry', () => {
      const entry: StalenessEntry = {
        id: 'stale',
        type: 'knowledge',
        title: 'Old Knowledge',
        createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days ago
      };

      const warning = detector.analyzeEntry(entry);

      expect(warning).not.toBeNull();
      expect(warning?.entryId).toBe('stale');
      expect(warning?.reason).toBe('old_age');
      expect(warning?.recommendation).toContain('Knowledge');
    });
  });

  describe('shouldExclude', () => {
    it('should return false when excludeFromInjection is disabled', () => {
      const entry: StalenessEntry = {
        id: 'old',
        type: 'guideline',
        createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
      };

      // Default config has excludeFromInjection: false
      expect(detector.shouldExclude(entry)).toBe(false);
    });

    it('should return true for stale entry when excludeFromInjection is enabled', () => {
      const config: Partial<StaleDetectorConfig> = {
        excludeFromInjection: true,
        staleAgeDays: 30,
      };
      const customDetector = createStaleContextDetector(config);

      const entry: StalenessEntry = {
        id: 'old',
        type: 'guideline',
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
      };

      expect(customDetector.shouldExclude(entry)).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = detector.getConfig();

      expect(config.enabled).toBe(DEFAULT_STALE_DETECTOR_CONFIG.enabled);
      expect(config.staleAgeDays).toBe(DEFAULT_STALE_DETECTOR_CONFIG.staleAgeDays);
      expect(config.recencyThreshold).toBe(DEFAULT_STALE_DETECTOR_CONFIG.recencyThreshold);
    });
  });

  describe('recommendation generation', () => {
    it('should generate appropriate recommendation for old_age', () => {
      const entry: StalenessEntry = {
        id: 'old',
        type: 'tool',
        title: 'Old Tool',
        createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const warning = detector.analyzeEntry(entry);

      expect(warning?.recommendation).toContain('Tool');
      expect(warning?.recommendation).toContain('days ago');
      expect(warning?.recommendation).toContain('reviewing');
    });
  });
});
