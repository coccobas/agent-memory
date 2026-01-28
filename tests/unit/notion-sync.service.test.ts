import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createNotionSyncService,
  type SyncServiceDeps,
} from '../../src/services/notion-sync/sync.service.js';
import type { NotionClient, NotionPage } from '../../src/services/notion-sync/client.js';
import type { DatabaseConfig } from '../../src/services/notion-sync/config.js';
import type { ITaskRepository, TaskWithVersion } from '../../src/db/repositories/tasks.js';

describe('Notion Sync Service', () => {
  let mockQueryAllPages: ReturnType<typeof vi.fn>;
  let mockCreate: ReturnType<typeof vi.fn>;
  let mockUpdate: ReturnType<typeof vi.fn>;
  let mockList: ReturnType<typeof vi.fn>;
  let mockDeactivate: ReturnType<typeof vi.fn>;
  let mockNotionClient: NotionClient;
  let mockTaskRepo: ITaskRepository;
  let deps: SyncServiceDeps;

  const validDatabaseConfig: DatabaseConfig = {
    notionDatabaseId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    projectScopeId: 'proj-123',
    syncEnabled: true,
    fieldMappings: [
      { notionProperty: 'Name', taskField: 'title', notionType: 'title' },
      { notionProperty: 'Description', taskField: 'description', notionType: 'rich_text' },
      { notionProperty: 'Status', taskField: 'status', notionType: 'status' },
    ],
  };

  const createMockPage = (id: string, overrides: Partial<NotionPage> = {}): NotionPage => ({
    id,
    properties: {
      Name: { title: [{ plain_text: `Task ${id}` }] },
      Description: { rich_text: [{ plain_text: `Description for ${id}` }] },
      Status: { status: { name: 'In Progress' } },
    },
    lastEditedTime: new Date().toISOString(),
    ...overrides,
  });

  const createMockTask = (id: string, notionPageId: string): TaskWithVersion => ({
    id,
    scopeType: 'project',
    scopeId: 'proj-123',
    title: `Task ${id}`,
    description: 'Test description',
    taskType: 'other',
    taskDomain: 'agent',
    severity: 'medium',
    urgency: 'normal',
    status: 'open',
    category: null,
    resolution: null,
    file: null,
    startLine: null,
    endLine: null,
    assignee: null,
    reporter: null,
    parentTaskId: null,
    blockedBy: null,
    dueDate: null,
    startedAt: null,
    resolvedAt: null,
    estimatedMinutes: null,
    actualMinutes: null,
    tags: null,
    metadata: JSON.stringify({
      notionPageId,
      notionDatabaseId: validDatabaseConfig.notionDatabaseId,
    }),
    createdAt: new Date().toISOString(),
    createdBy: 'notion-sync',
    updatedAt: new Date().toISOString(),
    updatedBy: 'notion-sync',
    isActive: true,
    currentVersionId: 'ver-1',
  });

  beforeEach(() => {
    mockQueryAllPages = vi.fn().mockResolvedValue([]);
    mockCreate = vi.fn().mockImplementation((input) =>
      Promise.resolve({
        id: `task_${Date.now()}`,
        ...input,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
      })
    );
    mockUpdate = vi.fn().mockImplementation((id, input) =>
      Promise.resolve({
        id,
        ...input,
        updatedAt: new Date().toISOString(),
      })
    );
    mockList = vi.fn().mockResolvedValue([]);
    mockDeactivate = vi.fn().mockResolvedValue(true);

    mockNotionClient = {
      queryDatabase: vi.fn(),
      queryAllPages: mockQueryAllPages,
      getStatus: vi.fn().mockReturnValue({ isOpen: false, failures: 0 }),
      forceCloseCircuit: vi.fn(),
      forceOpenCircuit: vi.fn(),
    } as unknown as NotionClient;

    mockTaskRepo = {
      create: mockCreate,
      getById: vi.fn(),
      getByIds: vi.fn(),
      list: mockList,
      update: mockUpdate,
      deactivate: mockDeactivate,
      reactivate: vi.fn(),
      delete: vi.fn(),
      getHistory: vi.fn(),
      getVersion: vi.fn(),
      updateStatus: vi.fn(),
      listByStatus: vi.fn(),
      listBlocked: vi.fn(),
      getSubtasks: vi.fn(),
      addBlocker: vi.fn(),
      removeBlocker: vi.fn(),
    } as unknown as ITaskRepository;

    deps = {
      notionClient: mockNotionClient,
      taskRepo: mockTaskRepo,
    };
  });

  describe('syncDatabase', () => {
    it('creates new tasks for new Notion pages', async () => {
      const pages = [createMockPage('page-1'), createMockPage('page-2')];
      mockQueryAllPages.mockResolvedValue(pages);

      const service = createNotionSyncService(deps);
      const result = await service.syncDatabase(validDatabaseConfig);

      expect(result.success).toBe(true);
      expect(result.createdCount).toBe(2);
      expect(result.updatedCount).toBe(0);
      expect(result.deletedCount).toBe(0);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('updates existing tasks when Notion pages change', async () => {
      const existingTask = createMockTask('task-1', 'page-1');
      mockList.mockResolvedValue([existingTask]);

      const pages = [createMockPage('page-1')];
      mockQueryAllPages.mockResolvedValue(pages);

      const service = createNotionSyncService(deps);
      const result = await service.syncDatabase(validDatabaseConfig);

      expect(result.success).toBe(true);
      expect(result.createdCount).toBe(0);
      expect(result.updatedCount).toBe(1);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it('handles mixed create and update operations', async () => {
      const existingTask = createMockTask('task-1', 'page-1');
      mockList.mockResolvedValue([existingTask]);

      const pages = [createMockPage('page-1'), createMockPage('page-2')];
      mockQueryAllPages.mockResolvedValue(pages);

      const service = createNotionSyncService(deps);
      const result = await service.syncDatabase(validDatabaseConfig);

      expect(result.success).toBe(true);
      expect(result.createdCount).toBe(1);
      expect(result.updatedCount).toBe(1);
    });

    it('soft-deletes tasks when pages are removed from Notion (full sync)', async () => {
      const existingTask = createMockTask('task-1', 'page-1');
      mockList.mockResolvedValue([existingTask]);
      mockQueryAllPages.mockResolvedValue([]);

      const service = createNotionSyncService(deps);
      const result = await service.syncDatabase(validDatabaseConfig);

      expect(result.deletedCount).toBe(1);
      expect(mockDeactivate).toHaveBeenCalledWith('task-1');
    });

    it('uses incremental sync when lastSyncTimestamp is provided', async () => {
      const configWithTimestamp: DatabaseConfig = {
        ...validDatabaseConfig,
        lastSyncTimestamp: '2024-01-15T10:00:00Z',
      };

      mockQueryAllPages.mockResolvedValue([]);

      const service = createNotionSyncService(deps);
      await service.syncDatabase(configWithTimestamp);

      expect(mockQueryAllPages).toHaveBeenCalledWith(
        configWithTimestamp.notionDatabaseId,
        expect.objectContaining({
          timestamp: 'last_edited_time',
          last_edited_time: { after: '2024-01-15T10:00:00Z' },
        })
      );
    });

    it('uses full sync when fullSync option is true', async () => {
      const configWithTimestamp: DatabaseConfig = {
        ...validDatabaseConfig,
        lastSyncTimestamp: '2024-01-15T10:00:00Z',
      };

      mockQueryAllPages.mockResolvedValue([]);

      const service = createNotionSyncService(deps);
      await service.syncDatabase(configWithTimestamp, { fullSync: true });

      expect(mockQueryAllPages).toHaveBeenCalledWith(
        configWithTimestamp.notionDatabaseId,
        undefined
      );
    });

    it('does not persist changes in dry run mode', async () => {
      const pages = [createMockPage('page-1')];
      mockQueryAllPages.mockResolvedValue(pages);

      const service = createNotionSyncService(deps);
      const result = await service.syncDatabase(validDatabaseConfig, { dryRun: true });

      expect(result.createdCount).toBe(1);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('includes agentId in created tasks', async () => {
      const pages = [createMockPage('page-1')];
      mockQueryAllPages.mockResolvedValue(pages);

      const service = createNotionSyncService(deps);
      await service.syncDatabase(validDatabaseConfig, { agentId: 'test-agent' });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: 'test-agent',
        })
      );
    });

    it('handles errors for individual pages gracefully', async () => {
      const pages = [createMockPage('page-1'), createMockPage('page-2')];
      mockQueryAllPages.mockResolvedValue(pages);
      mockCreate.mockRejectedValueOnce(new Error('Database error')).mockResolvedValueOnce({
        id: 'task-2',
        title: 'Task page-2',
      } as TaskWithVersion);

      const service = createNotionSyncService(deps);
      const result = await service.syncDatabase(validDatabaseConfig);

      expect(result.success).toBe(false);
      expect(result.createdCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].pageId).toBe('page-1');
      expect(result.errors[0].recoverable).toBe(true);
    });

    it('handles Notion API errors', async () => {
      mockQueryAllPages.mockRejectedValue(new Error('API rate limited'));

      const service = createNotionSyncService(deps);
      const result = await service.syncDatabase(validDatabaseConfig);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('API rate limited');
      expect(result.errors[0].recoverable).toBe(false);
    });

    it('returns sync result with timestamps', async () => {
      mockQueryAllPages.mockResolvedValue([]);

      const service = createNotionSyncService(deps);
      const result = await service.syncDatabase(validDatabaseConfig);

      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();
      expect(result.newSyncTimestamp).toBeDefined();
      expect(new Date(result.startedAt).getTime()).toBeLessThanOrEqual(
        new Date(result.completedAt).getTime()
      );
    });

    it('stores Notion metadata in task', async () => {
      const page = createMockPage('page-1');
      mockQueryAllPages.mockResolvedValue([page]);

      const service = createNotionSyncService(deps);
      await service.syncDatabase(validDatabaseConfig);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            notionPageId: 'page-1',
            notionDatabaseId: validDatabaseConfig.notionDatabaseId,
          }),
        })
      );
    });

    it('generates default title when Name property is missing', async () => {
      const page: NotionPage = {
        id: 'page-no-name',
        properties: {},
        lastEditedTime: new Date().toISOString(),
      };
      mockQueryAllPages.mockResolvedValue([page]);

      const service = createNotionSyncService(deps);
      await service.syncDatabase(validDatabaseConfig);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Notion Item'),
        })
      );
    });
  });

  describe('field mapping', () => {
    it('maps title property correctly', async () => {
      const page = createMockPage('page-1', {
        properties: {
          Name: { title: [{ plain_text: 'My Task Title' }] },
        },
      });
      mockQueryAllPages.mockResolvedValue([page]);

      const service = createNotionSyncService(deps);
      await service.syncDatabase(validDatabaseConfig);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'My Task Title',
        })
      );
    });

    it('maps rich_text property correctly', async () => {
      const page = createMockPage('page-1', {
        properties: {
          Name: { title: [{ plain_text: 'Task' }] },
          Description: { rich_text: [{ plain_text: 'Part 1 ' }, { plain_text: 'Part 2' }] },
        },
      });
      mockQueryAllPages.mockResolvedValue([page]);

      const service = createNotionSyncService(deps);
      await service.syncDatabase(validDatabaseConfig);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Part 1 Part 2',
        })
      );
    });

    it('maps status property to task status', async () => {
      const testCases = [
        { notionStatus: 'Done', expectedStatus: 'done' },
        { notionStatus: 'In Progress', expectedStatus: 'in_progress' },
        { notionStatus: 'Blocked', expectedStatus: 'blocked' },
        { notionStatus: 'In Review', expectedStatus: 'review' },
        { notionStatus: 'Backlog', expectedStatus: 'backlog' },
        { notionStatus: 'Cancelled', expectedStatus: 'wont_do' },
        { notionStatus: 'Unknown Status', expectedStatus: 'open' },
      ];

      for (const { notionStatus, expectedStatus } of testCases) {
        mockCreate.mockClear();

        const page = createMockPage('page-1', {
          properties: {
            Name: { title: [{ plain_text: 'Task' }] },
            Status: { status: { name: notionStatus } },
          },
        });
        mockQueryAllPages.mockResolvedValue([page]);

        const service = createNotionSyncService(deps);
        await service.syncDatabase(validDatabaseConfig);

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            status: expectedStatus,
          })
        );
      }
    });

    it('maps select property correctly', async () => {
      const config: DatabaseConfig = {
        ...validDatabaseConfig,
        fieldMappings: [
          { notionProperty: 'Name', taskField: 'title', notionType: 'title' },
          { notionProperty: 'Category', taskField: 'category', notionType: 'select' },
        ],
      };

      const page = createMockPage('page-1', {
        properties: {
          Name: { title: [{ plain_text: 'Task' }] },
          Category: { select: { name: 'Bug' } },
        },
      });
      mockQueryAllPages.mockResolvedValue([page]);

      const service = createNotionSyncService(deps);
      await service.syncDatabase(config);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'Bug',
        })
      );
    });

    it('maps multi_select property to tags', async () => {
      const config: DatabaseConfig = {
        ...validDatabaseConfig,
        fieldMappings: [
          { notionProperty: 'Name', taskField: 'title', notionType: 'title' },
          { notionProperty: 'Tags', taskField: 'tags', notionType: 'multi_select' },
        ],
      };

      const page = createMockPage('page-1', {
        properties: {
          Name: { title: [{ plain_text: 'Task' }] },
          Tags: { multi_select: [{ name: 'urgent' }, { name: 'frontend' }] },
        },
      });
      mockQueryAllPages.mockResolvedValue([page]);

      const service = createNotionSyncService(deps);
      await service.syncDatabase(config);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['urgent', 'frontend'],
        })
      );
    });

    it('maps date property correctly', async () => {
      const config: DatabaseConfig = {
        ...validDatabaseConfig,
        fieldMappings: [
          { notionProperty: 'Name', taskField: 'title', notionType: 'title' },
          { notionProperty: 'Due', taskField: 'dueDate', notionType: 'date' },
        ],
      };

      const page = createMockPage('page-1', {
        properties: {
          Name: { title: [{ plain_text: 'Task' }] },
          Due: { date: { start: '2024-12-31' } },
        },
      });
      mockQueryAllPages.mockResolvedValue([page]);

      const service = createNotionSyncService(deps);
      await service.syncDatabase(config);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          dueDate: '2024-12-31',
        })
      );
    });

    it('stores unmapped properties in metadata', async () => {
      const page = createMockPage('page-1', {
        properties: {
          Name: { title: [{ plain_text: 'Task' }] },
          CustomField: { rich_text: [{ plain_text: 'Custom value' }] },
        },
      });
      mockQueryAllPages.mockResolvedValue([page]);

      const service = createNotionSyncService(deps);
      await service.syncDatabase(validDatabaseConfig);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            notionProperties: expect.objectContaining({
              CustomField: expect.anything(),
            }),
          }),
        })
      );
    });
  });

  describe('findTaskByNotionPageId', () => {
    it('finds task by Notion page ID in metadata', async () => {
      const existingTask = createMockTask('task-1', 'page-123');
      mockList.mockResolvedValue([existingTask]);

      const service = createNotionSyncService(deps);
      const result = await service.findTaskByNotionPageId('page-123', 'proj-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('task-1');
    });

    it('returns undefined when no matching task found', async () => {
      mockList.mockResolvedValue([]);

      const service = createNotionSyncService(deps);
      const result = await service.findTaskByNotionPageId('page-123', 'proj-123');

      expect(result).toBeUndefined();
    });
  });

  describe('getTrackedNotionPageIds', () => {
    it('returns set of tracked Notion page IDs', async () => {
      const tasks = [createMockTask('task-1', 'page-1'), createMockTask('task-2', 'page-2')];
      mockList.mockResolvedValue(tasks);

      const service = createNotionSyncService(deps);
      const result = await service.getTrackedNotionPageIds('proj-123');

      expect(result.size).toBe(2);
      expect(result.has('page-1')).toBe(true);
      expect(result.has('page-2')).toBe(true);
    });

    it('ignores tasks without Notion metadata', async () => {
      const taskWithoutMetadata: TaskWithVersion = {
        ...createMockTask('task-1', 'page-1'),
        metadata: null,
      };
      mockList.mockResolvedValue([taskWithoutMetadata]);

      const service = createNotionSyncService(deps);
      const result = await service.getTrackedNotionPageIds('proj-123');

      expect(result.size).toBe(0);
    });
  });
});
