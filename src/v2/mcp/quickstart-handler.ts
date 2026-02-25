/**
 * V2 Quickstart Handler
 *
 * One-call setup: detect project → load context → format display.
 *
 * Sessions are no longer created eagerly at startup. Topic assignment
 * happens asynchronously when a conversation ends (via the topic assigner).
 */

import type { AppContext } from '../../core/context.js';
import { detectProjectFromCwd, ensureProjectScope } from './context-detection.js';
import { handleV2MemoryQuery } from './handlers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuickstartParams {
  projectId?: string;
  rootPath?: string;
  agentId?: string;
  verbose?: boolean;
  limitPerType?: number;
}

export interface QuickstartResult {
  context: unknown;
  quickstart: {
    contextLoaded: boolean;
    projectId: string | null;
    projectLabel: string | null;
  };
  _display: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireSqlite(context: AppContext) {
  if (!context.sqlite) {
    throw new Error('memory_v2_requires_sqlite_backend');
  }
  return context.sqlite;
}

/**
 * Detect or ensure a project scope, returning the external ID and label.
 */
function resolveProject(
  context: AppContext,
  params: QuickstartParams
): {
  projectExternalId: string | null;
  projectLabel: string | null;
  projectScopeId: string | null;
} {
  const sqlite = requireSqlite(context);
  const cwd = params.rootPath ?? process.cwd();

  if (params.projectId) {
    const scopeId = ensureProjectScope(sqlite, params.projectId, undefined, cwd);

    const row = sqlite
      .prepare('SELECT label, name FROM v2_scopes WHERE id = ? LIMIT 1')
      .get(scopeId) as { label: string | null; name: string | null } | undefined;

    return {
      projectExternalId: params.projectId,
      projectLabel: row?.label ?? row?.name ?? params.projectId,
      projectScopeId: scopeId,
    };
  }

  const detected = detectProjectFromCwd(sqlite, cwd);
  return {
    projectExternalId: detected.projectExternalId,
    projectLabel: detected.projectLabel,
    projectScopeId: detected.projectScopeId,
  };
}

/**
 * Build a concise display string for quickstart output.
 */
function buildDisplay(projectLabel: string | null, contextResult: unknown): string {
  const lines: string[] = [];

  const projectStr = projectLabel ?? 'unknown project';
  lines.push(`Memory loaded for ${projectStr}`);

  const ctx = contextResult as {
    summary?: {
      totalEntries?: number;
      byType?: Record<string, number>;
    };
    critical?: unknown[];
    entries?: unknown[];
    totalCount?: number;
  };

  if (ctx.summary) {
    const byType = ctx.summary.byType ?? {};
    const parts: string[] = [];
    for (const [type, count] of Object.entries(byType)) {
      if (count > 0) parts.push(`${count} ${type}${count !== 1 ? 's' : ''}`);
    }
    if (parts.length > 0) {
      lines.push(`Entries: ${parts.join(', ')}`);
    }
    if (ctx.critical && ctx.critical.length > 0) {
      lines.push(`Critical items: ${ctx.critical.length}`);
    }
  } else if (ctx.totalCount !== undefined) {
    lines.push(`Entries loaded: ${ctx.totalCount}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * One-call quickstart: detect project, load context.
 */
export async function handleQuickstart(
  context: AppContext,
  params: QuickstartParams
): Promise<QuickstartResult> {
  // 1. Resolve project
  const { projectExternalId, projectLabel } = resolveProject(context, params);

  const verbose = params.verbose ?? false;

  // 2. Load context
  let contextResult: unknown = { entries: [], totalCount: 0 };
  if (projectExternalId) {
    try {
      contextResult = await handleV2MemoryQuery(context, {
        action: 'context',
        scope: { type: 'project', id: projectExternalId },
        hierarchical: !verbose,
        limit: params.limitPerType ?? 200,
      });
    } catch {
      contextResult = { entries: [], totalCount: 0, error: 'context_load_failed' };
    }
  }

  // 3. Build display
  const _display = buildDisplay(projectLabel, contextResult);

  return {
    context: contextResult,
    quickstart: {
      contextLoaded: true,
      projectId: projectExternalId,
      projectLabel,
    },
    _display,
  };
}

// ---------------------------------------------------------------------------
// MCP handler
// ---------------------------------------------------------------------------

export async function handleV2MemoryQuickstart(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  return handleQuickstart(context, {
    projectId: params.projectId as string | undefined,
    rootPath: params.rootPath as string | undefined,
    agentId: params.agentId as string | undefined,
    verbose: params.verbose as boolean | undefined,
    limitPerType: params.limitPerType as number | undefined,
  });
}
