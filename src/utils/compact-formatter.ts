/**
 * Compact output formatter for MCP responses
 *
 * Converts verbose JSON responses to human-readable single-line summaries.
 * Terminal mode provides rich formatting with trees, boxes, and icons.
 */

import { config } from '../config/index.js';
import {
  formatHierarchicalContextTerminal,
  formatHealthTerminal,
  formatListTerminal,
  formatStatusTerminal,
  formatStatusLine,
  formatBadges,
  icons,
} from './terminal-formatter.js';

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

function shortId(id: unknown): string {
  if (typeof id !== 'string' || id.length === 0) return '–';
  return id.slice(0, 8);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function analyzeResult(result: unknown): { type: string; summary: string } {
  if (!isRecord(result)) {
    return { type: 'unknown', summary: String(result) };
  }

  // Error response
  if ('error' in result && result.error) {
    const code = typeof result.code === 'string' ? `[${result.code}]` : '';
    return {
      type: 'error',
      summary: `✗ ${code} ${truncate(String(result.error), 80)}`,
    };
  }

  // Success with stored entry (guideline/knowledge/tool add)
  if (result.success === true && isRecord(result.guideline)) {
    const g = result.guideline;
    return {
      type: 'stored',
      summary: `✓ Stored guideline "${truncate(String(g.name || ''), 30)}" (${String(
        g.scopeType || ''
      )}:${shortId(g.scopeId)}, id:${shortId(g.id)})`,
    };
  }
  if (result.success === true && isRecord(result.knowledge)) {
    const k = result.knowledge;
    return {
      type: 'stored',
      summary: `✓ Stored knowledge "${truncate(String(k.title || ''), 30)}" (${String(
        k.scopeType || ''
      )}:${shortId(k.scopeId)}, id:${shortId(k.id)})`,
    };
  }
  if (result.success === true && isRecord(result.tool)) {
    const t = result.tool;
    return {
      type: 'stored',
      summary: `✓ Stored tool "${truncate(String(t.name || ''), 30)}" (${String(
        t.scopeType || ''
      )}:${shortId(t.scopeId)}, id:${shortId(t.id)})`,
    };
  }

  // Session operations
  if (result.success === true && isRecord(result.session)) {
    const s = result.session;
    const action = s.endedAt ? 'Ended' : 'Started';
    return {
      type: 'session',
      summary: `✓ ${action} session "${truncate(String(s.name || ''), 25)}" (id:${shortId(
        s.id
      )}, status:${String(s.status || '')})`,
    };
  }

  // Quickstart response (combined context + session)
  if (isRecord(result.quickstart)) {
    const qs = result.quickstart;
    const sessionAction = qs.sessionAction;

    if (sessionAction === 'resumed') {
      const resumedName = qs.resumedSessionName || 'unnamed';
      return {
        type: 'quickstart',
        summary: `✓ Context loaded, resumed session "${truncate(String(resumedName), 25)}"`,
      };
    } else if (sessionAction === 'created') {
      const createdName = qs.requestedSessionName || 'unnamed';
      return {
        type: 'quickstart',
        summary: `✓ Context loaded, started session "${truncate(String(createdName), 25)}"`,
      };
    } else if (sessionAction === 'error') {
      return {
        type: 'quickstart',
        summary: '✓ Context loaded (session start failed)',
      };
    } else {
      return {
        type: 'quickstart',
        summary: '✓ Context loaded',
      };
    }
  }

  // Project operations
  if (result.success === true && isRecord(result.project)) {
    const p = result.project;
    return {
      type: 'stored',
      summary: `✓ Project "${truncate(String(p.name || ''), 30)}" (id:${shortId(p.id)})`,
    };
  }

  // Tag operations
  if (result.success === true && isRecord(result.entryTag)) {
    const t = result.entryTag;
    return {
      type: 'success',
      summary: `✓ Tagged ${String(t.entryType || '')}:${shortId(t.entryId)}`,
    };
  }

  // List responses
  const meta = isRecord(result.meta) ? result.meta : undefined;
  const returnedCount =
    meta && typeof meta.returnedCount === 'number' ? meta.returnedCount : undefined;

  if (Array.isArray(result.guidelines)) {
    const count = returnedCount ?? result.guidelines.length;
    return { type: 'list', summary: `✓ ${count} guideline(s)` };
  }
  if (Array.isArray(result.knowledge)) {
    const count = returnedCount ?? result.knowledge.length;
    return { type: 'list', summary: `✓ ${count} knowledge item(s)` };
  }
  if (Array.isArray(result.tools)) {
    const count = returnedCount ?? result.tools.length;
    return { type: 'list', summary: `✓ ${count} tool(s)` };
  }
  if (Array.isArray(result.projects)) {
    const count = returnedCount ?? result.projects.length;
    return { type: 'list', summary: `✓ ${count} project(s)` };
  }
  if (Array.isArray(result.sessions)) {
    const count = returnedCount ?? result.sessions.length;
    return { type: 'list', summary: `✓ ${count} session(s)` };
  }

  // Search results
  if (Array.isArray(result.results)) {
    const count = returnedCount ?? result.results.length;
    return {
      type: 'search',
      summary: `✓ Found ${count} result(s)`,
    };
  }

  // Context response
  if (isRecord(result.scope) && (result.guidelines || result.knowledge || result.tools)) {
    const totalCount = meta && typeof meta.totalCount === 'number' ? meta.totalCount : 0;
    return {
      type: 'context',
      summary: `✓ Context loaded (${String(result.scope.type || '')}:${shortId(
        result.scope.id
      )}, ${totalCount} entries)`,
    };
  }

  // Bulk operations
  if (Array.isArray(result.entries)) {
    const count = typeof result.count === 'number' ? result.count : result.entries.length;
    return { type: 'stored', summary: `✓ Bulk stored ${count} entries` };
  }

  // Observe commit
  if (Array.isArray(result.stored)) {
    const storedCount =
      meta && typeof meta.storedCount === 'number' ? meta.storedCount : result.stored.length;
    return { type: 'stored', summary: `✓ Committed ${storedCount} entries to memory` };
  }

  // Draft response
  if ('draft' in result && result.draft) {
    return { type: 'success', summary: '✓ Draft prepared (use commit to store)' };
  }

  // Generic success
  if (result.success === true) {
    return { type: 'success', summary: '✓ Success' };
  }

  // Health check
  if (typeof result.status === 'string' && 'database' in result) {
    return { type: 'success', summary: `✓ Health: ${result.status}` };
  }

  return { type: 'unknown', summary: '✓ Done' };
}

/**
 * Format result for terminal mode with rich visualizations
 */
function formatTerminalOutput(result: unknown): string | null {
  if (!isRecord(result)) {
    return null;
  }

  // Hierarchical context response
  if ('summary' in result && isRecord(result.summary) && 'totalEntries' in result.summary) {
    return formatHierarchicalContextTerminal(
      result as unknown as Parameters<typeof formatHierarchicalContextTerminal>[0]
    );
  }

  // Health check response (infrastructure)
  if (typeof result.status === 'string' && 'database' in result && isRecord(result.database)) {
    return formatHealthTerminal(result as unknown as Parameters<typeof formatHealthTerminal>[0]);
  }

  // Status dashboard response (user-facing)
  if ('counts' in result && isRecord(result.counts) && 'guidelines' in result.counts) {
    return formatStatusTerminal(result as unknown as Parameters<typeof formatStatusTerminal>[0]);
  }

  // List responses
  if (Array.isArray(result.guidelines) && result.guidelines.length > 0) {
    return formatListTerminal(
      result.guidelines as Parameters<typeof formatListTerminal>[0],
      'guidelines'
    );
  }
  if (Array.isArray(result.knowledge) && result.knowledge.length > 0) {
    return formatListTerminal(
      result.knowledge as Parameters<typeof formatListTerminal>[0],
      'knowledge'
    );
  }
  if (Array.isArray(result.tools) && result.tools.length > 0) {
    return formatListTerminal(result.tools as Parameters<typeof formatListTerminal>[0], 'tools');
  }

  // Session started/ended
  if (result.success === true && isRecord(result.session)) {
    const s = result.session;
    const action = s.endedAt ? 'Ended' : 'Started';
    const status = s.status === 'active' ? 'active' : 'inactive';
    return formatStatusLine({
      status: 'healthy',
      items: [
        { label: action, value: String(s.name || ''), status: status as 'active' | 'inactive' },
      ],
    });
  }

  // Quickstart response (combined context + session)
  if (isRecord(result.quickstart)) {
    const qs = result.quickstart;
    const sessionAction = qs.sessionAction;
    const items: Array<{ label: string; value: string; status?: 'active' | 'inactive' }> = [];

    if (sessionAction === 'resumed') {
      items.push({
        label: 'Resumed',
        value: String(qs.resumedSessionName || 'unnamed'),
        status: 'active',
      });
    } else if (sessionAction === 'created') {
      items.push({
        label: 'Started',
        value: String(qs.requestedSessionName || 'unnamed'),
        status: 'active',
      });
    } else if (sessionAction === 'error') {
      items.push({
        label: 'Session',
        value: 'failed to start',
        status: 'inactive',
      });
    }

    items.push({ label: 'Context', value: 'loaded' });

    return formatStatusLine({
      status: 'healthy',
      items,
    });
  }

  // Success with stored entry - use badges
  if (result.success === true) {
    if (isRecord(result.guideline)) {
      const g = result.guideline;
      return `${icons.success} ${formatBadges([
        { label: 'guideline' },
        { label: truncate(String(g.name || ''), 25) },
      ])}`;
    }
    if (isRecord(result.knowledge)) {
      const k = result.knowledge;
      return `${icons.success} ${formatBadges([
        { label: 'knowledge' },
        { label: truncate(String(k.title || ''), 25) },
      ])}`;
    }
    if (isRecord(result.tool)) {
      const t = result.tool;
      return `${icons.success} ${formatBadges([
        { label: 'tool' },
        { label: truncate(String(t.name || ''), 25) },
      ])}`;
    }
  }

  // Error response
  if ('error' in result && result.error) {
    const code = typeof result.code === 'string' ? `[${result.code}]` : '';
    return `${icons.failure} ${code} ${truncate(String(result.error), 70)}`;
  }

  return null; // Fall back to compact or JSON
}

/**
 * Format result for output based on config
 */
export function formatOutput(result: unknown): string {
  if (config.output.format === 'terminal') {
    const terminalOutput = formatTerminalOutput(result);
    if (terminalOutput) {
      return terminalOutput;
    }
    // Fall back to compact for unhandled types
    return analyzeResult(result).summary;
  }
  if (config.output.format === 'compact') {
    return analyzeResult(result).summary;
  }
  return JSON.stringify(result, null, 2);
}
