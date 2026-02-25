/**
 * V2 Hook CLI — entry point for Claude Code hook commands.
 *
 * Reads JSON from stdin, dispatches to the appropriate handler.
 * CRITICAL: Never exits non-zero. All errors go to stderr.
 */

import type Database from 'better-sqlite3';
import type { SqliteMemoryV2Runtime } from '../adapters/sqlite/factory.js';
import {
  handleHookSessionStart,
  handleHookPostToolUse,
  handleHookSessionEnd,
} from './dispatcher.js';

// ---------------------------------------------------------------------------
// Event name normalization
// ---------------------------------------------------------------------------

/**
 * Claude Code sends event names in its native format (e.g. "posttooluse").
 * We normalize to canonical hyphenated form for internal dispatch.
 */
const EVENT_ALIASES: Record<string, string> = {
  // Claude Code native format → canonical
  posttooluse: 'post-tool-use',
  pretooluse: 'pre-tool-use',
  userpromptsubmit: 'user-prompt-submit',
  'session-start': 'session-start',
  'session-end': 'session-end',
  'post-tool-use': 'post-tool-use',
  'pre-tool-use': 'pre-tool-use',
  'user-prompt-submit': 'user-prompt-submit',
  stop: 'stop',
};

/** Events that have actual v2 handlers. */
const HANDLED_EVENTS = new Set(['session-start', 'session-end', 'post-tool-use']);

export function normalizeEventName(event: string): string {
  return EVENT_ALIASES[event] ?? event;
}

export function isValidHookEvent(event: string): boolean {
  return HANDLED_EVENTS.has(normalizeEventName(event));
}

export function parseHookStdin(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Payload normalization (Claude Code sends snake_case, we use camelCase)
// ---------------------------------------------------------------------------

/**
 * Extract a field from payload, checking both camelCase and snake_case.
 * Claude Code sends snake_case (session_id, transcript_path),
 * but internal contracts use camelCase (sessionId, transcriptPath).
 */
function field(payload: Record<string, unknown>, camel: string, snake: string): string | undefined {
  const value = payload[camel] ?? payload[snake];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// ---------------------------------------------------------------------------
// CLI runner
// ---------------------------------------------------------------------------

export interface HookCliDeps {
  readonly sqlite: Database.Database;
  readonly runtime: SqliteMemoryV2Runtime;
  readonly idGenerator?: () => string;
}

/**
 * Run a hook command. Always returns void, never throws.
 *
 * @param event - The hook event name (session-start, post-tool-use, session-end)
 * @param stdinJson - Raw JSON string from stdin
 * @param deps - Database and runtime dependencies
 */
export async function runHookCommand(
  event: string,
  stdinJson: string,
  deps: HookCliDeps
): Promise<void> {
  try {
    const canonical = normalizeEventName(event);

    if (!HANDLED_EVENTS.has(canonical)) {
      // Unknown or unimplemented event → no-op (don't crash)
      return;
    }

    const payload = parseHookStdin(stdinJson);
    if (!payload) {
      // Malformed stdin → no-op (don't crash)
      return;
    }

    const sessionId = field(payload, 'sessionId', 'session_id');
    if (!sessionId) {
      return;
    }

    const dispatchDeps = {
      sqlite: deps.sqlite,
      runtime: deps.runtime,
      idGenerator: deps.idGenerator,
    };

    if (canonical === 'session-start') {
      await handleHookSessionStart(dispatchDeps, {
        sessionId,
        projectId: field(payload, 'projectId', 'project_id'),
        transcriptPath: field(payload, 'transcriptPath', 'transcript_path'),
        agentId: field(payload, 'agentId', 'agent_id') ?? field(payload, 'agentType', 'agent_type'),
        cwd: field(payload, 'cwd', 'cwd'),
      });
    } else if (canonical === 'post-tool-use') {
      await handleHookPostToolUse(dispatchDeps, { sessionId });
    } else if (canonical === 'session-end') {
      await handleHookSessionEnd(dispatchDeps, {
        sessionId,
        projectId: field(payload, 'projectId', 'project_id'),
      });
    }
  } catch (error) {
    // Never crash — log to stderr only
    process.stderr.write(
      `[agent-memory hook] Error in ${event}: ${error instanceof Error ? error.message : String(error)}\n`
    );
  }
}
