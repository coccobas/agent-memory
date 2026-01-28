/**
 * Integration tests for Notion Sync Service
 *
 * Tests the complete sync flow: config -> client -> sync -> evidence -> history
 * Uses mocked Notion API (no real API calls)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

import {
  setupTestDb,
  cleanupTestDb,
  createTestProject,
  createTestRepositories,
  registerTestContext,
  type TestDb,
} from '../fixtures/test-helpers.js';
import { createNotionSyncService } from '../../src/services/notion-sync/sync.service.js';
import type { DatabaseConfig } from '../../src/services/notion-sync/config.js';
import type {
  NotionClient,
  NotionPage,
  NotionClientStatus,
} from '../../src/services/notion-sync/client.js';
import type { Repositories } from '../../src/core/interfaces/repositories.js';

const TEST_DB_PATH = './data/test-notion-sync-integration.db';

let testDb: TestDb;
let repos: Repositories;

// Mock Notion client factory
function createMockNotionClient(pages: NotionPage[] = []): NotionClient {
  return {
    queryDatabase: vi.fn().mockResolvedValue({
      results: pages,
      hasMore: false,
      nextCursor: null,
    }),
    queryAllPages: vi.fn().mockResolvedValue(pages),
    getStatus: vi.fn().mockReturnValue({ isOpen: false, failures: 0 } as NotionClientStatus),
    forceCloseCircuit: vi.fn(),
    forceOpenCircuit: vi.fn(),
  } as unknown as NotionClient;
}

// Helper to create mock Notion page data
function createMockNotionPage(
  id: string,
  title: string,
  description: string = '',
  status: string = 'In Progress',
  lastEditedTime?: string
): NotionPage {
  return {
    id,
    properties: {
      Name: {
        type: 'title',
        title: [{ plain_text: title }],
      },
      Description: {
        type: 'rich_text',
        rich_text: [{ plain_text: description }],
      },
      Status: {
        type: 'status',
        status: { name: status },
      },
    },
    lastEditedTime: lastEditedTime ?? new Date().toISOString(),
  };
}

// Helper to create database config
function createTestDbConfig(
  projectId: string,
  overrides: Partial<DatabaseConfig> = {}
): DatabaseConfig {
  return {
    notionDatabaseId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    projectScopeId: projectId,
    syncEnabled: true,
    fieldMappings: [
      { notionProperty: 'Name', taskField: 'title' },
      { notionProperty: 'Description', taskField: 'description' },
      { notionProperty: 'Status', taskField: 'status' },
    ],
    ...overrides,
  };
}

describe('Notion Sync Integration', () => {
  let previousPermMode: string | undefined;

  beforeAll(() => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    testDb = setupTestDb(TEST_DB_PATH);
    registerTestContext(testDb);
    repos = createTestRepositories(testDb);
  });

  afterAll(() => {
    if (previousPermMode === undefined) {
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    } else {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    }
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('Full sync flow', () => {
    it('should create tasks with versions from Notion data', async () => {
      const project = createTestProject(testDb.db, 'Notion Sync Test');

      const mockPages: NotionPage[] = [
        createMockNotionPage('page-1', 'Task 1', 'Description 1', 'In Progress'),
        createMockNotionPage('page-2', 'Task 2', 'Description 2', 'Done'),
      ];

      const mockClient = createMockNotionClient(mockPages);
      const syncService = createNotionSyncService({
        notionClient: mockClient,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      const dbConfig = createTestDbConfig(project.id);

      const result = await syncService.syncDatabase(dbConfig);

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(2);
      expect(result.createdCount).toBe(2);
      expect(result.updatedCount).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify tasks were created
      const tasks = await repos.tasks!.list({
        scopeType: 'project',
        scopeId: project.id,
      });
      expect(tasks.length).toBe(2);

      // Verify task content
      const task1 = tasks.find((t) => t.title === 'Task 1');
      expect(task1).toBeDefined();
      expect(task1!.description).toBe('Description 1');
      expect(task1!.status).toBe('in_progress');

      const task2 = tasks.find((t) => t.title === 'Task 2');
      expect(task2).toBeDefined();
      expect(task2!.status).toBe('done');
    });

    it('should create new version on update', async () => {
      const project = createTestProject(testDb.db, 'Notion Update Test');

      // First sync - create task
      const initialPages: NotionPage[] = [
        createMockNotionPage('page-update-1', 'Original Title', 'Original Description'),
      ];

      const mockClient = createMockNotionClient(initialPages);
      const syncService = createNotionSyncService({
        notionClient: mockClient,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      const dbConfig = createTestDbConfig(project.id);
      await syncService.syncDatabase(dbConfig);

      // Get the created task
      const tasksAfterCreate = await repos.tasks!.list({
        scopeType: 'project',
        scopeId: project.id,
      });
      expect(tasksAfterCreate.length).toBe(1);

      // Second sync - update task
      const updatedPages: NotionPage[] = [
        createMockNotionPage('page-update-1', 'Updated Title', 'Updated Description', 'Done'),
      ];

      // Update mock to return updated pages
      (mockClient.queryAllPages as ReturnType<typeof vi.fn>).mockResolvedValue(updatedPages);

      const updateResult = await syncService.syncDatabase(dbConfig);

      expect(updateResult.success).toBe(true);
      expect(updateResult.updatedCount).toBe(1);
      expect(updateResult.createdCount).toBe(0);

      // Verify task was updated
      const tasksAfterUpdate = await repos.tasks!.list({
        scopeType: 'project',
        scopeId: project.id,
      });
      expect(tasksAfterUpdate.length).toBe(1);

      const updatedTask = tasksAfterUpdate[0];
      expect(updatedTask.title).toBe('Updated Title');
      expect(updatedTask.description).toBe('Updated Description');
      expect(updatedTask.status).toBe('done');

      // Verify version history
      const history = await repos.tasks!.getHistory(updatedTask.id);
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should soft-delete removed items when no lastSyncTimestamp', async () => {
      const project = createTestProject(testDb.db, 'Notion Delete Test');

      const initialPages: NotionPage[] = [
        createMockNotionPage('page-delete-1', 'Task to Keep'),
        createMockNotionPage('page-delete-2', 'Task to Remove'),
      ];

      const mockClient = createMockNotionClient(initialPages);
      const syncService = createNotionSyncService({
        notionClient: mockClient,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      const dbConfig = createTestDbConfig(project.id);
      await syncService.syncDatabase(dbConfig);

      const tasksAfterCreate = await repos.tasks!.list({
        scopeType: 'project',
        scopeId: project.id,
      });
      expect(tasksAfterCreate.length).toBe(2);

      const reducedPages: NotionPage[] = [createMockNotionPage('page-delete-1', 'Task to Keep')];

      (mockClient.queryAllPages as ReturnType<typeof vi.fn>).mockResolvedValue(reducedPages);

      const deleteResult = await syncService.syncDatabase(dbConfig);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.deletedCount).toBe(1);

      const tasksAfterDelete = await repos.tasks!.list({
        scopeType: 'project',
        scopeId: project.id,
        includeInactive: false,
      });
      expect(tasksAfterDelete.length).toBe(1);
      expect(tasksAfterDelete[0].title).toBe('Task to Keep');

      const allTasks = await repos.tasks!.list({
        scopeType: 'project',
        scopeId: project.id,
        includeInactive: true,
      });
      expect(allTasks.length).toBe(2);
    });

    it('should create evidence trail', async () => {
      const project = createTestProject(testDb.db, 'Notion Evidence Test');

      const mockPages: NotionPage[] = [createMockNotionPage('page-evidence-1', 'Evidence Task')];

      const mockClient = createMockNotionClient(mockPages);
      const syncService = createNotionSyncService({
        notionClient: mockClient,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      const dbConfig = createTestDbConfig(project.id);
      await syncService.syncDatabase(dbConfig);

      // Verify evidence record was created
      const evidenceList = await repos.evidence!.list({
        scopeType: 'project',
        scopeId: project.id,
      });

      expect(evidenceList.length).toBeGreaterThanOrEqual(1);

      const syncEvidence = evidenceList.find((e) => e.title?.includes('Notion sync'));
      expect(syncEvidence).toBeDefined();
      expect(syncEvidence!.source).toBe('notion');
    });

    it('should handle empty Notion database', async () => {
      const project = createTestProject(testDb.db, 'Notion Empty Test');

      const mockClient = createMockNotionClient([]);
      const syncService = createNotionSyncService({
        notionClient: mockClient,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      const dbConfig = createTestDbConfig(project.id);
      const result = await syncService.syncDatabase(dbConfig);

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(0);
      expect(result.createdCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle tasks without title gracefully', async () => {
      const project = createTestProject(testDb.db, 'Notion No Title Test');

      // Page with empty title
      const mockPages: NotionPage[] = [
        {
          id: 'page-no-title',
          properties: {
            Name: {
              type: 'title',
              title: [], // Empty title
            },
            Description: {
              type: 'rich_text',
              rich_text: [{ plain_text: 'Has description but no title' }],
            },
          },
          lastEditedTime: new Date().toISOString(),
        },
      ];

      const mockClient = createMockNotionClient(mockPages);
      const syncService = createNotionSyncService({
        notionClient: mockClient,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      const dbConfig = createTestDbConfig(project.id);
      const result = await syncService.syncDatabase(dbConfig);

      expect(result.success).toBe(true);
      expect(result.createdCount).toBe(1);

      // Verify task was created with fallback title
      const tasks = await repos.tasks!.list({
        scopeType: 'project',
        scopeId: project.id,
      });
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toContain('Notion Item');
    });
  });

  describe('Incremental sync', () => {
    it('should only process changes since last sync', async () => {
      const project = createTestProject(testDb.db, 'Notion Incremental Test');

      const lastSyncTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago

      // Only new/updated pages should be returned
      const mockPages: NotionPage[] = [
        createMockNotionPage('page-new', 'New Task', 'Created after last sync'),
      ];

      const mockClient = createMockNotionClient(mockPages);
      const syncService = createNotionSyncService({
        notionClient: mockClient,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      const dbConfig = createTestDbConfig(project.id, {
        lastSyncTimestamp: lastSyncTime,
      });

      const result = await syncService.syncDatabase(dbConfig);

      expect(result.success).toBe(true);
      expect(result.createdCount).toBe(1);

      // Verify queryAllPages was called (filter is applied internally)
      expect(mockClient.queryAllPages).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle individual page errors gracefully', async () => {
      const project = createTestProject(testDb.db, 'Notion Error Test');

      // Create a page with invalid data that will cause mapping error
      const mockPages: NotionPage[] = [
        createMockNotionPage('page-good', 'Good Task', 'Valid task'),
        {
          id: 'page-bad',
          properties: {
            // Missing required Name property
            Description: {
              type: 'rich_text',
              rich_text: [{ plain_text: 'No title' }],
            },
          },
          lastEditedTime: new Date().toISOString(),
        },
      ];

      const mockClient = createMockNotionClient(mockPages);
      const syncService = createNotionSyncService({
        notionClient: mockClient,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      const dbConfig = createTestDbConfig(project.id);
      const result = await syncService.syncDatabase(dbConfig);

      // Should still succeed overall (partial success)
      expect(result.syncedCount).toBeGreaterThanOrEqual(1);
      // Both pages should be processed (one with fallback title)
      expect(result.createdCount).toBe(2);
    });

    it('should handle API errors and create error evidence', async () => {
      const project = createTestProject(testDb.db, 'Notion API Error Test');

      const mockClient = createMockNotionClient([]);
      (mockClient.queryAllPages as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Notion API rate limited')
      );

      const syncService = createNotionSyncService({
        notionClient: mockClient,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      const dbConfig = createTestDbConfig(project.id);
      const result = await syncService.syncDatabase(dbConfig);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('rate limited');

      // Verify error evidence was created
      const evidenceList = await repos.evidence!.list({
        scopeType: 'project',
        scopeId: project.id,
      });

      const errorEvidence = evidenceList.find((e) => e.title?.includes('failed'));
      expect(errorEvidence).toBeDefined();
    });
  });

  describe('Dry run mode', () => {
    it('should not persist changes in dry run mode', async () => {
      const project = createTestProject(testDb.db, 'Notion Dry Run Test');

      const mockPages: NotionPage[] = [
        createMockNotionPage('page-dry-1', 'Dry Run Task 1'),
        createMockNotionPage('page-dry-2', 'Dry Run Task 2'),
      ];

      const mockClient = createMockNotionClient(mockPages);
      const syncService = createNotionSyncService({
        notionClient: mockClient,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      const dbConfig = createTestDbConfig(project.id);
      const result = await syncService.syncDatabase(dbConfig, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.createdCount).toBe(2);

      // Verify no tasks were actually created
      const tasks = await repos.tasks!.list({
        scopeType: 'project',
        scopeId: project.id,
      });
      expect(tasks.length).toBe(0);
    });
  });

  describe('Field mapping', () => {
    it('should map all supported Notion property types', async () => {
      const project = createTestProject(testDb.db, 'Notion Field Mapping Test');

      const mockPages: NotionPage[] = [
        {
          id: 'page-fields',
          properties: {
            Name: {
              type: 'title',
              title: [{ plain_text: 'Full Field Task' }],
            },
            Description: {
              type: 'rich_text',
              rich_text: [{ plain_text: 'Rich text description' }],
            },
            Status: {
              type: 'status',
              status: { name: 'In Progress' },
            },
            Category: {
              type: 'select',
              select: { name: 'Bug' },
            },
            Tags: {
              type: 'multi_select',
              multi_select: [{ name: 'urgent' }, { name: 'frontend' }],
            },
            DueDate: {
              type: 'date',
              date: { start: '2025-12-31' },
            },
          },
          lastEditedTime: new Date().toISOString(),
        },
      ];

      const mockClient = createMockNotionClient(mockPages);
      const syncService = createNotionSyncService({
        notionClient: mockClient,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      const dbConfig: DatabaseConfig = {
        notionDatabaseId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        projectScopeId: project.id,
        syncEnabled: true,
        fieldMappings: [
          { notionProperty: 'Name', taskField: 'title' },
          { notionProperty: 'Description', taskField: 'description' },
          { notionProperty: 'Status', taskField: 'status' },
          { notionProperty: 'Category', taskField: 'category' },
          { notionProperty: 'Tags', taskField: 'tags' },
          { notionProperty: 'DueDate', taskField: 'dueDate' },
        ],
      };

      const result = await syncService.syncDatabase(dbConfig);

      expect(result.success).toBe(true);
      expect(result.createdCount).toBe(1);

      const tasks = await repos.tasks!.list({
        scopeType: 'project',
        scopeId: project.id,
      });
      expect(tasks.length).toBe(1);

      const task = tasks[0];
      expect(task.title).toBe('Full Field Task');
      expect(task.description).toBe('Rich text description');
      expect(task.status).toBe('in_progress');
      expect(task.category).toBe('Bug');
      expect(task.dueDate).toBe('2025-12-31');
    });

    it('should store unmapped properties in metadata', async () => {
      const project = createTestProject(testDb.db, 'Notion Unmapped Test');

      const mockPages: NotionPage[] = [
        {
          id: 'page-unmapped',
          properties: {
            Name: {
              type: 'title',
              title: [{ plain_text: 'Task with Extra Fields' }],
            },
            CustomField: {
              type: 'rich_text',
              rich_text: [{ plain_text: 'Custom value' }],
            },
            Priority: {
              type: 'select',
              select: { name: 'High' },
            },
          },
          lastEditedTime: new Date().toISOString(),
        },
      ];

      const mockClient = createMockNotionClient(mockPages);
      const syncService = createNotionSyncService({
        notionClient: mockClient,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      // Only map Name, leave CustomField and Priority unmapped
      const dbConfig: DatabaseConfig = {
        notionDatabaseId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        projectScopeId: project.id,
        syncEnabled: true,
        fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
      };

      const result = await syncService.syncDatabase(dbConfig);

      expect(result.success).toBe(true);

      const tasks = await repos.tasks!.list({
        scopeType: 'project',
        scopeId: project.id,
      });
      expect(tasks.length).toBe(1);

      // Verify metadata contains unmapped properties
      const task = tasks[0];
      expect(task.metadata).toBeDefined();
      const metadata = JSON.parse(task.metadata!) as Record<string, unknown>;
      expect(metadata.notionPageId).toBe('page-unmapped');
      expect(metadata.notionProperties).toBeDefined();
    });
  });

  describe('Status mapping', () => {
    it('should map common Notion statuses to task statuses', async () => {
      const project = createTestProject(testDb.db, 'Notion Status Mapping Test');

      const statusMappings = [
        { notionStatus: 'Done', expectedStatus: 'done' },
        { notionStatus: 'Completed', expectedStatus: 'done' },
        { notionStatus: 'In Progress', expectedStatus: 'in_progress' },
        { notionStatus: 'Doing', expectedStatus: 'in_progress' },
        { notionStatus: 'Blocked', expectedStatus: 'blocked' },
        { notionStatus: 'In Review', expectedStatus: 'review' },
        { notionStatus: 'Backlog', expectedStatus: 'backlog' },
        { notionStatus: 'Cancelled', expectedStatus: 'wont_do' },
        { notionStatus: 'Unknown Status', expectedStatus: 'open' },
      ];

      for (const { notionStatus, expectedStatus } of statusMappings) {
        const mockPages: NotionPage[] = [
          createMockNotionPage(
            `page-status-${notionStatus}`,
            `Task ${notionStatus}`,
            '',
            notionStatus
          ),
        ];

        const mockClient = createMockNotionClient(mockPages);
        const syncService = createNotionSyncService({
          notionClient: mockClient,
          taskRepo: repos.tasks!,
          evidenceRepo: repos.evidence,
        });

        const dbConfig = createTestDbConfig(project.id);
        await syncService.syncDatabase(dbConfig);

        const tasks = await repos.tasks!.list({
          scopeType: 'project',
          scopeId: project.id,
        });

        const task = tasks.find((t) => t.title === `Task ${notionStatus}`);
        expect(task).toBeDefined();
        expect(task!.status).toBe(expectedStatus);
      }
    });
  });

  describe('Circuit breaker integration', () => {
    it('should report circuit breaker status', async () => {
      const mockClient = createMockNotionClient([]);

      const status = mockClient.getStatus();
      expect(status.isOpen).toBe(false);
      expect(status.failures).toBe(0);
    });
  });

  describe('Metadata tracking', () => {
    it('should store Notion page ID and database ID in task metadata', async () => {
      const project = createTestProject(testDb.db, 'Notion Metadata Test');

      const mockPages: NotionPage[] = [createMockNotionPage('unique-page-id-123', 'Metadata Task')];

      const mockClient = createMockNotionClient(mockPages);
      const syncService = createNotionSyncService({
        notionClient: mockClient,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      const dbConfig = createTestDbConfig(project.id);
      await syncService.syncDatabase(dbConfig);

      const tasks = await repos.tasks!.list({
        scopeType: 'project',
        scopeId: project.id,
      });
      expect(tasks.length).toBe(1);

      const metadata = JSON.parse(tasks[0].metadata!) as Record<string, unknown>;
      expect(metadata.notionPageId).toBe('unique-page-id-123');
      expect(metadata.notionDatabaseId).toBe(dbConfig.notionDatabaseId);
      expect(metadata.notionLastEditedTime).toBeDefined();
    });
  });

  describe('Agent ID tracking', () => {
    it('should use provided agent ID for audit trail', async () => {
      const project = createTestProject(testDb.db, 'Notion Agent ID Test');

      const mockPages: NotionPage[] = [createMockNotionPage('page-agent', 'Agent Task')];

      const mockClient = createMockNotionClient(mockPages);
      const syncService = createNotionSyncService({
        notionClient: mockClient,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      const dbConfig = createTestDbConfig(project.id);
      await syncService.syncDatabase(dbConfig, { agentId: 'test-agent-123' });

      const tasks = await repos.tasks!.list({
        scopeType: 'project',
        scopeId: project.id,
      });
      expect(tasks.length).toBe(1);
      expect(tasks[0].createdBy).toBe('test-agent-123');
    });
  });
});
