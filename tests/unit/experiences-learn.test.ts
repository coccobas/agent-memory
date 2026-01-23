/**
 * Tests for the learn handler's text parsing, including LLM-enhanced parsing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IExtractionService, ExtractionProvider } from '../../src/core/context.js';

// =============================================================================
// MOCK THE REGEX-BASED PARSER FOR REFERENCE
// =============================================================================

/**
 * This is the existing regex-based parser we're testing/enhancing.
 * Exported from experiences.handler.ts as parseExperienceText.
 */
function parseExperienceText(text: string): {
  title: string;
  scenario: string;
  outcome: string;
  content: string;
} {
  const normalized = text.trim();

  // Pattern: "Fixed/Resolved/Solved X by doing Y"
  const fixedByMatch = normalized.match(
    /^(fixed|resolved|solved|addressed|handled)\s+(.+?)\s+by\s+(.+)$/i
  );
  if (fixedByMatch) {
    const problem = fixedByMatch[2]?.trim() ?? '';
    const solution = fixedByMatch[3]?.trim() ?? '';
    return {
      title: `${fixedByMatch[1]} ${problem.slice(0, 50)}`,
      scenario: problem,
      outcome: `success - ${solution}`,
      content: normalized,
    };
  }

  // Pattern: "Learned/Discovered that X when/while Y"
  const learnedWhenMatch = normalized.match(
    /^(learned|discovered|realized|found out)\s+(?:that\s+)?(.+?)\s+(when|while|after)\s+(.+)$/i
  );
  if (learnedWhenMatch) {
    const learning = learnedWhenMatch[2]?.trim() ?? '';
    const context = learnedWhenMatch[4]?.trim() ?? '';
    return {
      title: learning.slice(0, 60),
      scenario: context,
      outcome: learning,
      content: normalized,
    };
  }

  // Pattern: "Figured out X by Y"
  const figuredOutMatch = normalized.match(/^figured\s+out\s+(.+?)\s+by\s+(.+)$/i);
  if (figuredOutMatch) {
    const what = figuredOutMatch[1]?.trim() ?? '';
    const how = figuredOutMatch[2]?.trim() ?? '';
    return {
      title: what.slice(0, 60),
      scenario: `needed to figure out ${what}`,
      outcome: `${what} - achieved by ${how}`,
      content: normalized,
    };
  }

  // Pattern: "X: Y" or "X - Y" (problem: solution format)
  const colonMatch = normalized.match(/^([^:-]+)[:–—-]\s*(.+)$/);
  if (colonMatch && colonMatch[1] && colonMatch[2] && colonMatch[1].length < 80) {
    return {
      title: colonMatch[1].trim().slice(0, 60),
      scenario: colonMatch[1].trim(),
      outcome: colonMatch[2].trim(),
      content: normalized,
    };
  }

  // Pattern: Simple discovery "Discovered/Found X"
  const discoveredMatch = normalized.match(
    /^(discovered|found|learned|realized)\s+(?:that\s+)?(.+)$/i
  );
  if (discoveredMatch) {
    const discovery = discoveredMatch[2]?.trim() ?? '';
    return {
      title: discovery.slice(0, 60),
      scenario: 'investigation',
      outcome: discovery,
      content: normalized,
    };
  }

  // Fallback: use first sentence as title, whole text as content
  const firstSentence = (normalized.split(/[.!?]/)[0] ?? normalized).trim();
  const title =
    firstSentence.length > 60 ? firstSentence.slice(0, 57) + '...' : firstSentence || 'Experience';

  return {
    title,
    scenario: normalized,
    outcome: 'recorded',
    content: normalized,
  };
}

// =============================================================================
// LLM-ENHANCED PARSER (TO BE IMPLEMENTED)
// =============================================================================

interface ParsedExperience {
  title: string;
  scenario: string;
  outcome: string;
  content: string;
}

/**
 * Parse experience text with LLM enhancement.
 * Falls back to regex-based parsing if LLM is unavailable or fails.
 */
async function parseExperienceTextWithLLM(
  text: string,
  extractionService?: IExtractionService
): Promise<ParsedExperience> {
  // If no extraction service or not available, use regex fallback
  if (!extractionService?.isAvailable()) {
    return parseExperienceText(text);
  }

  try {
    const prompt = `Parse this experience description and extract structured information.

Text: "${text}"

Respond in this exact JSON format:
{
  "title": "Brief title (max 60 chars) summarizing the experience",
  "scenario": "The context or situation that triggered this experience",
  "outcome": "What was learned, achieved, or discovered"
}`;

    const result = await extractionService.extract({
      context: prompt,
      contextType: 'mixed',
      focusAreas: ['facts', 'decisions'],
    });

    // Try to parse JSON from any extracted entry
    for (const entry of result.entries) {
      try {
        const jsonMatch = entry.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as {
            title?: string;
            scenario?: string;
            outcome?: string;
          };
          if (parsed.title && parsed.scenario && parsed.outcome) {
            return {
              title: parsed.title.slice(0, 60),
              scenario: parsed.scenario,
              outcome: parsed.outcome,
              content: text.trim(),
            };
          }
        }
      } catch {
        // Continue to next entry
      }
    }

    // If no valid JSON found in entries, fall back to regex
    return parseExperienceText(text);
  } catch (error) {
    // On any error, fall back to regex
    return parseExperienceText(text);
  }
}

// =============================================================================
// TESTS FOR REGEX-BASED PARSING
// =============================================================================

describe('parseExperienceText (regex-based)', () => {
  describe('Fixed/Resolved/Solved patterns', () => {
    it('should parse "Fixed X by Y" pattern', () => {
      const result = parseExperienceText('Fixed the auth bug by adding token validation');
      expect(result.scenario).toBe('the auth bug');
      expect(result.outcome).toBe('success - adding token validation');
      expect(result.title).toContain('Fixed');
    });

    it('should parse "Resolved X by Y" pattern', () => {
      const result = parseExperienceText('Resolved memory leak by clearing event listeners');
      expect(result.scenario).toBe('memory leak');
      expect(result.outcome).toBe('success - clearing event listeners');
    });

    it('should parse "Solved X by Y" pattern', () => {
      const result = parseExperienceText('Solved database timeout by increasing pool size');
      expect(result.scenario).toBe('database timeout');
      expect(result.outcome).toBe('success - increasing pool size');
    });
  });

  describe('Learned/Discovered patterns', () => {
    it('should parse "Learned that X when Y" pattern', () => {
      const result = parseExperienceText(
        'Learned that caching improves performance when handling large datasets'
      );
      expect(result.outcome).toBe('caching improves performance');
      expect(result.scenario).toBe('handling large datasets');
    });

    it('should parse "Discovered X while Y" pattern', () => {
      const result = parseExperienceText(
        'Discovered a race condition while testing concurrent requests'
      );
      expect(result.outcome).toBe('a race condition');
      expect(result.scenario).toBe('testing concurrent requests');
    });
  });

  describe('Figured out pattern', () => {
    it('should parse "Figured out X by Y" pattern', () => {
      const result = parseExperienceText('Figured out the deployment issue by checking the logs');
      expect(result.title).toContain('deployment issue');
      expect(result.scenario).toContain('needed to figure out');
    });
  });

  describe('Colon/dash separator pattern', () => {
    it('should parse "X: Y" pattern', () => {
      const result = parseExperienceText('Auth failure: Token was expired');
      expect(result.scenario).toBe('Auth failure');
      expect(result.outcome).toBe('Token was expired');
    });

    it('should parse "X - Y" pattern', () => {
      const result = parseExperienceText('Memory issue - Garbage collector not running');
      expect(result.scenario).toBe('Memory issue');
      expect(result.outcome).toBe('Garbage collector not running');
    });
  });

  describe('Simple discovery pattern', () => {
    it('should parse "Discovered X" pattern', () => {
      const result = parseExperienceText('Discovered the API rate limits were too strict');
      expect(result.outcome).toBe('the API rate limits were too strict');
      expect(result.scenario).toBe('investigation');
    });

    it('should parse "Found X" pattern', () => {
      const result = parseExperienceText('Found that the config was missing');
      expect(result.outcome).toBe('the config was missing');
    });
  });

  describe('Fallback pattern', () => {
    it('should use first sentence as title for unrecognized patterns', () => {
      const result = parseExperienceText(
        'The API endpoint was returning 500 errors. We investigated the logs.'
      );
      expect(result.title).toBe('The API endpoint was returning 500 errors');
      expect(result.outcome).toBe('recorded');
    });

    it('should truncate long titles', () => {
      const longText = 'A'.repeat(100);
      const result = parseExperienceText(longText);
      expect(result.title.length).toBeLessThanOrEqual(60);
    });
  });
});

// =============================================================================
// TESTS FOR LLM-ENHANCED PARSING
// =============================================================================

describe('parseExperienceTextWithLLM', () => {
  let mockExtractionService: IExtractionService;

  function createMockExtractionService(available: boolean): IExtractionService {
    return {
      isAvailable: () => available,
      getProvider: () => 'openai' as ExtractionProvider,
      extract: vi.fn(),
    };
  }

  beforeEach(() => {
    mockExtractionService = createMockExtractionService(true);
  });

  describe('fallback behavior', () => {
    it('should fall back to regex when extraction service is unavailable', async () => {
      const unavailableService = createMockExtractionService(false);
      const result = await parseExperienceTextWithLLM(
        'Fixed the bug by updating the config',
        unavailableService
      );

      expect(result.scenario).toBe('the bug');
      expect(result.outcome).toBe('success - updating the config');
      expect(unavailableService.extract).not.toHaveBeenCalled();
    });

    it('should fall back to regex when extraction service is not provided', async () => {
      const result = await parseExperienceTextWithLLM('Fixed the bug by updating the config');

      expect(result.scenario).toBe('the bug');
      expect(result.outcome).toBe('success - updating the config');
    });

    it('should fall back to regex when LLM extraction throws', async () => {
      vi.mocked(mockExtractionService.extract).mockRejectedValue(new Error('API error'));

      const result = await parseExperienceTextWithLLM(
        'Fixed the bug by updating the config',
        mockExtractionService
      );

      expect(result.scenario).toBe('the bug');
      expect(result.outcome).toBe('success - updating the config');
    });

    it('should fall back to regex when LLM returns invalid JSON', async () => {
      vi.mocked(mockExtractionService.extract).mockResolvedValue({
        entries: [{ type: 'knowledge', content: 'not valid json', confidence: 0.9 }],
        entities: [],
        relationships: [],
        model: 'gpt-4',
        provider: 'openai',
        processingTimeMs: 100,
      });

      const result = await parseExperienceTextWithLLM(
        'Fixed the bug by updating the config',
        mockExtractionService
      );

      expect(result.scenario).toBe('the bug');
    });

    it('should fall back to regex when LLM JSON is missing required fields', async () => {
      vi.mocked(mockExtractionService.extract).mockResolvedValue({
        entries: [
          {
            type: 'knowledge',
            content: '{"title": "Test"}', // Missing scenario and outcome
            confidence: 0.9,
          },
        ],
        entities: [],
        relationships: [],
        model: 'gpt-4',
        provider: 'openai',
        processingTimeMs: 100,
      });

      const result = await parseExperienceTextWithLLM(
        'Fixed the bug by updating the config',
        mockExtractionService
      );

      // Falls back to regex
      expect(result.scenario).toBe('the bug');
    });
  });

  describe('successful LLM parsing', () => {
    it('should use LLM-parsed result when available', async () => {
      vi.mocked(mockExtractionService.extract).mockResolvedValue({
        entries: [
          {
            type: 'knowledge',
            content: JSON.stringify({
              title: 'Authentication Bug Fix',
              scenario: 'JWT tokens were expiring prematurely',
              outcome: 'Added proper token refresh mechanism',
            }),
            confidence: 0.95,
          },
        ],
        entities: [],
        relationships: [],
        model: 'gpt-4',
        provider: 'openai',
        processingTimeMs: 150,
      });

      const result = await parseExperienceTextWithLLM(
        'Fixed auth issues by implementing token refresh',
        mockExtractionService
      );

      expect(result.title).toBe('Authentication Bug Fix');
      expect(result.scenario).toBe('JWT tokens were expiring prematurely');
      expect(result.outcome).toBe('Added proper token refresh mechanism');
      expect(result.content).toBe('Fixed auth issues by implementing token refresh');
    });

    it('should truncate title to 60 characters', async () => {
      vi.mocked(mockExtractionService.extract).mockResolvedValue({
        entries: [
          {
            type: 'knowledge',
            content: JSON.stringify({
              title: 'A'.repeat(100),
              scenario: 'test scenario',
              outcome: 'test outcome',
            }),
            confidence: 0.95,
          },
        ],
        entities: [],
        relationships: [],
        model: 'gpt-4',
        provider: 'openai',
        processingTimeMs: 150,
      });

      const result = await parseExperienceTextWithLLM('Some text', mockExtractionService);

      expect(result.title.length).toBe(60);
    });

    it('should handle JSON embedded in text response', async () => {
      vi.mocked(mockExtractionService.extract).mockResolvedValue({
        entries: [
          {
            type: 'knowledge',
            content: `Here is the parsed result:
{
  "title": "Database Optimization",
  "scenario": "Slow queries",
  "outcome": "Added index"
}
Additional notes...`,
            confidence: 0.9,
          },
        ],
        entities: [],
        relationships: [],
        model: 'gpt-4',
        provider: 'openai',
        processingTimeMs: 100,
      });

      const result = await parseExperienceTextWithLLM('Optimized database', mockExtractionService);

      expect(result.title).toBe('Database Optimization');
      expect(result.scenario).toBe('Slow queries');
      expect(result.outcome).toBe('Added index');
    });

    it('should try multiple entries to find valid JSON', async () => {
      vi.mocked(mockExtractionService.extract).mockResolvedValue({
        entries: [
          { type: 'knowledge', content: 'invalid', confidence: 0.5 },
          { type: 'knowledge', content: 'also invalid', confidence: 0.6 },
          {
            type: 'knowledge',
            content: JSON.stringify({
              title: 'Valid Entry',
              scenario: 'Third time',
              outcome: 'Is the charm',
            }),
            confidence: 0.9,
          },
        ],
        entities: [],
        relationships: [],
        model: 'gpt-4',
        provider: 'openai',
        processingTimeMs: 200,
      });

      const result = await parseExperienceTextWithLLM('Some experience', mockExtractionService);

      expect(result.title).toBe('Valid Entry');
      expect(result.outcome).toBe('Is the charm');
    });
  });

  describe('complex natural language parsing', () => {
    it('should handle ambiguous text better than regex', async () => {
      // This text doesn't match any regex pattern well
      const ambiguousText =
        'After spending 3 hours debugging, I finally realized the issue was with the environment variables not being loaded correctly in the Docker container';

      vi.mocked(mockExtractionService.extract).mockResolvedValue({
        entries: [
          {
            type: 'knowledge',
            content: JSON.stringify({
              title: 'Docker Environment Variable Issue',
              scenario: 'Debugging session - Docker container not loading env vars',
              outcome: 'Discovered environment variables were not properly passed to Docker',
            }),
            confidence: 0.92,
          },
        ],
        entities: [],
        relationships: [],
        model: 'gpt-4',
        provider: 'openai',
        processingTimeMs: 180,
      });

      const result = await parseExperienceTextWithLLM(ambiguousText, mockExtractionService);

      // LLM provides better structured result
      expect(result.title).toBe('Docker Environment Variable Issue');
      expect(result.scenario).toContain('Docker');
      expect(result.outcome).toContain('environment variables');
    });
  });
});
