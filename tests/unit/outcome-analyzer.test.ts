/**
 * Outcome Analyzer Service Tests
 *
 * Tests for success pattern detection and comprehensive outcome analysis.
 * Also includes backward compatibility tests for legacy error analysis methods.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  OutcomeAnalyzerService,
  getOutcomeAnalyzerService,
  resetOutcomeAnalyzerService,
} from '../../src/services/learning/outcome-analyzer.service.js';
import type {
  OutcomeAnalysisConfig,
  ToolOutcome,
} from '../../src/services/learning/outcome-analyzer.service.js';

const mockOpenAICreate = vi.fn();
const mockAnthropicCreate = vi.fn();

vi.mock('openai', () => ({
  OpenAI: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockOpenAICreate,
      },
    },
  })),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: mockAnthropicCreate,
    },
  })),
}));

vi.mock('../../config/index.js', () => ({
  config: {
    extraction: {
      provider: 'disabled',
      openaiApiKey: undefined,
      anthropicApiKey: undefined,
      ollamaBaseUrl: 'http://localhost:11434',
      openaiModel: 'gpt-4o',
      anthropicModel: 'claude-3-5-sonnet-20241022',
      ollamaModel: 'llama2',
    },
    logging: {
      level: 'silent',
      debug: false,
    },
  },
}));

function createMockOutcome(
  toolName: string,
  outcome: 'success' | 'failure' | 'partial',
  outcomeType?: string,
  message?: string
): ToolOutcome {
  return {
    id: `out_${Math.random().toString(36).substr(2, 9)}`,
    sessionId: 'sess_123',
    projectId: 'proj_123',
    toolName,
    outcome,
    outcomeType: outcomeType || null,
    message: message || null,
    toolInputHash: null,
    inputSummary: null,
    outputSummary: null,
    durationMs: null,
    precedingToolId: null,
    analyzed: 0,
    createdAt: new Date().toISOString(),
  };
}

describe('OutcomeAnalyzerService', () => {
  let service: OutcomeAnalyzerService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenAICreate.mockReset();
    mockAnthropicCreate.mockReset();
    resetOutcomeAnalyzerService();
  });

  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.useRealTimers();
    }
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      service = new OutcomeAnalyzerService();
      expect(service).toBeDefined();
    });

    it('should initialize with custom config', () => {
      const config: OutcomeAnalysisConfig = {
        enabled: true,
        minUniqueErrorTypes: 3,
        analysisTimeoutMs: 15000,
        confidenceThreshold: 0.8,
        maxErrorsToAnalyze: 25,
        minOutcomesForAnalysis: 10,
      };
      service = new OutcomeAnalyzerService(config);
      expect(service).toBeDefined();
    });

    it('should handle disabled state', () => {
      service = new OutcomeAnalyzerService({ enabled: false });
      expect(service).toBeDefined();
    });
  });

  describe('analyzeOutcomes', () => {
    beforeEach(() => {
      service = new OutcomeAnalyzerService();
    });

    it('should return empty patterns when disabled', async () => {
      service = new OutcomeAnalyzerService({ enabled: false });

      const outcomes: ToolOutcome[] = [
        createMockOutcome('Edit', 'success'),
        createMockOutcome('Bash', 'success'),
      ];

      const result = await service.analyzeOutcomes(outcomes);

      expect(result.patterns).toEqual([]);
      expect(result.totalOutcomes).toBe(2);
      expect(result.successRate).toBe(1.0);
    });

    it('should return empty patterns when insufficient outcomes', async () => {
      const outcomes: ToolOutcome[] = [createMockOutcome('Edit', 'success')];

      const result = await service.analyzeOutcomes(outcomes);

      expect(result.patterns).toEqual([]);
      expect(result.totalOutcomes).toBe(1);
    });

    it('should calculate success rate correctly', async () => {
      const outcomes: ToolOutcome[] = [
        createMockOutcome('Edit', 'success'),
        createMockOutcome('Bash', 'failure', 'command_error'),
        createMockOutcome('Read', 'success'),
        createMockOutcome('Write', 'success'),
      ];

      const result = await service.analyzeOutcomes(outcomes);

      expect(result.successRate).toBe(0.75);
      expect(result.totalOutcomes).toBe(4);
    });

    it('should handle analysis timeout gracefully', async () => {
      service = new OutcomeAnalyzerService({ analysisTimeoutMs: 100 });

      const outcomes: ToolOutcome[] = Array.from({ length: 10 }, (_, i) =>
        createMockOutcome(`Tool${i}`, 'success')
      );

      const result = await service.analyzeOutcomes(outcomes);

      expect(result.patterns).toBeDefined();
      expect(result.totalOutcomes).toBe(10);
    });
  });

  describe('analyzeOutcomesForPatterns', () => {
    beforeEach(() => {
      service = new OutcomeAnalyzerService();
    });

    it('should categorize patterns by type', async () => {
      const outcomes: ToolOutcome[] = Array.from({ length: 10 }, (_, i) =>
        createMockOutcome(`Tool${i}`, 'success')
      );

      const result = await service.analyzeOutcomesForPatterns(outcomes);

      expect(result).toHaveProperty('bestPractices');
      expect(result).toHaveProperty('recoveryPatterns');
      expect(result).toHaveProperty('toolSequences');
      expect(result).toHaveProperty('efficiencyPatterns');
      expect(result.totalOutcomes).toBe(10);
    });

    it('should handle disabled state', async () => {
      service = new OutcomeAnalyzerService({ enabled: false });

      const outcomes: ToolOutcome[] = [createMockOutcome('Edit', 'success')];

      const result = await service.analyzeOutcomesForPatterns(outcomes);

      expect(result.bestPractices).toEqual([]);
      expect(result.recoveryPatterns).toEqual([]);
      expect(result.toolSequences).toEqual([]);
      expect(result.efficiencyPatterns).toEqual([]);
    });
  });

  describe('pattern detection methods', () => {
    beforeEach(() => {
      service = new OutcomeAnalyzerService();
    });

    it('detectBestPractices should filter for best_practice patterns', async () => {
      const outcomes: ToolOutcome[] = Array.from({ length: 10 }, (_, i) =>
        createMockOutcome(`Tool${i}`, 'success')
      );

      const patterns = await service.detectBestPractices(outcomes);

      expect(Array.isArray(patterns)).toBe(true);
      patterns.forEach((p) => {
        expect(p.patternType).toBe('best_practice');
      });
    });

    it('detectRecoveryPatterns should filter for recovery patterns', async () => {
      const outcomes: ToolOutcome[] = [
        createMockOutcome('Edit', 'failure', 'file_not_found'),
        createMockOutcome('Read', 'success'),
        createMockOutcome('Edit', 'success'),
      ];

      const patterns = await service.detectRecoveryPatterns(outcomes);

      expect(Array.isArray(patterns)).toBe(true);
      patterns.forEach((p) => {
        expect(p.patternType).toBe('recovery');
      });
    });

    it('detectToolSequences should filter for sequence patterns', async () => {
      const outcomes: ToolOutcome[] = [
        createMockOutcome('Read', 'success'),
        createMockOutcome('Edit', 'success'),
        createMockOutcome('Bash', 'success'),
      ];

      const patterns = await service.detectToolSequences(outcomes);

      expect(Array.isArray(patterns)).toBe(true);
      patterns.forEach((p) => {
        expect(p.patternType).toBe('sequence');
      });
    });

    it('detectEfficiencyPatterns should filter for efficiency patterns', async () => {
      const outcomes: ToolOutcome[] = Array.from({ length: 10 }, (_, i) =>
        createMockOutcome(`Tool${i}`, 'success')
      );

      const patterns = await service.detectEfficiencyPatterns(outcomes);

      expect(Array.isArray(patterns)).toBe(true);
      patterns.forEach((p) => {
        expect(p.patternType).toBe('efficiency');
      });
    });

    it('analyzeAllPatterns should return comprehensive analysis', async () => {
      const outcomes: ToolOutcome[] = Array.from({ length: 10 }, (_, i) =>
        createMockOutcome(`Tool${i}`, 'success')
      );

      const analysis = await service.analyzeAllPatterns(outcomes);

      expect(analysis).toHaveProperty('bestPractices');
      expect(analysis).toHaveProperty('recoveryPatterns');
      expect(analysis).toHaveProperty('toolSequences');
      expect(analysis).toHaveProperty('efficiencyPatterns');
      expect(analysis).toHaveProperty('totalOutcomes');
      expect(analysis).toHaveProperty('successRate');
    });
  });

  describe('legacy methods (backward compatibility)', () => {
    beforeEach(() => {
      service = new OutcomeAnalyzerService();
    });

    it('analyzeSessionErrors should return empty result (stubbed)', async () => {
      const result = await service.analyzeSessionErrors('session-123');

      expect(result.patterns).toEqual([]);
      expect(result.sessionId).toBe('session-123');
    });

    it('analyzeCrossSessionPatterns should return empty result (stubbed)', async () => {
      const result = await service.analyzeCrossSessionPatterns('project-123', 7);

      expect(result.patterns).toEqual([]);
      expect(result.projectId).toBe('project-123');
      expect(result.lookbackDays).toBe(7);
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = getOutcomeAnalyzerService();
      const instance2 = getOutcomeAnalyzerService();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getOutcomeAnalyzerService();
      resetOutcomeAnalyzerService();
      const instance2 = getOutcomeAnalyzerService();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('configuration', () => {
    it('should accept custom confidence threshold', () => {
      service = new OutcomeAnalyzerService({ confidenceThreshold: 0.85 });
      expect(service).toBeDefined();
    });

    it('should accept custom analysis timeout', () => {
      service = new OutcomeAnalyzerService({ analysisTimeoutMs: 45000 });
      expect(service).toBeDefined();
    });

    it('should accept custom max errors limit', () => {
      service = new OutcomeAnalyzerService({ maxErrorsToAnalyze: 100 });
      expect(service).toBeDefined();
    });

    it('should accept custom min outcomes for analysis', () => {
      service = new OutcomeAnalyzerService({ minOutcomesForAnalysis: 20 });
      expect(service).toBeDefined();
    });
  });
});
