/**
 * Interactive review command
 *
 * Provides a TUI for reviewing candidate entries extracted during a session.
 * Users can approve (promote to project scope), reject, or skip entries.
 *
 * Usage:
 *   agent-memory review [--session <id>] [--project <id>]
 */

import * as p from '@clack/prompts';
import { guidelineRepo } from '../db/repositories/guidelines.js';
import { knowledgeRepo } from '../db/repositories/knowledge.js';
import { toolRepo } from '../db/repositories/tools.js';
import { sessionRepo, projectRepo } from '../db/repositories/scopes.js';
import { entryTagRepo, tagRepo } from '../db/repositories/tags.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('review');

interface ReviewCandidate {
  id: string;
  type: 'guideline' | 'knowledge' | 'tool';
  name: string;
  content: string;
  confidence?: number;
  tags: string[];
}

interface ReviewStats {
  approved: number;
  rejected: number;
  skipped: number;
}

function parseArgs(argv: string[]): {
  sessionId?: string;
  projectId?: string;
  help: boolean;
} {
  let sessionId: string | undefined;
  let projectId: string | undefined;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }

    if (arg === '--session' || arg === '-s') {
      sessionId = argv[++i];
      continue;
    }
    if (arg.startsWith('--session=')) {
      sessionId = arg.slice('--session='.length);
      continue;
    }

    if (arg === '--project' || arg === '-p') {
      projectId = argv[++i];
      continue;
    }
    if (arg.startsWith('--project=')) {
      projectId = arg.slice('--project='.length);
      continue;
    }
  }

  return { sessionId, projectId, help };
}

function printHelp(): void {
  console.log(`
Usage: agent-memory review [options]

Interactive review of candidate memory entries.

Options:
  -s, --session <id>   Session ID to review candidates from
  -p, --project <id>   Project ID for promoting approved entries
  -h, --help           Show this help message

Examples:
  agent-memory review                          # Auto-detect active session
  agent-memory review --session abc123         # Review specific session
  agent-memory review -s abc123 -p proj456     # Specify both session and project

Actions during review:
  ↑/↓        Navigate between entries
  Space      Toggle selection
  Enter      Confirm action on selected entries
  a          Approve selected (promote to project scope)
  r          Reject selected (deactivate entries)
  s          Skip (leave for later review)
  q          Quit review
`);
}

async function getCandidates(sessionId: string): Promise<ReviewCandidate[]> {
  const candidates: ReviewCandidate[] = [];

  // Get guidelines from session scope
  const guidelines = guidelineRepo.list({ scopeType: 'session', scopeId: sessionId });
  for (const g of guidelines) {
    if (!g.isActive) continue;
    const tags = entryTagRepo.getTagsForEntry('guideline', g.id);
    const tagNames = tags.map((t) => t.name);
    if (tagNames.includes('candidate') || tagNames.includes('needs_review')) {
      candidates.push({
        id: g.id,
        type: 'guideline',
        name: g.name,
        content: g.currentVersion?.content ?? '',
        tags: tagNames,
      });
    }
  }

  // Get knowledge from session scope
  const knowledgeList = knowledgeRepo.list({ scopeType: 'session', scopeId: sessionId });
  for (const k of knowledgeList) {
    if (!k.isActive) continue;
    const tags = entryTagRepo.getTagsForEntry('knowledge', k.id);
    const tagNames = tags.map((t) => t.name);
    if (tagNames.includes('candidate') || tagNames.includes('needs_review')) {
      candidates.push({
        id: k.id,
        type: 'knowledge',
        name: k.title,
        content: k.currentVersion?.content ?? '',
        tags: tagNames,
      });
    }
  }

  // Get tools from session scope
  const tools = toolRepo.list({ scopeType: 'session', scopeId: sessionId });
  for (const t of tools) {
    if (!t.isActive) continue;
    const tags = entryTagRepo.getTagsForEntry('tool', t.id);
    const tagNames = tags.map((tag) => tag.name);
    if (tagNames.includes('candidate') || tagNames.includes('needs_review')) {
      candidates.push({
        id: t.id,
        type: 'tool',
        name: t.name,
        content: t.currentVersion?.description ?? '',
        tags: tagNames,
      });
    }
  }

  return candidates;
}

function truncate(s: string, maxLen: number): string {
  const cleaned = s.replace(/\n/g, ' ').trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen - 1) + '…' : cleaned;
}

async function approveEntry(
  candidate: ReviewCandidate,
  projectId: string
): Promise<boolean> {
  try {
    if (candidate.type === 'guideline') {
      const original = guidelineRepo.getById(candidate.id);
      if (!original) return false;

      // Create new guideline at project scope
      guidelineRepo.create({
        scopeType: 'project',
        scopeId: projectId,
        name: original.name,
        content: original.currentVersion?.content ?? '',
        category: original.category ?? undefined,
        priority: original.priority ?? undefined,
        rationale: original.currentVersion?.rationale ?? undefined,
      });

      // Deactivate the session-scoped original
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
  } catch (error) {
    logger.error(
      { candidateId: candidate.id, error: error instanceof Error ? error.message : String(error) },
      'Failed to approve entry'
    );
    return false;
  }
}

function rejectEntry(candidate: ReviewCandidate): boolean {
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
  } catch (error) {
    logger.error(
      { candidateId: candidate.id, error: error instanceof Error ? error.message : String(error) },
      'Failed to reject entry'
    );
    return false;
  }
}

function removeReviewTags(candidate: ReviewCandidate): void {
  try {
    // Look up tag IDs by name
    const candidateTag = tagRepo.getByName('candidate');
    const needsReviewTag = tagRepo.getByName('needs_review');

    if (candidateTag) {
      entryTagRepo.detach(candidate.type, candidate.id, candidateTag.id);
    }
    if (needsReviewTag) {
      entryTagRepo.detach(candidate.type, candidate.id, needsReviewTag.id);
    }
  } catch {
    // Best effort
  }
}

async function findActiveSession(): Promise<string | undefined> {
  const activeSessions = sessionRepo.list({ status: 'active' }, { limit: 10, offset: 0 });
  if (activeSessions.length === 0) return undefined;

  // Return most recent active session (using startedAt)
  const sorted = activeSessions.sort((a, b) => {
    const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
    const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
    return bTime - aTime;
  });

  return sorted[0]?.id ?? undefined;
}

async function runReviewLoop(
  candidates: ReviewCandidate[],
  projectId: string
): Promise<ReviewStats> {
  const stats: ReviewStats = { approved: 0, rejected: 0, skipped: 0 };
  let remaining = [...candidates];

  while (remaining.length > 0) {
    // Build options for multiselect
    const options = remaining.map((c) => ({
      value: c.id,
      label: `[${c.type}] ${c.name}`,
      hint: truncate(c.content, 60),
    }));

    p.note(
      `${remaining.length} candidate(s) remaining\n` +
        `Project: ${projectId}\n\n` +
        `Use Space to select, Enter to confirm selection`,
      'Review Candidates'
    );

    const selected = await p.multiselect({
      message: 'Select entries to act on:',
      options,
      required: false,
    });

    if (p.isCancel(selected)) {
      p.cancel('Review cancelled');
      break;
    }

    const selectedIds = selected as string[];

    if (selectedIds.length === 0) {
      const shouldExit = await p.confirm({
        message: 'No entries selected. Exit review?',
        initialValue: false,
      });

      if (p.isCancel(shouldExit) || shouldExit) {
        break;
      }
      continue;
    }

    // Ask what action to take
    const action = await p.select({
      message: `Action for ${selectedIds.length} selected entry(s):`,
      options: [
        { value: 'approve', label: 'Approve', hint: 'Promote to project scope' },
        { value: 'reject', label: 'Reject', hint: 'Deactivate entries' },
        { value: 'skip', label: 'Skip', hint: 'Leave for later' },
        { value: 'cancel', label: 'Cancel', hint: 'Go back to selection' },
      ],
    });

    if (p.isCancel(action) || action === 'cancel') {
      continue;
    }

    const selectedCandidates = remaining.filter((c) => selectedIds.includes(c.id));

    if (action === 'approve') {
      const spinner = p.spinner();
      spinner.start('Approving entries...');

      for (const candidate of selectedCandidates) {
        const success = await approveEntry(candidate, projectId);
        if (success) {
          stats.approved++;
          remaining = remaining.filter((c) => c.id !== candidate.id);
        }
      }

      spinner.stop(`Approved ${selectedCandidates.length} entry(s)`);
    }

    if (action === 'reject') {
      const spinner = p.spinner();
      spinner.start('Rejecting entries...');

      for (const candidate of selectedCandidates) {
        const success = rejectEntry(candidate);
        if (success) {
          stats.rejected++;
          remaining = remaining.filter((c) => c.id !== candidate.id);
        }
      }

      spinner.stop(`Rejected ${selectedCandidates.length} entry(s)`);
    }

    if (action === 'skip') {
      for (const candidate of selectedCandidates) {
        removeReviewTags(candidate);
        stats.skipped++;
        remaining = remaining.filter((c) => c.id !== candidate.id);
      }
      p.log.info(`Skipped ${selectedCandidates.length} entry(s)`);
    }
  }

  return stats;
}

export async function runReviewCommand(argv: string[]): Promise<void> {
  const { sessionId: argSessionId, projectId: argProjectId, help } = parseArgs(argv);

  if (help) {
    printHelp();
    process.exit(0);
  }

  // Load config
  await import('../config/index.js');

  p.intro('Agent Memory Review');

  // Determine session ID
  let sessionId = argSessionId;
  if (!sessionId) {
    const spinner = p.spinner();
    spinner.start('Finding active session...');
    sessionId = await findActiveSession();
    spinner.stop(sessionId ? `Found session: ${sessionId.slice(0, 8)}…` : 'No active session');
  }

  if (!sessionId) {
    p.log.error('No session found. Use --session <id> to specify.');
    process.exit(1);
  }

  // Verify session exists
  const session = sessionRepo.getById(sessionId);
  if (!session) {
    p.log.error(`Session not found: ${sessionId}`);
    process.exit(1);
  }

  // Determine project ID
  let projectId = argProjectId ?? session.projectId ?? undefined;
  if (!projectId) {
    // Ask user to select a project
    const projects = projectRepo.list();
    if (projects.length === 0) {
      p.log.error('No projects found. Create a project first.');
      process.exit(1);
    }

    const selected = await p.select({
      message: 'Select target project for approved entries:',
      options: projects.map((proj) => ({
        value: proj.id,
        label: proj.name,
        hint: proj.rootPath ?? undefined,
      })),
    });

    if (p.isCancel(selected)) {
      p.cancel('Review cancelled');
      process.exit(0);
    }

    projectId = selected as string;
  }

  // Verify project exists
  const project = projectRepo.getById(projectId);
  if (!project) {
    p.log.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  p.log.info(`Session: ${session.name ?? sessionId.slice(0, 8)}`);
  p.log.info(`Target project: ${project.name}`);

  // Get candidates
  const spinner = p.spinner();
  spinner.start('Loading candidates...');
  const candidates = await getCandidates(sessionId);
  spinner.stop(`Found ${candidates.length} candidate(s)`);

  if (candidates.length === 0) {
    p.log.success('No candidates to review!');
    p.outro('Review complete');
    process.exit(0);
  }

  // Run interactive review loop
  const stats = await runReviewLoop(candidates, projectId);

  // Summary
  p.note(
    `Approved: ${stats.approved}\n` +
      `Rejected: ${stats.rejected}\n` +
      `Skipped: ${stats.skipped}`,
    'Review Summary'
  );

  // Update session metadata to mark as reviewed
  if (stats.approved + stats.rejected > 0) {
    const meta = session.metadata ?? {};
    const observe = (meta.observe ?? {}) as Record<string, unknown>;
    const newMeta = {
      ...meta,
      observe: {
        ...observe,
        reviewedAt: new Date().toISOString(),
        reviewStats: stats,
      },
    };
    sessionRepo.update(sessionId, { metadata: newMeta });
  }

  p.outro('Review complete');
}
