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

import { runUserPromptSubmitCommand } from '../../../src/commands/hook/userpromptsubmit-command.js';
import type { TurnData } from '../../../src/services/capture/types.js';

describe('UserPromptSubmit transcript-enhanced detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRecentTranscript.mockReturnValue([]);
  });

  describe('pattern mention boosting', () => {
    it('should call getRecentTranscript when useTranscriptContext is enabled', async () => {
      const mockTranscript: TurnData[] = [
        {
          role: 'user',
          content: 'I want to set up TypeScript strict mode for this project',
          timestamp: new Date(Date.now() - 60000).toISOString(),
        },
      ];

      mockGetRecentTranscript.mockReturnValue(mockTranscript);

      await runUserPromptSubmitCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          prompt: 'We always use TypeScript strict mode',
        },
        config: {
          enableNaturalLanguageTriggers: true,
          useTranscriptContext: true,
        },
      });

      expect(mockGetRecentTranscript).toHaveBeenCalledWith('sess-123', expect.any(Object));
    });

    it('should detect boosted trigger when pattern mentioned in transcript', async () => {
      const mockTranscript: TurnData[] = [
        {
          role: 'user',
          content: 'We decided to always use functional components',
          timestamp: new Date(Date.now() - 60000).toISOString(),
        },
      ];

      mockGetRecentTranscript.mockReturnValue(mockTranscript);

      await runUserPromptSubmitCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          prompt: "Sounds good, let's stick with that",
        },
        config: {
          enableNaturalLanguageTriggers: true,
          useTranscriptContext: true,
        },
      });

      expect(mockRecordNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory_trigger_detected',
          category: expect.stringContaining('boosted'),
        })
      );
    });
  });

  describe('conflict detection', () => {
    it('should record conflict notification when always/never conflict detected', async () => {
      const mockTranscript: TurnData[] = [
        {
          role: 'user',
          content: 'We always use semicolons in JavaScript',
          timestamp: new Date(Date.now() - 60000).toISOString(),
        },
      ];

      mockGetRecentTranscript.mockReturnValue(mockTranscript);

      await runUserPromptSubmitCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          prompt: 'Actually, never use semicolons',
        },
        config: {
          enableNaturalLanguageTriggers: true,
          useTranscriptContext: true,
          detectConflicts: true,
        },
      });

      expect(mockRecordNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'conflict_detected',
          severity: 'warning',
        })
      );
    });

    it('should not record conflict when detectConflicts is false', async () => {
      const mockTranscript: TurnData[] = [
        {
          role: 'user',
          content: 'Always use tabs for indentation',
          timestamp: new Date().toISOString(),
        },
      ];

      mockGetRecentTranscript.mockReturnValue(mockTranscript);

      await runUserPromptSubmitCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          prompt: 'Never use tabs, always use spaces',
        },
        config: {
          enableNaturalLanguageTriggers: true,
          useTranscriptContext: true,
          detectConflicts: false,
        },
      });

      expect(mockRecordNotification).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'conflict_detected',
        })
      );
    });
  });

  describe('config options', () => {
    it('should not use transcript when useTranscriptContext is false', async () => {
      await runUserPromptSubmitCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          prompt: 'We always use TypeScript',
        },
        config: {
          enableNaturalLanguageTriggers: true,
          useTranscriptContext: false,
        },
      });

      expect(mockGetRecentTranscript).not.toHaveBeenCalled();
    });

    it('should read useTranscriptContext from env var', async () => {
      const originalEnv = process.env.AGENT_MEMORY_USE_TRANSCRIPT_CONTEXT;
      process.env.AGENT_MEMORY_USE_TRANSCRIPT_CONTEXT = 'true';

      try {
        await runUserPromptSubmitCommand({
          projectId: 'proj-123',
          input: {
            session_id: 'sess-123',
            prompt: 'We always use TypeScript',
          },
        });

        expect(mockGetRecentTranscript).toHaveBeenCalled();
      } finally {
        if (originalEnv === undefined) {
          delete process.env.AGENT_MEMORY_USE_TRANSCRIPT_CONTEXT;
        } else {
          process.env.AGENT_MEMORY_USE_TRANSCRIPT_CONTEXT = originalEnv;
        }
      }
    });
  });

  describe('error handling', () => {
    it('should continue when transcript retrieval fails', async () => {
      mockGetRecentTranscript.mockImplementation(() => {
        throw new Error('Transcript unavailable');
      });

      const result = await runUserPromptSubmitCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          prompt: 'We always use TypeScript strict mode',
        },
        config: {
          enableNaturalLanguageTriggers: true,
          useTranscriptContext: true,
        },
      });

      expect(result.exitCode).toBe(0);
    });
  });
});
