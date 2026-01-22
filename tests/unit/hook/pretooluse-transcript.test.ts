import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/db/connection.js', () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock('../../../src/services/verification.service.js', () => ({
  verifyAction: vi.fn(() => ({
    allowed: true,
    blocked: false,
    violations: [],
    warnings: [],
    requiresConfirmation: false,
  })),
}));

const mockGetContext = vi.fn();
vi.mock('../../../src/services/memory-injection.service.js', () => ({
  getMemoryInjectionService: vi.fn(() => ({
    getContext: mockGetContext,
  })),
}));

const mockGetRecentTranscript = vi.fn();
vi.mock('../../../src/services/capture/state.js', () => ({
  getCaptureStateManager: vi.fn(() => ({
    getRecentTranscript: mockGetRecentTranscript,
    formatTranscriptAsText: vi.fn(() => ''),
    getOrCreateSession: vi.fn(() => ({ transcript: [], metrics: {} })),
    getSession: vi.fn(() => null),
    addTurn: vi.fn(),
  })),
}));

vi.mock('../../../src/services/capture/behavior-observer.js', () => ({
  getBehaviorObserverService: vi.fn(() => ({
    recordEvent: vi.fn(),
  })),
}));

import { runPreToolUseCommand } from '../../../src/commands/hook/pretooluse-command.js';
import type { TurnData } from '../../../src/services/capture/types.js';

describe('PreToolUse transcript context injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetContext.mockResolvedValue({
      success: true,
      injectedContext: '',
      entries: [],
      detectedIntent: 'explore',
      processingTimeMs: 0,
      message: 'No context',
    });
    mockGetRecentTranscript.mockReturnValue([]);
  });

  describe('conversationContext parameter', () => {
    it('should pass conversationContext to injection service when session has transcript', async () => {
      const mockTranscript: TurnData[] = [
        {
          role: 'user',
          content: 'I need to fix the auth bug in the login component',
          timestamp: new Date(Date.now() - 60000).toISOString(),
        },
        {
          role: 'assistant',
          content: 'I will look at the login component to understand the auth flow',
          timestamp: new Date(Date.now() - 30000).toISOString(),
        },
      ];

      mockGetRecentTranscript.mockReturnValue(mockTranscript);

      await runPreToolUseCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          tool_name: 'Edit',
          tool_input: { file_path: '/src/components/Login.tsx' },
        },
        config: {
          injectContext: true,
          includeConversationContext: true,
        },
      });

      expect(mockGetContext).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationContext: expect.stringContaining('auth bug'),
        })
      );
    });

    it('should not include conversationContext when disabled', async () => {
      const mockTranscript: TurnData[] = [
        { role: 'user', content: 'Fix the auth bug', timestamp: new Date().toISOString() },
      ];

      mockGetRecentTranscript.mockReturnValue(mockTranscript);

      await runPreToolUseCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          tool_name: 'Edit',
          tool_input: { file_path: '/src/app.ts' },
        },
        config: {
          injectContext: true,
          includeConversationContext: false,
        },
      });

      expect(mockGetContext).toHaveBeenCalledWith(
        expect.not.objectContaining({
          conversationContext: expect.anything(),
        })
      );
    });

    it('should not include conversationContext when no session_id', async () => {
      await runPreToolUseCommand({
        projectId: 'proj-123',
        input: {
          tool_name: 'Edit',
          tool_input: { file_path: '/src/app.ts' },
        },
        config: {
          injectContext: true,
          includeConversationContext: true,
        },
      });

      expect(mockGetRecentTranscript).not.toHaveBeenCalled();
    });

    it('should handle empty transcript gracefully', async () => {
      mockGetRecentTranscript.mockReturnValue([]);

      await runPreToolUseCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          tool_name: 'Edit',
          tool_input: { file_path: '/src/app.ts' },
        },
        config: {
          injectContext: true,
          includeConversationContext: true,
        },
      });

      expect(mockGetContext).toHaveBeenCalledWith(
        expect.not.objectContaining({
          conversationContext: '',
        })
      );
    });
  });

  describe('conversationContext formatting', () => {
    it('should format transcript as readable text', async () => {
      const mockTranscript: TurnData[] = [
        {
          role: 'user',
          content: 'Working on auth',
          timestamp: new Date(Date.now() - 60000).toISOString(),
        },
        {
          role: 'assistant',
          content: 'Looking at login code',
          timestamp: new Date(Date.now() - 30000).toISOString(),
        },
        { role: 'user', content: 'Fix the token validation', timestamp: new Date().toISOString() },
      ];

      mockGetRecentTranscript.mockReturnValue(mockTranscript);

      await runPreToolUseCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          tool_name: 'Edit',
          tool_input: { file_path: '/src/auth.ts' },
        },
        config: {
          injectContext: true,
          includeConversationContext: true,
        },
      });

      expect(mockGetContext).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationContext: expect.stringMatching(/user:.*Working on auth/i),
        })
      );
      expect(mockGetContext).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationContext: expect.stringMatching(/assistant:.*Looking at login/i),
        })
      );
    });

    it('should respect maxTokens for conversation context', async () => {
      const longContent = 'A'.repeat(5000);
      const mockTranscript: TurnData[] = [
        {
          role: 'user',
          content: longContent,
          timestamp: new Date(Date.now() - 60000).toISOString(),
          tokenCount: 2000,
        },
        {
          role: 'assistant',
          content: longContent,
          timestamp: new Date(Date.now() - 30000).toISOString(),
          tokenCount: 2000,
        },
        {
          role: 'user',
          content: 'Recent message',
          timestamp: new Date().toISOString(),
          tokenCount: 10,
        },
      ];

      mockGetRecentTranscript.mockReturnValue([mockTranscript[2]!]);

      await runPreToolUseCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          tool_name: 'Edit',
          tool_input: { file_path: '/src/app.ts' },
        },
        config: {
          injectContext: true,
          includeConversationContext: true,
          conversationContextMaxTokens: 500,
        },
      });

      expect(mockGetRecentTranscript).toHaveBeenCalledWith(
        'sess-123',
        expect.objectContaining({ maxTokens: 500 })
      );
    });

    it('should respect lastN turns for conversation context', async () => {
      const mockTranscript: TurnData[] = [
        { role: 'user', content: 'Turn 1', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Turn 2', timestamp: new Date().toISOString() },
        { role: 'user', content: 'Turn 3', timestamp: new Date().toISOString() },
      ];

      mockGetRecentTranscript.mockReturnValue(mockTranscript.slice(-2));

      await runPreToolUseCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          tool_name: 'Edit',
          tool_input: { file_path: '/src/app.ts' },
        },
        config: {
          injectContext: true,
          includeConversationContext: true,
          conversationContextLastN: 2,
        },
      });

      expect(mockGetRecentTranscript).toHaveBeenCalledWith(
        'sess-123',
        expect.objectContaining({ lastN: 2 })
      );
    });
  });

  describe('config defaults', () => {
    it('should have includeConversationContext enabled by default', async () => {
      const mockTranscript: TurnData[] = [
        { role: 'user', content: 'Test message', timestamp: new Date().toISOString() },
      ];
      mockGetRecentTranscript.mockReturnValue(mockTranscript);

      await runPreToolUseCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          tool_name: 'Edit',
          tool_input: { file_path: '/src/app.ts' },
        },
      });

      expect(mockGetRecentTranscript).toHaveBeenCalled();
    });

    it('should read includeConversationContext from env var', async () => {
      const originalEnv = process.env.AGENT_MEMORY_INCLUDE_CONVERSATION_CONTEXT;
      process.env.AGENT_MEMORY_INCLUDE_CONVERSATION_CONTEXT = 'true';

      try {
        const mockTranscript: TurnData[] = [
          { role: 'user', content: 'Test message', timestamp: new Date().toISOString() },
        ];
        mockGetRecentTranscript.mockReturnValue(mockTranscript);

        await runPreToolUseCommand({
          projectId: 'proj-123',
          input: {
            session_id: 'sess-123',
            tool_name: 'Edit',
            tool_input: { file_path: '/src/app.ts' },
          },
        });

        expect(mockGetRecentTranscript).toHaveBeenCalled();
      } finally {
        if (originalEnv === undefined) {
          delete process.env.AGENT_MEMORY_INCLUDE_CONVERSATION_CONTEXT;
        } else {
          process.env.AGENT_MEMORY_INCLUDE_CONVERSATION_CONTEXT = originalEnv;
        }
      }
    });
  });

  describe('error handling', () => {
    it('should continue when transcript retrieval fails (non-blocking)', async () => {
      mockGetRecentTranscript.mockImplementation(() => {
        throw new Error('Transcript unavailable');
      });

      mockGetContext.mockResolvedValue({
        success: true,
        injectedContext: 'Some context',
        entries: [
          { type: 'guideline', id: 'g1', title: 'Rule', content: '...', relevanceScore: 0.9 },
        ],
        detectedIntent: 'code',
        processingTimeMs: 10,
        message: 'OK',
      });

      const result = await runPreToolUseCommand({
        projectId: 'proj-123',
        input: {
          session_id: 'sess-123',
          tool_name: 'Edit',
          tool_input: { file_path: '/src/app.ts' },
        },
        config: {
          injectContext: true,
          includeConversationContext: true,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(mockGetContext).toHaveBeenCalled();
    });
  });
});
