/**
 * Tests for Context Detection Service
 *
 * Tests the automatic detection of project, session, and agentId
 * from working directory and environment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ContextDetectionService,
  createContextDetectionService,
  type DetectedContext,
  type EnrichableParams,
} from '../../src/services/context-detection.service.js';
import type { Config } from '../../src/config/index.js';
import type {
  IProjectRepository,
  ISessionRepository,
} from '../../src/core/interfaces/repositories.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock repositories
function createMockProjectRepo() {
  return {
    findByPath: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockSessionRepo() {
  return {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    end: vi.fn(),
  };
}

function createMockConfig(overrides: Partial<Config['autoContext']> = {}): Config {
  return {
    autoContext: {
      enabled: true,
      cacheTTLMs: 5000,
      defaultAgentId: 'default-agent',
      autoSession: true,
      autoSessionName: 'Auto Session',
      ...overrides,
    },
  } as Config;
}

describe('ContextDetectionService', () => {
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let sessionRepo: ReturnType<typeof createMockSessionRepo>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    projectRepo = createMockProjectRepo();
    sessionRepo = createMockSessionRepo();
    originalEnv = process.env.AGENT_MEMORY_DEFAULT_AGENT_ID;
    delete process.env.AGENT_MEMORY_DEFAULT_AGENT_ID;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.AGENT_MEMORY_DEFAULT_AGENT_ID = originalEnv;
    } else {
      delete process.env.AGENT_MEMORY_DEFAULT_AGENT_ID;
    }
    vi.clearAllMocks();
  });

  describe('detect()', () => {
    describe('when disabled', () => {
      it('should return minimal context with default agentId', async () => {
        const config = createMockConfig({ enabled: false });
        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);

        const result = await service.detect();

        expect(result.agentId.value).toBe('default-agent');
        expect(result.agentId.source).toBe('default');
        expect(result.project).toBeUndefined();
        expect(result.session).toBeUndefined();
        expect(projectRepo.findByPath).not.toHaveBeenCalled();
      });

      it('should use explicit agentId when provided', async () => {
        const config = createMockConfig({ enabled: false });
        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);

        const result = await service.detect({ agentId: 'explicit-agent' });

        expect(result.agentId.value).toBe('explicit-agent');
        expect(result.agentId.source).toBe('explicit');
      });
    });

    describe('project detection', () => {
      it('should detect project from working directory', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue({
          id: 'proj-123',
          name: 'Test Project',
          rootPath: '/test/project',
        });
        sessionRepo.list.mockResolvedValue([]);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.detect();

        expect(result.project).toBeDefined();
        expect(result.project?.id).toBe('proj-123');
        expect(result.project?.name).toBe('Test Project');
        expect(result.project?.source).toBe('cwd');
      });

      it('should handle no project found', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue(null);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.detect();

        expect(result.project).toBeUndefined();
      });

      it('should handle project detection errors gracefully', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockRejectedValue(new Error('DB error'));

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.detect();

        expect(result.project).toBeUndefined();
      });
    });

    describe('session detection', () => {
      it('should detect active session for detected project', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue({
          id: 'proj-123',
          name: 'Test Project',
        });
        sessionRepo.list.mockResolvedValue([
          {
            id: 'sess-456',
            name: 'Active Session',
            status: 'active',
          },
        ]);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.detect();

        expect(result.session).toBeDefined();
        expect(result.session?.id).toBe('sess-456');
        expect(result.session?.status).toBe('active');
        expect(result.session?.source).toBe('active');
      });

      it('should not detect session without project', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue(null);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.detect();

        expect(result.session).toBeUndefined();
        expect(sessionRepo.list).not.toHaveBeenCalled();
      });

      it('should handle no active session', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue({
          id: 'proj-123',
          name: 'Test Project',
        });
        sessionRepo.list.mockResolvedValue([]);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.detect();

        expect(result.session).toBeUndefined();
      });

      it('should handle session detection errors gracefully', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue({
          id: 'proj-123',
          name: 'Test Project',
        });
        sessionRepo.list.mockRejectedValue(new Error('DB error'));

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.detect();

        expect(result.project).toBeDefined();
        expect(result.session).toBeUndefined();
      });
    });

    describe('agentId detection', () => {
      it('should use explicit agentId when provided', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue(null);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.detect({ agentId: 'explicit-agent' });

        expect(result.agentId.value).toBe('explicit-agent');
        expect(result.agentId.source).toBe('explicit');
      });

      it('should use env variable when set', async () => {
        process.env.AGENT_MEMORY_DEFAULT_AGENT_ID = 'env-agent';
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue(null);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.detect();

        expect(result.agentId.value).toBe('env-agent');
        expect(result.agentId.source).toBe('env');
      });

      it('should use default agentId as fallback', async () => {
        const config = createMockConfig({ defaultAgentId: 'fallback-agent' });
        projectRepo.findByPath.mockResolvedValue(null);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.detect();

        expect(result.agentId.value).toBe('fallback-agent');
        expect(result.agentId.source).toBe('default');
      });

      it('should prioritize explicit over env over default', async () => {
        process.env.AGENT_MEMORY_DEFAULT_AGENT_ID = 'env-agent';
        const config = createMockConfig({ defaultAgentId: 'fallback-agent' });
        projectRepo.findByPath.mockResolvedValue(null);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);

        // With explicit
        const result1 = await service.detect({ agentId: 'explicit-agent' });
        expect(result1.agentId.value).toBe('explicit-agent');
        expect(result1.agentId.source).toBe('explicit');
      });
    });

    describe('caching', () => {
      it('should cache detection results', async () => {
        const config = createMockConfig({ cacheTTLMs: 10000 });
        projectRepo.findByPath.mockResolvedValue({
          id: 'proj-123',
          name: 'Test Project',
        });
        sessionRepo.list.mockResolvedValue([]);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);

        // First call - should query repos
        await service.detect();
        expect(projectRepo.findByPath).toHaveBeenCalledTimes(1);

        // Second call - should use cache
        await service.detect();
        expect(projectRepo.findByPath).toHaveBeenCalledTimes(1);
      });

      it('should bypass cache when explicit projectId provided', async () => {
        const config = createMockConfig({ cacheTTLMs: 10000 });
        projectRepo.findByPath.mockResolvedValue({
          id: 'proj-123',
          name: 'Test Project',
        });
        sessionRepo.list.mockResolvedValue([]);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);

        await service.detect();
        await service.detect({ projectId: 'explicit-proj' });

        expect(projectRepo.findByPath).toHaveBeenCalledTimes(2);
      });

      it('should update agentId from explicit params even when cached', async () => {
        const config = createMockConfig({ cacheTTLMs: 10000 });
        projectRepo.findByPath.mockResolvedValue({
          id: 'proj-123',
          name: 'Test Project',
        });
        sessionRepo.list.mockResolvedValue([]);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);

        // First call without explicit agentId
        const result1 = await service.detect();
        expect(result1.agentId.value).toBe('default-agent');

        // Second call with explicit agentId - should use explicit but keep cached project
        const result2 = await service.detect({ agentId: 'new-agent' });
        expect(result2.agentId.value).toBe('new-agent');
        expect(result2.agentId.source).toBe('explicit');
        expect(result2.project?.id).toBe('proj-123');
      });
    });
  });

  describe('enrichParams()', () => {
    it('should enrich scopeType and scopeId when project detected', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'Test Project',
      });
      sessionRepo.list.mockResolvedValue([]);

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.enrichParams({ action: 'list' });

      expect(result.enriched.scopeType).toBe('project');
      expect(result.enriched.scopeId).toBe('proj-123');
    });

    it('should enrich projectId when project detected', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'Test Project',
      });
      sessionRepo.list.mockResolvedValue([]);

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.enrichParams({});

      expect(result.enriched.projectId).toBe('proj-123');
    });

    it('should enrich sessionId when session detected', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'Test Project',
      });
      sessionRepo.list.mockResolvedValue([
        {
          id: 'sess-456',
          status: 'active',
        },
      ]);

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.enrichParams({});

      expect(result.enriched.sessionId).toBe('sess-456');
    });

    it('should enrich agentId', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue(null);

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.enrichParams({});

      expect(result.enriched.agentId).toBe('default-agent');
    });

    it('should not overwrite explicit scopeType', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'Test Project',
      });
      sessionRepo.list.mockResolvedValue([]);

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.enrichParams({ scopeType: 'global' });

      expect(result.enriched.scopeType).toBe('global');
    });

    it('should not overwrite explicit scopeId', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'Test Project',
      });
      sessionRepo.list.mockResolvedValue([]);

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.enrichParams({
        scopeType: 'project',
        scopeId: 'explicit-scope',
      });

      expect(result.enriched.scopeId).toBe('explicit-scope');
    });

    it('should not overwrite explicit projectId', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'Test Project',
      });
      sessionRepo.list.mockResolvedValue([]);

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.enrichParams({ projectId: 'explicit-proj' });

      expect(result.enriched.projectId).toBe('explicit-proj');
    });

    it('should not overwrite explicit sessionId', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'Test Project',
      });
      sessionRepo.list.mockResolvedValue([
        {
          id: 'sess-456',
          status: 'active',
        },
      ]);

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.enrichParams({ sessionId: 'explicit-sess' });

      expect(result.enriched.sessionId).toBe('explicit-sess');
    });

    it('should not overwrite explicit agentId', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue(null);

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.enrichParams({ agentId: 'explicit-agent' });

      expect(result.enriched.agentId).toBe('explicit-agent');
    });

    it('should return detected context', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'Test Project',
      });
      sessionRepo.list.mockResolvedValue([]);

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.enrichParams({});

      expect(result.detected).toBeDefined();
      expect(result.detected.project?.id).toBe('proj-123');
    });

    it('should preserve original args', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue(null);

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.enrichParams({
        action: 'list',
        customParam: 'value',
      });

      expect(result.enriched.action).toBe('list');
      expect(result.enriched.customParam).toBe('value');
    });

    it('should only enrich scopeId if scopeType is project', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'Test Project',
      });
      sessionRepo.list.mockResolvedValue([]);

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.enrichParams({ scopeType: 'global' });

      // scopeType is explicit 'global', so scopeId should not be auto-filled
      expect(result.enriched.scopeId).toBeUndefined();
    });
  });

  describe('clearCache()', () => {
    it('should clear the cache', async () => {
      const config = createMockConfig({ cacheTTLMs: 10000 });
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'Test Project',
      });
      sessionRepo.list.mockResolvedValue([]);

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);

      // First call - populates cache
      await service.detect();
      expect(projectRepo.findByPath).toHaveBeenCalledTimes(1);

      // Clear cache
      service.clearCache();

      // Next call should query repos again
      await service.detect();
      expect(projectRepo.findByPath).toHaveBeenCalledTimes(2);
    });
  });

  describe('createContextDetectionService()', () => {
    it('should create a ContextDetectionService instance', () => {
      const config = createMockConfig();
      const service = createContextDetectionService(config, projectRepo as any, sessionRepo as any);

      expect(service).toBeInstanceOf(ContextDetectionService);
    });
  });

  describe('resolveProjectScope()', () => {
    describe('when explicit scopeId is provided', () => {
      it('should return the explicit scopeId', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue({
          id: 'cwd-proj',
          name: 'CWD Project',
        });
        sessionRepo.list.mockResolvedValue([
          {
            id: 'sess-123',
            projectId: 'session-proj',
            status: 'active',
          },
        ]);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.resolveProjectScope('project', 'explicit-proj');

        expect(result.projectId).toBe('explicit-proj');
        expect(result.source).toBe('explicit');
      });

      it('should include warning when explicit scopeId differs from session project', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue({
          id: 'cwd-proj',
          name: 'CWD Project',
        });
        sessionRepo.list.mockResolvedValue([
          {
            id: 'sess-123',
            projectId: 'session-proj',
            status: 'active',
          },
        ]);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.resolveProjectScope('project', 'explicit-proj');

        expect(result.projectId).toBe('explicit-proj');
        expect(result.source).toBe('explicit');
        expect(result.warning).toContain('differs from active session');
        expect(result.sessionId).toBe('sess-123');
      });

      it('should not include warning when explicit scopeId matches session project', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue({
          id: 'cwd-proj',
          name: 'CWD Project',
        });
        sessionRepo.list.mockResolvedValue([
          {
            id: 'sess-123',
            projectId: 'session-proj',
            status: 'active',
          },
        ]);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.resolveProjectScope('project', 'session-proj');

        expect(result.projectId).toBe('session-proj');
        expect(result.source).toBe('explicit');
        expect(result.warning).toBeUndefined();
      });
    });

    describe('when no explicit scopeId is provided', () => {
      it('should resolve from active session when available', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue({
          id: 'cwd-proj',
          name: 'CWD Project',
        });
        sessionRepo.list.mockResolvedValue([
          {
            id: 'sess-123',
            projectId: 'session-proj',
            status: 'active',
          },
        ]);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.resolveProjectScope('project');

        expect(result.projectId).toBe('session-proj');
        expect(result.source).toBe('session');
        expect(result.sessionId).toBe('sess-123');
      });

      it('should fall back to cwd-detected project when no active session', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue({
          id: 'cwd-proj',
          name: 'CWD Project',
        });
        sessionRepo.list.mockResolvedValue([]);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.resolveProjectScope('project');

        expect(result.projectId).toBe('cwd-proj');
        expect(result.source).toBe('cwd');
        expect(result.sessionId).toBeUndefined();
      });

      it('should throw error when no project can be resolved', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue(null);
        sessionRepo.list.mockResolvedValue([]);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);

        await expect(service.resolveProjectScope('project')).rejects.toThrow(
          'No active session found'
        );
      });
    });

    describe('when scopeType is not project', () => {
      it('should pass through for global scope', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue(null);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.resolveProjectScope('global');

        expect(result.projectId).toBe('');
        expect(result.source).toBe('explicit');
      });

      it('should pass through for session scope', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue(null);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.resolveProjectScope('session', 'sess-id');

        expect(result.projectId).toBe('sess-id');
        expect(result.source).toBe('explicit');
      });
    });

    describe('when session has no projectId', () => {
      it('should fall back to cwd-detected project', async () => {
        const config = createMockConfig();
        projectRepo.findByPath.mockResolvedValue({
          id: 'cwd-proj',
          name: 'CWD Project',
        });
        sessionRepo.list.mockResolvedValue([
          {
            id: 'sess-123',
            projectId: null, // No projectId on session
            status: 'active',
          },
        ]);

        const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
        const result = await service.resolveProjectScope('project');

        expect(result.projectId).toBe('cwd-proj');
        expect(result.source).toBe('cwd');
      });
    });
  });
});
