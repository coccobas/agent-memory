/**
 * Unit tests for hook command modules
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock modules before imports
vi.mock('../../src/services/verification.service.js', () => ({
  verifyAction: vi.fn(),
}));

vi.mock('../../src/commands/hook/session.js', () => ({
  ensureSessionIdExists: vi.fn(),
  getObserveState: vi.fn(() => ({})),
  setObserveReviewedAt: vi.fn(),
}));

vi.mock('../../src/commands/hook/state-file.js', () => ({
  hasWarnedReview: vi.fn(() => false),
  isReviewSuspended: vi.fn(() => false),
  setWarnedReview: vi.fn(),
  setReviewSuspended: vi.fn(),
}));

vi.mock('../../src/commands/hook/transcript-ingest.js', () => ({
  ingestTranscript: vi.fn(),
}));

vi.mock('../../src/commands/hook/session-summary.js', () => ({
  writeSessionSummaryFile: vi.fn(() => ({ itemCount: 0 })),
  formatSessionSummary: vi.fn(() => ['Session summary']),
}));

vi.mock('../../src/commands/hook/review.js', () => ({
  approveCandidate: vi.fn(() => true),
  findCandidateByShortId: vi.fn(),
  formatCandidateDetail: vi.fn(() => ['Candidate detail']),
  formatCandidateList: vi.fn(() => ['Candidate list']),
  getReviewCandidates: vi.fn(() => []),
  rejectCandidate: vi.fn(() => true),
  skipCandidate: vi.fn(() => true),
}));

import { runPreToolUseCommand } from '../../src/commands/hook/pretooluse-command.js';
import { runStopCommand } from '../../src/commands/hook/stop-command.js';
import { runUserPromptSubmitCommand } from '../../src/commands/hook/userpromptsubmit-command.js';
import { runSessionEndCommand } from '../../src/commands/hook/session-end-command.js';
import { verifyAction } from '../../src/services/verification.service.js';
import { ensureSessionIdExists, getObserveState, setObserveReviewedAt } from '../../src/commands/hook/session.js';
import { hasWarnedReview, isReviewSuspended, setWarnedReview, setReviewSuspended } from '../../src/commands/hook/state-file.js';
import { ingestTranscript } from '../../src/commands/hook/transcript-ingest.js';
import { writeSessionSummaryFile, formatSessionSummary } from '../../src/commands/hook/session-summary.js';
import { getReviewCandidates, findCandidateByShortId, approveCandidate, rejectCandidate, skipCandidate, formatCandidateList, formatCandidateDetail } from '../../src/commands/hook/review.js';

describe('runPreToolUseCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return exit code 0 when action is allowed', () => {
    vi.mocked(verifyAction).mockReturnValue({
      allowed: true,
      blocked: false,
      violations: [],
      warnings: [],
      requiresConfirmation: false,
    });

    const result = runPreToolUseCommand({
      projectId: 'proj-123',
      agentId: 'claude-code',
      input: {
        session_id: 'sess-123',
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: '/path/to/file.ts', content: 'code' },
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toEqual([]);
    expect(result.stderr).toEqual([]);
    expect(verifyAction).toHaveBeenCalledWith('sess-123', 'proj-123', expect.objectContaining({
      type: 'file_write',
      filePath: '/path/to/file.ts',
    }));
  });

  it('should return exit code 2 with violations when action is blocked', () => {
    vi.mocked(verifyAction).mockReturnValue({
      allowed: false,
      blocked: true,
      violations: [
        { guidelineId: 'g1', guidelineName: 'no-secrets', severity: 'critical', message: 'Contains secret' },
      ],
      warnings: [],
      requiresConfirmation: false,
    });

    const result = runPreToolUseCommand({
      input: {
        session_id: 'sess-123',
        tool_name: 'Write',
        tool_input: { file_path: '/path/secrets.ts' },
      },
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Contains secret');
  });

  it('should use default message when no violation messages', () => {
    vi.mocked(verifyAction).mockReturnValue({
      allowed: false,
      blocked: true,
      violations: [],
      warnings: [],
      requiresConfirmation: false,
    });

    const result = runPreToolUseCommand({
      input: { tool_name: 'Bash', tool_input: { command: 'rm -rf /' } },
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Blocked by critical guideline');
  });

  it('should handle bash tool as command action type', () => {
    vi.mocked(verifyAction).mockReturnValue({
      allowed: true,
      blocked: false,
      violations: [],
      warnings: [],
      requiresConfirmation: false,
    });

    runPreToolUseCommand({
      input: {
        tool_name: 'Bash',
        tool_input: { command: 'npm install' },
      },
    });

    expect(verifyAction).toHaveBeenCalledWith(null, null, expect.objectContaining({
      type: 'command',
    }));
  });

  it('should handle unknown tools as other action type', () => {
    vi.mocked(verifyAction).mockReturnValue({
      allowed: true,
      blocked: false,
      violations: [],
      warnings: [],
      requiresConfirmation: false,
    });

    runPreToolUseCommand({
      input: {
        tool_name: 'UnknownTool',
        tool_input: { some: 'data' },
      },
    });

    expect(verifyAction).toHaveBeenCalledWith(null, null, expect.objectContaining({
      type: 'other',
    }));
  });
});

describe('runStopCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error when session_id is missing', () => {
    const result = runStopCommand({
      input: { transcript_path: '/path/to/transcript.json' },
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr[0]).toContain('Missing session_id');
  });

  it('should return error when transcript_path is missing', () => {
    const result = runStopCommand({
      input: { session_id: 'sess-123' },
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr[0]).toContain('Missing transcript_path');
  });

  it('should call ensureSessionIdExists and ingestTranscript', () => {
    vi.mocked(isReviewSuspended).mockReturnValue(true);

    const result = runStopCommand({
      projectId: 'proj-123',
      agentId: 'claude-code',
      input: {
        session_id: 'sess-123',
        transcript_path: '/path/transcript.json',
        cwd: '/project',
      },
    });

    expect(ensureSessionIdExists).toHaveBeenCalledWith('sess-123', 'proj-123');
    expect(ingestTranscript).toHaveBeenCalledWith({
      sessionId: 'sess-123',
      transcriptPath: '/path/transcript.json',
      projectId: 'proj-123',
      agentId: 'claude-code',
      cwd: '/project',
    });
    expect(result.exitCode).toBe(0);
  });

  it('should return early when review is suspended', () => {
    vi.mocked(isReviewSuspended).mockReturnValue(true);
    vi.mocked(getObserveState).mockReturnValue({});
    vi.mocked(hasWarnedReview).mockReturnValue(false);
    vi.mocked(writeSessionSummaryFile).mockReturnValue({ itemCount: 0 });

    const result = runStopCommand({
      input: {
        session_id: 'sess-123',
        transcript_path: '/path/transcript.json',
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toEqual([]);
    // When review is suspended, the function returns early after ingestTranscript
    expect(ingestTranscript).toHaveBeenCalled();
  });

  it('should show session tracked message when items exist and not warned before', () => {
    vi.mocked(isReviewSuspended).mockReturnValue(false);
    vi.mocked(getObserveState).mockReturnValue({});
    vi.mocked(hasWarnedReview).mockReturnValue(false);
    vi.mocked(writeSessionSummaryFile).mockReturnValue({ itemCount: 5 });

    const result = runStopCommand({
      input: {
        session_id: 'sess-123',
        transcript_path: '/path/transcript.json',
      },
    });

    expect(setWarnedReview).toHaveBeenCalledWith('sess-123');
    expect(result.stderr[0]).toContain('Session tracked');
    expect(result.stderr[0]).toContain('5 items');
  });

  it('should show no new items message when itemCount is 0', () => {
    vi.mocked(isReviewSuspended).mockReturnValue(false);
    vi.mocked(getObserveState).mockReturnValue({});
    vi.mocked(hasWarnedReview).mockReturnValue(false);
    vi.mocked(writeSessionSummaryFile).mockReturnValue({ itemCount: 0 });

    const result = runStopCommand({
      input: {
        session_id: 'sess-123',
        transcript_path: '/path/transcript.json',
      },
    });

    expect(result.stderr[0]).toContain('no new items');
  });

  it('should show review reminder when items need review', () => {
    vi.mocked(isReviewSuspended).mockReturnValue(false);
    vi.mocked(getObserveState).mockReturnValue({ needsReviewCount: 3 });
    vi.mocked(hasWarnedReview).mockReturnValue(true);
    vi.mocked(writeSessionSummaryFile).mockReturnValue({ itemCount: 5 });

    const result = runStopCommand({
      input: {
        session_id: 'sess-123',
        transcript_path: '/path/transcript.json',
      },
    });

    expect(result.stderr[0]).toContain('3 need review');
    expect(result.stderr[0]).toContain('npx agent-memory review');
  });
});

describe('runUserPromptSubmitCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return exit code 0 when session_id is missing', () => {
    const result = runUserPromptSubmitCommand({
      input: { prompt: '!am status' },
    });

    expect(result.exitCode).toBe(0);
  });

  it('should return exit code 0 for non-!am prompts', () => {
    const result = runUserPromptSubmitCommand({
      input: { session_id: 'sess-123', prompt: 'Help me debug this' },
    });

    expect(result.exitCode).toBe(0);
    expect(ensureSessionIdExists).not.toHaveBeenCalled();
  });

  it('should return exit code 0 when prompt is empty', () => {
    const result = runUserPromptSubmitCommand({
      input: { session_id: 'sess-123', prompt: '' },
    });

    expect(result.exitCode).toBe(0);
  });

  describe('!am commands', () => {
    it('should handle !am review off', () => {
      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am review off' },
      });

      expect(setReviewSuspended).toHaveBeenCalledWith('sess-123', true);
      expect(result.exitCode).toBe(2);
      expect(result.stderr[0]).toContain('Review suspended');
    });

    it('should handle !am review suspend', () => {
      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am review suspend' },
      });

      expect(setReviewSuspended).toHaveBeenCalledWith('sess-123', true);
    });

    it('should handle !am review on', () => {
      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am review on' },
      });

      expect(setReviewSuspended).toHaveBeenCalledWith('sess-123', false);
      expect(result.stderr[0]).toContain('Review enabled');
    });

    it('should handle !am review resume', () => {
      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am review resume' },
      });

      expect(setReviewSuspended).toHaveBeenCalledWith('sess-123', false);
    });

    it('should handle !am review done', () => {
      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am review done' },
      });

      expect(setObserveReviewedAt).toHaveBeenCalledWith('sess-123', expect.any(String));
      expect(result.stderr[0]).toContain('Review acknowledged');
    });

    it('should handle !am status', () => {
      vi.mocked(isReviewSuspended).mockReturnValue(false);
      vi.mocked(getObserveState).mockReturnValue({
        committedAt: '2024-01-01T00:00:00Z',
        needsReviewCount: 2,
      });

      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am status' },
      });

      expect(result.exitCode).toBe(2);
      expect(result.stderr[0]).toContain('committed:');
    });

    it('should handle !am summary', () => {
      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am summary' },
      });

      expect(formatSessionSummary).toHaveBeenCalledWith('sess-123');
      expect(result.exitCode).toBe(2);
    });

    it('should handle !am review (list)', () => {
      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am review' },
      });

      expect(getReviewCandidates).toHaveBeenCalledWith('sess-123');
      expect(formatCandidateList).toHaveBeenCalled();
    });

    it('should handle !am list', () => {
      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am list' },
      });

      expect(getReviewCandidates).toHaveBeenCalledWith('sess-123');
      expect(formatCandidateList).toHaveBeenCalled();
    });

    it('should handle !am show <id>', () => {
      const mockCandidate = { id: 'cand-123', shortId: 'abc123', type: 'guideline', name: 'test', content: 'content' };
      vi.mocked(findCandidateByShortId).mockReturnValue(mockCandidate as any);

      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am show abc123' },
      });

      expect(findCandidateByShortId).toHaveBeenCalled();
      expect(formatCandidateDetail).toHaveBeenCalledWith(mockCandidate);
    });

    it('should handle !am show without id', () => {
      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am show' },
      });

      expect(result.stderr).toContain('Usage: !am show <id>');
    });

    it('should handle !am show with non-existent id', () => {
      vi.mocked(findCandidateByShortId).mockReturnValue(undefined);

      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am show notfound' },
      });

      expect(result.stderr[0]).toContain('Entry not found');
    });

    it('should handle !am approve <id>', () => {
      const mockCandidate = { id: 'cand-123', shortId: 'abc123', type: 'guideline', name: 'test', content: 'content' };
      vi.mocked(findCandidateByShortId).mockReturnValue(mockCandidate as any);

      const result = runUserPromptSubmitCommand({
        projectId: 'proj-123',
        input: { session_id: 'sess-123', prompt: '!am approve abc123' },
      });

      expect(approveCandidate).toHaveBeenCalledWith(mockCandidate, 'proj-123');
      expect(result.stderr[0]).toContain('Approved');
    });

    it('should require projectId for approve', () => {
      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am approve abc123' },
      });

      expect(result.stderr[0]).toContain('No project ID');
    });

    it('should handle !am reject <id>', () => {
      const mockCandidate = { id: 'cand-123', shortId: 'abc123', type: 'guideline', name: 'test', content: 'content' };
      vi.mocked(findCandidateByShortId).mockReturnValue(mockCandidate as any);

      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am reject abc123' },
      });

      expect(rejectCandidate).toHaveBeenCalledWith(mockCandidate);
      expect(result.stderr[0]).toContain('Rejected');
    });

    it('should handle !am skip <id>', () => {
      const mockCandidate = { id: 'cand-123', shortId: 'abc123', type: 'guideline', name: 'test', content: 'content' };
      vi.mocked(findCandidateByShortId).mockReturnValue(mockCandidate as any);

      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am skip abc123' },
      });

      expect(skipCandidate).toHaveBeenCalledWith(mockCandidate);
      expect(result.stderr[0]).toContain('Skipped');
    });

    it('should show help for unknown command', () => {
      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', prompt: '!am unknown' },
      });

      expect(result.exitCode).toBe(2);
      expect(result.stderr[0]).toContain('!am commands:');
    });

    it('should handle prompt from user_prompt field', () => {
      vi.mocked(isReviewSuspended).mockReturnValue(false);
      vi.mocked(getObserveState).mockReturnValue({});

      const result = runUserPromptSubmitCommand({
        input: { session_id: 'sess-123', user_prompt: '!am status' },
      });

      expect(result.exitCode).toBe(2);
    });
  });
});

describe('runSessionEndCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error when session_id is missing', () => {
    const result = runSessionEndCommand({
      input: { transcript_path: '/path/to/transcript.json' },
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr[0]).toContain('Missing session_id');
  });

  it('should return error when transcript_path is missing', () => {
    const result = runSessionEndCommand({
      input: { session_id: 'sess-123' },
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr[0]).toContain('Missing transcript_path');
  });

  it('should call ensureSessionIdExists and ingestTranscript', () => {
    const result = runSessionEndCommand({
      projectId: 'proj-123',
      agentId: 'claude-code',
      input: {
        session_id: 'sess-123',
        transcript_path: '/path/transcript.json',
        cwd: '/project',
      },
    });

    expect(ensureSessionIdExists).toHaveBeenCalledWith('sess-123', 'proj-123');
    expect(ingestTranscript).toHaveBeenCalledWith({
      sessionId: 'sess-123',
      transcriptPath: '/path/transcript.json',
      projectId: 'proj-123',
      agentId: 'claude-code',
      cwd: '/project',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toEqual([]);
    expect(result.stderr).toEqual([]);
  });

  it('should handle missing cwd gracefully', () => {
    const result = runSessionEndCommand({
      input: {
        session_id: 'sess-123',
        transcript_path: '/path/transcript.json',
      },
    });

    expect(ingestTranscript).toHaveBeenCalledWith(expect.objectContaining({
      cwd: undefined,
    }));
    expect(result.exitCode).toBe(0);
  });
});
