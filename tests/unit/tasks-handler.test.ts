import { describe, it, expect, vi, beforeEach } from 'vitest';
import { taskHandlers, addTask, getTask, listTasks } from '../../src/mcp/handlers/tasks.handler.js';
import type { AppContext } from '../../src/core/context.js';

describe('Tasks Handler', () => {
  let mockContext: AppContext;
  let mockTasksRepo: {
    create: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    getSubtasks: ReturnType<typeof vi.fn>;
  };
  let mockProjectsRepo: {
    getById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTasksRepo = {
      create: vi.fn(),
      getById: vi.fn(),
      list: vi.fn(),
      getSubtasks: vi.fn(),
    };
    mockProjectsRepo = {
      getById: vi.fn(),
      update: vi.fn(),
    };
    mockContext = {
      db: {} as any,
      repos: {
        tasks: mockTasksRepo,
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

      mockTasksRepo.create
        .mockResolvedValueOnce(mainTask)
        .mockResolvedValueOnce(subtask1)
        .mockResolvedValueOnce(subtask2);

      const result = await addTask(mockContext, {
        subtasks: ['Subtask 1', 'Subtask 2'],
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result.success).toBe(true);
      expect(result.task.id).toBe('task-1');
      expect(result.subtasks).toHaveLength(2);
    });

    it('should create subtasks with parentTaskId', async () => {
      mockTasksRepo.create
        .mockResolvedValueOnce({ id: 'task-1', title: 'Main' })
        .mockResolvedValueOnce({ id: 'subtask-1', title: 'Sub' });

      await addTask(mockContext, {
        subtasks: ['Sub task'],
        scopeType: 'global',
      });

      // Second call should have parentTaskId set to main task
      expect(mockTasksRepo.create).toHaveBeenCalledTimes(2);
      expect(mockTasksRepo.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          parentTaskId: 'task-1',
        })
      );
    });

    it('should link to parent task if provided', async () => {
      mockTasksRepo.create
        .mockResolvedValueOnce({ id: 'task-1', title: 'Main' })
        .mockResolvedValueOnce({ id: 'subtask-1', title: 'Sub' });

      await addTask(mockContext, {
        parentTask: 'parent-task-id',
        subtasks: ['Sub task'],
        scopeType: 'project',
      });

      // Main task should have parentTaskId set
      expect(mockTasksRepo.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          parentTaskId: 'parent-task-id',
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
      mockTasksRepo.create
        .mockResolvedValueOnce({ id: 'task-1', title: 'Main' })
        .mockResolvedValueOnce({ id: 'subtask-1', title: 'Sub' });
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
        description: 'Task content',
        parentTaskId: null,
      };
      mockTasksRepo.getById.mockResolvedValue(task);
      mockTasksRepo.getSubtasks.mockResolvedValue([{ id: 'subtask-1', title: 'Subtask 1' }]);

      const result = await getTask(mockContext, { taskId: 'task-1' });

      expect(result.task.id).toBe('task-1');
      expect(result.subtasks).toHaveLength(1);
    });

    it('should include parent task if exists', async () => {
      const task = { id: 'subtask-1', title: 'Subtask', description: '', parentTaskId: 'parent-1' };
      const parentTask = { id: 'parent-1', title: 'Parent Task' };
      mockTasksRepo.getById.mockResolvedValueOnce(task).mockResolvedValueOnce(parentTask);
      mockTasksRepo.getSubtasks.mockResolvedValue([]);

      const result = await getTask(mockContext, { taskId: 'subtask-1' });

      expect(result.parentTask).toBeDefined();
      expect(result.parentTask!.id).toBe('parent-1');
    });

    it('should throw when task not found', async () => {
      mockTasksRepo.getById.mockResolvedValue(null);

      await expect(getTask(mockContext, { taskId: 'nonexistent' })).rejects.toThrow();
    });
  });

  describe('listTasks', () => {
    it('should list tasks', async () => {
      mockTasksRepo.list.mockResolvedValue([
        { id: 'task-1', title: 'Task 1' },
        { id: 'task-2', title: 'Task 2' },
      ]);
      mockTasksRepo.getSubtasks
        .mockResolvedValueOnce([{ id: 'sub-1' }])
        .mockResolvedValueOnce([{ id: 'sub-2' }, { id: 'sub-3' }]);

      const result = await listTasks(mockContext, {});

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0].subtaskCount).toBe(1);
      expect(result.tasks[1].subtaskCount).toBe(2);
      expect(result.meta.returnedCount).toBe(2);
    });

    it('should filter by parent task', async () => {
      mockTasksRepo.list.mockResolvedValue([{ id: 'subtask-1', title: 'Sub' }]);
      mockTasksRepo.getSubtasks.mockResolvedValue([]);

      await listTasks(mockContext, { parentTaskId: 'parent-1' });

      expect(mockTasksRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({
          parentTaskId: 'parent-1',
        }),
        expect.any(Object)
      );
    });

    it('should apply pagination', async () => {
      mockTasksRepo.list.mockResolvedValue([{ id: 'task-2', title: 'Task 2' }]);
      mockTasksRepo.getSubtasks.mockResolvedValue([]);

      const result = await listTasks(mockContext, { limit: 1, offset: 1 });

      expect(mockTasksRepo.list).toHaveBeenCalledWith(expect.any(Object), { limit: 1, offset: 1 });
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
