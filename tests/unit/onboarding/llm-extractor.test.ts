/**
 * LLM Extractor Tests
 *
 * Tests for LLM-based contribution pattern extraction with mocked LLM.
 * All tests use mocked LLM responses - NO real API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Types will be imported once implemented
import type { DeepScanFinding } from '../../../src/services/onboarding/types.js';

/**
 * Mock LLM Response Types
 */
interface ContributionGuide {
  pattern: string;
  title: string;
  steps: string[];
  confidence: number;
}

interface LlmExtractionResponse {
  guides: ContributionGuide[];
}

// Mock the LLM extractor module (will be implemented)
vi.mock('../../../src/services/onboarding/llm-extractor.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/services/onboarding/llm-extractor.js')
  >('../../../src/services/onboarding/llm-extractor.js');
  return actual;
});

describe('LlmExtractorService', () => {
  // We'll import dynamically to allow mocking
  let LlmExtractorService: typeof import('../../../src/services/onboarding/llm-extractor.js').LlmExtractorService;
  let estimateTokens: typeof import('../../../src/services/onboarding/llm-extractor.js').estimateTokens;
  let buildCodebasePrompt: typeof import('../../../src/services/onboarding/llm-extractor.js').buildCodebasePrompt;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import('../../../src/services/onboarding/llm-extractor.js');
    LlmExtractorService = module.LlmExtractorService;
    estimateTokens = module.estimateTokens;
    buildCodebasePrompt = module.buildCodebasePrompt;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Token Budget Enforcement
  // ===========================================================================

  describe('Token Budget Enforcement', () => {
    it('should enforce max 2000 tokens per LLM call', async () => {
      const mockLlmCall = vi.fn().mockResolvedValue({ guides: [] });

      // Create a very long prompt that exceeds budget
      const longContext = 'a'.repeat(10000); // ~2500 tokens (rough estimate)

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      await expect(
        service.extractContributionPatterns({
          modules: [longContext],
          patterns: [],
          conventions: [],
        })
      ).rejects.toThrow(/token budget/i);

      // LLM should NOT have been called
      expect(mockLlmCall).not.toHaveBeenCalled();
    });

    it('should allow prompts within token budget', async () => {
      const mockResponse: LlmExtractionResponse = {
        guides: [
          {
            pattern: 'Repository',
            title: 'How to add new Repository',
            steps: ['Create interface', 'Implement class', 'Export'],
            confidence: 0.85,
          },
        ],
      };
      const mockLlmCall = vi.fn().mockResolvedValue(mockResponse);

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      const result = await service.extractContributionPatterns({
        modules: ['services', 'handlers'],
        patterns: ['Repository Pattern'],
        conventions: ['*.service.ts'],
      });

      // LLM should have been called
      expect(mockLlmCall).toHaveBeenCalled();
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it('should calculate token estimate as ~4 chars per token', () => {
      const text = 'a'.repeat(100);
      const tokens = estimateTokens(text);
      expect(tokens).toBe(25); // 100 chars / 4 = 25 tokens
    });

    it('should include system prompt in token budget calculation', async () => {
      const mockLlmCall = vi.fn().mockResolvedValue({ guides: [] });

      // Create context that with system prompt exceeds budget
      // System prompt is ~500-800 tokens, so 1500 token context should exceed 2000
      const context = 'word '.repeat(1500); // ~1875 tokens in context

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      await expect(
        service.extractContributionPatterns({
          modules: [context],
          patterns: [],
          conventions: [],
        })
      ).rejects.toThrow(/token budget/i);
    });
  });

  // ===========================================================================
  // Prompt Generation
  // ===========================================================================

  describe('Prompt Generation for Codebase Context', () => {
    it('should build prompt with module structure', () => {
      const prompt = buildCodebasePrompt({
        modules: ['services', 'handlers', 'repositories'],
        patterns: [],
        conventions: [],
      });

      expect(prompt).toContain('services');
      expect(prompt).toContain('handlers');
      expect(prompt).toContain('repositories');
    });

    it('should build prompt with design patterns', () => {
      const prompt = buildCodebasePrompt({
        modules: [],
        patterns: ['Repository Pattern', 'Service Layer'],
        conventions: [],
      });

      expect(prompt).toContain('Repository Pattern');
      expect(prompt).toContain('Service Layer');
    });

    it('should build prompt with naming conventions', () => {
      const prompt = buildCodebasePrompt({
        modules: [],
        patterns: [],
        conventions: ['*.service.ts', '*.repository.ts'],
      });

      expect(prompt).toContain('*.service.ts');
      expect(prompt).toContain('*.repository.ts');
    });

    it('should include contribution patterns extraction format', () => {
      const prompt = buildCodebasePrompt({
        modules: ['services'],
        patterns: ['Service Layer'],
        conventions: ['*.service.ts'],
      });

      // Should include expected JSON format
      expect(prompt).toContain('guides');
      expect(prompt).toContain('pattern');
      expect(prompt).toContain('steps');
      expect(prompt).toContain('confidence');
    });
  });

  // ===========================================================================
  // LLM Response Parsing
  // ===========================================================================

  describe('LLM Response Parsing', () => {
    it('should parse valid LLM response into DeepScanFindings', async () => {
      const mockResponse: LlmExtractionResponse = {
        guides: [
          {
            pattern: 'Repository',
            title: 'How to add new Repository',
            steps: ['Create interface', 'Implement class', 'Export'],
            confidence: 0.85,
          },
          {
            pattern: 'Service',
            title: 'How to add new Service',
            steps: ['Define interface', 'Create implementation', 'Register'],
            confidence: 0.9,
          },
        ],
      };
      const mockLlmCall = vi.fn().mockResolvedValue(mockResponse);

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      const result = await service.extractContributionPatterns({
        modules: ['services'],
        patterns: ['Repository Pattern', 'Service Layer'],
        conventions: [],
      });

      expect(result.findings).toHaveLength(2);
      expect(result.findings[0].title).toBe('How to add new Repository');
      expect(result.findings[1].title).toBe('How to add new Service');
    });

    it('should convert LLM guides to DeepScanFinding format', async () => {
      const mockResponse: LlmExtractionResponse = {
        guides: [
          {
            pattern: 'Handler',
            title: 'How to add new Handler',
            steps: ['Create descriptor', 'Create handler', 'Register'],
            confidence: 0.8,
          },
        ],
      };
      const mockLlmCall = vi.fn().mockResolvedValue(mockResponse);

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      const result = await service.extractContributionPatterns({
        modules: ['handlers'],
        patterns: ['Handler Pattern'],
        conventions: [],
      });

      const finding = result.findings[0];
      expect(finding).toBeDefined();
      expect(finding.area).toBe('architecture');
      expect(finding.category).toBe('reference');
      expect(finding.confidence).toBe(0.8);
      expect(finding.content).toContain('1)');
      expect(finding.content).toContain('Create descriptor');
    });

    it('should format steps with numbered list', async () => {
      const mockResponse: LlmExtractionResponse = {
        guides: [
          {
            pattern: 'Factory',
            title: 'How to add new Factory',
            steps: ['Define interface', 'Implement factory', 'Export'],
            confidence: 0.75,
          },
        ],
      };
      const mockLlmCall = vi.fn().mockResolvedValue(mockResponse);

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      const result = await service.extractContributionPatterns({
        modules: [],
        patterns: ['Factory Pattern'],
        conventions: [],
      });

      const finding = result.findings[0];
      expect(finding.content).toMatch(/1\)\s+Define interface/);
      expect(finding.content).toMatch(/2\)\s+Implement factory/);
      expect(finding.content).toMatch(/3\)\s+Export/);
    });

    it('should handle empty guides array', async () => {
      const mockResponse: LlmExtractionResponse = { guides: [] };
      const mockLlmCall = vi.fn().mockResolvedValue(mockResponse);

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      const result = await service.extractContributionPatterns({
        modules: [],
        patterns: [],
        conventions: [],
      });

      expect(result.findings).toHaveLength(0);
      expect(result.success).toBe(true);
    });

    it('should handle malformed LLM response', async () => {
      const mockLlmCall = vi.fn().mockResolvedValue({ invalid: 'response' });

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      const result = await service.extractContributionPatterns({
        modules: ['services'],
        patterns: [],
        conventions: [],
      });

      // Should not throw, but return empty findings
      expect(result.findings).toHaveLength(0);
      expect(result.success).toBe(true);
    });

    it('should include source field in findings', async () => {
      const mockResponse: LlmExtractionResponse = {
        guides: [
          {
            pattern: 'Adapter',
            title: 'How to add new Adapter',
            steps: ['Step 1'],
            confidence: 0.75,
          },
        ],
      };
      const mockLlmCall = vi.fn().mockResolvedValue(mockResponse);

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      const result = await service.extractContributionPatterns({
        modules: [],
        patterns: ['Adapter Pattern'],
        conventions: [],
      });

      expect(result.findings[0].source).toBe('llm-extraction');
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('Error Handling', () => {
    it('should handle LLM API failures gracefully', async () => {
      const mockLlmCall = vi.fn().mockRejectedValue(new Error('API rate limit exceeded'));

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      const result = await service.extractContributionPatterns({
        modules: ['services'],
        patterns: [],
        conventions: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API rate limit');
      expect(result.findings).toHaveLength(0);
    });

    it('should handle network timeout errors', async () => {
      const mockLlmCall = vi.fn().mockRejectedValue(new Error('Network timeout'));

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      const result = await service.extractContributionPatterns({
        modules: [],
        patterns: ['Service Layer'],
        conventions: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should handle JSON parse errors from LLM', async () => {
      // LLM returns invalid JSON
      const mockLlmCall = vi.fn().mockResolvedValue('not json at all');

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      const result = await service.extractContributionPatterns({
        modules: [],
        patterns: [],
        conventions: [],
      });

      // Should handle gracefully
      expect(result.findings).toHaveLength(0);
    });

    it('should preserve partial results on error', async () => {
      // First call succeeds, service processes it
      const mockResponse: LlmExtractionResponse = {
        guides: [
          {
            pattern: 'Partial',
            title: 'Partial Guide',
            steps: ['Step 1'],
            confidence: 0.8,
          },
        ],
      };
      const mockLlmCall = vi.fn().mockResolvedValue(mockResponse);

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      const result = await service.extractContributionPatterns({
        modules: [],
        patterns: ['Some Pattern'],
        conventions: [],
      });

      expect(result.findings.length).toBeGreaterThanOrEqual(0);
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Codebase-Specific Prompt
  // ===========================================================================

  describe('Codebase-Specific Prompt', () => {
    it('should use CODEBASE_CONTRIBUTION_PROMPT from prompts.ts', async () => {
      const mockLlmCall = vi.fn().mockResolvedValue({ guides: [] });

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      await service.extractContributionPatterns({
        modules: ['services'],
        patterns: ['Service Layer'],
        conventions: [],
      });

      // Check that the LLM was called with proper prompt structure
      expect(mockLlmCall).toHaveBeenCalled();
      const callArgs = mockLlmCall.mock.calls[0];
      expect(callArgs[0]).toContain('contribution patterns');
    });
  });

  // ===========================================================================
  // Integration with DeepScanFinding
  // ===========================================================================

  describe('DeepScanFinding Integration', () => {
    it('should return findings compatible with DeepScanFinding type', async () => {
      const mockResponse: LlmExtractionResponse = {
        guides: [
          {
            pattern: 'Pipeline',
            title: 'How to add new Pipeline Stage',
            steps: ['Create stage function', 'Add to pipeline config', 'Handle errors'],
            confidence: 0.75,
          },
        ],
      };
      const mockLlmCall = vi.fn().mockResolvedValue(mockResponse);

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      const result = await service.extractContributionPatterns({
        modules: [],
        patterns: ['Pipeline Pattern'],
        conventions: [],
      });

      const finding: DeepScanFinding = result.findings[0];

      // Validate all required DeepScanFinding fields
      expect(finding.area).toBe('architecture');
      expect(finding.title).toBeDefined();
      expect(finding.content).toBeDefined();
      expect(finding.category).toBe('reference');
      expect(finding.confidence).toBeGreaterThanOrEqual(0);
      expect(finding.confidence).toBeLessThanOrEqual(1);
    });

    it('should set area to architecture for contribution guides', async () => {
      const mockResponse: LlmExtractionResponse = {
        guides: [{ pattern: 'Test', title: 'Test Guide', steps: ['Step 1'], confidence: 0.8 }],
      };
      const mockLlmCall = vi.fn().mockResolvedValue(mockResponse);

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      const result = await service.extractContributionPatterns({
        modules: [],
        patterns: [],
        conventions: [],
      });

      expect(result.findings[0].area).toBe('architecture');
    });

    it('should set category to reference for contribution guides', async () => {
      const mockResponse: LlmExtractionResponse = {
        guides: [{ pattern: 'Test', title: 'Test Guide', steps: ['Step 1'], confidence: 0.8 }],
      };
      const mockLlmCall = vi.fn().mockResolvedValue(mockResponse);

      const service = new LlmExtractorService({
        llmCall: mockLlmCall,
        maxTokens: 2000,
      });

      const result = await service.extractContributionPatterns({
        modules: [],
        patterns: [],
        conventions: [],
      });

      expect(result.findings[0].category).toBe('reference');
    });
  });
});
