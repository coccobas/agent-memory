/**
 * Compact output formatter for MCP responses
 *
 * Converts verbose JSON responses to human-readable single-line summaries.
 */

import { config } from '../config/index.js';

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
 * Format result for output based on config
 */
export function formatOutput(result: unknown): string {
  if (config.output.format === 'compact') {
    return analyzeResult(result).summary;
  }
  return JSON.stringify(result, null, 2);
}
