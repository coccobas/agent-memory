/**
 * V2 Context Detection
 *
 * Lightweight project-from-cwd detection using v2_scopes.
 * Looks up project scopes by rootPath metadata or falls back
 * to matching the working directory against known project paths.
 */

import type Database from 'better-sqlite3';

export interface DetectedContext {
  projectScopeId: string | null;
  projectExternalId: string | null;
  projectLabel: string | null;
}

interface ScopeRow {
  id: string;
  name: string | null;
  label: string | null;
  metadata: string | null;
}

/**
 * Extract the external ID from a scope key.
 * "project:abc-123" → "abc-123", "global:__root__" → null
 */
function externalIdFromScopeKey(scopeKey: string): string | null {
  const colonIdx = scopeKey.indexOf(':');
  if (colonIdx < 0) return null;
  const suffix = scopeKey.slice(colonIdx + 1);
  return suffix === '__root__' ? null : suffix;
}

/**
 * Detect the project scope from the current working directory.
 *
 * Strategy:
 * 1. Query all non-archived project scopes
 * 2. Check if any scope's metadata.rootPath matches `cwd`
 * 3. If multiple, prefer the longest rootPath (most specific)
 */
export function detectProjectFromCwd(sqlite: Database.Database, cwd: string): DetectedContext {
  const rows = sqlite
    .prepare(
      `
      SELECT id, name, label, metadata
      FROM v2_scopes
      WHERE type = 'project'
        AND is_archived = 0
    `
    )
    .all() as ScopeRow[];

  let bestMatch: { row: ScopeRow; pathLength: number } | null = null;

  for (const row of rows) {
    if (!row.metadata) continue;

    try {
      const meta = JSON.parse(row.metadata) as Record<string, unknown>;
      const rootPath = meta.rootPath as string | undefined;

      if (rootPath && cwd.startsWith(rootPath)) {
        if (!bestMatch || rootPath.length > bestMatch.pathLength) {
          bestMatch = { row, pathLength: rootPath.length };
        }
      }
    } catch {
      // Invalid JSON in metadata, skip
    }
  }

  if (bestMatch) {
    return {
      projectScopeId: bestMatch.row.id,
      projectExternalId: externalIdFromScopeKey(bestMatch.row.id),
      projectLabel: bestMatch.row.label ?? bestMatch.row.name,
    };
  }

  return {
    projectScopeId: null,
    projectExternalId: null,
    projectLabel: null,
  };
}

/**
 * Find or create a project scope for the given external ID.
 * Returns the v2_scopes.id (the scope key like "project:abc-123").
 */
export function ensureProjectScope(
  sqlite: Database.Database,
  projectId: string,
  label?: string,
  rootPath?: string
): string {
  const scopeKey = `project:${projectId}`;
  const now = new Date().toISOString();

  const metadata = rootPath ? JSON.stringify({ rootPath }) : '{}';

  // Ensure global root exists first
  sqlite
    .prepare(
      `
      INSERT INTO v2_scopes (id, type, parent_scope_id, name, metadata, created_at, updated_at)
      VALUES ('global:__root__', 'global', NULL, 'global', '{}', ?, ?)
      ON CONFLICT(id) DO NOTHING
    `
    )
    .run(now, now);

  // Create/update project scope
  sqlite
    .prepare(
      `
      INSERT INTO v2_scopes (id, type, parent_scope_id, name, label, metadata, is_archived, created_at, updated_at)
      VALUES (?, 'project', 'global:__root__', ?, ?, ?, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = COALESCE(excluded.label, v2_scopes.label),
        metadata = CASE
          WHEN excluded.metadata != '{}' THEN excluded.metadata
          ELSE v2_scopes.metadata
        END,
        updated_at = excluded.updated_at
    `
    )
    .run(scopeKey, label ?? projectId, label ?? null, metadata, now, now);

  return scopeKey;
}
