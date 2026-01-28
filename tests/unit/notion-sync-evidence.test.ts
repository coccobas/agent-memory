import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestRepositories } from '../fixtures/test-helpers.js';
import { createNotionSyncService } from '../../src/services/notion-sync/sync.service.js';
import type { NotionPage } from '../../src/services/notion-sync/client.js';

const TEST_DB_PATH = './data/test-notion-sync-evidence.db';

let testDb: ReturnType<typeof setupTestDb>;
let repos: ReturnType<typeof createTestRepositories>;

describe('Notion Sync Evidence', () => {
  beforeEach(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    repos = createTestRepositories(testDb);
  });

  afterEach(() => {
    if (testDb.sqlite) {
      testDb.sqlite.close();
    }
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('Evidence creation on successful sync', () => {
    it('should create evidence record after successful sync', async () => {
      const mockNotionClient = {
        queryAllPages: vi.fn().mockResolvedValue([
          {
            id: 'page-1',
            lastEditedTime: '2024-01-01T00:00:00Z',
            properties: {
              Name: {
                title: [{ plain_text: 'Test Task' }],
              },
            },
          } as NotionPage,
        ]),
      };

      const config = {
        notionDatabaseId: 'db-123',
        projectScopeId: 'proj-123',
        syncEnabled: true,
        fieldMappings: [
          {
            notionProperty: 'Name',
            taskField: 'title' as const,
            notionType: 'title' as const,
          },
        ],
      };

      const syncService = createNotionSyncService({
        notionClient: mockNotionClient as any,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      const result = await syncService.syncDatabase(config as any);

      expect(result.success).toBe(true);
      expect(result.createdCount).toBe(1);

      const evidence = await repos.evidence!.list({
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(evidence).toHaveLength(1);
      expect(evidence[0].title).toContain('Notion sync');
      expect(evidence[0].source).toBe('notion');
      expect(evidence[0].evidenceType).toBe('other');
    });

    it('should include sync statistics in evidence metadata', async () => {
      const mockNotionClient = {
        queryAllPages: vi.fn().mockResolvedValue([
          {
            id: 'page-1',
            lastEditedTime: '2024-01-01T00:00:00Z',
            properties: {
              Name: {
                title: [{ plain_text: 'Task 1' }],
              },
            },
          } as NotionPage,
          {
            id: 'page-2',
            lastEditedTime: '2024-01-01T00:00:00Z',
            properties: {
              Name: {
                title: [{ plain_text: 'Task 2' }],
              },
            },
          } as NotionPage,
        ]),
      };

      const config = {
        notionDatabaseId: 'db-456',
        projectScopeId: 'proj-456',
        syncEnabled: true,
        fieldMappings: [
          {
            notionProperty: 'Name',
            taskField: 'title' as const,
            notionType: 'title' as const,
          },
        ],
      };

      const syncService = createNotionSyncService({
        notionClient: mockNotionClient as any,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      await syncService.syncDatabase(config as any);

      const evidence = await repos.evidence!.list({
        scopeType: 'project',
        scopeId: 'proj-456',
      });

      expect(evidence).toHaveLength(1);
      const metadata = JSON.parse(evidence[0].metadata || '{}');
      expect(metadata.syncedCount).toBe(2);
      expect(metadata.createdCount).toBe(2);
      expect(metadata.updatedCount).toBe(0);
      expect(metadata.deletedCount).toBe(0);
      expect(metadata.notionDatabaseId).toBe('db-456');
      expect(metadata.success).toBe(true);
    });

    it('should mark evidence as successful when no errors occur', async () => {
      const mockNotionClient = {
        queryAllPages: vi.fn().mockResolvedValue([
          {
            id: 'page-1',
            lastEditedTime: '2024-01-01T00:00:00Z',
            properties: {
              Name: {
                title: [{ plain_text: 'Test' }],
              },
            },
          } as NotionPage,
        ]),
      };

      const config = {
        notionDatabaseId: 'db-789',
        projectScopeId: 'proj-789',
        syncEnabled: true,
        fieldMappings: [
          {
            notionProperty: 'Name',
            taskField: 'title' as const,
            notionType: 'title' as const,
          },
        ],
      };

      const syncService = createNotionSyncService({
        notionClient: mockNotionClient as any,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      await syncService.syncDatabase(config as any);

      const evidence = await repos.evidence!.list({
        scopeType: 'project',
        scopeId: 'proj-789',
      });

      const metadata = JSON.parse(evidence[0].metadata || '{}');
      expect(metadata.success).toBe(true);
      expect(metadata.errors).toEqual([]);
    });
  });

  describe('Evidence creation on failed sync', () => {
    it('should create evidence record even when sync fails', async () => {
      const mockNotionClient = {
        queryAllPages: vi.fn().mockRejectedValue(new Error('API Error')),
      };

      const config = {
        notionDatabaseId: 'db-fail',
        projectScopeId: 'proj-fail',
        syncEnabled: true,
        fieldMappings: [],
      };

      const syncService = createNotionSyncService({
        notionClient: mockNotionClient as any,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      const result = await syncService.syncDatabase(config as any);

      expect(result.success).toBe(false);

      const evidence = await repos.evidence!.list({
        scopeType: 'project',
        scopeId: 'proj-fail',
      });

      expect(evidence).toHaveLength(1);
      expect(evidence[0].title).toContain('failed');
      expect(evidence[0].source).toBe('notion');
    });

    it('should include error information in evidence metadata on failure', async () => {
      const mockNotionClient = {
        queryAllPages: vi.fn().mockRejectedValue(new Error('Connection timeout')),
      };

      const config = {
        notionDatabaseId: 'db-error',
        projectScopeId: 'proj-error',
        syncEnabled: true,
        fieldMappings: [],
      };

      const syncService = createNotionSyncService({
        notionClient: mockNotionClient as any,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      await syncService.syncDatabase(config as any);

      const evidence = await repos.evidence!.list({
        scopeType: 'project',
        scopeId: 'proj-error',
      });

      const metadata = JSON.parse(evidence[0].metadata || '{}');
      expect(metadata.success).toBe(false);
      expect(metadata.errors).toBeDefined();
      expect(Array.isArray(metadata.errors)).toBe(true);
      expect(metadata.errors.length).toBeGreaterThan(0);
    });

    it('should mark evidence as failed with appropriate title', async () => {
      const mockNotionClient = {
        queryAllPages: vi.fn().mockRejectedValue(new Error('Auth failed')),
      };

      const config = {
        notionDatabaseId: 'db-auth-fail',
        projectScopeId: 'proj-auth-fail',
        syncEnabled: true,
        fieldMappings: [],
      };

      const syncService = createNotionSyncService({
        notionClient: mockNotionClient as any,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      await syncService.syncDatabase(config as any);

      const evidence = await repos.evidence!.list({
        scopeType: 'project',
        scopeId: 'proj-auth-fail',
      });

      expect(evidence[0].title).toMatch(/failed/i);
      expect(evidence[0].description).toContain('Auth failed');
    });
  });

  describe('Evidence creation with optional repository', () => {
    it('should not create evidence if repository is not provided', async () => {
      const mockNotionClient = {
        queryAllPages: vi.fn().mockResolvedValue([
          {
            id: 'page-1',
            lastEditedTime: '2024-01-01T00:00:00Z',
            properties: {
              Name: {
                title: [{ plain_text: 'Test' }],
              },
            },
          } as NotionPage,
        ]),
      };

      const config = {
        notionDatabaseId: 'db-no-evidence',
        projectScopeId: 'proj-no-evidence',
        syncEnabled: true,
        fieldMappings: [
          {
            notionProperty: 'Name',
            taskField: 'title' as const,
            notionType: 'title' as const,
          },
        ],
      };

      const syncService = createNotionSyncService({
        notionClient: mockNotionClient as any,
        taskRepo: repos.tasks!,
      });

      const result = await syncService.syncDatabase(config as any);

      expect(result.success).toBe(true);

      const evidence = await repos.evidence!.list({
        scopeType: 'project',
        scopeId: 'proj-no-evidence',
      });

      expect(evidence).toHaveLength(0);
    });

    it('should handle evidence creation errors gracefully', async () => {
      const mockNotionClient = {
        queryAllPages: vi.fn().mockResolvedValue([
          {
            id: 'page-1',
            lastEditedTime: '2024-01-01T00:00:00Z',
            properties: {
              Name: {
                title: [{ plain_text: 'Test' }],
              },
            },
          } as NotionPage,
        ]),
      };

      const mockEvidenceRepo = {
        create: vi.fn().mockRejectedValue(new Error('Evidence creation failed')),
        getById: vi.fn(),
        list: vi.fn(),
        deactivate: vi.fn(),
        listByType: vi.fn(),
        listBySource: vi.fn(),
        getByUrl: vi.fn(),
        getByFilePath: vi.fn(),
      };

      const config = {
        notionDatabaseId: 'db-evidence-error',
        projectScopeId: 'proj-evidence-error',
        syncEnabled: true,
        fieldMappings: [
          {
            notionProperty: 'Name',
            taskField: 'title' as const,
            notionType: 'title' as const,
          },
        ],
      };

      const syncService = createNotionSyncService({
        notionClient: mockNotionClient as any,
        taskRepo: repos.tasks!,
        evidenceRepo: mockEvidenceRepo as any,
      });

      const result = await syncService.syncDatabase(config as any);

      expect(result.success).toBe(true);
      expect(mockEvidenceRepo.create).toHaveBeenCalled();
    });
  });

  describe('Evidence metadata completeness', () => {
    it('should include all required metadata fields', async () => {
      const mockNotionClient = {
        queryAllPages: vi.fn().mockResolvedValue([
          {
            id: 'page-1',
            lastEditedTime: '2024-01-01T00:00:00Z',
            properties: {
              Name: {
                title: [{ plain_text: 'Complete Task' }],
              },
            },
          } as NotionPage,
        ]),
      };

      const config = {
        notionDatabaseId: 'db-complete',
        projectScopeId: 'proj-complete',
        syncEnabled: true,
        fieldMappings: [
          {
            notionProperty: 'Name',
            taskField: 'title' as const,
            notionType: 'title' as const,
          },
        ],
      };

      const syncService = createNotionSyncService({
        notionClient: mockNotionClient as any,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      await syncService.syncDatabase(config as any);

      const evidence = await repos.evidence!.list({
        scopeType: 'project',
        scopeId: 'proj-complete',
      });

      const metadata = JSON.parse(evidence[0].metadata || '{}');

      expect(metadata).toHaveProperty('notionDatabaseId');
      expect(metadata).toHaveProperty('syncedCount');
      expect(metadata).toHaveProperty('createdCount');
      expect(metadata).toHaveProperty('updatedCount');
      expect(metadata).toHaveProperty('deletedCount');
      expect(metadata).toHaveProperty('errors');
      expect(metadata).toHaveProperty('syncTimestamp');
      expect(metadata).toHaveProperty('success');
    });

    it('should set createdBy to notion-sync-service', async () => {
      const mockNotionClient = {
        queryAllPages: vi.fn().mockResolvedValue([
          {
            id: 'page-1',
            lastEditedTime: '2024-01-01T00:00:00Z',
            properties: {
              Name: {
                title: [{ plain_text: 'Test' }],
              },
            },
          } as NotionPage,
        ]),
      };

      const config = {
        notionDatabaseId: 'db-creator',
        projectScopeId: 'proj-creator',
        syncEnabled: true,
        fieldMappings: [
          {
            notionProperty: 'Name',
            taskField: 'title' as const,
            notionType: 'title' as const,
          },
        ],
      };

      const syncService = createNotionSyncService({
        notionClient: mockNotionClient as any,
        taskRepo: repos.tasks!,
        evidenceRepo: repos.evidence,
      });

      await syncService.syncDatabase(config as any);

      const evidence = await repos.evidence!.list({
        scopeType: 'project',
        scopeId: 'proj-creator',
      });

      expect(evidence[0].createdBy).toBe('notion-sync-service');
    });
  });
});
