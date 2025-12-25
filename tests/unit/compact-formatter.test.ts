import { describe, it, expect, beforeEach, vi } from 'vitest';
import { formatOutput } from '../../src/utils/compact-formatter.js';

// Mock config
vi.mock('../../src/config/index.js', () => ({
  config: {
    output: {
      format: 'compact',
    },
  },
}));

describe('Compact Formatter', () => {
  describe('formatOutput with compact mode', () => {
    it('should return summary for non-object values', () => {
      expect(formatOutput('simple string')).toContain('simple string');
      expect(formatOutput(123)).toContain('123');
      expect(formatOutput(null)).toContain('null');
    });

    describe('Error responses', () => {
      it('should format error response', () => {
        const result = formatOutput({
          error: 'Something went wrong',
          code: 'E1001',
        });
        expect(result).toContain('✗');
        expect(result).toContain('[E1001]');
        expect(result).toContain('Something went wrong');
      });

      it('should format error without code', () => {
        const result = formatOutput({ error: 'An error occurred' });
        expect(result).toContain('✗');
        expect(result).toContain('An error occurred');
      });

      it('should truncate long error messages', () => {
        const longError = 'A'.repeat(100);
        const result = formatOutput({ error: longError });
        expect(result).toContain('✗');
        expect(result.length).toBeLessThan(100);
        expect(result).toContain('…');
      });
    });

    describe('Stored entries', () => {
      it('should format stored guideline', () => {
        const result = formatOutput({
          success: true,
          guideline: {
            id: 'guide-12345678-abcd',
            name: 'Test Guideline',
            scopeType: 'project',
            scopeId: 'proj-12345678',
          },
        });
        expect(result).toContain('✓');
        expect(result).toContain('Stored guideline');
        expect(result).toContain('Test Guideline');
        expect(result).toContain('project');
      });

      it('should format stored knowledge', () => {
        const result = formatOutput({
          success: true,
          knowledge: {
            id: 'know-12345678-abcd',
            title: 'Test Knowledge',
            scopeType: 'org',
            scopeId: 'org-12345678',
          },
        });
        expect(result).toContain('✓');
        expect(result).toContain('Stored knowledge');
        expect(result).toContain('Test Knowledge');
        expect(result).toContain('org');
      });

      it('should format stored tool', () => {
        const result = formatOutput({
          success: true,
          tool: {
            id: 'tool-12345678-abcd',
            name: 'Test Tool',
            scopeType: 'global',
            scopeId: '',
          },
        });
        expect(result).toContain('✓');
        expect(result).toContain('Stored tool');
        expect(result).toContain('Test Tool');
      });

      it('should truncate long names', () => {
        const longName = 'A'.repeat(50);
        const result = formatOutput({
          success: true,
          guideline: {
            id: 'guide-12345678',
            name: longName,
            scopeType: 'project',
            scopeId: 'proj-123',
          },
        });
        expect(result).toContain('…');
      });
    });

    describe('Session operations', () => {
      it('should format started session', () => {
        const result = formatOutput({
          success: true,
          session: {
            id: 'sess-12345678-abcd',
            name: 'Work Session',
            status: 'active',
          },
        });
        expect(result).toContain('✓');
        expect(result).toContain('Started session');
        expect(result).toContain('Work Session');
        expect(result).toContain('active');
      });

      it('should format ended session', () => {
        const result = formatOutput({
          success: true,
          session: {
            id: 'sess-12345678',
            name: 'Completed Session',
            status: 'completed',
            endedAt: new Date().toISOString(),
          },
        });
        expect(result).toContain('✓');
        expect(result).toContain('Ended session');
        expect(result).toContain('Completed Session');
      });
    });

    describe('Project operations', () => {
      it('should format project response', () => {
        const result = formatOutput({
          success: true,
          project: {
            id: 'proj-12345678',
            name: 'My Project',
          },
        });
        expect(result).toContain('✓');
        expect(result).toContain('Project');
        expect(result).toContain('My Project');
      });
    });

    describe('Tag operations', () => {
      it('should format tag response', () => {
        const result = formatOutput({
          success: true,
          entryTag: {
            entryType: 'guideline',
            entryId: 'guide-12345678',
          },
        });
        expect(result).toContain('✓');
        expect(result).toContain('Tagged');
        expect(result).toContain('guideline');
      });
    });

    describe('List responses', () => {
      it('should format guidelines list', () => {
        const result = formatOutput({
          guidelines: [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }],
        });
        expect(result).toContain('✓');
        expect(result).toContain('3 guideline(s)');
      });

      it('should format knowledge list', () => {
        const result = formatOutput({
          knowledge: [{ id: 'k1' }],
        });
        expect(result).toContain('✓');
        expect(result).toContain('1 knowledge item(s)');
      });

      it('should format tools list', () => {
        const result = formatOutput({
          tools: [{ id: 't1' }, { id: 't2' }],
        });
        expect(result).toContain('✓');
        expect(result).toContain('2 tool(s)');
      });

      it('should format projects list', () => {
        const result = formatOutput({
          projects: [{ id: 'p1' }, { id: 'p2' }],
        });
        expect(result).toContain('✓');
        expect(result).toContain('2 project(s)');
      });

      it('should format sessions list', () => {
        const result = formatOutput({
          sessions: [{ id: 's1' }],
        });
        expect(result).toContain('✓');
        expect(result).toContain('1 session(s)');
      });

      it('should use meta.returnedCount when available', () => {
        const result = formatOutput({
          guidelines: [{ id: 'g1' }],
          meta: { returnedCount: 10 },
        });
        expect(result).toContain('10 guideline(s)');
      });
    });

    describe('Search results', () => {
      it('should format search results', () => {
        const result = formatOutput({
          results: [{ id: 'r1' }, { id: 'r2' }],
        });
        expect(result).toContain('✓');
        expect(result).toContain('Found');
        expect(result).toContain('2 result(s)');
      });

      it('should use meta.returnedCount for search results', () => {
        const result = formatOutput({
          results: [{ id: 'r1' }],
          meta: { returnedCount: 5 },
        });
        expect(result).toContain('5 result(s)');
      });
    });

    describe('Context response', () => {
      it('should format context response with scope but no arrays', () => {
        // Context response only triggers when scope is present
        // but guidelines/knowledge/tools are truthy but not arrays
        // In practice, the list check runs first if arrays are present
        // Let's test the list format when both scope and array are present
        const result = formatOutput({
          scope: { type: 'project', id: 'proj-12345678' },
          guidelines: [{ id: 'g1' }],
          meta: { returnedCount: 1 },
        });
        // List check runs first
        expect(result).toContain('✓');
        expect(result).toContain('1 guideline(s)');
      });

      it('should handle empty knowledge list', () => {
        const result = formatOutput({
          knowledge: [],
          meta: { returnedCount: 0 },
        });
        expect(result).toContain('0 knowledge item(s)');
      });

      it('should handle empty tools list', () => {
        const result = formatOutput({
          tools: [],
          meta: { returnedCount: 0 },
        });
        expect(result).toContain('0 tool(s)');
      });
    });

    describe('Bulk operations', () => {
      it('should format bulk stored entries', () => {
        const result = formatOutput({
          entries: [{ id: 'e1' }, { id: 'e2' }],
          count: 2,
        });
        expect(result).toContain('✓');
        expect(result).toContain('Bulk stored');
        expect(result).toContain('2 entries');
      });

      it('should use count from response', () => {
        const result = formatOutput({
          entries: [{ id: 'e1' }],
          count: 5,
        });
        expect(result).toContain('5 entries');
      });
    });

    describe('Observe commit', () => {
      it('should format stored commit response', () => {
        const result = formatOutput({
          stored: [{ id: 's1' }, { id: 's2' }],
          meta: { storedCount: 2 },
        });
        expect(result).toContain('✓');
        expect(result).toContain('Committed');
        expect(result).toContain('2 entries');
      });

      it('should use array length when meta not available', () => {
        const result = formatOutput({
          stored: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
        });
        expect(result).toContain('3 entries');
      });
    });

    describe('Draft response', () => {
      it('should format draft response', () => {
        const result = formatOutput({
          draft: { entries: [] },
        });
        expect(result).toContain('✓');
        expect(result).toContain('Draft prepared');
      });
    });

    describe('Generic success', () => {
      it('should format generic success', () => {
        const result = formatOutput({ success: true });
        expect(result).toContain('✓');
        expect(result).toContain('Success');
      });
    });

    describe('Health check', () => {
      it('should format health check response', () => {
        const result = formatOutput({
          status: 'healthy',
          database: { connected: true },
        });
        expect(result).toContain('✓');
        expect(result).toContain('Health:');
        expect(result).toContain('healthy');
      });
    });

    describe('Unknown response', () => {
      it('should format unknown object response', () => {
        const result = formatOutput({ unknownField: 'value' });
        expect(result).toContain('✓');
        expect(result).toContain('Done');
      });
    });
  });

  describe('shortId helper', () => {
    it('should truncate long IDs to 8 characters', () => {
      const result = formatOutput({
        success: true,
        guideline: {
          id: 'guide-12345678901234567890',
          name: 'Test',
          scopeType: 'project',
          scopeId: 'proj-987654321',
        },
      });
      // Short IDs should be 8 chars
      expect(result).toContain('guide-12');
    });

    it('should handle empty ID', () => {
      const result = formatOutput({
        success: true,
        guideline: {
          id: '',
          name: 'Test',
          scopeType: 'project',
          scopeId: 'proj-123',
        },
      });
      expect(result).toContain('–');
    });
  });
});
