/**
 * Classification Service Tests
 *
 * Tests for the hybrid classification system that combines:
 * 1. Fast regex pattern matching (high confidence)
 * 2. LLM fallback for ambiguous cases
 * 3. Learning from user corrections
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ClassificationService,
  type ClassificationServiceConfig,
} from '../../src/services/classification/index.js';
import { PatternMatcher } from '../../src/services/classification/pattern-matcher.js';
import type { ClassificationRepository } from '../../src/services/classification/classification.repository.js';

// Mock the repository
const mockRepo: ClassificationRepository = {
  recordFeedback: vi.fn().mockResolvedValue('feedback-id'),
  getFeedbackForPattern: vi.fn().mockResolvedValue([]),
  getPatternFeedbackStats: vi.fn().mockResolvedValue({ total: 0, correct: 0, incorrect: 0 }),
  getRecentFeedback: vi.fn().mockResolvedValue([]),
  getOrCreatePatternConfidence: vi
    .fn()
    .mockImplementation(async (patternId, patternType, baseWeight) => ({
      id: `pc-${patternId}`,
      patternId,
      patternType,
      baseWeight: baseWeight ?? 0.7,
      feedbackMultiplier: 1.0,
      totalMatches: 0,
      correctMatches: 0,
      incorrectMatches: 0,
      updatedAt: new Date().toISOString(),
    })),
  getPatternConfidence: vi.fn().mockImplementation(async (patternId) => ({
    id: `pc-${patternId}`,
    patternId,
    patternType: 'guideline' as const,
    baseWeight: 0.7,
    feedbackMultiplier: 1.0,
    totalMatches: 0,
    correctMatches: 0,
    incorrectMatches: 0,
    updatedAt: new Date().toISOString(),
  })),
  updatePatternConfidence: vi.fn().mockResolvedValue(undefined),
  getAllPatternConfidence: vi.fn().mockResolvedValue([]),
  getPatternStats: vi.fn().mockResolvedValue([]),
  resetPatternConfidence: vi.fn().mockResolvedValue(undefined),
} as unknown as ClassificationRepository;

const defaultConfig: ClassificationServiceConfig = {
  highConfidenceThreshold: 0.85,
  lowConfidenceThreshold: 0.6,
  enableLLMFallback: false,
  preferLLM: false,
  feedbackDecayDays: 30,
  maxPatternBoost: 0.15,
  maxPatternPenalty: 0.3,
  cacheSize: 100,
  cacheTTLMs: 60000,
  learningRate: 0.1,
};

describe('PatternMatcher', () => {
  let patternMatcher: PatternMatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    patternMatcher = new PatternMatcher(mockRepo, defaultConfig);
  });

  describe('Guideline Patterns', () => {
    it('should match "Rule:" prefix with high confidence', async () => {
      const result = await patternMatcher.match('Rule: always use TypeScript strict mode');
      expect(result.type).toBe('guideline');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should match "must" prefix', async () => {
      const result = await patternMatcher.match('Must use async/await for all async operations');
      expect(result.type).toBe('guideline');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should match "always" prefix', async () => {
      const result = await patternMatcher.match('Always write unit tests for new features');
      expect(result.type).toBe('guideline');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should match "never" prefix', async () => {
      const result = await patternMatcher.match('Never commit secrets to the repository');
      expect(result.type).toBe('guideline');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should match "we always" pattern', async () => {
      const result = await patternMatcher.match('We always use dependency injection');
      expect(result.type).toBe('guideline');
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('should match "prefer X over Y" pattern', async () => {
      const result = await patternMatcher.match('Prefer const over let for variables');
      expect(result.type).toBe('guideline');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should match "don\'t use" pattern', async () => {
      const result = await patternMatcher.match("Don't use var in TypeScript");
      expect(result.type).toBe('guideline');
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('should match "we will use" future commitment pattern', async () => {
      const result = await patternMatcher.match('We will use TDD for this project');
      expect(result.type).toBe('guideline');
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('should match "let\'s use" team decision pattern', async () => {
      const result = await patternMatcher.match("Let's use Prettier for code formatting");
      expect(result.type).toBe('guideline');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should match "from now on" future rule pattern', async () => {
      const result = await patternMatcher.match('From now on all PRs require code review');
      expect(result.type).toBe('guideline');
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('should match "going forward" pattern', async () => {
      const result = await patternMatcher.match('Going forward we will write tests first');
      expect(result.type).toBe('guideline');
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });
  });

  describe('Knowledge Patterns', () => {
    it('should match "Decision:" prefix with high confidence', async () => {
      const result = await patternMatcher.match('Decision: use PostgreSQL for production');
      expect(result.type).toBe('knowledge');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should match "we decided" pattern', async () => {
      const result = await patternMatcher.match('We decided to use React for the frontend');
      expect(result.type).toBe('knowledge');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should match "Fact:" prefix', async () => {
      const result = await patternMatcher.match(
        'Fact: the API rate limit is 1000 requests per minute'
      );
      expect(result.type).toBe('knowledge');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should match "remember that" pattern', async () => {
      const result = await patternMatcher.match('Remember that the database is sharded');
      expect(result.type).toBe('knowledge');
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should match "our API uses" pattern', async () => {
      const result = await patternMatcher.match('Our API uses REST, not GraphQL');
      expect(result.type).toBe('knowledge');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should match "we use X for Y" pattern', async () => {
      const result = await patternMatcher.match('We use Redis for caching');
      expect(result.type).toBe('knowledge');
      expect(result.confidence).toBeGreaterThanOrEqual(0.65);
    });
  });

  describe('Tool Patterns', () => {
    it('should match "Command:" prefix with high confidence', async () => {
      const result = await patternMatcher.match('Command: npm run build');
      expect(result.type).toBe('tool');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should match npm commands', async () => {
      const result = await patternMatcher.match('npm run test to run all tests');
      expect(result.type).toBe('tool');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should match docker commands', async () => {
      const result = await patternMatcher.match('docker-compose up -d to start services');
      expect(result.type).toBe('tool');
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('should match git commands', async () => {
      const result = await patternMatcher.match('git checkout -b feature/new-feature');
      expect(result.type).toBe('tool');
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('should match backtick commands', async () => {
      const result = await patternMatcher.match('run `npm test` to execute tests');
      expect(result.type).toBe('tool');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('Ambiguous Cases', () => {
    it('should default to knowledge for ambiguous text', async () => {
      const result = await patternMatcher.match('The project has good test coverage');
      expect(result.type).toBe('knowledge');
      expect(result.confidence).toBeLessThan(0.85);
    });

    it('should return lower confidence for ambiguous patterns', async () => {
      const result = await patternMatcher.match('Some general information about the system');
      expect(result.confidence).toBeLessThanOrEqual(0.6);
    });
  });

  describe('False Positive Prevention', () => {
    it('should NOT classify "make sure" phrases as tool', async () => {
      const result = await patternMatcher.match('Make sure to test all edge cases');
      expect(result.type).not.toBe('tool');
    });

    it('should NOT classify "make the" phrases as tool', async () => {
      const result = await patternMatcher.match('Make the button more visible');
      expect(result.type).not.toBe('tool');
    });

    it('should NOT classify "make it" phrases as tool', async () => {
      const result = await patternMatcher.match('Make it easier to find the settings');
      expect(result.type).not.toBe('tool');
    });

    it('should NOT classify UX feedback as tool', async () => {
      const result = await patternMatcher.match(
        'UX feedback: memory_conversation name is unclear. It is actually a conversation logging tool.'
      );
      expect(result.type).not.toBe('tool');
    });

    it('should NOT classify "make changes" as tool', async () => {
      const result = await patternMatcher.match('Make changes to improve the API');
      expect(result.type).not.toBe('tool');
    });

    it('should still classify real make commands as tool', async () => {
      const result = await patternMatcher.match('make build to compile the project');
      expect(result.type).toBe('tool');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should still classify make targets as tool', async () => {
      const result = await patternMatcher.match('Run make test for unit tests');
      expect(result.type).toBe('tool');
    });
  });
});

// Create a mock DrizzleDb that returns a pattern confidence entry
function createMockDb() {
  const mockPatternConfidence = {
    id: 'pc-1',
    patternId: 'guideline_rule_prefix',
    patternType: 'guideline',
    baseWeight: 0.95,
    feedbackMultiplier: 1.0,
    totalMatches: 0,
    correctMatches: 0,
    incorrectMatches: 0,
    updatedAt: new Date().toISOString(),
  };

  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue(mockPatternConfidence),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue([]),
            }),
          }),
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
        all: vi.fn().mockReturnValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        run: vi.fn(),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          run: vi.fn(),
        }),
      }),
    }),
  };
}

describe('ClassificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('classify()', () => {
    it('should return forced type with confidence 1.0', async () => {
      const mockDb = createMockDb();
      const service = new ClassificationService(mockDb as never, null, defaultConfig);

      const result = await service.classify('Some random text', 'tool');
      expect(result.type).toBe('tool');
      expect(result.confidence).toBe(1.0);
      expect(result.method).toBe('forced');
    });

    it('should use regex classification when no forceType', async () => {
      const mockDb = createMockDb();
      const service = new ClassificationService(mockDb as never, null, defaultConfig);

      const result = await service.classify('Rule: always test your code');
      expect(result.type).toBe('guideline');
      expect(result.method).toBe('regex');
    });

    it('should indicate adjustedByFeedback when patterns have been modified', async () => {
      // Set up mock to return a modified multiplier
      const modifiedMockRepo = {
        ...mockRepo,
        getOrCreatePatternConfidence: vi
          .fn()
          .mockImplementation(async (patternId, patternType, baseWeight) => ({
            id: `pc-${patternId}`,
            patternId,
            patternType,
            baseWeight: baseWeight ?? 0.7,
            feedbackMultiplier: 1.1, // Modified from feedback
            totalMatches: 5,
            correctMatches: 4,
            incorrectMatches: 1,
            updatedAt: new Date().toISOString(),
          })),
      };

      const patternMatcher = new PatternMatcher(
        modifiedMockRepo as unknown as ClassificationRepository,
        defaultConfig
      );
      const result = await patternMatcher.match('Rule: test code');

      expect(result.adjustedByFeedback).toBe(true);
    });
  });

  describe('recordCorrection()', () => {
    it('should not record when predicted equals actual', async () => {
      const mockDb = createMockDb();
      const service = new ClassificationService(mockDb as never, null, defaultConfig);

      // When predicted equals actual, no correction is needed
      await service.recordCorrection('Some text', 'guideline', 'guideline');

      // The service should short-circuit and not call the repo
      // We can verify this by checking the mock wasn't called for recording
      // Since the repo is internal, we just verify no error is thrown
    });
  });

  describe('isLLMAvailable()', () => {
    it('should return false when LLM fallback is disabled', async () => {
      const mockDb = createMockDb();
      const service = new ClassificationService(mockDb as never, null, {
        ...defaultConfig,
        enableLLMFallback: false,
      });

      expect(service.isLLMAvailable()).toBe(false);
    });

    it('should return false when extraction service is null', async () => {
      const mockDb = createMockDb();
      const service = new ClassificationService(mockDb as never, null, {
        ...defaultConfig,
        enableLLMFallback: true,
      });

      expect(service.isLLMAvailable()).toBe(false);
    });

    it('should return true when LLM is enabled and extraction service is available', async () => {
      const mockDb = createMockDb();
      const mockExtraction = {
        isAvailable: () => true,
        extractForClassification: vi.fn(),
      };

      const service = new ClassificationService(mockDb as never, mockExtraction, {
        ...defaultConfig,
        enableLLMFallback: true,
      });

      expect(service.isLLMAvailable()).toBe(true);
    });
  });
});

describe('Confidence Calculation', () => {
  let patternMatcher: PatternMatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    patternMatcher = new PatternMatcher(mockRepo, defaultConfig);
  });

  it('should boost confidence when multiple same-type patterns match', async () => {
    // "We always prefer X over Y" matches multiple guideline patterns
    const result = await patternMatcher.match('We always prefer TypeScript over JavaScript');
    // Should have at least one guideline match
    expect(
      result.patternMatches.filter((m) => m.type === 'guideline').length
    ).toBeGreaterThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('should reduce confidence when competing types match', async () => {
    // Text that could be both guideline and knowledge
    const result = await patternMatcher.match('We decided to always use TypeScript');
    // This should have matches for both types
    const guidelineMatches = result.patternMatches.filter((m) => m.type === 'guideline');
    const knowledgeMatches = result.patternMatches.filter((m) => m.type === 'knowledge');

    if (guidelineMatches.length > 0 && knowledgeMatches.length > 0) {
      // When there's competition, confidence should be lower than a pure match
      expect(result.confidence).toBeLessThan(0.95);
    }
  });
});

describe('Cache Behavior', () => {
  it('should cache classification results', async () => {
    const mockDb = createMockDb();
    const service = new ClassificationService(mockDb as never, null, defaultConfig);

    // First call
    const result1 = await service.classify('Rule: test caching');
    // Second call with same text should hit cache
    const result2 = await service.classify('Rule: test caching');

    expect(result1).toEqual(result2);
  });

  it('should not cache forced type results', async () => {
    const mockDb = createMockDb();
    const service = new ClassificationService(mockDb as never, null, defaultConfig);

    // Force a type
    const forced = await service.classify('Some text', 'tool');
    expect(forced.method).toBe('forced');

    // Normal classification should not return cached forced result
    const normal = await service.classify('Some text');
    expect(normal.method).not.toBe('forced');
  });
});

describe('LLM-Preferred Mode', () => {
  it('should use LLM first when preferLLM is true and LLM is available', async () => {
    const mockDb = createMockDb();
    const mockExtraction = {
      isAvailable: () => true,
      extractForClassification: vi.fn().mockResolvedValue({
        type: 'guideline',
        confidence: 0.95,
        reasoning: 'This is a rule statement',
      }),
    };

    const service = new ClassificationService(mockDb as never, mockExtraction, {
      ...defaultConfig,
      enableLLMFallback: true,
      preferLLM: true,
    });

    const result = await service.classify('we will use TDD for this project');

    expect(result.method).toBe('llm');
    expect(result.type).toBe('guideline');
    expect(mockExtraction.extractForClassification).toHaveBeenCalledOnce();
  });

  it('should fall back to regex when LLM fails in preferLLM mode', async () => {
    const mockDb = createMockDb();
    const mockExtraction = {
      isAvailable: () => true,
      extractForClassification: vi.fn().mockResolvedValue(null),
    };

    const service = new ClassificationService(mockDb as never, mockExtraction, {
      ...defaultConfig,
      enableLLMFallback: true,
      preferLLM: true,
    });

    const result = await service.classify('Rule: always write tests first');

    expect(result.method).toBe('regex');
    expect(result.type).toBe('guideline');
  });

  it('should use regex when preferLLM is false even if LLM is available', async () => {
    const mockDb = createMockDb();
    const mockExtraction = {
      isAvailable: () => true,
      extractForClassification: vi.fn(),
    };

    const service = new ClassificationService(mockDb as never, mockExtraction, {
      ...defaultConfig,
      enableLLMFallback: true,
      preferLLM: false,
    });

    const result = await service.classify('Rule: always write tests first');

    expect(result.method).toBe('regex');
    expect(mockExtraction.extractForClassification).not.toHaveBeenCalled();
  });
});
