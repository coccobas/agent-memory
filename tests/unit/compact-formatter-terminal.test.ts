import { describe, it, expect, vi } from 'vitest';

// Mock config for terminal mode
vi.mock('../../src/config/index.js', () => ({
  config: {
    output: {
      format: 'terminal',
    },
  },
}));

// Mock terminal-formatter with simplified implementations
vi.mock('../../src/utils/terminal-formatter.js', () => ({
  formatHierarchicalContextTerminal: vi.fn(() => '[HIERARCHICAL CONTEXT]'),
  formatHealthTerminal: vi.fn(() => '[HEALTH TERMINAL]'),
  formatListTerminal: vi.fn(
    (items: unknown[], type: string) => `[LIST ${type}: ${(items as unknown[]).length}]`
  ),
  formatStatusTerminal: vi.fn(() => '[STATUS TERMINAL]'),
  formatStatusLine: vi.fn((opts: { items: Array<{ label: string; value: string }> }) =>
    opts.items.map((i) => `${i.label}: ${i.value}`).join(', ')
  ),
  formatBadges: vi.fn((badges: Array<{ label: string }>) =>
    badges.map((b) => `[${b.label}]`).join(' ')
  ),
  icons: {
    success: '✓',
    failure: '✗',
    info: 'ℹ',
    warning: '⚠',
  },
}));

import { formatOutput } from '../../src/utils/compact-formatter.js';

describe('Compact Formatter - Terminal Mode', () => {
  describe('formatOutput with terminal mode', () => {
    it('should return summary for non-object values (falls back to compact)', () => {
      const result = formatOutput('simple string');
      expect(result).toContain('simple string');
    });

    describe('Hierarchical context response', () => {
      it('should use formatHierarchicalContextTerminal for hierarchical response', () => {
        const result = formatOutput({
          summary: { totalEntries: 10 },
          guidelines: [],
          knowledge: [],
        });
        expect(result).toBe('[HIERARCHICAL CONTEXT]');
      });
    });

    describe('Health check response', () => {
      it('should use formatHealthTerminal for health check', () => {
        const result = formatOutput({
          status: 'healthy',
          database: { connected: true },
        });
        expect(result).toBe('[HEALTH TERMINAL]');
      });
    });

    describe('Status dashboard response', () => {
      it('should use formatStatusTerminal for status dashboard', () => {
        const result = formatOutput({
          counts: { guidelines: 5, knowledge: 3, tools: 2 },
        });
        expect(result).toBe('[STATUS TERMINAL]');
      });
    });

    describe('List responses', () => {
      it('should format guidelines list in terminal mode', () => {
        const result = formatOutput({
          guidelines: [
            { id: 'g1', name: 'Guide 1' },
            { id: 'g2', name: 'Guide 2' },
          ],
        });
        expect(result).toBe('[LIST guidelines: 2]');
      });

      it('should format knowledge list in terminal mode', () => {
        const result = formatOutput({
          knowledge: [{ id: 'k1', title: 'Knowledge 1' }],
        });
        expect(result).toBe('[LIST knowledge: 1]');
      });

      it('should format tools list in terminal mode', () => {
        const result = formatOutput({
          tools: [{ id: 't1', name: 'Tool 1' }],
        });
        expect(result).toBe('[LIST tools: 1]');
      });

      it('should fall back to compact for empty lists', () => {
        const result = formatOutput({
          guidelines: [],
        });
        // Empty list doesn't trigger terminal format, falls back to compact
        expect(result).toContain('0 guideline(s)');
      });
    });

    describe('Session operations', () => {
      it('should format started session with formatStatusLine', () => {
        const result = formatOutput({
          success: true,
          session: {
            id: 'sess-123',
            name: 'Work Session',
            status: 'active',
          },
        });
        expect(result).toContain('Started');
        expect(result).toContain('Work Session');
      });

      it('should format ended session', () => {
        const result = formatOutput({
          success: true,
          session: {
            id: 'sess-123',
            name: 'Ended Session',
            status: 'completed',
            endedAt: '2024-01-01T00:00:00Z',
          },
        });
        expect(result).toContain('Ended');
        expect(result).toContain('Ended Session');
      });
    });

    describe('Quickstart responses', () => {
      it('should format quickstart with resumed session', () => {
        const result = formatOutput({
          quickstart: {
            sessionAction: 'resumed',
            resumedSessionName: 'My Work Session',
          },
        });
        expect(result).toContain('Resumed');
        expect(result).toContain('My Work Session');
        expect(result).toContain('Context');
        expect(result).toContain('loaded');
      });

      it('should format quickstart with created session', () => {
        const result = formatOutput({
          quickstart: {
            sessionAction: 'created',
            requestedSessionName: 'New Session',
          },
        });
        expect(result).toContain('Started');
        expect(result).toContain('New Session');
      });

      it('should format quickstart with session error', () => {
        const result = formatOutput({
          quickstart: {
            sessionAction: 'error',
          },
        });
        expect(result).toContain('Session');
        expect(result).toContain('failed to start');
      });

      it('should format quickstart without session action', () => {
        const result = formatOutput({
          quickstart: {},
        });
        expect(result).toContain('Context');
        expect(result).toContain('loaded');
      });
    });

    describe('Success with stored entries', () => {
      it('should format stored guideline with badges', () => {
        const result = formatOutput({
          success: true,
          guideline: {
            id: 'guide-123',
            name: 'Test Guideline',
          },
        });
        expect(result).toContain('✓');
        expect(result).toContain('[guideline]');
        expect(result).toContain('[Test Guideline]');
      });

      it('should format stored knowledge with badges', () => {
        const result = formatOutput({
          success: true,
          knowledge: {
            id: 'know-123',
            title: 'Test Knowledge',
          },
        });
        expect(result).toContain('✓');
        expect(result).toContain('[knowledge]');
        expect(result).toContain('[Test Knowledge]');
      });

      it('should format stored tool with badges', () => {
        const result = formatOutput({
          success: true,
          tool: {
            id: 'tool-123',
            name: 'Test Tool',
          },
        });
        expect(result).toContain('✓');
        expect(result).toContain('[tool]');
        expect(result).toContain('[Test Tool]');
      });

      it('should truncate long names in badges', () => {
        const longName = 'A'.repeat(50);
        const result = formatOutput({
          success: true,
          guideline: {
            id: 'guide-123',
            name: longName,
          },
        });
        expect(result).toContain('✓');
        expect(result).toContain('[guideline]');
        // Name should be truncated to 25 chars + ellipsis
        expect(result).not.toContain(longName);
      });
    });

    describe('Error response', () => {
      it('should format error response with icon', () => {
        const result = formatOutput({
          error: 'Something went wrong',
          code: 'E1001',
        });
        expect(result).toContain('✗');
        expect(result).toContain('[E1001]');
        expect(result).toContain('Something went wrong');
      });

      it('should format error without code', () => {
        const result = formatOutput({
          error: 'An error occurred',
        });
        expect(result).toContain('✗');
        expect(result).toContain('An error occurred');
      });

      it('should truncate long error messages', () => {
        const longError = 'A'.repeat(100);
        const result = formatOutput({ error: longError });
        expect(result).toContain('✗');
        expect(result.length).toBeLessThan(100);
      });
    });

    describe('Fallback to compact', () => {
      it('should fall back to compact for unhandled types', () => {
        const result = formatOutput({
          results: [{ id: 'r1' }],
        });
        // Search results don't have terminal formatting, falls back to compact
        expect(result).toContain('✓');
        expect(result).toContain('Found');
        expect(result).toContain('1 result(s)');
      });

      it('should fall back to compact for generic success', () => {
        const result = formatOutput({ success: true });
        expect(result).toContain('✓');
        expect(result).toContain('Success');
      });

      it('should fall back to compact for unknown responses', () => {
        const result = formatOutput({ unknownField: 'value' });
        expect(result).toContain('✓');
        expect(result).toContain('Done');
      });
    });
  });
});
