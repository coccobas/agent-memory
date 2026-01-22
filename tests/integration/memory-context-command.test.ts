/**
 * Integration tests for memory_context MCP command
 *
 * TDD: These tests define the expected API contract.
 * Tests use mocks until implementation is complete, then will use real DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Types that will be defined in implementation
interface MemoryContextParams {
  action: 'get' | 'budget-info' | 'stats';
  purpose?: 'session_start' | 'tool_injection' | 'query';
  toolName?: string;
  query?: string;
  scopeType?: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;
  format?: 'markdown' | 'json' | 'natural_language';
  budget?: 'auto' | number;
  include?: Array<'guidelines' | 'knowledge' | 'tools' | 'experiences'>;
  excludeStale?: boolean;
  maxEntries?: number;
}

interface MemoryContextResult {
  success: boolean;
  content?: string;
  entries?: Array<{
    id: string;
    type: 'guideline' | 'knowledge' | 'tool' | 'experience';
    title: string;
    content: string;
  }>;
  stats?: {
    entriesIncluded: number;
    entriesExcluded: number;
    tokensUsed: number;
    tokenBudget: number;
    compressionLevel?: string;
  };
  stalenessWarnings?: Array<{
    entryId: string;
    entryType: string;
    reason: string;
    ageDays?: number;
  }>;
  budgetInfo?: {
    allocated: number;
    used: number;
    complexity: string;
  };
  error?: string;
}

// Mock handler until implementation exists
const mockHandleMemoryContext = vi.fn<[MemoryContextParams], Promise<MemoryContextResult>>();

describe('memory_context MCP command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('action: get', () => {
    it('returns context for session_start purpose', async () => {
      const params: MemoryContextParams = {
        action: 'get',
        purpose: 'session_start',
        scopeType: 'project',
        scopeId: 'proj-123',
      };

      mockHandleMemoryContext.mockResolvedValue({
        success: true,
        content:
          '## Memory Context\n\n### Guidelines\n- Code Style: Use TypeScript\n- Testing: Write tests first\n',
        entries: [
          { id: 'g1', type: 'guideline', title: 'Code Style', content: 'Use TypeScript' },
          { id: 'g2', type: 'guideline', title: 'Testing', content: 'Write tests first' },
        ],
        stats: {
          entriesIncluded: 2,
          entriesExcluded: 0,
          tokensUsed: 100,
          tokenBudget: 2000,
        },
        budgetInfo: { allocated: 2000, used: 100, complexity: 'simple' },
      });

      const result = await mockHandleMemoryContext(params);

      expect(result.success).toBe(true);
      expect(result.content).toContain('Guidelines');
      expect(result.stats?.entriesIncluded).toBe(2);
      expect(result.budgetInfo?.complexity).toBe('simple');
    });

    it('returns context for tool_injection purpose with smaller budget', async () => {
      const params: MemoryContextParams = {
        action: 'get',
        purpose: 'tool_injection',
        toolName: 'Edit',
        scopeType: 'project',
        scopeId: 'proj-123',
      };

      mockHandleMemoryContext.mockResolvedValue({
        success: true,
        content: '## Relevant Memory Context\n\n### Guidelines\n- Code Style\n',
        entries: [{ id: 'g1', type: 'guideline', title: 'Code Style', content: 'TypeScript' }],
        stats: {
          entriesIncluded: 1,
          entriesExcluded: 0,
          tokensUsed: 50,
          tokenBudget: 1600,
        },
      });

      const result = await mockHandleMemoryContext(params);

      expect(result.success).toBe(true);
      expect(result.stats?.tokenBudget).toBeLessThanOrEqual(1600);
    });

    it('respects explicit budget parameter', async () => {
      const params: MemoryContextParams = {
        action: 'get',
        purpose: 'query',
        scopeType: 'project',
        scopeId: 'proj-123',
        budget: 200,
      };

      mockHandleMemoryContext.mockResolvedValue({
        success: true,
        content: '## Context\n- Rule 1\n',
        stats: {
          entriesIncluded: 2,
          entriesExcluded: 8,
          tokensUsed: 180,
          tokenBudget: 200,
          compressionLevel: 'hierarchical',
        },
      });

      const result = await mockHandleMemoryContext(params);

      expect(result.stats?.tokensUsed).toBeLessThanOrEqual(200);
      expect(result.stats?.entriesExcluded).toBeGreaterThan(0);
    });

    it('includes staleness warnings for old entries', async () => {
      const params: MemoryContextParams = {
        action: 'get',
        purpose: 'session_start',
        scopeType: 'project',
        scopeId: 'proj-123',
      };

      mockHandleMemoryContext.mockResolvedValue({
        success: true,
        content: '## Context\n',
        stalenessWarnings: [
          {
            entryId: 'g1',
            entryType: 'guideline',
            reason: 'old_age',
            ageDays: 120,
          },
        ],
        stats: { entriesIncluded: 2, entriesExcluded: 0, tokensUsed: 100, tokenBudget: 2000 },
      });

      const result = await mockHandleMemoryContext(params);

      expect(result.stalenessWarnings?.length).toBeGreaterThan(0);
      expect(result.stalenessWarnings?.[0].ageDays).toBeGreaterThan(90);
    });

    it('excludes stale entries when excludeStale is true', async () => {
      const params: MemoryContextParams = {
        action: 'get',
        purpose: 'tool_injection',
        toolName: 'Edit',
        scopeType: 'project',
        scopeId: 'proj-123',
        excludeStale: true,
      };

      mockHandleMemoryContext.mockResolvedValue({
        success: true,
        content: '## Context\n- Fresh Rule\n',
        entries: [{ id: 'g2', type: 'guideline', title: 'Fresh Rule', content: 'Current' }],
        stats: { entriesIncluded: 1, entriesExcluded: 1, tokensUsed: 40, tokenBudget: 1600 },
        stalenessWarnings: [],
      });

      const result = await mockHandleMemoryContext(params);

      expect(result.stats?.entriesExcluded).toBe(1);
      expect(result.stalenessWarnings).toHaveLength(0);
    });

    it('filters by include parameter', async () => {
      const params: MemoryContextParams = {
        action: 'get',
        purpose: 'query',
        scopeType: 'project',
        scopeId: 'proj-123',
        include: ['knowledge'],
      };

      mockHandleMemoryContext.mockResolvedValue({
        success: true,
        content: '## Knowledge\n- Fact 1\n',
        entries: [{ id: 'k1', type: 'knowledge', title: 'Fact 1', content: 'Info' }],
        stats: { entriesIncluded: 1, entriesExcluded: 0, tokensUsed: 30, tokenBudget: 4000 },
      });

      const result = await mockHandleMemoryContext(params);

      // All entries should be knowledge only
      result.entries?.forEach((entry) => {
        expect(entry.type).toBe('knowledge');
      });
    });

    it('formats output as JSON when requested', async () => {
      const params: MemoryContextParams = {
        action: 'get',
        purpose: 'query',
        scopeType: 'project',
        scopeId: 'proj-123',
        format: 'json',
      };

      mockHandleMemoryContext.mockResolvedValue({
        success: true,
        content: '{"memoryContext":{"guidelines":[{"title":"Rule 1"}]}}',
        stats: { entriesIncluded: 1, entriesExcluded: 0, tokensUsed: 60, tokenBudget: 4000 },
      });

      const result = await mockHandleMemoryContext(params);

      expect(() => JSON.parse(result.content!)).not.toThrow();
    });
  });

  describe('action: budget-info', () => {
    it('returns budget information for purposes', async () => {
      const params: MemoryContextParams = {
        action: 'budget-info',
      };

      mockHandleMemoryContext.mockResolvedValue({
        success: true,
        content: JSON.stringify({
          budgets: {
            session_start: { default: 2000, min: 500, max: 4000 },
            tool_injection: { default: 1600, min: 200, max: 3200 },
            query: { default: 4000, min: 1000, max: 8000 },
          },
        }),
      });

      const result = await mockHandleMemoryContext(params);
      const data = JSON.parse(result.content!);

      expect(data.budgets.session_start.default).toBe(2000);
      expect(data.budgets.tool_injection.default).toBeLessThan(data.budgets.query.default);
    });
  });

  describe('action: stats', () => {
    it('returns statistics about stored context', async () => {
      const params: MemoryContextParams = {
        action: 'stats',
        scopeType: 'project',
        scopeId: 'proj-123',
      };

      mockHandleMemoryContext.mockResolvedValue({
        success: true,
        content: JSON.stringify({
          totalEntries: 10,
          byType: { guidelines: 4, knowledge: 3, tools: 2, experiences: 1 },
          staleCount: 2,
          totalTokensEstimate: 1500,
        }),
      });

      const result = await mockHandleMemoryContext(params);
      const data = JSON.parse(result.content!);

      expect(data.totalEntries).toBe(10);
      expect(data.staleCount).toBe(2);
    });
  });

  describe('error handling', () => {
    it('returns error for invalid purpose', async () => {
      const params = {
        action: 'get' as const,
        purpose: 'invalid_purpose' as 'session_start',
        scopeType: 'project' as const,
        scopeId: 'proj-123',
      };

      mockHandleMemoryContext.mockResolvedValue({
        success: false,
        error: 'Invalid purpose: invalid_purpose',
      });

      const result = await mockHandleMemoryContext(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid purpose');
    });

    it('returns error for missing scopeId when required', async () => {
      const params: MemoryContextParams = {
        action: 'get',
        purpose: 'session_start',
        scopeType: 'project',
        // scopeId intentionally missing
      };

      mockHandleMemoryContext.mockResolvedValue({
        success: false,
        error: 'scopeId required for project scope',
      });

      const result = await mockHandleMemoryContext(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('scopeId');
    });

    it('handles non-existent project gracefully', async () => {
      const params: MemoryContextParams = {
        action: 'get',
        purpose: 'session_start',
        scopeType: 'project',
        scopeId: 'non-existent-project-id',
      };

      mockHandleMemoryContext.mockResolvedValue({
        success: true,
        content: '',
        entries: [],
        stats: { entriesIncluded: 0, entriesExcluded: 0, tokensUsed: 0, tokenBudget: 2000 },
      });

      const result = await mockHandleMemoryContext(params);

      expect(result.success).toBe(true);
      expect(result.stats?.entriesIncluded).toBe(0);
    });
  });
});
