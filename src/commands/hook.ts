/**
 * hook command
 *
 * Subcommands for running Claude Code hook logic in a deterministic way.
 *
 * Usage:
 *   agent-memory hook pretooluse --project-id <id>
 *   agent-memory hook stop --project-id <id>
 *   agent-memory hook userpromptsubmit --project-id <id>
 *   agent-memory hook session-end --project-id <id>
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { conversationRepo } from '../db/repositories/conversations.js';
import { sessionRepo } from '../db/repositories/scopes.js';
import { sessions } from '../db/schema.js';
import { getDb } from '../db/connection.js';
import { verifyAction, type ProposedAction } from '../services/verification.service.js';

type ClaudeHookRole = 'user' | 'agent' | 'system';

type ClaudeHookInput = {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  prompt?: string;
  user_prompt?: string;
  text?: string;
  message?: string;
};

function parseArgs(argv: string[]): {
  subcommand: string;
  projectId?: string;
  agentId?: string;
  autoExtract?: boolean;
} {
  const subcommand = argv[0] || '';
  let projectId: string | undefined;
  let agentId: string | undefined;
  let autoExtract: boolean | undefined;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--project-id' || arg === '--project') {
      projectId = argv[++i] ?? '';
    } else if (arg.startsWith('--project-id=') || arg.startsWith('--project=')) {
      projectId = arg.split('=')[1];
    } else if (arg === '--agent-id' || arg === '--agent') {
      agentId = argv[++i] ?? '';
    } else if (arg.startsWith('--agent-id=') || arg.startsWith('--agent=')) {
      agentId = arg.split('=')[1];
    } else if (arg === '--auto-extract') {
      autoExtract = true;
    } else if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`);
      process.exit(2);
    }
  }

  return { subcommand, projectId, agentId, autoExtract };
}

async function readStdinJson(): Promise<ClaudeHookInput> {
  if (process.stdin.isTTY) {
    console.error('Hook commands expect JSON on stdin');
    process.exit(2);
  }

  const data = await new Promise<string>((resolvePromise) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      let chunk: string | null;
      // eslint-disable-next-line no-cond-assign
      while ((chunk = process.stdin.read()) !== null) {
        buf += chunk;
      }
    });
    process.stdin.on('end', () => resolvePromise(buf));
  });

  try {
    return JSON.parse(data) as ClaudeHookInput;
  } catch {
    console.error('Invalid JSON hook input');
    process.exit(2);
  }
}

function stringifyUnknown(value: unknown, maxLen = 20000): string {
  if (typeof value === 'string') return value.slice(0, maxLen);
  try {
    return JSON.stringify(value).slice(0, maxLen);
  } catch {
    return String(value).slice(0, maxLen);
  }
}

function ensureSessionIdExists(sessionId: string, projectId?: string): void {
  const db = getDb();
  const existing = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (existing) return;

  db.insert(sessions)
    .values({
      id: sessionId,
      projectId: projectId ?? null,
      name: 'Claude Code Session',
      purpose: 'Auto-created from Claude Code hooks',
      agentId: null,
      status: 'active',
      metadata: { source: 'claude-code' },
    })
    .run();
}

function getPromptFromHookInput(input: ClaudeHookInput): string | undefined {
  const candidates = [input.prompt, input.user_prompt, input.text, input.message];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return undefined;
}

function extractProposedActionFromTool(
  toolName: string | undefined,
  toolInput: unknown
): { actionType: ProposedAction['type']; filePath?: string; content: string; description: string } {
  const name = (toolName || '').toLowerCase();

  if (name === 'write' || name === 'edit') {
    const inputObj = toolInput as Record<string, unknown> | null;
    const filePath =
      inputObj && typeof inputObj.file_path === 'string'
        ? inputObj.file_path
        : inputObj && typeof inputObj.filePath === 'string'
          ? inputObj.filePath
          : undefined;
    const content =
      inputObj && typeof inputObj.content === 'string' ? inputObj.content : stringifyUnknown(toolInput);
    return {
      actionType: 'file_write',
      filePath,
      content,
      description: `PreToolUse: ${toolName}`,
    };
  }

  if (name === 'bash') {
    return {
      actionType: 'command',
      content: stringifyUnknown(toolInput),
      description: `PreToolUse: ${toolName}`,
    };
  }

  return {
    actionType: 'other',
    content: stringifyUnknown(toolInput),
    description: `PreToolUse: ${toolName || 'unknown'}`,
  };
}

function readTranscriptLines(transcriptPath: string): string[] {
  if (!existsSync(transcriptPath)) return [];
  const raw = readFileSync(transcriptPath, 'utf8');
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function loadState(statePath: string): Record<string, unknown> {
  if (!existsSync(statePath)) return {};
  try {
    return JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function saveState(statePath: string, state: Record<string, unknown>): void {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function extractMessageFromTranscriptEntry(entry: unknown): { role: ClaudeHookRole; content: string } | null {
  if (!entry || typeof entry !== 'object') return null;
  const obj = entry as Record<string, unknown>;

  const roleRaw =
    (typeof obj.role === 'string' && obj.role) ||
    (typeof obj.type === 'string' && obj.type) ||
    (typeof obj.author === 'string' && obj.author) ||
    '';

  let role: ClaudeHookRole | null = null;
  const roleLower = roleRaw.toLowerCase();
  if (roleLower.includes('user')) role = 'user';
  else if (roleLower.includes('assistant') || roleLower.includes('agent') || roleLower.includes('claude'))
    role = 'agent';
  else if (roleLower.includes('system')) role = 'system';

  const content =
    typeof obj.content === 'string'
      ? obj.content
      : Array.isArray(obj.content)
        ? obj.content
            .map((c) => {
              if (typeof c === 'string') return c;
              if (c && typeof c === 'object' && typeof (c as Record<string, unknown>).text === 'string') {
                return (c as Record<string, unknown>).text as string;
              }
              return '';
            })
            .filter(Boolean)
            .join('\n')
        : typeof obj.message === 'string'
          ? obj.message
          : typeof obj.text === 'string'
            ? obj.text
            : '';

  if (!role || !content) return null;
  return { role, content };
}

function ingestTranscript(params: {
  sessionId: string;
  transcriptPath: string;
  projectId?: string;
  agentId?: string;
  cwd?: string;
}): { appended: number; totalLines: number } {
  const { sessionId, transcriptPath, projectId, agentId, cwd } = params;

  const statePath = resolve(process.cwd(), '.claude', 'hooks', '.agent-memory-state.json');
  const state = loadState(statePath);
  const key = `claude:${sessionId}:${transcriptPath}`;
  const lastLine = typeof state[key] === 'number' ? (state[key] as number) : 0;

  const lines = readTranscriptLines(transcriptPath);
  const newLines = lines.slice(lastLine);
  if (newLines.length === 0) return { appended: 0, totalLines: lines.length };

  const existing = conversationRepo.list({ sessionId, status: 'active' }, { limit: 1, offset: 0 })[0];
  const conversation = existing
    ? existing
    : conversationRepo.create({
        sessionId,
        projectId,
        agentId: agentId ?? undefined,
        title: cwd ? `Claude Code: ${cwd}` : 'Claude Code conversation',
        metadata: { source: 'claude-code', transcriptPath },
      });

  let appended = 0;
  for (const line of newLines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const msg = extractMessageFromTranscriptEntry(parsed);
    if (!msg) continue;

    conversationRepo.addMessage({
      conversationId: conversation.id,
      role: msg.role,
      content: msg.content,
      metadata: { source: 'claude-code', sessionId },
    });
    appended += 1;
  }

  state[key] = lines.length;
  saveState(statePath, state);

  return { appended, totalLines: lines.length };
}

function setReviewSuspended(sessionId: string, suspended: boolean): void {
  const statePath = resolve(process.cwd(), '.claude', 'hooks', '.agent-memory-state.json');
  const state = loadState(statePath);
  state[`review:suspended:${sessionId}`] = suspended;
  saveState(statePath, state);
}

function isReviewSuspended(sessionId: string): boolean {
  const statePath = resolve(process.cwd(), '.claude', 'hooks', '.agent-memory-state.json');
  const state = loadState(statePath);
  return state[`review:suspended:${sessionId}`] === true;
}

function getObserveState(sessionId: string): {
  committedAt?: string;
  reviewedAt?: string;
  needsReviewCount?: number;
} {
  const session = sessionRepo.getById(sessionId);
  const meta = (session?.metadata ?? {}) as Record<string, unknown>;
  const observe = (meta.observe ?? {}) as Record<string, unknown>;
  return {
    committedAt: typeof observe.committedAt === 'string' ? observe.committedAt : undefined,
    reviewedAt: typeof observe.reviewedAt === 'string' ? observe.reviewedAt : undefined,
    needsReviewCount: typeof observe.needsReviewCount === 'number' ? observe.needsReviewCount : undefined,
  };
}

function setObserveReviewedAt(sessionId: string, reviewedAt: string): void {
  const session = sessionRepo.getById(sessionId);
  const meta = (session?.metadata ?? {}) as Record<string, unknown>;
  const observe = (meta.observe ?? {}) as Record<string, unknown>;
  const nextMeta: Record<string, unknown> = {
    ...meta,
    observe: { ...observe, reviewedAt },
  };
  sessionRepo.update(sessionId, { metadata: nextMeta });
}

async function runPreToolUse(projectId?: string, agentId?: string): Promise<void> {
  await import('../config/index.js');
  const input = await readStdinJson();

  const sessionId = input.session_id || null;
  const proposed = extractProposedActionFromTool(input.tool_name, input.tool_input);

  const result = verifyAction(sessionId, projectId ?? null, {
    type: proposed.actionType,
    description: proposed.description,
    filePath: proposed.filePath,
    content: proposed.content,
    metadata: {
      source: 'claude-code-hook',
      agentId: agentId ?? 'claude-code',
      hookEvent: input.hook_event_name,
      toolName: input.tool_name,
      cwd: input.cwd,
    },
  });

  if (result.blocked) {
    const messages = (result.violations || []).map((v) => v.message).filter(Boolean);
    const stderr = messages.length > 0 ? messages.join('\n') : 'Blocked by critical guideline';
    console.error(stderr);
    process.exit(2);
  }

  // allow tool
  process.exit(0);
}

async function runStop(projectId?: string, agentId?: string): Promise<void> {
  await import('../config/index.js');
  const input = await readStdinJson();

  const sessionId = input.session_id;
  const transcriptPath = input.transcript_path;

  if (!sessionId) {
    console.error('Missing session_id in hook input');
    process.exit(2);
  }
  if (!transcriptPath) {
    console.error('Missing transcript_path in hook input');
    process.exit(2);
  }

  ensureSessionIdExists(sessionId, projectId);

  // Keep conversation history up to date before any review gating.
  ingestTranscript({
    sessionId,
    transcriptPath,
    projectId,
    agentId,
    cwd: input.cwd,
  });

  if (isReviewSuspended(sessionId)) {
    process.exit(0);
  }

  const observe = getObserveState(sessionId);

  if (!observe.committedAt) {
    console.error(
      [
        'Agent Memory: end-of-session review is required before stopping.',
        '',
        `Next step (recommended): call memory_observe draft, then commit for sessionId=${sessionId}.`,
        projectId ? `Use projectId=${projectId} to allow auto-promote to project scope.` : undefined,
        '',
        'To suspend enforcement for this session, type: !am review off',
      ]
        .filter(Boolean)
        .join('\n')
    );
    process.exit(2);
  }

  if ((observe.needsReviewCount ?? 0) > 0 && !observe.reviewedAt) {
    console.error(
      [
        `Agent Memory: ${observe.needsReviewCount} candidate memory item(s) need review before stopping.`,
        '',
        'To acknowledge review and allow stopping: !am review done',
        'To suspend enforcement for this session: !am review off',
      ].join('\n')
    );
    process.exit(2);
  }

  process.exit(0);
}

async function runUserPromptSubmit(projectId?: string): Promise<void> {
  await import('../config/index.js');
  const input = await readStdinJson();

  const sessionId = input.session_id;
  if (!sessionId) {
    process.exit(0);
  }

  const prompt = getPromptFromHookInput(input);
  if (!prompt) {
    process.exit(0);
  }

  const trimmed = prompt.trim();
  if (!trimmed.toLowerCase().startsWith('!am')) {
    process.exit(0);
  }

  const parts = trimmed.split(/\s+/).slice(1);
  const command = (parts[0] ?? '').toLowerCase();
  const subcommand = (parts[1] ?? '').toLowerCase();

  ensureSessionIdExists(sessionId, projectId);

  if (command === 'review' && (subcommand === 'off' || subcommand === 'suspend')) {
    setReviewSuspended(sessionId, true);
    console.error('Agent Memory: review enforcement suspended for this session.');
    process.exit(2);
  }

  if (command === 'review' && (subcommand === 'on' || subcommand === 'resume')) {
    setReviewSuspended(sessionId, false);
    console.error('Agent Memory: review enforcement enabled for this session.');
    process.exit(2);
  }

  if (command === 'review' && subcommand === 'done') {
    const reviewedAt = new Date().toISOString();
    setObserveReviewedAt(sessionId, reviewedAt);
    console.error(`Agent Memory: review acknowledged at ${reviewedAt}.`);
    process.exit(2);
  }

  if (command === 'status' || (command === 'review' && subcommand === 'status')) {
    const suspended = isReviewSuspended(sessionId);
    const observe = getObserveState(sessionId);
    console.error(
      [
        `Agent Memory status for sessionId=${sessionId}`,
        `- reviewSuspended: ${suspended}`,
        `- observe.committedAt: ${observe.committedAt ?? 'null'}`,
        `- observe.needsReviewCount: ${observe.needsReviewCount ?? 0}`,
        `- observe.reviewedAt: ${observe.reviewedAt ?? 'null'}`,
      ].join('\n')
    );
    process.exit(2);
  }

  console.error(
    [
      'Agent Memory commands:',
      '- !am status',
      '- !am review status',
      '- !am review off',
      '- !am review on',
      '- !am review done',
    ].join('\n')
  );
  process.exit(2);
}

async function runSessionEnd(projectId?: string, agentId?: string): Promise<void> {
  await import('../config/index.js');
  const input = await readStdinJson();

  const sessionId = input.session_id;
  const transcriptPath = input.transcript_path;

  if (!sessionId) {
    console.error('Missing session_id in hook input');
    process.exit(2);
  }
  if (!transcriptPath) {
    console.error('Missing transcript_path in hook input');
    process.exit(2);
  }

  ensureSessionIdExists(sessionId, projectId);
  ingestTranscript({
    sessionId,
    transcriptPath,
    projectId,
    agentId,
    cwd: input.cwd,
  });

  process.exit(0);
}

export async function runHookCommand(argv: string[]): Promise<void> {
  const { subcommand, projectId, agentId } = parseArgs(argv);

  const sub = (subcommand || '').toLowerCase();
  if (!sub || sub === '--help' || sub === '-h') {
    console.log(
      'Usage: agent-memory hook <pretooluse|stop|userpromptsubmit|session-end> [--project-id <id>] [--agent-id <id>]'
    );
    process.exit(0);
  }

  if (sub === 'pretooluse') {
    await runPreToolUse(projectId, agentId);
    return;
  }

  if (sub === 'stop') {
    await runStop(projectId, agentId);
    return;
  }

  if (sub === 'userpromptsubmit' || sub === 'user-prompt-submit') {
    await runUserPromptSubmit(projectId);
    return;
  }

  if (sub === 'session-end' || sub === 'sessionend') {
    await runSessionEnd(projectId, agentId);
    return;
  }

  console.error(`Unknown hook subcommand: ${subcommand}`);
  process.exit(2);
}
