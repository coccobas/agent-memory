/**
 * Terminal Formatter Tests
 */

import { describe, it, expect } from 'vitest';
import {
  formatStatusLine,
  formatBadges,
  formatTree,
  formatBox,
  formatBarChart,
  formatTable,
  formatHierarchicalContextTerminal,
  formatHealthTerminal,
  formatListTerminal,
  icons,
} from '../../src/utils/terminal-formatter.js';

describe('Terminal Formatter', () => {
  describe('formatStatusLine', () => {
    it('should format a healthy status line', () => {
      const result = formatStatusLine({
        status: 'healthy',
        items: [{ label: 'Session', value: 'active', status: 'active' }],
      });
      expect(result).toContain('●');
      expect(result).toContain('Healthy');
      expect(result).toContain('Session');
    });

    it('should format a degraded status line', () => {
      const result = formatStatusLine({
        status: 'degraded',
        items: [],
      });
      expect(result).toContain('◐');
      expect(result).toContain('Degraded');
    });
  });

  describe('formatBadges', () => {
    it('should format badges with values', () => {
      const result = formatBadges([
        { label: 'entries', value: 20 },
        { label: 'guidelines', value: 10 },
      ]);
      expect(result).toBe('[20 entries] [10 guidelines]');
    });

    it('should format badges without values', () => {
      const result = formatBadges([{ label: 'active' }, { label: 'healthy' }]);
      expect(result).toBe('[active] [healthy]');
    });
  });

  describe('formatTree', () => {
    it('should format a simple tree', () => {
      const result = formatTree({
        label: 'Root',
        children: [{ label: 'Child 1' }, { label: 'Child 2' }],
      });
      expect(result).toContain('Root');
      expect(result).toContain('├──');
      expect(result).toContain('└──');
      expect(result).toContain('Child 1');
      expect(result).toContain('Child 2');
    });

    it('should format a tree with icons and meta', () => {
      const result = formatTree({
        label: 'Memory',
        children: [
          { label: 'Guidelines', icon: icons.guideline, meta: '(10)' },
          { label: 'Knowledge', icon: icons.knowledge, meta: '(5)' },
        ],
      });
      expect(result).toContain('Memory');
      expect(result).toContain(icons.guideline);
      expect(result).toContain('(10)');
    });

    it('should format nested children', () => {
      const result = formatTree({
        label: 'Memory',
        children: [
          {
            label: 'Guidelines',
            children: [
              { label: 'workflow', meta: '(5)' },
              { label: 'code_style', meta: '(3)' },
            ],
          },
        ],
      });
      expect(result).toContain('workflow');
      expect(result).toContain('code_style');
    });
  });

  describe('formatBox', () => {
    it('should format content in a box', () => {
      const result = formatBox(['Line 1', 'Line 2']);
      expect(result).toContain('╭');
      expect(result).toContain('╯');
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
    });

    it('should format box with title', () => {
      const result = formatBox(['Content here'], { title: 'Title' });
      expect(result).toContain('Title');
      expect(result).toContain('─');
    });
  });

  describe('formatBarChart', () => {
    it('should format a bar chart', () => {
      const result = formatBarChart([
        { label: 'workflow', value: 7 },
        { label: 'fact', value: 8 },
        { label: 'code_style', value: 3 },
      ]);
      expect(result).toContain('workflow');
      expect(result).toContain('█');
      expect(result).toContain('░');
      expect(result).toContain('7');
      expect(result).toContain('8');
    });

    it('should handle empty items', () => {
      const result = formatBarChart([]);
      expect(result).toBe('');
    });
  });

  describe('formatTable', () => {
    it('should format a table with headers', () => {
      const result = formatTable(
        [
          ['Total Entries', '20'],
          ['Guidelines', '10'],
        ],
        { headers: ['Metric', 'Value'] }
      );
      expect(result).toContain('Metric');
      expect(result).toContain('Value');
      expect(result).toContain('Total Entries');
      expect(result).toContain('20');
      expect(result).toContain('╭');
      expect(result).toContain('╯');
    });

    it('should handle empty rows', () => {
      const result = formatTable([]);
      expect(result).toBe('');
    });
  });

  describe('formatHierarchicalContextTerminal', () => {
    it('should format hierarchical context', () => {
      const ctx = {
        summary: {
          totalEntries: 20,
          byType: { guideline: 10, knowledge: 10 },
          byCategory: { workflow: 7, fact: 8, code_style: 3 },
          lastUpdated: '2026-01-01T12:00:00Z',
        },
        critical: [
          {
            id: '123',
            type: 'guideline',
            title: 'test-guideline',
            snippet: 'Test content',
            priority: 95,
            category: 'workflow',
          },
        ],
        recent: [],
        categories: ['workflow', 'fact', 'code_style'],
        meta: {
          scopeType: 'project',
          scopeId: 'proj-123',
          tokenSavings: '~90%',
        },
        _context: {
          project: { name: 'Test Project', rootPath: '/test' },
          session: { name: 'Test Session', status: 'active' },
        },
      };

      const result = formatHierarchicalContextTerminal(ctx);
      expect(result).toContain('● Healthy');
      expect(result).toContain('[20 entries]');
      expect(result).toContain('Memory');
      expect(result).toContain('Guidelines');
      expect(result).toContain('Critical Guidelines:');
      expect(result).toContain('test-guideline');
    });
  });

  describe('formatHealthTerminal', () => {
    it('should format health response', () => {
      const health = {
        status: 'healthy',
        database: { connected: true, path: '/data/memory.db' },
        uptime: 3700,
      };

      const result = formatHealthTerminal(health);
      expect(result).toContain('● Healthy');
      expect(result).toContain('Connected');
      expect(result).toContain('1h');
    });
  });

  describe('formatListTerminal', () => {
    it('should format list response', () => {
      const items = [
        { id: '1', name: 'guideline-1', priority: 95 },
        { id: '2', name: 'guideline-2', priority: 80 },
      ];

      const result = formatListTerminal(items, 'guidelines');
      expect(result).toContain('[2 guidelines]');
      expect(result).toContain('guideline-1');
      expect(result).toContain('[P: 95]');
    });

    it('should handle empty list', () => {
      const result = formatListTerminal([], 'guidelines');
      expect(result).toContain('No guidelines found');
    });
  });
});
