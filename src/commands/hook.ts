/**
 * hook command
 *
 * Subcommands for running Claude Code hook logic in a deterministic way.
 *
 * Usage:
 *   agent-memory hook install [options]
 *   agent-memory hook status [options]
 *   agent-memory hook uninstall [options]
 *   agent-memory hook pretooluse --project-id <id>
 *   agent-memory hook stop --project-id <id>
 *   agent-memory hook userpromptsubmit --project-id <id>
 *   agent-memory hook session-end --project-id <id>
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { conversationRepo } from '../db/repositories/conversations.js';
import { sessionRepo, projectRepo } from '../db/repositories/scopes.js';
import { guidelineRepo } from '../db/repositories/guidelines.js';
import { knowledgeRepo } from '../db/repositories/knowledge.js';
import { toolRepo } from '../db/repositories/tools.js';
import { sessions } from '../db/schema.js';
import { getDb } from '../db/connection.js';
import { verifyAction, type ProposedAction } from '../services/verification.service.js';
import {
  generateHooks,
  installHooks,
  getHookStatus,
  uninstallHooks,
  type SupportedIDE,
} from '../services/hook-generator.service.js';
import { createComponentLogger } from '../utils/logger.js';
import { readTranscriptFromOffset } from '../utils/transcript-cursor.js';

const logger = createComponentLogger('hook');

function writeStdout(message: string): void {
  process.stdout.write(message.endsWith('\n') ? message : `${message}\n`);
}

function writeStderr(message: string): void {
  process.stderr.write(message.endsWith('\n') ? message : `${message}\n`);
}

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
      writeStderr(`Unknown option: ${arg}`);
      process.exit(2);
    }
  }

  return { subcommand, projectId, agentId, autoExtract };
}

function parseInstallArgs(argv: string[]): {
  subcommand: 'install' | 'status' | 'uninstall';
  ide: SupportedIDE;
  projectPath: string;
  projectId?: string;
  sessionId?: string;
  dryRun: boolean;
  quiet: boolean;
} {
  const sub = (argv[0] || '').toLowerCase();
  if (sub !== 'install' && sub !== 'status' && sub !== 'uninstall') {
    writeStderr(`Unknown hook subcommand: ${argv[0] || ''}`);
    process.exit(2);
  }

  const options = {
    subcommand: sub,
    ide: 'claude' as SupportedIDE,
    projectPath: process.cwd(),
    projectId: undefined as string | undefined,
    sessionId: undefined as string | undefined,
    dryRun: false,
    quiet: false,
  };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i] ?? '';

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHookHelp();
      process.exit(0);
    }

    if (arg === '--ide') {
      const ide = (argv[++i] ?? '').toLowerCase();
      if (ide === 'claude' || ide === 'cursor' || ide === 'vscode') {
        options.ide = ide;
      } else {
        writeStderr(`Invalid IDE: ${ide}. Supported: claude, cursor, vscode`);
        process.exit(2);
      }
      continue;
    }

    if (arg.startsWith('--ide=')) {
      const ide = arg.slice('--ide='.length).toLowerCase();
      if (ide === 'claude' || ide === 'cursor' || ide === 'vscode') {
        options.ide = ide;
      } else {
        writeStderr(`Invalid IDE: ${ide}. Supported: claude, cursor, vscode`);
        process.exit(2);
      }
      continue;
    }

    if (arg === '--project-path') {
      options.projectPath = resolve(argv[++i] ?? process.cwd());
      continue;
    }

    if (arg.startsWith('--project-path=')) {
      options.projectPath = resolve(arg.slice('--project-path='.length));
      continue;
    }

    if (arg === '--project-id') {
      options.projectId = argv[++i] ?? '';
      continue;
    }

    if (arg.startsWith('--project-id=')) {
      options.projectId = arg.slice('--project-id='.length);
      continue;
    }

    if (arg === '--session-id') {
      options.sessionId = argv[++i] ?? '';
      continue;
    }

    if (arg.startsWith('--session-id=')) {
      options.sessionId = arg.slice('--session-id='.length);
      continue;
    }

    if (arg.startsWith('-')) {
      writeStderr(`Unknown option: ${arg}`);
      process.exit(2);
    }
  }

  return options as {
    subcommand: 'install' | 'status' | 'uninstall';
    ide: SupportedIDE;
    projectPath: string;
    projectId?: string;
    sessionId?: string;
    dryRun: boolean;
    quiet: boolean;
  };
}

function printHookHelp(): void {
  writeStdout(`Usage:
  agent-memory hook install [--ide <claude|cursor|vscode>] [--project-path <path>] [--project-id <id>] [--session-id <id>] [--dry-run] [--quiet]
  agent-memory hook status [--ide <claude|cursor|vscode>] [--project-path <path>] [--quiet]
  agent-memory hook uninstall [--ide <claude|cursor|vscode>] [--project-path <path>] [--dry-run] [--quiet]
  agent-memory hook <pretooluse|stop|userpromptsubmit|session-end> [--project-id <id>] [--agent-id <id>]

Notes:
  - install/status/uninstall write files in the target project directory.
  - pretooluse/stop/userpromptsubmit/session-end are executed by Claude Code hooks and expect JSON on stdin.
`);
}

async function readStdinJson(): Promise<ClaudeHookInput> {
  if (process.stdin.isTTY) {
    writeStderr('Hook commands expect JSON on stdin');
    process.exit(2);
  }

  const data = await new Promise<string>((resolvePromise) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      let chunk: string | null;
      // eslint-disable-next-line no-cond-assign, @typescript-eslint/no-unsafe-assignment
      while ((chunk = process.stdin.read()) !== null) {
        buf += chunk;
      }
    });
    process.stdin.on('end', () => resolvePromise(buf));
  });

  try {
    return JSON.parse(data) as ClaudeHookInput;
  } catch {
    writeStderr('Invalid JSON hook input');
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
      inputObj && typeof inputObj.content === 'string'
        ? inputObj.content
        : stringifyUnknown(toolInput);
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

// readTranscriptLines removed - using readTranscriptFromOffset for better performance

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
  const existing = loadState(statePath);
  const merged = { ...existing, ...state };
  writeFileSync(statePath, JSON.stringify(merged, null, 2));
}

function extractMessageFromTranscriptEntry(
  entry: unknown
): { role: ClaudeHookRole; content: string } | null {
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
  else if (
    roleLower.includes('assistant') ||
    roleLower.includes('agent') ||
    roleLower.includes('claude')
  )
    role = 'agent';
  else if (roleLower.includes('system')) role = 'system';

  const content =
    typeof obj.content === 'string'
      ? obj.content
      : Array.isArray(obj.content)
        ? obj.content
            .map((c) => {
              if (typeof c === 'string') return c;
              if (
                c &&
                typeof c === 'object' &&
                typeof (c as Record<string, unknown>).text === 'string'
              ) {
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
}): { appended: number; linesRead: number } {
  const { sessionId, transcriptPath } = params;

  const statePath = resolve(process.cwd(), '.claude', 'hooks', '.agent-memory-state.json');
  const state = loadState(statePath);

  // Use byte offset for efficient incremental reading (instead of re-reading entire file)
  const byteOffsetKey = `claude:byteOffset:${sessionId}:${transcriptPath}`;
  const lastByteOffset = typeof state[byteOffsetKey] === 'number' ? state[byteOffsetKey] : 0;

  // Read only new content from the last offset
  const result = readTranscriptFromOffset(transcriptPath, lastByteOffset);

  // Handle file truncation (e.g., log rotation) - reset state
  if (result.wasTruncated) {
    state[byteOffsetKey] = 0;
    saveState(statePath, state);
    // Re-read from beginning
    const resetResult = readTranscriptFromOffset(transcriptPath, 0);
    return processTranscriptLines(resetResult, params, state, statePath, byteOffsetKey);
  }

  if (result.lines.length === 0) {
    return { appended: 0, linesRead: 0 };
  }

  return processTranscriptLines(result, params, state, statePath, byteOffsetKey);
}

function processTranscriptLines(
  result: { lines: string[]; nextByteOffset: number },
  params: { sessionId: string; transcriptPath: string; projectId?: string; agentId?: string; cwd?: string },
  state: Record<string, unknown>,
  statePath: string,
  byteOffsetKey: string
): { appended: number; linesRead: number } {
  const { sessionId, projectId, agentId, cwd, transcriptPath } = params;

  const existing = conversationRepo.list(
    { sessionId, status: 'active' },
    { limit: 1, offset: 0 }
  )[0];
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
  for (const line of result.lines) {
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

  // Persist byte offset for next incremental read
  state[byteOffsetKey] = result.nextByteOffset;
  saveState(statePath, state);

  return { appended, linesRead: result.lines.length };
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

function hasWarnedReview(sessionId: string): boolean {
  const statePath = resolve(process.cwd(), '.claude', 'hooks', '.agent-memory-state.json');
  const state = loadState(statePath);
  return state[`review:warned:${sessionId}`] === true;
}

function setWarnedReview(sessionId: string): void {
  const statePath = resolve(process.cwd(), '.claude', 'hooks', '.agent-memory-state.json');
  const state = loadState(statePath);
  state[`review:warned:${sessionId}`] = true;
  saveState(statePath, state);
}

function getObserveState(sessionId: string): {
  committedAt?: string;
  reviewedAt?: string;
  needsReviewCount?: number;
} {
  const session = sessionRepo.getById(sessionId);
  const meta = session?.metadata ?? {};
  const observe = (meta.observe ?? {}) as Record<string, unknown>;
  return {
    committedAt: typeof observe.committedAt === 'string' ? observe.committedAt : undefined,
    reviewedAt: typeof observe.reviewedAt === 'string' ? observe.reviewedAt : undefined,
    needsReviewCount:
      typeof observe.needsReviewCount === 'number' ? observe.needsReviewCount : undefined,
  };
}

function setObserveReviewedAt(sessionId: string, reviewedAt: string): void {
  const session = sessionRepo.getById(sessionId);
  const meta = session?.metadata ?? {};
  const observe = (meta.observe ?? {}) as Record<string, unknown>;
  const nextMeta: Record<string, unknown> = {
    ...meta,
    observe: { ...observe, reviewedAt },
  };
  sessionRepo.update(sessionId, { metadata: nextMeta });
}

interface SessionSummary {
  sessionId: string;
  projectName?: string;
  guidelines: Array<{ name: string; content: string }>;
  knowledge: Array<{ title: string; content: string }>;
  tools: Array<{ name: string; description?: string }>;
  needsReview: number;
}

function getSessionSummary(sessionId: string): SessionSummary {
  const session = sessionRepo.getById(sessionId);
  const projectId = session?.projectId;
  const project = projectId ? projectRepo.getById(projectId) : null;

  const guidelinesList = guidelineRepo.list({ scopeType: 'session', scopeId: sessionId });
  const knowledgeList = knowledgeRepo.list({ scopeType: 'session', scopeId: sessionId });
  const toolsList = toolRepo.list({ scopeType: 'session', scopeId: sessionId });

  const meta = session?.metadata ?? {};
  const observe = (meta.observe ?? {}) as Record<string, unknown>;
  const needsReview = typeof observe.needsReviewCount === 'number' ? observe.needsReviewCount : 0;

  return {
    sessionId,
    projectName: project?.name,
    guidelines: guidelinesList.map((g) => ({
      name: g.name,
      content: g.currentVersion?.content ?? '',
    })),
    knowledge: knowledgeList.map((k) => ({
      title: k.title,
      content: k.currentVersion?.content ?? '',
    })),
    tools: toolsList.map((t) => ({
      name: t.name,
      description: t.currentVersion?.description ?? undefined,
    })),
    needsReview,
  };
}

// Reserved for future session summary file output
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function writeSessionSummaryFile(sessionId: string, cwd: string): { path: string; itemCount: number } {
  const summary = getSessionSummary(sessionId);
  const itemCount = summary.guidelines.length + summary.knowledge.length + summary.tools.length;

  const truncate = (s: string, len: number) => (s.length > len ? s.slice(0, len) + '...' : s);
  const timestamp = new Date().toISOString();

  let md = `# Session Summary\n\n`;
  md += `**Session:** \`${sessionId.slice(0, 8)}…\`\n`;
  if (summary.projectName) {
    md += `**Project:** ${summary.projectName}\n`;
  }
  md += `**Updated:** ${timestamp}\n\n`;

  md += `## Stored Entries\n\n`;

  md += `### Guidelines (${summary.guidelines.length})\n`;
  if (summary.guidelines.length === 0) {
    md += `_(none)_\n\n`;
  } else {
    for (const g of summary.guidelines) {
      md += `- **${g.name}** – ${truncate(g.content.replace(/\n/g, ' '), 80)}\n`;
    }
    md += `\n`;
  }

  md += `### Knowledge (${summary.knowledge.length})\n`;
  if (summary.knowledge.length === 0) {
    md += `_(none)_\n\n`;
  } else {
    for (const k of summary.knowledge) {
      md += `- **${k.title}** – ${truncate(k.content.replace(/\n/g, ' '), 80)}\n`;
    }
    md += `\n`;
  }

  md += `### Tools (${summary.tools.length})\n`;
  if (summary.tools.length === 0) {
    md += `_(none)_\n\n`;
  } else {
    for (const t of summary.tools) {
      md += `- **${t.name}**${t.description ? ` – ${truncate(t.description, 60)}` : ''}\n`;
    }
    md += `\n`;
  }

  if (summary.needsReview > 0) {
    md += `## Needs Review (${summary.needsReview})\n`;
    md += `_Items tagged as \`candidate\` require human review_\n`;
  }

  const summaryPath = resolve(cwd, '.claude', 'session-summary.md');
  const summaryDir = dirname(summaryPath);
  if (!existsSync(summaryDir)) {
    mkdirSync(summaryDir, { recursive: true });
  }
  writeFileSync(summaryPath, md, 'utf8');

  return { path: summaryPath, itemCount };
}

// Reserved for future stderr session summary output
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function formatSessionSummaryStderr(sessionId: string): void {
  const summary = getSessionSummary(sessionId);

  console.error(`\n📋 Session Summary (${sessionId.slice(0, 8)}…)`);
  if (summary.projectName) {
    console.error(`   Project: ${summary.projectName}`);
  }
  console.error('');

  if (summary.guidelines.length > 0) {
    console.error(`   Guidelines (${summary.guidelines.length}):`);
    for (const g of summary.guidelines.slice(0, 5)) {
      console.error(`   • ${g.name}`);
    }
    if (summary.guidelines.length > 5) {
      console.error(`   ... and ${summary.guidelines.length - 5} more`);
    }
  }

  if (summary.knowledge.length > 0) {
    console.error(`   Knowledge (${summary.knowledge.length}):`);
    for (const k of summary.knowledge.slice(0, 5)) {
      console.error(`   • ${k.title}`);
    }
    if (summary.knowledge.length > 5) {
      console.error(`   ... and ${summary.knowledge.length - 5} more`);
    }
  }

  if (summary.tools.length > 0) {
    console.error(`   Tools (${summary.tools.length}):`);
    for (const t of summary.tools.slice(0, 5)) {
      console.error(`   • ${t.name}`);
    }
    if (summary.tools.length > 5) {
      console.error(`   ... and ${summary.tools.length - 5} more`);
    }
  }

  if (summary.needsReview > 0) {
    console.error(`\n   ⚠ ${summary.needsReview} item(s) need review`);
  }
  console.error('');
}

interface ReviewCandidate {
  id: string;
  shortId: string;
  type: 'guideline' | 'knowledge' | 'tool';
  name: string;
  content: string;
}

function getReviewCandidates(sessionId: string): ReviewCandidate[] {
  const candidates: ReviewCandidate[] = [];

  const guidelinesList = guidelineRepo.list({ scopeType: 'session', scopeId: sessionId });
  for (const g of guidelinesList) {
    if (!g.isActive) continue;
    const tags = g.id ? getEntryTags('guideline', g.id) : [];
    if (tags.includes('candidate') || tags.includes('needs_review')) {
      candidates.push({
        id: g.id,
        shortId: g.id.slice(0, 6),
        type: 'guideline',
        name: g.name,
        content: g.currentVersion?.content ?? '',
      });
    }
  }

  const knowledgeList = knowledgeRepo.list({ scopeType: 'session', scopeId: sessionId });
  for (const k of knowledgeList) {
    if (!k.isActive) continue;
    const tags = k.id ? getEntryTags('knowledge', k.id) : [];
    if (tags.includes('candidate') || tags.includes('needs_review')) {
      candidates.push({
        id: k.id,
        shortId: k.id.slice(0, 6),
        type: 'knowledge',
        name: k.title,
        content: k.currentVersion?.content ?? '',
      });
    }
  }

  const toolsList = toolRepo.list({ scopeType: 'session', scopeId: sessionId });
  for (const t of toolsList) {
    if (!t.isActive) continue;
    const tags = t.id ? getEntryTags('tool', t.id) : [];
    if (tags.includes('candidate') || tags.includes('needs_review')) {
      candidates.push({
        id: t.id,
        shortId: t.id.slice(0, 6),
        type: 'tool',
        name: t.name,
        content: t.currentVersion?.description ?? '',
      });
    }
  }

  return candidates;
}

function getEntryTags(entryType: 'guideline' | 'knowledge' | 'tool', entryId: string): string[] {
  try {
    const { entryTagRepo } = require('../db/repositories/tags.js') as {
      entryTagRepo: { getTagsForEntry: (type: string, id: string) => Array<{ name: string }> };
    };
    const tags = entryTagRepo.getTagsForEntry(entryType, entryId);
    return tags.map((t) => t.name);
  } catch {
    return [];
  }
}

function findCandidateByShortId(candidates: ReviewCandidate[], shortId: string): ReviewCandidate | undefined {
  return candidates.find((c) => c.shortId === shortId || c.id === shortId || c.id.startsWith(shortId));
}

function approveCandidate(candidate: ReviewCandidate, projectId: string): boolean {
  try {
    if (candidate.type === 'guideline') {
      const original = guidelineRepo.getById(candidate.id);
      if (!original) return false;
      guidelineRepo.create({
        scopeType: 'project',
        scopeId: projectId,
        name: original.name,
        content: original.currentVersion?.content ?? '',
        category: original.category ?? undefined,
        priority: original.priority ?? undefined,
        rationale: original.currentVersion?.rationale ?? undefined,
      });
      guidelineRepo.deactivate(candidate.id);
      return true;
    }
    if (candidate.type === 'knowledge') {
      const original = knowledgeRepo.getById(candidate.id);
      if (!original) return false;
      knowledgeRepo.create({
        scopeType: 'project',
        scopeId: projectId,
        title: original.title,
        content: original.currentVersion?.content ?? '',
        category: original.category ?? undefined,
        source: original.currentVersion?.source ?? undefined,
      });
      knowledgeRepo.deactivate(candidate.id);
      return true;
    }
    if (candidate.type === 'tool') {
      const original = toolRepo.getById(candidate.id);
      if (!original) return false;
      toolRepo.create({
        scopeType: 'project',
        scopeId: projectId,
        name: original.name,
        description: original.currentVersion?.description ?? undefined,
        category: original.category ?? undefined,
      });
      toolRepo.deactivate(candidate.id);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function rejectCandidate(candidate: ReviewCandidate): boolean {
  try {
    if (candidate.type === 'guideline') {
      guidelineRepo.deactivate(candidate.id);
      return true;
    }
    if (candidate.type === 'knowledge') {
      knowledgeRepo.deactivate(candidate.id);
      return true;
    }
    if (candidate.type === 'tool') {
      toolRepo.deactivate(candidate.id);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function skipCandidate(candidate: ReviewCandidate): boolean {
  try {
    const { entryTagRepo, tagRepo } = require('../db/repositories/tags.js') as {
      entryTagRepo: { detach: (type: string, entryId: string, tagId: string) => boolean };
      tagRepo: { getByName: (name: string) => { id: string } | undefined };
    };
    const candidateTag = tagRepo.getByName('candidate');
    const needsReviewTag = tagRepo.getByName('needs_review');
    if (candidateTag) {
      entryTagRepo.detach(candidate.type, candidate.id, candidateTag.id);
    }
    if (needsReviewTag) {
      entryTagRepo.detach(candidate.type, candidate.id, needsReviewTag.id);
    }
    return true;
  } catch {
    return false;
  }
}

function formatCandidateList(candidates: ReviewCandidate[]): void {
  if (candidates.length === 0) {
    console.error('\n📋 No candidates to review\n');
    return;
  }
  console.error(`\n📋 Review Candidates (${candidates.length})\n`);
  for (const c of candidates) {
    const truncated = c.content.replace(/\n/g, ' ').slice(0, 50);
    console.error(`  ${c.shortId}  [${c.type}] ${c.name}`);
    console.error(`         ${truncated}${c.content.length > 50 ? '…' : ''}`);
  }
  console.error('\nCommands: !am approve <id> | !am reject <id> | !am skip <id> | !am show <id>\n');
}

function formatCandidateDetail(candidate: ReviewCandidate): void {
  console.error(`\n📄 ${candidate.type.toUpperCase()}: ${candidate.name}`);
  console.error(`   ID: ${candidate.id}`);
  console.error(`   ───────────────────────────────────`);
  // Show full content, wrapped
  const lines = candidate.content.split('\n');
  for (const line of lines.slice(0, 20)) {
    console.error(`   ${line}`);
  }
  if (lines.length > 20) {
    console.error(`   ... (${lines.length - 20} more lines)`);
  }
  console.error('');
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
  const cwd = input.cwd || process.cwd();

  if (!sessionId) {
    writeStderr('Missing session_id in hook input');
    process.exit(2);
  }
  if (!transcriptPath) {
    writeStderr('Missing transcript_path in hook input');
    process.exit(2);
  }

  ensureSessionIdExists(sessionId, projectId);

  // Keep conversation history up to date before any review gating.
  ingestTranscript({
    sessionId,
    transcriptPath,
    projectId,
    agentId,
    cwd,
  });

  if (isReviewSuspended(sessionId)) {
    process.exit(0);
  }

  const observe = getObserveState(sessionId);

  // Write session summary file and output minimal one-liner
  const { itemCount } = writeSessionSummaryFile(sessionId, cwd);

  // Only warn once per session about review availability
  if (!observe.committedAt && !hasWarnedReview(sessionId)) {
    setWarnedReview(sessionId);
    if (itemCount > 0) {
      console.error(`✓ Session tracked (${itemCount} items) - see .claude/session-summary.md`);
    } else {
      console.error(`✓ Session tracked - no new items`);
    }
    process.exit(0);
  }

  if ((observe.needsReviewCount ?? 0) > 0 && !observe.reviewedAt) {
    console.error(
      `✓ Session (${itemCount} items, ${observe.needsReviewCount} need review) - run: npx agent-memory review`
    );
    process.exit(0);
  }

  // Silent exit for subsequent turns after initial warning
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
    console.error('✓ Review suspended');
    process.exit(2);
  }

  if (command === 'review' && (subcommand === 'on' || subcommand === 'resume')) {
    setReviewSuspended(sessionId, false);
    console.error('✓ Review enabled');
    process.exit(2);
  }

  if (command === 'review' && subcommand === 'done') {
    const reviewedAt = new Date().toISOString();
    setObserveReviewedAt(sessionId, reviewedAt);
    console.error('✓ Review acknowledged');
    process.exit(2);
  }

  if (command === 'status' || (command === 'review' && subcommand === 'status')) {
    const suspended = isReviewSuspended(sessionId);
    const observe = getObserveState(sessionId);
    const committed = observe.committedAt ? '✓' : '✗';
    const reviewed = observe.reviewedAt ? '✓' : (observe.needsReviewCount ?? 0) > 0 ? '⚠' : '–';
    console.error(
      `Session ${sessionId.slice(0, 8)}… | committed:${committed} reviewed:${reviewed} suspended:${suspended ? 'yes' : 'no'} pending:${observe.needsReviewCount ?? 0}`
    );
    process.exit(2);
  }

  if (command === 'summary') {
    formatSessionSummaryStderr(sessionId);
    process.exit(2);
  }

  // Review commands for in-IDE workflow
  if (command === 'review' && !subcommand) {
    const candidates = getReviewCandidates(sessionId);
    formatCandidateList(candidates);
    process.exit(2);
  }

  if (command === 'list') {
    const candidates = getReviewCandidates(sessionId);
    formatCandidateList(candidates);
    process.exit(2);
  }

  if (command === 'show') {
    const targetId = subcommand;
    if (!targetId) {
      console.error('Usage: !am show <id>');
      process.exit(2);
    }
    const candidates = getReviewCandidates(sessionId);
    const candidate = findCandidateByShortId(candidates, targetId);
    if (!candidate) {
      console.error(`Entry not found: ${targetId}`);
      process.exit(2);
    }
    formatCandidateDetail(candidate);
    process.exit(2);
  }

  if (command === 'approve') {
    const targetId = subcommand;
    if (!targetId) {
      console.error('Usage: !am approve <id>');
      process.exit(2);
    }
    if (!projectId) {
      console.error('No project ID configured. Use --project-id when installing hooks.');
      process.exit(2);
    }
    const candidates = getReviewCandidates(sessionId);
    const candidate = findCandidateByShortId(candidates, targetId);
    if (!candidate) {
      console.error(`Entry not found: ${targetId}`);
      process.exit(2);
    }
    const success = approveCandidate(candidate, projectId);
    if (success) {
      console.error(`✓ Approved: ${candidate.name} → project scope`);
    } else {
      console.error(`✗ Failed to approve: ${candidate.name}`);
    }
    process.exit(2);
  }

  if (command === 'reject') {
    const targetId = subcommand;
    if (!targetId) {
      console.error('Usage: !am reject <id>');
      process.exit(2);
    }
    const candidates = getReviewCandidates(sessionId);
    const candidate = findCandidateByShortId(candidates, targetId);
    if (!candidate) {
      console.error(`Entry not found: ${targetId}`);
      process.exit(2);
    }
    const success = rejectCandidate(candidate);
    if (success) {
      console.error(`✓ Rejected: ${candidate.name}`);
    } else {
      console.error(`✗ Failed to reject: ${candidate.name}`);
    }
    process.exit(2);
  }

  if (command === 'skip') {
    const targetId = subcommand;
    if (!targetId) {
      console.error('Usage: !am skip <id>');
      process.exit(2);
    }
    const candidates = getReviewCandidates(sessionId);
    const candidate = findCandidateByShortId(candidates, targetId);
    if (!candidate) {
      console.error(`Entry not found: ${targetId}`);
      process.exit(2);
    }
    const success = skipCandidate(candidate);
    if (success) {
      console.error(`✓ Skipped: ${candidate.name}`);
    } else {
      console.error(`✗ Failed to skip: ${candidate.name}`);
    }
    process.exit(2);
  }

  console.error(`!am commands:
  status              Show session status
  summary             Show session summary
  review              List candidates for review
  show <id>           Show entry details
  approve <id>        Promote to project scope
  reject <id>         Deactivate entry
  skip <id>           Remove from review queue
  review off|on|done  Control review notifications`);
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
  const first = (argv[0] || '').toLowerCase();
  if (!first || first === '--help' || first === '-h') {
    printHookHelp();
    process.exit(0);
  }

  if (first === 'install' || first === 'status' || first === 'uninstall') {
    const { subcommand, ide, projectPath, projectId, sessionId, dryRun, quiet } =
      parseInstallArgs(argv);

    if (subcommand === 'status') {
      const status = getHookStatus(projectPath, ide);
      if (!quiet) {
        writeStdout(`Status: ${status.installed ? 'Installed' : 'Not installed'}`);
        writeStdout('Files:');
        for (const file of status.files) {
          writeStdout(`  ${file.exists ? '✓' : '✗'} ${file.path}`);
        }
      }
      process.exit(status.installed ? 0 : 1);
    }

    if (subcommand === 'uninstall') {
      if (dryRun) {
        const status = getHookStatus(projectPath, ide);
        if (!quiet) {
          writeStdout('(Dry run - no files will be removed)');
          writeStdout('Would remove:');
          for (const file of status.files) {
            if (file.exists) writeStdout(`  - ${file.path}`);
          }
        }
        process.exit(0);
      }

      const result = uninstallHooks(projectPath, ide);
      if (!quiet) {
        if (result.success) {
          writeStdout(`Removed ${result.removed.length} file(s):`);
          for (const file of result.removed) writeStdout(`  - ${file}`);
        } else {
          writeStdout('Uninstall completed with errors:');
          for (const error of result.errors) writeStdout(`  - ${error}`);
        }
      }
      process.exit(result.success ? 0 : 1);
    }

    // install
    const genResult = generateHooks({
      ide,
      projectPath,
      projectId,
      sessionId,
    });

    if (!genResult.success) {
      writeStderr(genResult.message);
      process.exit(1);
    }

    if (!quiet) {
      writeStdout(genResult.message);
    }

    if (dryRun) {
      if (!quiet) {
        writeStdout('(Dry run - no files will be written)');
        writeStdout('Would install:');
        for (const hook of genResult.hooks) writeStdout(`  - ${hook.filePath}`);
      }
      process.exit(0);
    }

    const installResult = installHooks(genResult.hooks);
    if (!quiet) {
      if (installResult.success) {
        writeStdout(`Installed ${installResult.installed.length} file(s):`);
        for (const file of installResult.installed) writeStdout(`  ✓ ${file}`);
        const firstHook = genResult.hooks[0];
        if (firstHook) {
          writeStdout('---');
          writeStdout(firstHook.instructions);
        }
      } else {
        writeStdout('Installation completed with errors:');
        for (const error of installResult.errors) writeStdout(`  ✗ ${error}`);
        for (const file of installResult.installed) writeStdout(`  ✓ ${file}`);
      }
    }
    process.exit(installResult.success ? 0 : 1);
  }

  const { subcommand, projectId, agentId } = parseArgs(argv);

  const sub = (subcommand || '').toLowerCase();

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

  logger.warn({ subcommand }, 'Unknown hook subcommand');
  writeStderr(`Unknown hook subcommand: ${subcommand}`);
  process.exit(2);
}
