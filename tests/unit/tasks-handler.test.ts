import { describe, it, expect, vi, beforeEach } from 'vitest';
import { taskHandlers, addTask, getTask, listTasks } from '../../src/mcp/handlers/tasks.handler.js';
import type { AppContext } from '../../src/core/context.js';

describe('Tasks Handler', () => {
  let mockContext: AppContext;
  let mockKnowledgeRepo: {
    create: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
  let mockRelationsRepo: {
    create: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
  let mockProjectsRepo: {
    getById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mockDb: {
    select: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockKnowledgeRepo = {
      create: vi.fn(),
      getById: vi.fn(),
      list: vi.fn(),
    };
    mockRelationsRepo = {
      create: vi.fn(),
      list: vi.fn(),
    };
    mockProjectsRepo = {
      getById: vi.fn(),
      update: vi.fn(),
    };
    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(null),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            run: vi.fn(),
          }),
        }),
      }),
    };
    mockContext = {
      db: mockDb as any,
      repos: {
        knowledge: mockKnowledgeRepo,
        entryRelations: mockRelationsRepo,
        projects: mockProjectsRepo,
      } as any,
      services: {} as any,
    };
  });

  describe('addTask', () => {
    it('should create a task with subtasks', async () => {
      const mainTask = { id: 'task-1', title: 'Task with 2 subtask(s)' };
      const subtask1 = { id: 'subtask-1', title: 'Subtask 1' };
      const subtask2 = { id: 'subtask-2', title: 'Subtask 2' };

      mockKnowledgeRepo.create
        .mockResolvedValueOnce(mainTask)
        .mockResolvedValueOnce(subtask1)
        .mockResolvedValueOnce(subtask2);
      mockRelationsRepo.create.mockResolvedValue({});

      const result = await addTask(mockContext, {
        subtasks: ['Subtask 1', 'Subtask 2'],
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result.success).toBe(true);
      expect(result.task.id).toBe('task-1');
      expect(result.subtasks).toHaveLength(2);
    });

    it('should create parent-child relations', async () => {
      mockKnowledgeRepo.create
        .mockResolvedValueOnce({ id: 'task-1', title: 'Main' })
        .mockResolvedValueOnce({ id: 'subtask-1', title: 'Sub' });
      mockRelationsRepo.create.mockResolvedValue({});

      await addTask(mockContext, {
        subtasks: ['Sub task'],
        scopeType: 'global',
      });

      // Should create parent_task and subtask_of relations
      expect(mockRelationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          relationType: 'parent_task',
        })
      );
      expect(mockRelationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          relationType: 'subtask_of',
        })
      );
    });

    it('should link to parent task if provided', async () => {
      mockKnowledgeRepo.create
        .mockResolvedValueOnce({ id: 'task-1', title: 'Main' })
        .mockResolvedValueOnce({ id: 'subtask-1', title: 'Sub' });
      mockRelationsRepo.create.mockResolvedValue({});

      await addTask(mockContext, {
        parentTask: 'parent-task-id',
        subtasks: ['Sub task'],
        scopeType: 'project',
      });

      // Should create relations to parent task
      expect(mockRelationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: 'parent-task-id',
          targetId: 'task-1',
          relationType: 'parent_task',
        })
      );
    });

    it('should throw when subtasks is empty', async () => {
      await expect(
        addTask(mockContext, {
          subtasks: [],
          scopeType: 'project',
        })
      ).rejects.toThrow('at least one subtask');
    });

    it('should update project metadata if projectId provided', async () => {
      mockKnowledgeRepo.create
        .mockResolvedValueOnce({ id: 'task-1', title: 'Main' })
        .mockResolvedValueOnce({ id: 'subtask-1', title: 'Sub' });
      mockRelationsRepo.create.mockResolvedValue({});
      mockProjectsRepo.getById.mockResolvedValue({ id: 'proj-123', metadata: {} });
      mockProjectsRepo.update.mockResolvedValue({});

      await addTask(mockContext, {
        subtasks: ['Sub task'],
        scopeType: 'project',
        projectId: 'proj-123',
        decompositionStrategy: 'maximal',
      });

      expect(mockProjectsRepo.update).toHaveBeenCalled();
    });
  });

  describe('getTask', () => {
    it('should get a task with its subtasks', async () => {
      const task = {
        id: 'task-1',
        title: 'Main Task',
        currentVersion: { content: 'Task content' },
      };
      mockKnowledgeRepo.getById.mockResolvedValue(task);
      mockRelationsRepo.list.mockResolvedValueOnce([
        { targetType: 'knowledge', targetId: 'subtask-1' },
      ]).mockResolvedValueOnce([]);
      mockKnowledgeRepo.getById.mockResolvedValueOnce(task).mockResolvedValueOnce({
        id: 'subtask-1',
        title: 'Subtask 1',
      });

      const result = await getTask(mockContext, { taskId: 'task-1' });

      expect(result.task.id).toBe('task-1');
      expect(result.subtasks).toHaveLength(1);
    });

    it('should include parent task if exists', async () => {
      const task = { id: 'subtask-1', title: 'Subtask', currentVersion: { content: '' } };
      const parentTask = { id: 'parent-1', title: 'Parent Task' };
      mockKnowledgeRepo.getById.mockResolvedValueOnce(task).mockResolvedValueOnce(parentTask);
      mockRelationsRepo.list
        .mockResolvedValueOnce([]) // No subtasks
        .mockResolvedValueOnce([{ targetType: 'knowledge', targetId: 'parent-1' }]); // Has parent

      const result = await getTask(mockContext, { taskId: 'subtask-1' });

      expect(result.parentTask).toBeDefined();
      expect(result.parentTask!.id).toBe('parent-1');
    });

    it('should throw when task not found', async () => {
      mockKnowledgeRepo.getById.mockResolvedValue(null);

      await expect(getTask(mockContext, { taskId: 'nonexistent' })).rejects.toThrow();
    });
  });

  describe('listTasks', () => {
    it('should list tasks', async () => {
      mockRelationsRepo.list.mockResolvedValue([
        { sourceType: 'knowledge', sourceId: 'task-1' },
        { sourceType: 'knowledge', sourceId: 'task-2' },
      ]);
      mockKnowledgeRepo.getById
        .mockResolvedValueOnce({ id: 'task-1', title: 'Task 1' })
        .mockResolvedValueOnce({ id: 'task-2', title: 'Task 2' });
      // For subtask counts
      mockRelationsRepo.list
        .mockResolvedValueOnce([{ sourceType: 'knowledge', sourceId: 'task-1' }])
        .mockResolvedValueOnce([{ sourceType: 'knowledge', sourceId: 'task-2' }])
        .mockResolvedValueOnce([{ id: 'sub-1' }])
        .mockResolvedValueOnce([{ id: 'sub-2' }, { id: 'sub-3' }]);

      const result = await listTasks(mockContext, {});

      expect(result.tasks).toBeDefined();
      expect(result.meta.returnedCount).toBeGreaterThanOrEqual(0);
    });

    it('should filter by parent task', async () => {
      mockRelationsRepo.list.mockResolvedValue([
        { targetType: 'knowledge', targetId: 'subtask-1' },
      ]);
      mockKnowledgeRepo.getById.mockResolvedValue({ id: 'subtask-1', title: 'Sub' });

      await listTasks(mockContext, { parentTaskId: 'parent-1' });

      expect(mockRelationsRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: 'parent-1',
          relationType: 'parent_task',
        })
      );
    });

    it('should apply pagination', async () => {
      mockRelationsRepo.list.mockResolvedValue([
        { sourceType: 'knowledge', sourceId: 'task-1' },
        { sourceType: 'knowledge', sourceId: 'task-2' },
        { sourceType: 'knowledge', sourceId: 'task-3' },
      ]);
      mockKnowledgeRepo.getById.mockResolvedValue({ id: 'task-2', title: 'Task 2' });
      mockRelationsRepo.list.mockResolvedValue([]);

      const result = await listTasks(mockContext, { limit: 1, offset: 1 });

      expect(result.tasks.length).toBeLessThanOrEqual(1);
    });
  });

  describe('taskHandlers export', () => {
    it('should export all handlers', () => {
      expect(taskHandlers.add).toBeDefined();
      expect(taskHandlers.get).toBeDefined();
      expect(taskHandlers.list).toBeDefined();
    });
  });
});
