import { describe, it, expect, vi, beforeEach } from 'vitest';
import { experienceHandlers } from '../../src/mcp/handlers/experiences.handler.js';
import * as auditService from '../../src/services/audit.service.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/services/audit.service.js');
vi.mock('../../src/services/capture/index.js', () => ({
  createExperienceCaptureModule: vi.fn().mockReturnValue({
    recordCase: vi.fn().mockResolvedValue({
      experiences: [],
      skippedDuplicates: [],
      processingTimeMs: 10,
    }),
    capture: vi.fn().mockResolvedValue({
      experiences: [],
      skippedDuplicates: [],
      processingTimeMs: 10,
    }),
  }),
}));

describe('Experience Handlers', () => {
  let mockContext: AppContext;
  let mockExperiencesRepo: {
    promote: ReturnType<typeof vi.fn>;
    recordOutcome: ReturnType<typeof vi.fn>;
    addStep: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auditService.logAction).mockReturnValue(undefined);
    mockExperiencesRepo = {
      promote: vi.fn(),
      recordOutcome: vi.fn(),
      addStep: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      list: vi.fn(),
      deactivate: vi.fn(),
    };
    mockContext = {
      db: {} as any,
      repos: {
        experiences: mockExperiencesRepo,
      } as any,
      services: {} as any,
    };
  });

  describe('promote', () => {
    it('should promote experience to strategy', async () => {
      mockExperiencesRepo.promote.mockResolvedValue({
        experience: {
          id: 'exp-1',
          title: 'Test',
          level: 'strategy',
          scopeType: 'project',
        },
        createdTool: null,
      });

      const result = await experienceHandlers.promote(mockContext, {
        id: 'exp-1',
        toLevel: 'strategy',
        agentId: 'agent-1',
        pattern: 'When X happens, do Y',
      });

      expect(result.success).toBe(true);
      expect(mockExperiencesRepo.promote).toHaveBeenCalledWith(
        'exp-1',
        expect.objectContaining({ toLevel: 'strategy' })
      );
    });

    it('should promote experience to skill and create tool', async () => {
      mockExperiencesRepo.promote.mockResolvedValue({
        experience: { id: 'exp-1', level: 'strategy', scopeType: 'project' },
        createdTool: { id: 'tool-1', name: 'my-skill' },
      });

      const result = await experienceHandlers.promote(mockContext, {
        id: 'exp-1',
        toLevel: 'skill',
        toolName: 'my-skill',
        toolDescription: 'A useful tool',
        toolCategory: 'cli',
        agentId: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.createdTool).toBeDefined();
    });

    it('should throw when id is missing', async () => {
      await expect(
        experienceHandlers.promote(mockContext, {
          toLevel: 'strategy',
          agentId: 'agent-1',
        })
      ).rejects.toThrow();
    });
  });

  describe('record_outcome', () => {
    it('should record success outcome', async () => {
      mockExperiencesRepo.recordOutcome.mockResolvedValue({
        id: 'exp-1',
        useCount: 5,
        successCount: 4,
        scopeType: 'project',
        currentVersion: { confidence: 0.8 },
      });

      const result = await experienceHandlers.record_outcome(mockContext, {
        id: 'exp-1',
        success: true,
        agentId: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.metrics.useCount).toBe(5);
      expect(result.metrics.successCount).toBe(4);
    });

    it('should record failure outcome with feedback', async () => {
      mockExperiencesRepo.recordOutcome.mockResolvedValue({
        id: 'exp-1',
        useCount: 5,
        successCount: 3,
        scopeType: 'project',
        currentVersion: { confidence: 0.6 },
      });

      const result = await experienceHandlers.record_outcome(mockContext, {
        id: 'exp-1',
        success: false,
        feedback: 'Did not work in edge case',
        agentId: 'agent-1',
      });

      expect(result.success).toBe(true);
    });

    it('should throw when experience not found', async () => {
      mockExperiencesRepo.recordOutcome.mockResolvedValue(null);

      await expect(
        experienceHandlers.record_outcome(mockContext, {
          id: 'nonexistent',
          success: true,
          agentId: 'agent-1',
        })
      ).rejects.toThrow();
    });
  });

  describe('add_step', () => {
    it('should add trajectory step', async () => {
      mockExperiencesRepo.addStep.mockResolvedValue({
        id: 'step-1',
        action: 'Read file',
        observation: 'File contents found',
      });
      mockExperiencesRepo.getById.mockResolvedValue({
        id: 'exp-1',
        scopeType: 'project',
      });

      const result = await experienceHandlers.add_step(mockContext, {
        id: 'exp-1',
        action: 'Read file',
        observation: 'File contents found',
        agentId: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.step.action).toBe('Read file');
    });

    it('should include optional step fields', async () => {
      mockExperiencesRepo.addStep.mockResolvedValue({ id: 'step-1' });
      mockExperiencesRepo.getById.mockResolvedValue({
        id: 'exp-1',
        scopeType: 'project',
      });

      await experienceHandlers.add_step(mockContext, {
        id: 'exp-1',
        action: 'Use grep',
        reasoning: 'Need to find pattern',
        toolUsed: 'Grep',
        success: true,
        durationMs: 150,
        agentId: 'agent-1',
      });

      expect(mockExperiencesRepo.addStep).toHaveBeenCalledWith(
        'exp-1',
        expect.objectContaining({
          action: 'Use grep',
          reasoning: 'Need to find pattern',
          toolUsed: 'Grep',
          success: true,
          durationMs: 150,
        })
      );
    });
  });

  describe('get_trajectory', () => {
    it('should get experience with trajectory steps', async () => {
      mockExperiencesRepo.getById.mockResolvedValue({
        id: 'exp-1',
        title: 'Debug Issue',
        scopeType: 'project',
        trajectorySteps: [
          { action: 'Step 1', observation: 'Result 1' },
          { action: 'Step 2', observation: 'Result 2' },
        ],
      });

      const result = await experienceHandlers.get_trajectory(mockContext, {
        id: 'exp-1',
        agentId: 'agent-1',
      });

      expect(result.trajectorySteps).toHaveLength(2);
    });

    it('should throw when experience not found', async () => {
      mockExperiencesRepo.getById.mockResolvedValue(null);

      await expect(
        experienceHandlers.get_trajectory(mockContext, {
          id: 'nonexistent',
          agentId: 'agent-1',
        })
      ).rejects.toThrow();
    });
  });

  describe('record_case', () => {
    it('should record a case experience', async () => {
      const result = await experienceHandlers.record_case(mockContext, {
        title: 'Fixed API bug',
        scenario: 'API was returning 500',
        outcome: 'Fixed the null pointer',
        agentId: 'agent-1',
      });

      expect(result.success).toBe(true);
    });
  });
});
