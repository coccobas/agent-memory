import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scopeHandlers } from '../../src/mcp/handlers/scopes.handler.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/utils/admin.js', () => ({
  requireAdminKey: vi.fn(),
}));
vi.mock('../../src/services/critical-guidelines.service.js', () => ({
  getCriticalGuidelinesForSession: vi.fn().mockReturnValue([]),
}));
vi.mock('../../src/services/capture/index.js', () => ({
  getCaptureService: vi.fn().mockReturnValue(null),
}));
vi.mock('../../src/services/feedback/index.js', () => ({
  getFeedbackService: vi.fn().mockReturnValue(null),
}));
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Scopes Handler', () => {
  let mockContext: AppContext;
  let mockOrgsRepo: {
    create: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
  let mockProjectsRepo: {
    create: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    getByName: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let mockSessionsRepo: {
    create: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOrgsRepo = {
      create: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
    };
    mockProjectsRepo = {
      create: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      getByName: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    mockSessionsRepo = {
      create: vi.fn(),
      end: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
    };
    mockContext = {
      db: {} as any,
      repos: {
        organizations: mockOrgsRepo,
        projects: mockProjectsRepo,
        sessions: mockSessionsRepo,
      } as any,
      services: {} as any,
    };
  });

  describe('Organizations', () => {
    it('should create an organization', async () => {
      mockOrgsRepo.create.mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
      });

      const result = await scopeHandlers.orgCreate(mockContext, {
        name: 'Test Org',
        adminKey: 'key',
      });

      expect(result.success).toBe(true);
      expect(result.organization.name).toBe('Test Org');
    });

    it('should create org with metadata', async () => {
      mockOrgsRepo.create.mockResolvedValue({ id: 'org-1', name: 'Test' });

      await scopeHandlers.orgCreate(mockContext, {
        name: 'Test',
        metadata: { tier: 'enterprise' },
        adminKey: 'key',
      });

      expect(mockOrgsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { tier: 'enterprise' } })
      );
    });

    it('should list organizations', async () => {
      mockOrgsRepo.list.mockResolvedValue([
        { id: 'org-1', name: 'Org 1' },
        { id: 'org-2', name: 'Org 2' },
      ]);

      const result = await scopeHandlers.orgList(mockContext, {});

      expect(result.organizations).toHaveLength(2);
      expect(result.meta.returnedCount).toBe(2);
    });

    it('should list organizations with pagination', async () => {
      mockOrgsRepo.list.mockResolvedValue([{ id: 'org-1' }]);

      await scopeHandlers.orgList(mockContext, { limit: 10, offset: 5 });

      expect(mockOrgsRepo.list).toHaveBeenCalledWith({ limit: 10, offset: 5 });
    });
  });

  describe('Projects', () => {
    it('should create a project', async () => {
      mockProjectsRepo.create.mockResolvedValue({
        id: 'proj-1',
        name: 'Test Project',
      });

      const result = await scopeHandlers.projectCreate(mockContext, {
        name: 'Test Project',
        adminKey: 'key',
      });

      expect(result.success).toBe(true);
      expect(result.project.name).toBe('Test Project');
    });

    it('should create project with all options', async () => {
      mockProjectsRepo.create.mockResolvedValue({ id: 'proj-1' });

      await scopeHandlers.projectCreate(mockContext, {
        name: 'Project',
        orgId: 'org-1',
        description: 'A project',
        rootPath: '/path/to/project',
        metadata: { language: 'typescript' },
        adminKey: 'key',
      });

      expect(mockProjectsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Project',
          orgId: 'org-1',
          description: 'A project',
          rootPath: '/path/to/project',
          metadata: { language: 'typescript' },
        })
      );
    });

    it('should list projects', async () => {
      mockProjectsRepo.list.mockResolvedValue([{ id: 'proj-1' }]);

      const result = await scopeHandlers.projectList(mockContext, {});

      expect(result.projects).toHaveLength(1);
    });

    it('should list projects by orgId', async () => {
      mockProjectsRepo.list.mockResolvedValue([]);

      await scopeHandlers.projectList(mockContext, { orgId: 'org-1' });

      expect(mockProjectsRepo.list).toHaveBeenCalledWith(
        { orgId: 'org-1' },
        expect.anything()
      );
    });

    it('should get project by id', async () => {
      mockProjectsRepo.getById.mockResolvedValue({
        id: 'proj-1',
        name: 'Test',
      });

      const result = await scopeHandlers.projectGet(mockContext, { id: 'proj-1' });

      expect(result.project.id).toBe('proj-1');
    });

    it('should get project by name', async () => {
      mockProjectsRepo.getByName.mockResolvedValue({
        id: 'proj-1',
        name: 'Test',
      });

      const result = await scopeHandlers.projectGet(mockContext, { name: 'Test' });

      expect(result.project.name).toBe('Test');
    });

    it('should throw when neither id nor name provided', async () => {
      await expect(scopeHandlers.projectGet(mockContext, {})).rejects.toThrow();
    });

    it('should throw when project not found', async () => {
      mockProjectsRepo.getById.mockResolvedValue(null);

      await expect(
        scopeHandlers.projectGet(mockContext, { id: 'nonexistent' })
      ).rejects.toThrow();
    });

    it('should update project', async () => {
      mockProjectsRepo.update.mockResolvedValue({
        id: 'proj-1',
        name: 'Updated',
      });

      const result = await scopeHandlers.projectUpdate(mockContext, {
        id: 'proj-1',
        name: 'Updated',
        adminKey: 'key',
      });

      expect(result.success).toBe(true);
      expect(result.project.name).toBe('Updated');
    });

    it('should throw on update when project not found', async () => {
      mockProjectsRepo.update.mockResolvedValue(null);

      await expect(
        scopeHandlers.projectUpdate(mockContext, {
          id: 'nonexistent',
          adminKey: 'key',
        })
      ).rejects.toThrow();
    });

    it('should delete project with confirmation', async () => {
      mockProjectsRepo.delete.mockResolvedValue(true);

      const result = await scopeHandlers.projectDelete(mockContext, {
        id: 'proj-1',
        confirm: true,
        adminKey: 'key',
      });

      expect(result.success).toBe(true);
    });

    it('should throw on delete without confirmation', async () => {
      await expect(
        scopeHandlers.projectDelete(mockContext, {
          id: 'proj-1',
          adminKey: 'key',
        })
      ).rejects.toThrow('confirm');
    });

    it('should throw on delete when project not found', async () => {
      mockProjectsRepo.delete.mockResolvedValue(false);

      await expect(
        scopeHandlers.projectDelete(mockContext, {
          id: 'nonexistent',
          confirm: true,
          adminKey: 'key',
        })
      ).rejects.toThrow();
    });
  });

  describe('Sessions', () => {
    it('should start a session', async () => {
      mockSessionsRepo.create.mockResolvedValue({
        id: 'sess-1',
        status: 'active',
      });

      const result = await scopeHandlers.sessionStart(mockContext, {});

      expect(result.success).toBe(true);
      expect(result.session.id).toBe('sess-1');
      expect(result.criticalGuidelines).toBeDefined();
    });

    it('should start session with all options', async () => {
      mockSessionsRepo.create.mockResolvedValue({ id: 'sess-1' });

      await scopeHandlers.sessionStart(mockContext, {
        projectId: 'proj-1',
        name: 'Feature work',
        purpose: 'Implement feature X',
        agentId: 'claude',
        metadata: { model: 'opus' },
      });

      expect(mockSessionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          name: 'Feature work',
          purpose: 'Implement feature X',
          agentId: 'claude',
          metadata: { model: 'opus' },
        })
      );
    });

    it('should end a session', async () => {
      mockSessionsRepo.end.mockResolvedValue({
        id: 'sess-1',
        status: 'completed',
      });

      const result = await scopeHandlers.sessionEnd(mockContext, { id: 'sess-1' });

      expect(result.success).toBe(true);
      expect(result.session.status).toBe('completed');
    });

    it('should end session with status', async () => {
      mockSessionsRepo.end.mockResolvedValue({ id: 'sess-1', status: 'discarded' });

      await scopeHandlers.sessionEnd(mockContext, {
        id: 'sess-1',
        status: 'discarded',
      });

      expect(mockSessionsRepo.end).toHaveBeenCalledWith('sess-1', 'discarded');
    });

    it('should throw when session not found', async () => {
      mockSessionsRepo.end.mockResolvedValue(null);

      await expect(
        scopeHandlers.sessionEnd(mockContext, { id: 'nonexistent' })
      ).rejects.toThrow();
    });

    it('should list sessions', async () => {
      mockSessionsRepo.list.mockResolvedValue([
        { id: 'sess-1' },
        { id: 'sess-2' },
      ]);

      const result = await scopeHandlers.sessionList(mockContext, {});

      expect(result.sessions).toHaveLength(2);
      expect(result.meta.returnedCount).toBe(2);
    });

    it('should list sessions with filters', async () => {
      mockSessionsRepo.list.mockResolvedValue([]);

      await scopeHandlers.sessionList(mockContext, {
        projectId: 'proj-1',
        status: 'active',
        limit: 20,
        offset: 0,
      });

      expect(mockSessionsRepo.list).toHaveBeenCalledWith(
        { projectId: 'proj-1', status: 'active' },
        { limit: 20, offset: 0 }
      );
    });
  });
});
