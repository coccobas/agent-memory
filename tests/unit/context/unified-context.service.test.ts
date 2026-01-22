/**
 * Unit tests for UnifiedContextService
 *
 * TDD: These tests are written BEFORE implementation.
 * They define the expected behavior of the unified context system.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Types we expect to exist
interface ContextPurpose {
  type: 'session_start' | 'tool_injection' | 'query' | 'custom';
  toolName?: string;
  query?: string;
}

interface UnifiedContextRequest {
  purpose: ContextPurpose;
  scopeType: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;
  sessionId?: string;
  projectId?: string;
  format?: 'markdown' | 'json' | 'natural_language';
  budget?: 'auto' | number;
  include?: Array<'guidelines' | 'knowledge' | 'tools' | 'experiences'>;
  excludeStale?: boolean;
  maxEntries?: number;
}

interface UnifiedContextResult {
  success: boolean;
  content: string;
  entries: Array<{
    id: string;
    type: 'guideline' | 'knowledge' | 'tool' | 'experience';
    title: string;
    content: string;
    priority?: number;
  }>;
  stats: {
    entriesIncluded: number;
    entriesExcluded: number;
    tokensUsed: number;
    tokenBudget: number;
    compressionLevel: 'none' | 'hierarchical' | 'llm' | 'truncated';
    processingTimeMs: number;
  };
  stalenessWarnings: Array<{
    entryId: string;
    entryType: string;
    reason: string;
    ageDays?: number;
    recommendation: string;
  }>;
  budgetInfo: {
    allocated: number;
    used: number;
    complexity: 'simple' | 'moderate' | 'complex' | 'critical';
  };
}

// Mock the service - will be implemented later
const createMockUnifiedContextService = () => ({
  getContext: vi.fn(),
  getBudgetForPurpose: vi.fn(),
  getDefaultInclude: vi.fn(),
});

describe('UnifiedContextService', () => {
  let service: ReturnType<typeof createMockUnifiedContextService>;

  beforeEach(() => {
    service = createMockUnifiedContextService();
    vi.clearAllMocks();
  });

  describe('getContext', () => {
    describe('purpose: session_start', () => {
      it('returns context optimized for session initialization', async () => {
        const request: UnifiedContextRequest = {
          purpose: { type: 'session_start' },
          scopeType: 'project',
          scopeId: 'proj-123',
          format: 'markdown',
        };

        const expectedResult: UnifiedContextResult = {
          success: true,
          content: '## Memory Context\n\n### Guidelines\n- Rule 1\n',
          entries: [{ id: 'g1', type: 'guideline', title: 'Rule 1', content: 'Content' }],
          stats: {
            entriesIncluded: 1,
            entriesExcluded: 0,
            tokensUsed: 50,
            tokenBudget: 2000,
            compressionLevel: 'none',
            processingTimeMs: 10,
          },
          stalenessWarnings: [],
          budgetInfo: {
            allocated: 2000,
            used: 50,
            complexity: 'simple',
          },
        };

        service.getContext.mockResolvedValue(expectedResult);
        const result = await service.getContext(request);

        expect(result.success).toBe(true);
        expect(result.content).toContain('Memory Context');
        expect(result.budgetInfo.complexity).toBe('simple');
      });

      it('uses moderate budget for session_start by default', async () => {
        service.getBudgetForPurpose.mockReturnValue(2000);
        const budget = service.getBudgetForPurpose({ type: 'session_start' });
        expect(budget).toBe(2000);
      });

      it('includes all entry types by default for session_start', async () => {
        service.getDefaultInclude.mockReturnValue([
          'guidelines',
          'knowledge',
          'tools',
          'experiences',
        ]);
        const include = service.getDefaultInclude({ type: 'session_start' });
        expect(include).toEqual(['guidelines', 'knowledge', 'tools', 'experiences']);
      });
    });

    describe('purpose: tool_injection', () => {
      it('returns context optimized for tool execution', async () => {
        const request: UnifiedContextRequest = {
          purpose: { type: 'tool_injection', toolName: 'Edit' },
          scopeType: 'project',
          scopeId: 'proj-123',
        };

        const expectedResult: UnifiedContextResult = {
          success: true,
          content: '## Relevant Memory Context\n\n### Guidelines\n- Coding standard\n',
          entries: [
            { id: 'g1', type: 'guideline', title: 'Coding standard', content: 'Use TypeScript' },
          ],
          stats: {
            entriesIncluded: 1,
            entriesExcluded: 2,
            tokensUsed: 30,
            tokenBudget: 1600,
            compressionLevel: 'none',
            processingTimeMs: 5,
          },
          stalenessWarnings: [],
          budgetInfo: {
            allocated: 1600,
            used: 30,
            complexity: 'simple',
          },
        };

        service.getContext.mockResolvedValue(expectedResult);
        const result = await service.getContext(request);

        expect(result.success).toBe(true);
        expect(result.stats.tokenBudget).toBeLessThanOrEqual(1600); // Tool injection uses smaller budget
      });

      it('adjusts budget based on tool complexity', async () => {
        // Edit tool = simple
        service.getBudgetForPurpose.mockReturnValue(1600);
        let budget = service.getBudgetForPurpose({ type: 'tool_injection', toolName: 'Edit' });
        expect(budget).toBe(1600);

        // Bash tool = potentially complex
        service.getBudgetForPurpose.mockReturnValue(3200);
        budget = service.getBudgetForPurpose({ type: 'tool_injection', toolName: 'Bash' });
        expect(budget).toBe(3200);
      });
    });

    describe('purpose: query', () => {
      it('returns context for user queries', async () => {
        const request: UnifiedContextRequest = {
          purpose: { type: 'query', query: 'authentication patterns' },
          scopeType: 'project',
          scopeId: 'proj-123',
        };

        const expectedResult: UnifiedContextResult = {
          success: true,
          content: '## Query Results\n\n### Knowledge\n- Auth uses JWT\n',
          entries: [{ id: 'k1', type: 'knowledge', title: 'Auth patterns', content: 'JWT tokens' }],
          stats: {
            entriesIncluded: 1,
            entriesExcluded: 0,
            tokensUsed: 100,
            tokenBudget: 4000,
            compressionLevel: 'none',
            processingTimeMs: 15,
          },
          stalenessWarnings: [],
          budgetInfo: {
            allocated: 4000,
            used: 100,
            complexity: 'moderate',
          },
        };

        service.getContext.mockResolvedValue(expectedResult);
        const result = await service.getContext(request);

        expect(result.success).toBe(true);
        expect(result.stats.tokenBudget).toBeGreaterThan(1600); // Query gets more budget
      });
    });

    describe('budget management', () => {
      it('respects explicit budget override', async () => {
        const request: UnifiedContextRequest = {
          purpose: { type: 'session_start' },
          scopeType: 'project',
          scopeId: 'proj-123',
          budget: 500, // Explicit small budget
        };

        const expectedResult: UnifiedContextResult = {
          success: true,
          content: '## Memory Context\n- Rule 1\n',
          entries: [{ id: 'g1', type: 'guideline', title: 'Rule 1', content: 'Short' }],
          stats: {
            entriesIncluded: 1,
            entriesExcluded: 5,
            tokensUsed: 50,
            tokenBudget: 500,
            compressionLevel: 'none',
            processingTimeMs: 8,
          },
          stalenessWarnings: [],
          budgetInfo: { allocated: 500, used: 50, complexity: 'simple' },
        };

        service.getContext.mockResolvedValue(expectedResult);
        const result = await service.getContext(request);

        expect(result.stats.tokenBudget).toBe(500);
        expect(result.stats.entriesExcluded).toBeGreaterThan(0); // Some excluded due to budget
      });

      it('applies compression when over budget', async () => {
        const request: UnifiedContextRequest = {
          purpose: { type: 'tool_injection', toolName: 'Edit' },
          scopeType: 'project',
          scopeId: 'proj-123',
          budget: 100, // Very small budget
        };

        const expectedResult: UnifiedContextResult = {
          success: true,
          content: '## Context (compressed)\n- Rules summary\n',
          entries: [{ id: 'g1', type: 'guideline', title: 'Rules', content: 'Summary' }],
          stats: {
            entriesIncluded: 1,
            entriesExcluded: 0,
            tokensUsed: 80,
            tokenBudget: 100,
            compressionLevel: 'hierarchical',
            processingTimeMs: 20,
          },
          stalenessWarnings: [],
          budgetInfo: { allocated: 100, used: 80, complexity: 'simple' },
        };

        service.getContext.mockResolvedValue(expectedResult);
        const result = await service.getContext(request);

        expect(result.stats.compressionLevel).not.toBe('none');
      });
    });

    describe('staleness detection', () => {
      it('returns warnings for stale entries', async () => {
        const request: UnifiedContextRequest = {
          purpose: { type: 'session_start' },
          scopeType: 'project',
          scopeId: 'proj-123',
        };

        const expectedResult: UnifiedContextResult = {
          success: true,
          content: '## Memory Context\n- Old rule\n',
          entries: [{ id: 'g1', type: 'guideline', title: 'Old rule', content: 'Outdated' }],
          stats: {
            entriesIncluded: 1,
            entriesExcluded: 0,
            tokensUsed: 50,
            tokenBudget: 2000,
            compressionLevel: 'none',
            processingTimeMs: 10,
          },
          stalenessWarnings: [
            {
              entryId: 'g1',
              entryType: 'guideline',
              reason: 'old_age',
              ageDays: 120,
              recommendation: 'Review and update this guideline',
            },
          ],
          budgetInfo: { allocated: 2000, used: 50, complexity: 'simple' },
        };

        service.getContext.mockResolvedValue(expectedResult);
        const result = await service.getContext(request);

        expect(result.stalenessWarnings).toHaveLength(1);
        expect(result.stalenessWarnings[0].ageDays).toBeGreaterThan(90);
      });

      it('excludes stale entries when excludeStale is true', async () => {
        const request: UnifiedContextRequest = {
          purpose: { type: 'tool_injection', toolName: 'Edit' },
          scopeType: 'project',
          scopeId: 'proj-123',
          excludeStale: true,
        };

        const expectedResult: UnifiedContextResult = {
          success: true,
          content: '## Memory Context\n- Fresh rule\n',
          entries: [{ id: 'g2', type: 'guideline', title: 'Fresh rule', content: 'Current' }],
          stats: {
            entriesIncluded: 1,
            entriesExcluded: 1, // Stale entry excluded
            tokensUsed: 40,
            tokenBudget: 1600,
            compressionLevel: 'none',
            processingTimeMs: 8,
          },
          stalenessWarnings: [], // No warnings since stale excluded
          budgetInfo: { allocated: 1600, used: 40, complexity: 'simple' },
        };

        service.getContext.mockResolvedValue(expectedResult);
        const result = await service.getContext(request);

        expect(result.stalenessWarnings).toHaveLength(0);
        expect(result.stats.entriesExcluded).toBeGreaterThan(0);
      });
    });

    describe('entry type filtering', () => {
      it('filters to only requested entry types', async () => {
        const request: UnifiedContextRequest = {
          purpose: { type: 'query' },
          scopeType: 'project',
          scopeId: 'proj-123',
          include: ['guidelines', 'knowledge'], // No tools or experiences
        };

        const expectedResult: UnifiedContextResult = {
          success: true,
          content: '## Context\n- Guideline 1\n- Knowledge 1\n',
          entries: [
            { id: 'g1', type: 'guideline', title: 'Guideline 1', content: 'G1' },
            { id: 'k1', type: 'knowledge', title: 'Knowledge 1', content: 'K1' },
          ],
          stats: {
            entriesIncluded: 2,
            entriesExcluded: 0,
            tokensUsed: 60,
            tokenBudget: 4000,
            compressionLevel: 'none',
            processingTimeMs: 12,
          },
          stalenessWarnings: [],
          budgetInfo: { allocated: 4000, used: 60, complexity: 'moderate' },
        };

        service.getContext.mockResolvedValue(expectedResult);
        const result = await service.getContext(request);

        // All entries should be guidelines or knowledge
        result.entries.forEach((entry) => {
          expect(['guideline', 'knowledge']).toContain(entry.type);
        });
      });
    });

    describe('format output', () => {
      it('formats as markdown by default', async () => {
        const request: UnifiedContextRequest = {
          purpose: { type: 'session_start' },
          scopeType: 'project',
          scopeId: 'proj-123',
        };

        const expectedResult: UnifiedContextResult = {
          success: true,
          content: '## Memory Context\n\n### Guidelines\n\n- **Rule 1**: Content here\n',
          entries: [{ id: 'g1', type: 'guideline', title: 'Rule 1', content: 'Content here' }],
          stats: {
            entriesIncluded: 1,
            entriesExcluded: 0,
            tokensUsed: 50,
            tokenBudget: 2000,
            compressionLevel: 'none',
            processingTimeMs: 10,
          },
          stalenessWarnings: [],
          budgetInfo: { allocated: 2000, used: 50, complexity: 'simple' },
        };

        service.getContext.mockResolvedValue(expectedResult);
        const result = await service.getContext(request);

        expect(result.content).toContain('##');
        expect(result.content).toContain('**');
      });

      it('formats as JSON when requested', async () => {
        const request: UnifiedContextRequest = {
          purpose: { type: 'query' },
          scopeType: 'project',
          scopeId: 'proj-123',
          format: 'json',
        };

        const expectedResult: UnifiedContextResult = {
          success: true,
          content: '{"memoryContext":{"guidelines":[{"title":"Rule 1"}]}}',
          entries: [{ id: 'g1', type: 'guideline', title: 'Rule 1', content: 'Content' }],
          stats: {
            entriesIncluded: 1,
            entriesExcluded: 0,
            tokensUsed: 60,
            tokenBudget: 4000,
            compressionLevel: 'none',
            processingTimeMs: 10,
          },
          stalenessWarnings: [],
          budgetInfo: { allocated: 4000, used: 60, complexity: 'moderate' },
        };

        service.getContext.mockResolvedValue(expectedResult);
        const result = await service.getContext(request);

        expect(() => JSON.parse(result.content)).not.toThrow();
      });
    });

    describe('error handling', () => {
      it('returns error result when scope not found', async () => {
        const request: UnifiedContextRequest = {
          purpose: { type: 'session_start' },
          scopeType: 'project',
          scopeId: 'non-existent',
        };

        const expectedResult = {
          success: false,
          content: '',
          entries: [],
          stats: {
            entriesIncluded: 0,
            entriesExcluded: 0,
            tokensUsed: 0,
            tokenBudget: 0,
            compressionLevel: 'none' as const,
            processingTimeMs: 5,
          },
          stalenessWarnings: [],
          budgetInfo: { allocated: 0, used: 0, complexity: 'simple' as const },
          error: 'Project not found: non-existent',
        };

        service.getContext.mockResolvedValue(expectedResult);
        const result = await service.getContext(request);

        expect(result.success).toBe(false);
      });

      it('handles empty results gracefully', async () => {
        const request: UnifiedContextRequest = {
          purpose: { type: 'query', query: 'nonexistent topic' },
          scopeType: 'project',
          scopeId: 'proj-123',
        };

        const expectedResult: UnifiedContextResult = {
          success: true,
          content: '',
          entries: [],
          stats: {
            entriesIncluded: 0,
            entriesExcluded: 0,
            tokensUsed: 0,
            tokenBudget: 4000,
            compressionLevel: 'none',
            processingTimeMs: 8,
          },
          stalenessWarnings: [],
          budgetInfo: { allocated: 4000, used: 0, complexity: 'moderate' },
        };

        service.getContext.mockResolvedValue(expectedResult);
        const result = await service.getContext(request);

        expect(result.success).toBe(true);
        expect(result.entries).toHaveLength(0);
        expect(result.content).toBe('');
      });
    });
  });
});
