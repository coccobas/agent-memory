/**
 * V2 MCP Observe Handler.
 *
 * Handles the memory_observe tool: ingests conversation messages
 * and optionally triggers extraction via the shared ingest layer.
 */

import type { AppContext } from '../../core/context.js';
import type { IngestMessage } from '../contracts/transcript.js';
import { getRuntime } from './handlers.js';
import { detectProjectFromCwd, ensureProjectScope } from './context-detection.js';
import { ingest } from '../hooks/ingest.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ObserveParams {
  sessionId?: string;
  messages?: readonly {
    role: string;
    content: string;
    toolName?: string;
  }[];
  isFinal?: boolean;
  projectId?: string;
  agentId?: string;
}

export interface ObserveResult {
  success: boolean;
  transcriptId?: string;
  messagesStored?: number;
  extracted?: {
    candidates: number;
    stored: number;
    duplicatesSkipped: number;
  };
  error?: string;
  _display?: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function requireSqlite(context: AppContext) {
  if (!context.sqlite) {
    throw new Error('memory_v2_requires_sqlite_backend');
  }
  return context.sqlite;
}

/**
 * Handle the memory_observe MCP tool call.
 */
export async function handleV2MemoryObserve(
  context: AppContext,
  params: Record<string, unknown>
): Promise<ObserveResult> {
  const sessionId = params.sessionId as string | undefined;

  if (!sessionId) {
    return {
      success: false,
      error: 'session_id_required',
      _display: 'sessionId is required',
    };
  }

  const messages = (params.messages ?? []) as readonly {
    role: string;
    content: string;
    toolName?: string;
  }[];

  if (messages.length === 0 && !params.isFinal) {
    return {
      success: true,
      messagesStored: 0,
      _display: 'No messages to ingest (no-op)',
    };
  }

  const sqlite = requireSqlite(context);
  const runtime = getRuntime(context);

  // Resolve project
  let projectExternalId = params.projectId as string | undefined;
  if (!projectExternalId) {
    const detected = detectProjectFromCwd(sqlite, process.cwd());
    projectExternalId = detected.projectExternalId ?? undefined;
  }

  const projectScopeId = projectExternalId
    ? ensureProjectScope(sqlite, projectExternalId)
    : undefined;

  // Normalize messages
  const normalizedMessages: IngestMessage[] = messages.map((m) => ({
    role: normalizeRole(m.role),
    content: m.content,
    toolName: m.toolName,
  }));

  const result = await ingest(
    { sqlite, runtime },
    {
      claudeSessionId: sessionId,
      projectScopeId,
      messages: normalizedMessages,
      isFinal: params.isFinal as boolean | undefined,
      agentId: (params.agentId as string | undefined) ?? 'claude-code',
    }
  );

  const display = result.extracted
    ? `Ingested ${result.messagesStored} messages, extracted ${result.extracted.stored} entries`
    : `Ingested ${result.messagesStored} messages`;

  return {
    success: true,
    transcriptId: result.transcriptId,
    messagesStored: result.messagesStored,
    extracted: result.extracted,
    _display: display,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ValidRole = 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result';

const ROLE_MAP: Record<string, ValidRole> = {
  user: 'user',
  human: 'user',
  assistant: 'assistant',
  ai: 'assistant',
  system: 'system',
  tool_use: 'tool_use',
  tool_result: 'tool_result',
};

function normalizeRole(raw: string): ValidRole {
  return ROLE_MAP[raw.toLowerCase()] ?? 'user';
}
