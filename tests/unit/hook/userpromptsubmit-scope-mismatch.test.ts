import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGetRecentTranscript = vi.fn();
vi.mock('../../../src/services/capture/state.js', () => ({
  getCaptureStateManager: vi.fn(() => ({
    getRecentTranscript: mockGetRecentTranscript,
    getOrCreateSession: vi.fn(() => ({ transcript: [], metrics: {} })),
  })),
}));

vi.mock('../../../src/db/connection.js', () => ({
  getDb: vi.fn(() => ({})),
}));

const mockRecordNotification = vi.fn();
vi.mock('../../../src/services/analytics/index.js', () => ({
  getHookAnalyticsService: vi.fn(() => ({
    recordNotification: mockRecordNotification,
  })),
}));

vi.mock('../../../src/commands/hook/session.js', () => ({
  ensureSessionIdExists: vi.fn(),
}));

const mockDetect = vi.fn();
const mockIsContextRegistered = vi.fn();
const mockGetContext = vi.fn();
vi.mock('../../../src/core/container.js', () => ({
  isContextRegistered: () => mockIsContextRegistered(),
  getContext: () => mockGetContext(),
}));

import { runUserPromptSubmitCommand } from '../../../src/commands/hook/userpromptsubmit-command.js';
import type { TurnData } from '../../../src/services/capture/types.js';

describe('UserPromptSubmit scope mismatch detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRecentTranscript.mockReturnValue([]);
    mockIsContextRegistered.mockReturnValue(false);
    mockGetContext.mockReturnValue({});
    mockDetect.mockResolvedValue({ project: null });
  });

  describe('when detectScopeMismatch is enabled', () => {
    it('should detect project mentions and check against current project', async () => {
      const mockTranscript: TurnData[] = [
        { role: 'user', content: 'Working on the frontend-app project' },
      ];
      mockGetRecentTranscript.mockReturnValue(mockTranscript);
      mockIsContextRegistered.mockReturnValue(true);
      mockGetContext.mockReturnValue({
        services: {
          contextDetection: {
            detect: mockDetect,
          },
        },
      });
      mockDetect.mockResolvedValue({
        project: { name: 'agent-memory', id: 'proj-123' },
      });

      await runUserPromptSubmitCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          prompt: 'Let me check the frontend-app code',
        },
        config: {
          useTranscriptContext: true,
          detectScopeMismatch: true,
        },
      });

      expect(mockDetect).toHaveBeenCalled();
    });

    it('should record warning notification when scope mismatch detected', async () => {
      const mockTranscript: TurnData[] = [
        { role: 'user', content: 'Working on the frontend-app project' },
      ];
      mockGetRecentTranscript.mockReturnValue(mockTranscript);
      mockIsContextRegistered.mockReturnValue(true);
      mockGetContext.mockReturnValue({
        services: {
          contextDetection: {
            detect: mockDetect,
          },
        },
      });
      mockDetect.mockResolvedValue({
        project: { name: 'agent-memory', id: 'proj-123' },
      });

      await runUserPromptSubmitCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          prompt: 'Continue working on that',
        },
        config: {
          useTranscriptContext: true,
          detectScopeMismatch: true,
        },
      });

      expect(mockRecordNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'scope_mismatch_warning',
          severity: 'warning',
          category: 'transcript_analysis',
        })
      );
    });

    it('should include project names in notification message', async () => {
      const mockTranscript: TurnData[] = [
        { role: 'user', content: 'The backend repo has the API' },
      ];
      mockGetRecentTranscript.mockReturnValue(mockTranscript);
      mockIsContextRegistered.mockReturnValue(true);
      mockGetContext.mockReturnValue({
        services: {
          contextDetection: {
            detect: mockDetect,
          },
        },
      });
      mockDetect.mockResolvedValue({
        project: { name: 'agent-memory', id: 'proj-123' },
      });

      await runUserPromptSubmitCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          prompt: 'Check the backend API',
        },
        config: {
          useTranscriptContext: true,
          detectScopeMismatch: true,
        },
      });

      expect(mockRecordNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('backend'),
        })
      );
    });

    it('should not record notification when no mismatch detected', async () => {
      const mockTranscript: TurnData[] = [
        { role: 'user', content: 'Working on the agent-memory project' },
      ];
      mockGetRecentTranscript.mockReturnValue(mockTranscript);
      mockIsContextRegistered.mockReturnValue(true);
      mockGetContext.mockReturnValue({
        services: {
          contextDetection: {
            detect: mockDetect,
          },
        },
      });
      mockDetect.mockResolvedValue({
        project: { name: 'agent-memory', id: 'proj-123' },
      });

      await runUserPromptSubmitCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          prompt: 'Continue with agent-memory work',
        },
        config: {
          useTranscriptContext: true,
          detectScopeMismatch: true,
        },
      });

      expect(mockRecordNotification).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'scope_mismatch_warning',
        })
      );
    });
  });

  describe('when detectScopeMismatch is disabled', () => {
    it('should not check context detection when disabled', async () => {
      const mockTranscript: TurnData[] = [
        { role: 'user', content: 'Working on different-project' },
      ];
      mockGetRecentTranscript.mockReturnValue(mockTranscript);
      mockIsContextRegistered.mockReturnValue(true);
      mockGetContext.mockReturnValue({
        services: {
          contextDetection: {
            detect: mockDetect,
          },
        },
      });

      await runUserPromptSubmitCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          prompt: 'Check that project',
        },
        config: {
          useTranscriptContext: true,
          detectScopeMismatch: false,
        },
      });

      expect(mockDetect).not.toHaveBeenCalled();
    });

    it('should not check context detection when useTranscriptContext is false', async () => {
      mockIsContextRegistered.mockReturnValue(true);
      mockGetContext.mockReturnValue({
        services: {
          contextDetection: {
            detect: mockDetect,
          },
        },
      });

      await runUserPromptSubmitCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          prompt: 'Working on different-project',
        },
        config: {
          useTranscriptContext: false,
          detectScopeMismatch: true,
        },
      });

      expect(mockDetect).not.toHaveBeenCalled();
    });
  });

  describe('environment variable configuration', () => {
    it('should read detectScopeMismatch from env var', async () => {
      const originalEnv = process.env.AGENT_MEMORY_DETECT_SCOPE_MISMATCH;
      process.env.AGENT_MEMORY_DETECT_SCOPE_MISMATCH = 'true';
      process.env.AGENT_MEMORY_USE_TRANSCRIPT_CONTEXT = 'true';

      const mockTranscript: TurnData[] = [
        { role: 'user', content: 'Working on the other-project project' },
      ];
      mockGetRecentTranscript.mockReturnValue(mockTranscript);
      mockIsContextRegistered.mockReturnValue(true);
      mockGetContext.mockReturnValue({
        services: {
          contextDetection: {
            detect: mockDetect,
          },
        },
      });
      mockDetect.mockResolvedValue({
        project: { name: 'agent-memory', id: 'proj-123' },
      });

      try {
        await runUserPromptSubmitCommand({
          projectId: 'proj-123',
          input: {
            session_id: 'sess-123',
            prompt: 'Check that',
          },
        });

        expect(mockDetect).toHaveBeenCalled();
      } finally {
        if (originalEnv === undefined) {
          delete process.env.AGENT_MEMORY_DETECT_SCOPE_MISMATCH;
        } else {
          process.env.AGENT_MEMORY_DETECT_SCOPE_MISMATCH = originalEnv;
        }
        delete process.env.AGENT_MEMORY_USE_TRANSCRIPT_CONTEXT;
      }
    });
  });

  describe('error handling', () => {
    it('should continue when context detection fails', async () => {
      const mockTranscript: TurnData[] = [
        { role: 'user', content: 'Working on the other-project project' },
      ];
      mockGetRecentTranscript.mockReturnValue(mockTranscript);
      mockIsContextRegistered.mockReturnValue(true);
      mockGetContext.mockReturnValue({
        services: {
          contextDetection: {
            detect: mockDetect,
          },
        },
      });
      mockDetect.mockRejectedValue(new Error('Detection failed'));

      const result = await runUserPromptSubmitCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          prompt: 'Continue working',
        },
        config: {
          useTranscriptContext: true,
          detectScopeMismatch: true,
        },
      });

      expect(result.exitCode).toBe(0);
    });
  });
});
