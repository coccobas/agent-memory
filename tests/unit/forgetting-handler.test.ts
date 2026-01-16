import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forgettingHandlers, handleForgetting } from '../../src/mcp/handlers/forgetting.handler.js';
import * as forgettingModule from '../../src/services/forgetting/index.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/services/forgetting/index.js');

describe('Forgetting Handler', () => {
  let mockContext: AppContext;
  let mockForgettingService: {
    analyze: ReturnType<typeof vi.fn>;
    forget: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockForgettingService = {
      analyze: vi.fn(),
      forget: vi.fn(),
      getStatus: vi.fn(),
    };
    vi.mocked(forgettingModule.createForgettingService).mockReturnValue(
      mockForgettingService as any
    );
    mockContext = {
      db: {} as any,
      repos: {} as any,
      services: {} as any,
    };
  });

  describe('analyze', () => {
    it('should analyze forgetting candidates', async () => {
      const mockResult = {
        success: true,
        candidates: [
          { id: 'entry-1', type: 'knowledge', score: 0.2 },
          { id: 'entry-2', type: 'guideline', score: 0.3 },
        ],
        totalCandidates: 2,
      };
      mockForgettingService.analyze.mockResolvedValue(mockResult);

      const result = await forgettingHandlers.analyze(mockContext, {
        action: 'analyze',
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result).toEqual(mockResult);
    });

    it('should pass all parameters', async () => {
      mockForgettingService.analyze.mockResolvedValue({ success: true });

      await forgettingHandlers.analyze(mockContext, {
        action: 'analyze',
        scopeType: 'project',
        scopeId: 'proj-123',
        entryTypes: ['knowledge', 'guideline'],
        strategy: 'recency',
        staleDays: 90,
        minAccessCount: 2,
        importanceThreshold: 0.4,
        limit: 50,
      });

      expect(mockForgettingService.analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'project',
          scopeId: 'proj-123',
          entryTypes: ['knowledge', 'guideline'],
          strategy: 'recency',
          staleDays: 90,
          minAccessCount: 2,
          importanceThreshold: 0.4,
          limit: 50,
        })
      );
    });

    it('should use combined strategy by default', async () => {
      mockForgettingService.analyze.mockResolvedValue({ success: true });

      await forgettingHandlers.analyze(mockContext, {
        action: 'analyze',
        scopeType: 'global',
      });

      expect(mockForgettingService.analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'global',
        })
      );
    });
  });

  describe('forget', () => {
    it('should execute forgetting', async () => {
      const mockResult = {
        success: true,
        forgotten: ['entry-1', 'entry-2'],
        count: 2,
      };
      mockForgettingService.forget.mockResolvedValue(mockResult);

      const result = await forgettingHandlers.forget(mockContext, {
        action: 'forget',
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result).toEqual(mockResult);
    });

    it('should support dry run mode', async () => {
      mockForgettingService.forget.mockResolvedValue({ success: true, forgotten: [] });

      await forgettingHandlers.forget(mockContext, {
        action: 'forget',
        scopeType: 'project',
        dryRun: true,
      });

      expect(mockForgettingService.forget).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true })
      );
    });

    it('should pass agentId', async () => {
      mockForgettingService.forget.mockResolvedValue({ success: true });

      await forgettingHandlers.forget(mockContext, {
        action: 'forget',
        scopeType: 'project',
        agentId: 'cleanup-agent',
      });

      expect(mockForgettingService.forget).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'cleanup-agent' })
      );
    });

    it('should pass all parameters', async () => {
      mockForgettingService.forget.mockResolvedValue({ success: true });

      await forgettingHandlers.forget(mockContext, {
        action: 'forget',
        scopeType: 'org',
        scopeId: 'org-123',
        entryTypes: ['tool'],
        strategy: 'frequency',
        staleDays: 180,
        minAccessCount: 5,
        importanceThreshold: 0.3,
        limit: 100,
        dryRun: false,
        agentId: 'admin',
      });

      expect(mockForgettingService.forget).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'org',
          scopeId: 'org-123',
          entryTypes: ['tool'],
          strategy: 'frequency',
          staleDays: 180,
          minAccessCount: 5,
          importanceThreshold: 0.3,
          limit: 100,
          dryRun: false,
          agentId: 'admin',
        })
      );
    });
  });

  describe('status', () => {
    it('should return service status', async () => {
      const mockStatus = {
        enabled: true,
        strategies: ['recency', 'frequency', 'importance', 'combined'],
        defaultStrategy: 'combined',
      };
      mockForgettingService.getStatus.mockReturnValue(mockStatus);

      const result = await forgettingHandlers.status(mockContext, { action: 'status' });

      expect(result.success).toBe(true);
      expect(result.status).toEqual(mockStatus);
    });
  });

  describe('handleForgetting router', () => {
    it('should route analyze action', async () => {
      mockForgettingService.analyze.mockResolvedValue({ success: true });

      await handleForgetting(mockContext, { action: 'analyze', scopeType: 'global' });

      expect(mockForgettingService.analyze).toHaveBeenCalled();
    });

    it('should route forget action', async () => {
      mockForgettingService.forget.mockResolvedValue({ success: true });

      await handleForgetting(mockContext, { action: 'forget', scopeType: 'global' });

      expect(mockForgettingService.forget).toHaveBeenCalled();
    });

    it('should route status action', async () => {
      mockForgettingService.getStatus.mockReturnValue({});

      await handleForgetting(mockContext, { action: 'status' });

      expect(mockForgettingService.getStatus).toHaveBeenCalled();
    });

    it('should throw for unknown action', async () => {
      await expect(handleForgetting(mockContext, { action: 'unknown' as any })).rejects.toThrow(
        "Invalid action 'unknown' for tool 'memory_forget'"
      );
    });
  });
});
