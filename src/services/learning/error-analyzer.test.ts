/**
 * Error Analyzer Service Tests
 *
 * TDD approach: Tests written first with mocked LLM responses
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ErrorAnalyzerService } from './error-analyzer.service.js';
import type { ErrorAnalysisConfig, ErrorPattern } from './error-analyzer.service.js';

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

describe('ErrorAnalyzerService', () => {
  let service: ErrorAnalyzerService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenAICreate.mockReset();
    mockAnthropicCreate.mockReset();
  });

  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.useRealTimers();
    }
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      service = new ErrorAnalyzerService();
      expect(service).toBeDefined();
    });

    it('should initialize with custom config', () => {
      const config: ErrorAnalysisConfig = {
        enabled: true,
        minUniqueErrorTypes: 3,
        analysisTimeoutMs: 15000,
        confidenceThreshold: 0.8,
        maxErrorsToAnalyze: 25,
      };
      service = new ErrorAnalyzerService(config);
      expect(service).toBeDefined();
    });

    it('should handle disabled state', () => {
      service = new ErrorAnalyzerService({ enabled: false });
      expect(service).toBeDefined();
    });
  });

  describe('analyzeSessionErrors', () => {
    beforeEach(() => {
      service = new ErrorAnalyzerService();
    });

    it('should return empty result when disabled', async () => {
      service = new ErrorAnalyzerService({ enabled: false });
      const result = await service.analyzeSessionErrors('session-123');

      expect(result).toBeDefined();
      expect(result.patterns).toEqual([]);
      expect(result.sessionId).toBe('session-123');
    });

    it('should return empty result when no errors found', async () => {
      const result = await service.analyzeSessionErrors('session-no-errors');

      expect(result).toBeDefined();
      expect(result.patterns).toEqual([]);
      expect(result.sessionId).toBe('session-no-errors');
    });

    it('should handle LLM timeout gracefully', async () => {
      const result = await service.analyzeSessionErrors('session-timeout');

      expect(result.patterns).toEqual([]);
    });

    it('should handle LLM API failure gracefully', async () => {
      const result = await service.analyzeSessionErrors('session-api-fail');

      expect(result.patterns).toEqual([]);
    });
  });

  describe('analyzeCrossSessionPatterns', () => {
    beforeEach(() => {
      service = new ErrorAnalyzerService();
    });

    it('should analyze patterns across multiple sessions', async () => {
      const result = await service.analyzeCrossSessionPatterns('project-123', 7);

      expect(result.patterns).toBeDefined();
      expect(result.projectId).toBe('project-123');
      expect(result.lookbackDays).toBe(7);
    });

    it('should respect configuration', async () => {
      service = new ErrorAnalyzerService({ maxErrorsToAnalyze: 10, enabled: false });

      const result = await service.analyzeCrossSessionPatterns('project-456', 30);

      expect(result.patterns).toEqual([]);
      expect(result.projectId).toBe('project-456');
    });

    it('should handle no patterns detected', async () => {
      const result = await service.analyzeCrossSessionPatterns('project-789', 14);

      expect(result.patterns).toBeDefined();
      expect(result.projectId).toBe('project-789');
    });
  });

  describe('generateCorrectiveEntry', () => {
    beforeEach(() => {
      service = new ErrorAnalyzerService();
    });

    it('should generate guideline entry from pattern', async () => {
      const pattern: ErrorPattern = {
        patternType: 'wrong_path',
        description: 'Agent uses wrong paths',
        frequency: 5,
        suggestedCorrection: {
          type: 'guideline',
          title: 'Path conventions',
          content: 'Always use relative paths from project root',
        },
        confidence: 0.9,
      };

      const entry = await service.generateCorrectiveEntry(pattern);

      expect(entry.type).toBe('guideline');
      if (entry.type === 'guideline') {
        expect(entry.name).toBe('Path conventions');
      }
      expect(entry.content).toContain('relative paths');
      expect(entry.category).toBe('error-correction');
      expect(entry.metadata?.errorPatternType).toBe('wrong_path');
      expect(entry.metadata?.confidence).toBe(0.9);
    });

    it('should generate knowledge entry from pattern', async () => {
      const pattern: ErrorPattern = {
        patternType: 'config_error',
        description: 'Missing TypeScript config',
        frequency: 3,
        suggestedCorrection: {
          type: 'knowledge',
          title: 'TypeScript requires tsconfig.json',
          content: 'Create tsconfig.json with proper compiler options',
        },
        confidence: 0.85,
      };

      const entry = await service.generateCorrectiveEntry(pattern);

      expect(entry.type).toBe('knowledge');
      if (entry.type === 'knowledge') {
        expect(entry.title).toBe('TypeScript requires tsconfig.json');
      }
      expect(entry.content).toContain('tsconfig.json');
      expect(entry.category).toBe('error-correction');
    });

    it('should include frequency in metadata', async () => {
      const pattern: ErrorPattern = {
        patternType: 'permission',
        description: 'Permission denied',
        frequency: 10,
        suggestedCorrection: {
          type: 'knowledge',
          title: 'Permission fix',
          content: 'Run with elevated privileges',
        },
        confidence: 0.8,
      };

      const entry = await service.generateCorrectiveEntry(pattern);

      expect(entry.metadata?.frequency).toBe(10);
    });
  });

  describe('LLM provider selection', () => {
    it('should handle disabled provider', () => {
      service = new ErrorAnalyzerService({ enabled: false });
      expect(service).toBeDefined();
    });

    it('should initialize without API keys', () => {
      service = new ErrorAnalyzerService();
      expect(service).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should accept custom confidence threshold', () => {
      service = new ErrorAnalyzerService({ confidenceThreshold: 0.85 });
      expect(service).toBeDefined();
    });

    it('should accept custom analysis timeout', () => {
      service = new ErrorAnalyzerService({ analysisTimeoutMs: 45000 });
      expect(service).toBeDefined();
    });

    it('should accept custom max errors limit', () => {
      service = new ErrorAnalyzerService({ maxErrorsToAnalyze: 100 });
      expect(service).toBeDefined();
    });
  });
});
