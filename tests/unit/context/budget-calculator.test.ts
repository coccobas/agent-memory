/**
 * Tests for DynamicBudgetCalculator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DynamicBudgetCalculator,
  createBudgetCalculator,
  type BudgetEntry,
  type BudgetCalculatorConfig,
  DEFAULT_BUDGET_CONFIG,
  COMPLEXITY_MULTIPLIERS,
  INTENT_COMPLEXITY_MAP,
} from '../../../src/services/context/budget-calculator.js';

describe('DynamicBudgetCalculator', () => {
  let calculator: DynamicBudgetCalculator;

  beforeEach(() => {
    calculator = createBudgetCalculator();
  });

  describe('calculate', () => {
    it('should return base budget for simple intent', () => {
      const result = calculator.calculate('lookup');

      expect(result.complexity).toBe('simple');
      expect(result.multiplier).toBe(COMPLEXITY_MULTIPLIERS.simple);
      expect(result.totalBudget).toBe(DEFAULT_BUDGET_CONFIG.baseBudget);
    });

    it('should return higher budget for complex intent (debug)', () => {
      const result = calculator.calculate('debug');

      expect(result.complexity).toBe('complex');
      expect(result.multiplier).toBe(COMPLEXITY_MULTIPLIERS.complex);
      expect(result.totalBudget).toBe(
        Math.min(
          DEFAULT_BUDGET_CONFIG.baseBudget * COMPLEXITY_MULTIPLIERS.complex,
          DEFAULT_BUDGET_CONFIG.maxBudget
        )
      );
    });

    it('should return moderate budget for moderate intent (how_to)', () => {
      const result = calculator.calculate('how_to');

      expect(result.complexity).toBe('moderate');
      expect(result.multiplier).toBe(COMPLEXITY_MULTIPLIERS.moderate);
    });

    it('should apply compression reserve to effective budget', () => {
      const result = calculator.calculate('lookup');

      const expectedEffective = Math.floor(
        result.totalBudget * (1 - DEFAULT_BUDGET_CONFIG.compressionReserve)
      );
      expect(result.effectiveBudget).toBe(expectedEffective);
    });

    it('should respect maxBudget cap', () => {
      const config: Partial<BudgetCalculatorConfig> = {
        baseBudget: 5000,
        maxBudget: 8000,
      };
      const customCalc = createBudgetCalculator(config);

      const result = customCalc.calculate('debug'); // 4x multiplier = 20000, but capped

      expect(result.totalBudget).toBe(8000);
    });

    it('should calculate allocation by type based on intent', () => {
      const result = calculator.calculate('debug');

      // Debug intent should allocate more to experience and knowledge
      expect(result.allocation.guideline).toBeGreaterThan(0);
      expect(result.allocation.knowledge).toBeGreaterThan(0);
      expect(result.allocation.tool).toBeGreaterThan(0);
      expect(result.allocation.experience).toBeGreaterThan(0);

      // Total allocation should roughly equal effective budget
      const totalAllocation =
        result.allocation.guideline +
        result.allocation.knowledge +
        result.allocation.tool +
        result.allocation.experience;
      expect(totalAllocation).toBeLessThanOrEqual(result.effectiveBudget);
    });

    it('should calculate maxEntries per type', () => {
      const result = calculator.calculate('lookup');

      expect(result.maxEntries.guideline).toBeGreaterThanOrEqual(1);
      expect(result.maxEntries.knowledge).toBeGreaterThanOrEqual(1);
      expect(result.maxEntries.tool).toBeGreaterThanOrEqual(1);
      expect(result.maxEntries.experience).toBeGreaterThanOrEqual(1);
    });

    it('should allow complexity override', () => {
      const result = calculator.calculate('lookup', 'complex');

      expect(result.complexity).toBe('complex');
      expect(result.multiplier).toBe(COMPLEXITY_MULTIPLIERS.complex);
    });

    it('should return static result when disabled', () => {
      const config: Partial<BudgetCalculatorConfig> = {
        enabled: false,
      };
      const disabledCalc = createBudgetCalculator(config);

      const result = disabledCalc.calculate('debug');

      expect(result.complexity).toBe('simple');
      expect(result.totalBudget).toBe(DEFAULT_BUDGET_CONFIG.baseBudget);
    });

    it('should default to explore for undefined intent', () => {
      const result = calculator.calculate(undefined);

      expect(result.complexity).toBe('simple'); // explore is simple
    });
  });

  describe('calculateFromEntries', () => {
    it('should upgrade complexity when many high-priority entries', () => {
      const entries: BudgetEntry[] = [
        { id: '1', type: 'guideline', contentLength: 500, priority: 9 },
        { id: '2', type: 'knowledge', contentLength: 500, priority: 10 },
        { id: '3', type: 'tool', contentLength: 500, priority: 8 },
      ];

      const result = calculator.calculateFromEntries(entries, 'lookup');

      // Should upgrade from simple to moderate due to high-priority entries
      expect(result.complexity).toBe('moderate');
    });

    it('should upgrade complexity when high average relevance', () => {
      const entries: BudgetEntry[] = [
        { id: '1', type: 'guideline', contentLength: 500, relevanceScore: 0.9 },
        { id: '2', type: 'knowledge', contentLength: 500, relevanceScore: 0.85 },
        { id: '3', type: 'tool', contentLength: 500, relevanceScore: 0.88 },
      ];

      const result = calculator.calculateFromEntries(entries, 'lookup');

      // Should upgrade from simple to moderate due to high relevance
      expect(result.complexity).toBe('moderate');
    });

    it('should not downgrade complexity', () => {
      const entries: BudgetEntry[] = [
        { id: '1', type: 'guideline', contentLength: 500, priority: 3 },
      ];

      const result = calculator.calculateFromEntries(entries, 'debug');

      // debug is already complex, should stay complex
      expect(result.complexity).toBe('complex');
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens based on character count', () => {
      const content = 'Hello world'; // 11 characters
      const tokens = calculator.estimateTokens(content);

      // Default tokensPerChar is 0.25
      expect(tokens).toBe(Math.ceil(11 * 0.25));
    });

    it('should use custom tokensPerChar', () => {
      const config: Partial<BudgetCalculatorConfig> = {
        tokensPerChar: 0.5,
      };
      const customCalc = createBudgetCalculator(config);

      const content = 'Hello world'; // 11 characters
      const tokens = customCalc.estimateTokens(content);

      expect(tokens).toBe(Math.ceil(11 * 0.5));
    });
  });

  describe('fitsInBudget', () => {
    it('should return true when content fits', () => {
      const content = 'Short content';
      expect(calculator.fitsInBudget(content, 100)).toBe(true);
    });

    it('should return false when content exceeds budget', () => {
      const content = 'A'.repeat(1000); // 1000 chars = ~250 tokens
      expect(calculator.fitsInBudget(content, 10)).toBe(false);
    });
  });

  describe('remainingCharacters', () => {
    it('should calculate remaining characters correctly', () => {
      const remaining = calculator.remainingCharacters(100, 200);

      // 100 tokens remaining / 0.25 tokensPerChar = 400 chars
      expect(remaining).toBe(Math.floor(100 / 0.25));
    });

    it('should return 0 when budget exceeded', () => {
      const remaining = calculator.remainingCharacters(300, 200);
      expect(remaining).toBe(0);
    });
  });

  describe('intent complexity mapping', () => {
    it('should map all intents to complexity levels', () => {
      const intents = ['lookup', 'how_to', 'debug', 'explore', 'compare', 'configure'] as const;

      for (const intent of intents) {
        expect(INTENT_COMPLEXITY_MAP[intent]).toBeDefined();
        expect(['simple', 'moderate', 'complex']).toContain(INTENT_COMPLEXITY_MAP[intent]);
      }
    });
  });
});
