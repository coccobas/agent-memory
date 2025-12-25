import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verificationHandlers } from '../../src/mcp/handlers/verification.handler.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/services/critical-guidelines.service.js', () => ({
  getCriticalGuidelinesForSession: vi.fn().mockReturnValue({
    count: 2,
    guidelines: [
      { id: 'g-1', name: 'Security Rule', priority: 100 },
      { id: 'g-2', name: 'Privacy Rule', priority: 95 },
    ],
  }),
}));

describe('Verification Handler', () => {
  let mockContext: AppContext;
  let mockVerificationService: {
    verifyAction: ReturnType<typeof vi.fn>;
    logCompletedAction: ReturnType<typeof vi.fn>;
    acknowledgeGuidelines: ReturnType<typeof vi.fn>;
    areAllCriticalGuidelinesAcknowledged: ReturnType<typeof vi.fn>;
    getAcknowledgedGuidelineIds: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerificationService = {
      verifyAction: vi.fn().mockReturnValue({
        blocked: false,
        violations: [],
        warnings: [],
      }),
      logCompletedAction: vi.fn().mockReturnValue({
        logged: true,
        violations: [],
      }),
      acknowledgeGuidelines: vi.fn().mockReturnValue({
        acknowledged: 2,
        guidelineIds: ['g-1', 'g-2'],
      }),
      areAllCriticalGuidelinesAcknowledged: vi.fn().mockReturnValue({
        acknowledged: true,
        missing: [],
      }),
      getAcknowledgedGuidelineIds: vi.fn().mockReturnValue(['g-1', 'g-2']),
    };
    mockContext = {
      db: {} as any,
      repos: {} as any,
      services: {
        verification: mockVerificationService,
      } as any,
    };
  });

  describe('preCheck', () => {
    it('should verify a proposed action', () => {
      const result = verificationHandlers.preCheck(mockContext, {
        sessionId: 'sess-1',
        proposedAction: {
          type: 'file_write',
          filePath: '/src/test.ts',
          content: 'console.log("hello")',
        },
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('pre_check');
      expect(result.blocked).toBe(false);
      expect(result.message).toContain('proceed');
    });

    it('should block action when violations detected', () => {
      mockVerificationService.verifyAction.mockReturnValue({
        blocked: true,
        violations: [
          { guidelineId: 'g-1', guideline: 'No secrets', reason: 'Contains API key' },
        ],
        warnings: [],
      });

      const result = verificationHandlers.preCheck(mockContext, {
        sessionId: 'sess-1',
        proposedAction: {
          type: 'file_write',
          content: 'const API_KEY = "secret123"',
        },
      });

      expect(result.blocked).toBe(true);
      expect(result.message).toContain('BLOCKED');
    });

    it('should throw when proposedAction is missing', () => {
      expect(() =>
        verificationHandlers.preCheck(mockContext, {
          sessionId: 'sess-1',
        })
      ).toThrow('proposedAction');
    });

    it('should throw when proposedAction has invalid type', () => {
      expect(() =>
        verificationHandlers.preCheck(mockContext, {
          sessionId: 'sess-1',
          proposedAction: {
            type: 'invalid_type',
          },
        })
      ).toThrow('proposedAction');
    });

    it('should throw when verification service unavailable', () => {
      mockContext.services = {} as any;

      expect(() =>
        verificationHandlers.preCheck(mockContext, {
          sessionId: 'sess-1',
          proposedAction: { type: 'file_write' },
        })
      ).toThrow();
    });

    it('should support all action types', () => {
      const actionTypes = ['file_write', 'code_generate', 'api_call', 'command', 'other'];

      for (const type of actionTypes) {
        const result = verificationHandlers.preCheck(mockContext, {
          sessionId: 'sess-1',
          proposedAction: { type },
        });
        expect(result.success).toBe(true);
      }
    });

    it('should include projectId if provided', () => {
      const result = verificationHandlers.preCheck(mockContext, {
        sessionId: 'sess-1',
        projectId: 'proj-1',
        proposedAction: { type: 'file_write' },
      });

      expect(mockVerificationService.verifyAction).toHaveBeenCalledWith(
        'sess-1',
        'proj-1',
        expect.anything()
      );
    });
  });

  describe('postCheck', () => {
    it('should log a completed action', () => {
      const result = verificationHandlers.postCheck(mockContext, {
        sessionId: 'sess-1',
        completedAction: {
          type: 'file_write',
          filePath: '/src/test.ts',
        },
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('post_check');
      expect(result.message).toContain('No violations');
    });

    it('should accept content string instead of completedAction', () => {
      const result = verificationHandlers.postCheck(mockContext, {
        sessionId: 'sess-1',
        content: 'Agent response text',
      });

      expect(result.success).toBe(true);
      expect(mockVerificationService.logCompletedAction).toHaveBeenCalledWith(
        'sess-1',
        expect.objectContaining({
          type: 'other',
          content: 'Agent response text',
        }),
        undefined
      );
    });

    it('should report violations found in post-check', () => {
      mockVerificationService.logCompletedAction.mockReturnValue({
        logged: true,
        violations: [{ guidelineId: 'g-1', reason: 'Violated rule' }],
      });

      const result = verificationHandlers.postCheck(mockContext, {
        sessionId: 'sess-1',
        completedAction: { type: 'file_write' },
      });

      expect(result.message).toContain('violation');
    });

    it('should throw when neither completedAction nor content provided', () => {
      expect(() =>
        verificationHandlers.postCheck(mockContext, {
          sessionId: 'sess-1',
        })
      ).toThrow('completedAction');
    });

    it('should include agentId for audit', () => {
      verificationHandlers.postCheck(mockContext, {
        sessionId: 'sess-1',
        completedAction: { type: 'file_write' },
        agentId: 'agent-1',
      });

      expect(mockVerificationService.logCompletedAction).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'agent-1'
      );
    });

    it('should throw when verification service unavailable', () => {
      mockContext.services = {} as any;

      expect(() =>
        verificationHandlers.postCheck(mockContext, {
          sessionId: 'sess-1',
          completedAction: { type: 'file_write' },
        })
      ).toThrow();
    });
  });

  describe('acknowledge', () => {
    it('should acknowledge critical guidelines', () => {
      const result = verificationHandlers.acknowledge(mockContext, {
        sessionId: 'sess-1',
        guidelineIds: ['g-1', 'g-2'],
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('acknowledge');
      expect(result.acknowledged).toBe(2);
      expect(result.allAcknowledged).toBe(true);
    });

    it('should throw when sessionId is missing', () => {
      expect(() =>
        verificationHandlers.acknowledge(mockContext, {
          guidelineIds: ['g-1'],
        })
      ).toThrow('sessionId');
    });

    it('should report missing acknowledgments', () => {
      mockVerificationService.areAllCriticalGuidelinesAcknowledged.mockReturnValue({
        acknowledged: false,
        missing: ['g-2'],
      });

      const result = verificationHandlers.acknowledge(mockContext, {
        sessionId: 'sess-1',
        guidelineIds: ['g-1'],
      });

      expect(result.allAcknowledged).toBe(false);
      expect(result.missingAcknowledgments).toContain('g-2');
      expect(result.message).toContain('missing');
    });

    it('should include agentId', () => {
      verificationHandlers.acknowledge(mockContext, {
        sessionId: 'sess-1',
        agentId: 'agent-1',
      });

      expect(mockVerificationService.acknowledgeGuidelines).toHaveBeenCalledWith(
        'sess-1',
        undefined,
        'agent-1'
      );
    });

    it('should throw when verification service unavailable', () => {
      mockContext.services = {} as any;

      expect(() =>
        verificationHandlers.acknowledge(mockContext, {
          sessionId: 'sess-1',
        })
      ).toThrow();
    });
  });

  describe('status', () => {
    it('should return verification status', () => {
      const result = verificationHandlers.status(mockContext, {
        sessionId: 'sess-1',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('status');
      expect(result.criticalGuidelinesCount).toBe(2);
      expect(result.guidelines).toHaveLength(2);
    });

    it('should throw when sessionId is missing', () => {
      expect(() =>
        verificationHandlers.status(mockContext, {})
      ).toThrow('sessionId');
    });

    it('should show acknowledged status for each guideline', () => {
      const result = verificationHandlers.status(mockContext, {
        sessionId: 'sess-1',
      });

      expect(result.guidelines[0].acknowledged).toBe(true);
      expect(result.guidelines[1].acknowledged).toBe(true);
    });

    it('should show unacknowledged guidelines', () => {
      mockVerificationService.getAcknowledgedGuidelineIds.mockReturnValue(['g-1']);

      const result = verificationHandlers.status(mockContext, {
        sessionId: 'sess-1',
      });

      expect(result.guidelines[0].acknowledged).toBe(true);
      expect(result.guidelines[1].acknowledged).toBe(false);
      expect(result.allAcknowledged).toBe(false);
    });

    it('should accept projectId', () => {
      const result = verificationHandlers.status(mockContext, {
        sessionId: 'sess-1',
        projectId: 'proj-1',
      });

      expect(result.success).toBe(true);
    });

    it('should throw when verification service unavailable', () => {
      mockContext.services = {} as any;

      expect(() =>
        verificationHandlers.status(mockContext, {
          sessionId: 'sess-1',
        })
      ).toThrow();
    });
  });
});
