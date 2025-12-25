import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hooksHandlers } from '../../src/mcp/handlers/hooks.handler.js';
import * as hookService from '../../src/services/hook-generator.service.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/services/hook-generator.service.js');
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Hooks Handler', () => {
  let mockContext: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {
      db: {} as any,
      repos: {} as any,
      services: {} as any,
    };

    vi.mocked(hookService.generateHooks).mockReturnValue({
      success: true,
      hooks: [
        {
          filePath: '/test/.claude/hooks.json',
          content: '{}',
          instructions: 'Add to project',
        },
      ],
      message: 'Generated successfully',
    });

    vi.mocked(hookService.installHooks).mockReturnValue({
      success: true,
      installed: ['/test/.claude/hooks.json'],
      errors: [],
    });

    vi.mocked(hookService.getHookStatus).mockReturnValue({
      installed: true,
      files: ['/test/.claude/hooks.json'],
    });

    vi.mocked(hookService.uninstallHooks).mockReturnValue({
      success: true,
      removed: ['/test/.claude/hooks.json'],
      errors: [],
    });
  });

  describe('generate', () => {
    it('should generate hooks for claude', () => {
      const result = hooksHandlers.generate(mockContext, {
        ide: 'claude',
        projectPath: '/test/project',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('generate');
      expect(hookService.generateHooks).toHaveBeenCalledWith(
        expect.objectContaining({
          ide: 'claude',
          projectPath: '/test/project',
        })
      );
    });

    it('should throw for invalid IDE', () => {
      expect(() =>
        hooksHandlers.generate(mockContext, {
          ide: 'invalid',
          projectPath: '/test',
        })
      ).toThrow();
    });

    it('should pass projectId and sessionId', () => {
      hooksHandlers.generate(mockContext, {
        ide: 'cursor',
        projectPath: '/test',
        projectId: 'proj-1',
        sessionId: 'sess-1',
      });

      expect(hookService.generateHooks).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          sessionId: 'sess-1',
        })
      );
    });
  });

  describe('install', () => {
    it('should install hooks successfully', () => {
      const result = hooksHandlers.install(mockContext, {
        ide: 'claude',
        projectPath: '/test',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('install');
      expect(hookService.installHooks).toHaveBeenCalled();
    });

    it('should return failure when generation fails', () => {
      vi.mocked(hookService.generateHooks).mockReturnValue({
        success: false,
        hooks: [],
        message: 'Generation failed',
      });

      const result = hooksHandlers.install(mockContext, {
        ide: 'vscode',
        projectPath: '/test',
      });

      expect(result.success).toBe(false);
    });

    it('should include installation errors', () => {
      vi.mocked(hookService.installHooks).mockReturnValue({
        success: false,
        installed: [],
        errors: ['Permission denied'],
      });

      const result = hooksHandlers.install(mockContext, {
        ide: 'claude',
        projectPath: '/test',
      });

      expect(result.errors).toContain('Permission denied');
    });
  });

  describe('status', () => {
    it('should return hook status', () => {
      const result = hooksHandlers.status({
        ide: 'claude',
        projectPath: '/test',
      });

      expect(result.success).toBe(true);
      expect(result.installed).toBe(true);
      expect(hookService.getHookStatus).toHaveBeenCalledWith('/test', 'claude');
    });

    it('should indicate when not installed', () => {
      vi.mocked(hookService.getHookStatus).mockReturnValue({
        installed: false,
        files: [],
      });

      const result = hooksHandlers.status({
        ide: 'cursor',
        projectPath: '/test',
      });

      expect(result.installed).toBe(false);
    });
  });

  describe('uninstall', () => {
    it('should uninstall hooks', () => {
      const result = hooksHandlers.uninstall({
        ide: 'claude',
        projectPath: '/test',
      });

      expect(result.success).toBe(true);
      expect(result.removed.length).toBe(1);
      expect(hookService.uninstallHooks).toHaveBeenCalledWith('/test', 'claude');
    });

    it('should include uninstall errors', () => {
      vi.mocked(hookService.uninstallHooks).mockReturnValue({
        success: false,
        removed: [],
        errors: ['File not found'],
      });

      const result = hooksHandlers.uninstall({
        ide: 'vscode',
        projectPath: '/test',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('File not found');
    });
  });
});
