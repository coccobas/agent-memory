import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { getPromptFromHookInput } from './shared.js';
import { ensureSessionIdExists, getObserveState, setObserveReviewedAt } from './session.js';
import { isReviewSuspended, setReviewSuspended } from './state-file.js';
import { formatSessionSummary } from './session-summary.js';
import {
  approveCandidate,
  findCandidateByShortId,
  formatCandidateDetail,
  formatCandidateList,
  getReviewCandidates,
  rejectCandidate,
  skipCandidate,
} from './review.js';

export function runUserPromptSubmitCommand(params: {
  projectId?: string;
  input: ClaudeHookInput;
}): HookCommandResult {
  const { projectId, input } = params;

  const sessionId = input.session_id;
  if (!sessionId) {
    return { exitCode: 0, stdout: [], stderr: [] };
  }

  const prompt = getPromptFromHookInput(input);
  if (!prompt) {
    return { exitCode: 0, stdout: [], stderr: [] };
  }

  const trimmed = prompt.trim();
  if (!trimmed.toLowerCase().startsWith('!am')) {
    return { exitCode: 0, stdout: [], stderr: [] };
  }

  const parts = trimmed.split(/\s+/).slice(1);
  const command = (parts[0] ?? '').toLowerCase();
  const subcommand = (parts[1] ?? '').toLowerCase();

  ensureSessionIdExists(sessionId, projectId);

  if (command === 'review' && (subcommand === 'off' || subcommand === 'suspend')) {
    setReviewSuspended(sessionId, true);
    return { exitCode: 2, stdout: [], stderr: ['✓ Review suspended'] };
  }

  if (command === 'review' && (subcommand === 'on' || subcommand === 'resume')) {
    setReviewSuspended(sessionId, false);
    return { exitCode: 2, stdout: [], stderr: ['✓ Review enabled'] };
  }

  if (command === 'review' && subcommand === 'done') {
    const reviewedAt = new Date().toISOString();
    setObserveReviewedAt(sessionId, reviewedAt);
    return { exitCode: 2, stdout: [], stderr: ['✓ Review acknowledged'] };
  }

  if (command === 'status' || (command === 'review' && subcommand === 'status')) {
    const suspended = isReviewSuspended(sessionId);
    const observe = getObserveState(sessionId);
    const committed = observe.committedAt ? '✓' : '✗';
    const reviewed = observe.reviewedAt ? '✓' : (observe.needsReviewCount ?? 0) > 0 ? '⚠' : '–';
    return {
      exitCode: 2,
      stdout: [],
      stderr: [
        `Session ${sessionId.slice(0, 8)}… | committed:${committed} reviewed:${reviewed} suspended:${suspended ? 'yes' : 'no'} pending:${observe.needsReviewCount ?? 0}`,
      ],
    };
  }

  if (command === 'summary') {
    return { exitCode: 2, stdout: [], stderr: formatSessionSummary(sessionId) };
  }

  if (command === 'review' && !subcommand) {
    const candidates = getReviewCandidates(sessionId);
    return { exitCode: 2, stdout: [], stderr: formatCandidateList(candidates) };
  }

  if (command === 'list') {
    const candidates = getReviewCandidates(sessionId);
    return { exitCode: 2, stdout: [], stderr: formatCandidateList(candidates) };
  }

  if (command === 'show') {
    const targetId = subcommand;
    if (!targetId) {
      return { exitCode: 2, stdout: [], stderr: ['Usage: !am show <id>'] };
    }
    const candidates = getReviewCandidates(sessionId);
    const candidate = findCandidateByShortId(candidates, targetId);
    if (!candidate) {
      return { exitCode: 2, stdout: [], stderr: [`Entry not found: ${targetId}`] };
    }
    return { exitCode: 2, stdout: [], stderr: formatCandidateDetail(candidate) };
  }

  if (command === 'approve') {
    const targetId = subcommand;
    if (!targetId) {
      return { exitCode: 2, stdout: [], stderr: ['Usage: !am approve <id>'] };
    }
    if (!projectId) {
      return {
        exitCode: 2,
        stdout: [],
        stderr: ['No project ID configured. Use --project-id when installing hooks.'],
      };
    }
    const candidates = getReviewCandidates(sessionId);
    const candidate = findCandidateByShortId(candidates, targetId);
    if (!candidate) {
      return { exitCode: 2, stdout: [], stderr: [`Entry not found: ${targetId}`] };
    }
    const success = approveCandidate(candidate, projectId);
    if (success) {
      return { exitCode: 2, stdout: [], stderr: [`✓ Approved: ${candidate.name} → project scope`] };
    }
    return { exitCode: 2, stdout: [], stderr: [`✗ Failed to approve: ${candidate.name}`] };
  }

  if (command === 'reject') {
    const targetId = subcommand;
    if (!targetId) {
      return { exitCode: 2, stdout: [], stderr: ['Usage: !am reject <id>'] };
    }
    const candidates = getReviewCandidates(sessionId);
    const candidate = findCandidateByShortId(candidates, targetId);
    if (!candidate) {
      return { exitCode: 2, stdout: [], stderr: [`Entry not found: ${targetId}`] };
    }
    const success = rejectCandidate(candidate);
    if (success) {
      return { exitCode: 2, stdout: [], stderr: [`✓ Rejected: ${candidate.name}`] };
    }
    return { exitCode: 2, stdout: [], stderr: [`✗ Failed to reject: ${candidate.name}`] };
  }

  if (command === 'skip') {
    const targetId = subcommand;
    if (!targetId) {
      return { exitCode: 2, stdout: [], stderr: ['Usage: !am skip <id>'] };
    }
    const candidates = getReviewCandidates(sessionId);
    const candidate = findCandidateByShortId(candidates, targetId);
    if (!candidate) {
      return { exitCode: 2, stdout: [], stderr: [`Entry not found: ${targetId}`] };
    }
    const success = skipCandidate(candidate);
    if (success) {
      return { exitCode: 2, stdout: [], stderr: [`✓ Skipped: ${candidate.name}`] };
    }
    return { exitCode: 2, stdout: [], stderr: [`✗ Failed to skip: ${candidate.name}`] };
  }

  return {
    exitCode: 2,
    stdout: [],
    stderr: [
      `!am commands:
  status              Show session status
  summary             Show session summary
  review              List candidates for review
  show <id>           Show entry details
  approve <id>        Promote to project scope
  reject <id>         Deactivate entry
  skip <id>           Remove from review queue
  review off|on|done  Control review notifications`,
    ],
  };
}

