/**
 * Tests for Smart Prioritization Types and Configuration
 *
 * TDD: Write tests first, then implement types.ts to make them pass.
 */

import { describe, it, expect } from 'vitest';
import {
  createDefaultSmartPriorityConfig,
  validateSmartPriorityConfig,
  type SmartPriorityConfig,
  type SmartPriorityResult,
  ENTRY_TYPES,
} from '../../../src/services/prioritization/types.js';

describe('Smart Prioritization Types', () => {
  describe('createDefaultSmartPriorityConfig', () => {
    it('should provide sensible defaults', () => {
      const config = createDefaultSmartPriorityConfig();

      expect(config.enabled).toBe(true);
      expect(config.adaptiveWeights.enabled).toBe(true);
      expect(config.usefulness.enabled).toBe(true);
      expect(config.contextSimilarity.enabled).toBe(true);
    });

    it('should have adaptive weights defaults', () => {
      const config = createDefaultSmartPriorityConfig();

      expect(config.adaptiveWeights.minSamplesForAdaptation).toBe(10);
      expect(config.adaptiveWeights.learningRate).toBe(0.1);
      expect(config.adaptiveWeights.lookbackDays).toBe(30);
    });

    it('should have usefulness defaults', () => {
      const config = createDefaultSmartPriorityConfig();

      expect(config.usefulness.retrievalWeight).toBe(0.3);
      expect(config.usefulness.successWeight).toBe(0.5);
      expect(config.usefulness.recencyWeight).toBe(0.2);
    });

    it('should have context similarity defaults', () => {
      const config = createDefaultSmartPriorityConfig();

      expect(config.contextSimilarity.similarityThreshold).toBe(0.7);
      expect(config.contextSimilarity.maxContextsToConsider).toBe(50);
      expect(config.contextSimilarity.boostMultiplier).toBe(1.2);
    });

    it('should have composite influence weights summing to 1.0', () => {
      const config = createDefaultSmartPriorityConfig();

      const sum =
        config.composite.adaptiveWeightInfluence +
        config.composite.usefulnessInfluence +
        config.composite.contextSimilarityInfluence;

      expect(sum).toBe(1.0);
    });

    it('should have default composite weights of 0.4, 0.3, 0.3', () => {
      const config = createDefaultSmartPriorityConfig();

      expect(config.composite.adaptiveWeightInfluence).toBe(0.4);
      expect(config.composite.usefulnessInfluence).toBe(0.3);
      expect(config.composite.contextSimilarityInfluence).toBe(0.3);
    });
  });

  describe('validateSmartPriorityConfig', () => {
    it('should validate weight ranges between 0 and 1', () => {
      const invalidConfig: SmartPriorityConfig = {
        ...createDefaultSmartPriorityConfig(),
        usefulness: {
          enabled: true,
          retrievalWeight: 1.5, // Invalid: > 1
          successWeight: 0.5,
          recencyWeight: 0.2,
        },
      };

      const result = validateSmartPriorityConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('usefulness.retrievalWeight must be between 0 and 1');
    });

    it('should validate negative weights', () => {
      const invalidConfig: SmartPriorityConfig = {
        ...createDefaultSmartPriorityConfig(),
        composite: {
          adaptiveWeightInfluence: -0.1, // Invalid: < 0
          usefulnessInfluence: 0.5,
          contextSimilarityInfluence: 0.6,
        },
      };

      const result = validateSmartPriorityConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('composite.adaptiveWeightInfluence must be between 0 and 1');
    });

    it('should validate positive config values', () => {
      const invalidConfig: SmartPriorityConfig = {
        ...createDefaultSmartPriorityConfig(),
        adaptiveWeights: {
          enabled: true,
          minSamplesForAdaptation: -5, // Invalid: negative
          learningRate: 0.1,
          lookbackDays: 30,
        },
      };

      const result = validateSmartPriorityConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('adaptiveWeights.minSamplesForAdaptation must be positive');
    });

    it('should accept valid config', () => {
      const validConfig = createDefaultSmartPriorityConfig();

      const result = validateSmartPriorityConfig(validConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate context similarity threshold', () => {
      const invalidConfig: SmartPriorityConfig = {
        ...createDefaultSmartPriorityConfig(),
        contextSimilarity: {
          enabled: true,
          similarityThreshold: 1.5, // Invalid: > 1
          maxContextsToConsider: 50,
          boostMultiplier: 1.2,
        },
      };

      const result = validateSmartPriorityConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'contextSimilarity.similarityThreshold must be between 0 and 1'
      );
    });

    it('should validate boost multiplier is >= 1', () => {
      const invalidConfig: SmartPriorityConfig = {
        ...createDefaultSmartPriorityConfig(),
        contextSimilarity: {
          enabled: true,
          similarityThreshold: 0.7,
          maxContextsToConsider: 50,
          boostMultiplier: 0.5, // Invalid: < 1 (would be a penalty, not boost)
        },
      };

      const result = validateSmartPriorityConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('contextSimilarity.boostMultiplier must be >= 1');
    });
  });

  describe('ENTRY_TYPES constant', () => {
    it('should include all entry types', () => {
      expect(ENTRY_TYPES).toContain('guideline');
      expect(ENTRY_TYPES).toContain('knowledge');
      expect(ENTRY_TYPES).toContain('tool');
      expect(ENTRY_TYPES).toContain('experience');
    });

    it('should have exactly 4 entry types', () => {
      expect(ENTRY_TYPES).toHaveLength(4);
    });
  });

  describe('SmartPriorityResult type', () => {
    it('should have correct structure', () => {
      const result: SmartPriorityResult = {
        entryId: 'entry-123',
        entryType: 'guideline',
        adaptiveWeight: 1.15,
        usefulnessScore: 0.8,
        contextSimilarityBoost: 1.1,
        compositePriorityScore: 0.95,
      };

      expect(result.entryId).toBe('entry-123');
      expect(result.entryType).toBe('guideline');
      expect(result.adaptiveWeight).toBe(1.15);
      expect(result.usefulnessScore).toBe(0.8);
      expect(result.contextSimilarityBoost).toBe(1.1);
      expect(result.compositePriorityScore).toBe(0.95);
    });

    it('should accept all valid entry types', () => {
      const types = ['guideline', 'knowledge', 'tool', 'experience'] as const;

      for (const type of types) {
        const result: SmartPriorityResult = {
          entryId: 'entry-123',
          entryType: type,
          adaptiveWeight: 1.0,
          usefulnessScore: 0.5,
          contextSimilarityBoost: 1.0,
          compositePriorityScore: 0.5,
        };

        expect(result.entryType).toBe(type);
      }
    });
  });
});
