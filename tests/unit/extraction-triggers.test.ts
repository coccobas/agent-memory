/**
 * Extraction Triggers Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExtractionTriggersService,
  getExtractionTriggersService,
  resetExtractionTriggersService,
  type TriggerType,
} from '../../src/services/capture/triggers.js';

describe('ExtractionTriggersService', () => {
  let service: ExtractionTriggersService;

  beforeEach(() => {
    resetExtractionTriggersService();
    service = new ExtractionTriggersService();
  });

  describe('detect()', () => {
    it('should return empty result for empty text', () => {
      const result = service.detect('');
      expect(result.triggers).toHaveLength(0);
      expect(result.shouldExtract).toBe(false);
    });

    it('should return empty result for null/undefined', () => {
      const result = service.detect(null as unknown as string);
      expect(result.triggers).toHaveLength(0);
    });

    it('should detect correction triggers', () => {
      const text = "No, actually that's wrong. The correct way is to use async/await.";
      const result = service.detect(text);

      expect(result.triggers.length).toBeGreaterThan(0);
      const correctionTriggers = result.triggers.filter((t) => t.type === 'correction');
      expect(correctionTriggers.length).toBeGreaterThan(0);
      expect(correctionTriggers[0].suggestedType).toBe('knowledge');
    });

    it('should detect recovery triggers', () => {
      const text = 'After debugging, I found the issue was a race condition. Fixed it by adding a mutex.';
      const result = service.detect(text);

      const recoveryTriggers = result.triggers.filter((t) => t.type === 'recovery');
      expect(recoveryTriggers.length).toBeGreaterThan(0);
      expect(recoveryTriggers[0].suggestedType).toBe('experience');
    });

    it('should detect enthusiasm triggers', () => {
      const text = 'Perfect! This is exactly what I needed. Love it!';
      const result = service.detect(text);

      const enthusiasmTriggers = result.triggers.filter((t) => t.type === 'enthusiasm');
      expect(enthusiasmTriggers.length).toBeGreaterThan(0);
    });

    it('should detect decision triggers', () => {
      const text = "We decided to use PostgreSQL because of its JSONB support. Let's go with that.";
      const result = service.detect(text);

      const decisionTriggers = result.triggers.filter((t) => t.type === 'decision');
      expect(decisionTriggers.length).toBeGreaterThan(0);
      expect(decisionTriggers[0].suggestedType).toBe('knowledge');
    });

    it('should detect rule triggers', () => {
      const text = 'Always use TypeScript strict mode. Never commit secrets to the repo.';
      const result = service.detect(text);

      const ruleTriggers = result.triggers.filter((t) => t.type === 'rule');
      expect(ruleTriggers.length).toBeGreaterThan(0);
      expect(ruleTriggers[0].suggestedType).toBe('guideline');
      expect(ruleTriggers[0].priorityBoost).toBe(40);
    });

    it('should detect command triggers', () => {
      const text = 'Run this command: `npm run build`. Use the command to compile.';
      const result = service.detect(text);

      const commandTriggers = result.triggers.filter((t) => t.type === 'command');
      expect(commandTriggers.length).toBeGreaterThan(0);
      expect(commandTriggers[0].suggestedType).toBe('tool');
    });

    it('should detect preference triggers', () => {
      const text = 'I prefer to use functional components. Please always format with Prettier.';
      const result = service.detect(text);

      const preferenceTriggers = result.triggers.filter((t) => t.type === 'preference');
      expect(preferenceTriggers.length).toBeGreaterThan(0);
    });

    it('should calculate total priority boost', () => {
      const text = 'Always use strict mode. We decided to use React.';
      const result = service.detect(text);

      expect(result.totalPriorityBoost).toBeGreaterThan(0);
    });

    it('should set hasHighConfidenceTriggers correctly', () => {
      const text = 'Always use TypeScript. Never skip tests.';
      const result = service.detect(text);

      expect(result.hasHighConfidenceTriggers).toBe(true);
    });

    it('should recommend extraction for high-confidence triggers', () => {
      const text = "No, that's wrong. The correct approach is to use dependency injection.";
      const result = service.detect(text);

      expect(result.shouldExtract).toBe(true);
    });

    it('should not recommend extraction for plain text', () => {
      const text = 'The weather is nice today.';
      const result = service.detect(text);

      expect(result.shouldExtract).toBe(false);
    });

    it('should sort triggers by position', () => {
      const text = 'Always use strict mode. Never skip tests. We decided to use React.';
      const result = service.detect(text);

      for (let i = 1; i < result.triggers.length; i++) {
        expect(result.triggers[i].spanStart).toBeGreaterThanOrEqual(
          result.triggers[i - 1].spanStart
        );
      }
    });

    it('should include matched text in triggers', () => {
      const text = "No, actually that's not right.";
      const result = service.detect(text);

      expect(result.triggers.length).toBeGreaterThan(0);
      expect(result.triggers[0].matchedText).toBeTruthy();
      expect(text.includes(result.triggers[0].matchedText)).toBe(true);
    });
  });

  describe('detectType()', () => {
    it('should only return triggers of specified type', () => {
      const text = 'Always use TypeScript. We decided to use React. Perfect!';
      const ruleTriggers = service.detectType(text, 'rule');

      expect(ruleTriggers.every((t) => t.type === 'rule')).toBe(true);
    });

    it('should return empty array if type not found', () => {
      const text = 'The weather is nice.';
      const result = service.detectType(text, 'correction');

      expect(result).toHaveLength(0);
    });
  });

  describe('hasTriggers()', () => {
    it('should return true when triggers exist', () => {
      const text = 'Always use strict mode.';
      expect(service.hasTriggers(text)).toBe(true);
    });

    it('should return false when no triggers exist', () => {
      const text = 'The sky is blue.';
      expect(service.hasTriggers(text)).toBe(false);
    });

    it('should return false for empty text', () => {
      expect(service.hasTriggers('')).toBe(false);
    });
  });

  describe('getDominantSuggestedType()', () => {
    it('should return null for empty triggers', () => {
      expect(service.getDominantSuggestedType([])).toBeNull();
    });

    it('should return type with highest priority boost', () => {
      const text = 'Always use strict mode. Never skip linting. Must always test.';
      const result = service.detect(text);
      const dominantType = service.getDominantSuggestedType(result.triggers);

      // Rules have highest priority boost (40), so guideline should dominate
      expect(dominantType).toBe('guideline');
    });

    it('should handle mixed trigger types', () => {
      const text = 'Fixed the bug by adding a retry. Always retry on failure.';
      const result = service.detect(text);
      const dominantType = service.getDominantSuggestedType(result.triggers);

      expect(dominantType).toBeTruthy();
    });
  });

  describe('getExtractionPriority()', () => {
    it('should return 0 for empty triggers', () => {
      expect(service.getExtractionPriority([])).toBe(0);
    });

    it('should sum priority boosts', () => {
      const text = 'Always use strict mode. We decided to use React.';
      const result = service.detect(text);
      const priority = service.getExtractionPriority(result.triggers);

      expect(priority).toBeGreaterThan(0);
      expect(priority).toBe(result.totalPriorityBoost);
    });

    it('should cap at 100', () => {
      // Create many triggers to exceed 100
      const text = `
        Always use TypeScript. Never skip tests. Must always lint.
        We decided to use React. Let's go with PostgreSQL.
        Fixed the bug. The solution was to add caching.
        Perfect! Exactly what I needed! Love it!
      `;
      const result = service.detect(text);
      const priority = service.getExtractionPriority(result.triggers);

      expect(priority).toBeLessThanOrEqual(100);
    });
  });

  describe('getSupportedTriggerTypes()', () => {
    it('should return all trigger types', () => {
      const types = service.getSupportedTriggerTypes();

      expect(types).toContain('correction');
      expect(types).toContain('recovery');
      expect(types).toContain('enthusiasm');
      expect(types).toContain('decision');
      expect(types).toContain('rule');
      expect(types).toContain('command');
      expect(types).toContain('preference');
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = getExtractionTriggersService();
      const instance2 = getExtractionTriggersService();

      expect(instance1).toBe(instance2);
    });

    it('should reset correctly', () => {
      const instance1 = getExtractionTriggersService();
      resetExtractionTriggersService();
      const instance2 = getExtractionTriggersService();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('real-world examples', () => {
    it('should detect error recovery pattern', () => {
      const text = `
        I was getting "ECONNREFUSED" errors when connecting to the database.
        After investigating, the root cause was that the connection pool was exhausted.
        The fix was to increase the pool size from 5 to 20. That resolved the issue.
      `;
      const result = service.detect(text);

      expect(result.shouldExtract).toBe(true);
      const recoveryTriggers = result.triggers.filter((t) => t.type === 'recovery');
      expect(recoveryTriggers.length).toBeGreaterThan(0);
    });

    it('should detect coding standard establishment', () => {
      const text = `
        For this project, we're establishing some coding standards:
        - Always use TypeScript strict mode
        - Never use 'any' type
        - Always include unit tests for new functions
        - Must always run linting before commit
      `;
      const result = service.detect(text);

      expect(result.shouldExtract).toBe(true);
      expect(result.hasHighConfidenceTriggers).toBe(true);
      const ruleTriggers = result.triggers.filter((t) => t.type === 'rule');
      expect(ruleTriggers.length).toBeGreaterThanOrEqual(3);
    });

    it('should detect technology decision', () => {
      const text = `
        After considering the options, we decided to use PostgreSQL for the database.
        Let's go with Redis for caching. The choice was based on our team's expertise.
      `;
      const result = service.detect(text);

      expect(result.shouldExtract).toBe(true);
      const decisionTriggers = result.triggers.filter((t) => t.type === 'decision');
      expect(decisionTriggers.length).toBeGreaterThan(0);
    });
  });
});
