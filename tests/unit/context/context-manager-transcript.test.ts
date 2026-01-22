import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  ContextManagerService,
  type ContextEntry,
} from '../../../src/services/context/context-manager.service.js';
import type { ComplexitySignals } from '../../../src/utils/transcript-analysis.js';

describe('ContextManagerService transcript integration', () => {
  let service: ContextManagerService;

  beforeEach(() => {
    service = new ContextManagerService(null, null, {
      enabled: true,
      staleness: { enabled: true, staleAgeDays: 90, notAccessedDays: 60 },
      budget: { enabled: true, baseBudget: 2000, maxBudget: 8000 },
      priority: { enabled: true, minScore: 0.3 },
      compression: { enabled: true, hierarchicalThreshold: 1500 },
    });
  });

  describe('complexity signals integration', () => {
    it('should accept complexitySignals in process request', async () => {
      const entries: ContextEntry[] = [
        { id: '1', type: 'guideline', content: 'Test guideline', title: 'Test' },
      ];

      const signals: ComplexitySignals = {
        score: 0.8,
        signals: ['error', 'debug', 'fix'],
        hasErrorRecovery: true,
        hasDecisions: true,
        hasLearning: false,
      };

      const result = await service.process({
        entries,
        intent: 'explore',
        complexitySignals: signals,
      });

      expect(result).toBeDefined();
      expect(result.budget.complexity).toBe('complex');
    });

    it('should increase budget when hasErrorRecovery is true', async () => {
      const entries: ContextEntry[] = [
        { id: '1', type: 'guideline', content: 'Test guideline', title: 'Test' },
      ];

      const withRecovery = await service.process({
        entries,
        intent: 'explore',
        complexitySignals: {
          score: 0.5,
          signals: ['error'],
          hasErrorRecovery: true,
          hasDecisions: false,
          hasLearning: false,
        },
      });

      const withoutRecovery = await service.process({
        entries,
        intent: 'explore',
      });

      expect(withRecovery.budget.effectiveBudget).toBeGreaterThan(
        withoutRecovery.budget.effectiveBudget
      );
    });

    it('should increase budget when hasDecisions is true', async () => {
      const entries: ContextEntry[] = [
        { id: '1', type: 'guideline', content: 'Test guideline', title: 'Test' },
      ];

      const withDecisions = await service.process({
        entries,
        intent: 'explore',
        complexitySignals: {
          score: 0.5,
          signals: ['decided'],
          hasErrorRecovery: false,
          hasDecisions: true,
          hasLearning: false,
        },
      });

      const withoutDecisions = await service.process({
        entries,
        intent: 'explore',
      });

      expect(withDecisions.budget.effectiveBudget).toBeGreaterThan(
        withoutDecisions.budget.effectiveBudget
      );
    });

    it('should use complexitySignals.score to determine complexity level', async () => {
      const entries: ContextEntry[] = [
        { id: '1', type: 'guideline', content: 'Test guideline', title: 'Test' },
      ];

      const lowComplexity = await service.process({
        entries,
        intent: 'explore',
        complexitySignals: {
          score: 0.2,
          signals: [],
          hasErrorRecovery: false,
          hasDecisions: false,
          hasLearning: false,
        },
      });

      const highComplexity = await service.process({
        entries,
        intent: 'explore',
        complexitySignals: {
          score: 0.8,
          signals: ['error', 'fix', 'debug'],
          hasErrorRecovery: true,
          hasDecisions: true,
          hasLearning: true,
        },
      });

      expect(lowComplexity.budget.complexity).toBe('simple');
      expect(highComplexity.budget.complexity).toBe('complex');
    });

    it('should prefer complexitySignals over intent-based complexity when both present', async () => {
      const entries: ContextEntry[] = [
        { id: '1', type: 'guideline', content: 'Test guideline', title: 'Test' },
      ];

      const result = await service.process({
        entries,
        intent: 'lookup',
        complexitySignals: {
          score: 0.9,
          signals: ['error', 'fix'],
          hasErrorRecovery: true,
          hasDecisions: true,
          hasLearning: true,
        },
      });

      expect(result.budget.complexity).toBe('complex');
    });
  });

  describe('signal-based budget allocation', () => {
    it('should allocate more budget to experiences when hasLearning is true', async () => {
      const entries: ContextEntry[] = [
        { id: '1', type: 'experience', content: 'Past experience', title: 'Test' },
        { id: '2', type: 'guideline', content: 'Guideline', title: 'Test' },
      ];

      const withLearning = await service.process({
        entries,
        intent: 'explore',
        complexitySignals: {
          score: 0.5,
          signals: ['learned'],
          hasErrorRecovery: false,
          hasDecisions: false,
          hasLearning: true,
        },
      });

      expect(withLearning.budget.allocation.experience).toBeGreaterThan(0);
    });
  });
});
