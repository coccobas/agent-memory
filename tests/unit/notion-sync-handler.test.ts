import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notionSyncHandlers } from '../../src/mcp/handlers/notion-sync.handler.js';
import type { AppContext } from '../../src/core/context.js';
import type { SyncResult } from '../../src/services/notion-sync/sync.service.js';

interface SyncHandlerResult {
  success: boolean;
  syncedDatabases: number;
  dryRun?: boolean;
  results: SyncResult[];
}

interface StatusHandlerResult {
  scheduler: {
    running: boolean;
    schedule: string | null;
    nextRun: Date | null;
    lastRun: Date | null;
    lastRunSuccess: boolean | null;
    lastRunError: string | null;
  };
  config: {
    loaded: boolean;
    databaseCount: number;
    error: string | null;
  };
}

interface ListDatabasesResult {
  databases: Array<{
    notionDatabaseId: string;
    projectScopeId: string;
    syncEnabled: boolean;
    fieldMappingCount: number;
    lastSyncTimestamp?: string;
  }>;
  totalCount: number;
  enabledCount: number;
}

vi.mock('../../src/services/notion-sync/config.js', () => ({
  loadNotionSyncConfig: vi.fn(),
}));

vi.mock('../../src/services/notion-sync/client.js', () => ({
  createNotionClient: vi.fn(),
}));

vi.mock('../../src/services/notion-sync/sync.service.js', () => ({
  createNotionSyncService: vi.fn(),
}));

vi.mock('../../src/services/notion-sync/scheduler.service.js', () => ({
  getNotionSyncSchedulerStatus: vi.fn(),
}));

import { loadNotionSyncConfig } from '../../src/services/notion-sync/config.js';
import { createNotionClient } from '../../src/services/notion-sync/client.js';
import { createNotionSyncService } from '../../src/services/notion-sync/sync.service.js';
import { getNotionSyncSchedulerStatus } from '../../src/services/notion-sync/scheduler.service.js';

const mockLoadConfig = loadNotionSyncConfig as ReturnType<typeof vi.fn>;
const mockCreateClient = createNotionClient as ReturnType<typeof vi.fn>;
const mockCreateSyncService = createNotionSyncService as ReturnType<typeof vi.fn>;
const mockGetSchedulerStatus = getNotionSyncSchedulerStatus as ReturnType<typeof vi.fn>;

describe('Notion Sync Handler', () => {
  let mockContext: AppContext;
  let mockSyncService: { syncDatabase: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      db: {} as AppContext['db'],
      sqlite: {} as AppContext['sqlite'],
      repos: {
        tasks: {} as AppContext['repos']['tasks'],
        evidence: {} as AppContext['repos']['evidence'],
      } as AppContext['repos'],
      services: {} as AppContext['services'],
    } as AppContext;

    mockSyncService = {
      syncDatabase: vi.fn(),
    };

    mockCreateClient.mockReturnValue({});
    mockCreateSyncService.mockReturnValue(mockSyncService);
  });

  describe('sync', () => {
    it('should trigger manual sync and return results', async () => {
      const mockConfig = {
        databases: [
          {
            notionDatabaseId: 'db-123',
            projectScopeId: 'proj-1',
            syncEnabled: true,
            fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
          },
        ],
      };
      mockLoadConfig.mockReturnValue(mockConfig);

      const mockResult: SyncResult = {
        databaseId: 'db-123',
        projectScopeId: 'proj-1',
        success: true,
        syncedCount: 5,
        createdCount: 3,
        updatedCount: 2,
        deletedCount: 0,
        skippedCount: 0,
        errors: [],
        startedAt: '2026-01-28T00:00:00.000Z',
        completedAt: '2026-01-28T00:00:01.000Z',
        newSyncTimestamp: '2026-01-28T00:00:01.000Z',
      };
      mockSyncService.syncDatabase.mockResolvedValue(mockResult);

      const result = (await notionSyncHandlers.sync(mockContext, {})) as SyncHandlerResult;

      expect(result.success).toBe(true);
      expect(result.syncedDatabases).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].syncedCount).toBe(5);
    });

    it('should sync specific database when databaseId provided', async () => {
      const mockConfig = {
        databases: [
          {
            notionDatabaseId: 'db-123',
            projectScopeId: 'proj-1',
            syncEnabled: true,
            fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
          },
          {
            notionDatabaseId: 'db-456',
            projectScopeId: 'proj-2',
            syncEnabled: true,
            fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
          },
        ],
      };
      mockLoadConfig.mockReturnValue(mockConfig);

      const mockResult: SyncResult = {
        databaseId: 'db-123',
        projectScopeId: 'proj-1',
        success: true,
        syncedCount: 3,
        createdCount: 3,
        updatedCount: 0,
        deletedCount: 0,
        skippedCount: 0,
        errors: [],
        startedAt: '2026-01-28T00:00:00.000Z',
        completedAt: '2026-01-28T00:00:01.000Z',
        newSyncTimestamp: '2026-01-28T00:00:01.000Z',
      };
      mockSyncService.syncDatabase.mockResolvedValue(mockResult);

      const result = (await notionSyncHandlers.sync(mockContext, {
        databaseId: 'db-123',
      })) as SyncHandlerResult;

      expect(result.success).toBe(true);
      expect(result.syncedDatabases).toBe(1);
      expect(mockSyncService.syncDatabase).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid database ID', async () => {
      const mockConfig = {
        databases: [
          {
            notionDatabaseId: 'db-123',
            projectScopeId: 'proj-1',
            syncEnabled: true,
            fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
          },
        ],
      };
      mockLoadConfig.mockReturnValue(mockConfig);

      await expect(
        notionSyncHandlers.sync(mockContext, { databaseId: 'nonexistent-db' })
      ).rejects.toThrow();
    });

    it('should skip disabled databases', async () => {
      const mockConfig = {
        databases: [
          {
            notionDatabaseId: 'db-123',
            projectScopeId: 'proj-1',
            syncEnabled: false,
            fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
          },
        ],
      };
      mockLoadConfig.mockReturnValue(mockConfig);

      const result = (await notionSyncHandlers.sync(mockContext, {})) as SyncHandlerResult;

      expect(result.success).toBe(true);
      expect(result.syncedDatabases).toBe(0);
      expect(mockSyncService.syncDatabase).not.toHaveBeenCalled();
    });

    it('should pass fullSync and dryRun options', async () => {
      const mockConfig = {
        databases: [
          {
            notionDatabaseId: 'db-123',
            projectScopeId: 'proj-1',
            syncEnabled: true,
            fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
          },
        ],
      };
      mockLoadConfig.mockReturnValue(mockConfig);

      const mockResult: SyncResult = {
        databaseId: 'db-123',
        projectScopeId: 'proj-1',
        success: true,
        syncedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        deletedCount: 0,
        skippedCount: 0,
        errors: [],
        startedAt: '2026-01-28T00:00:00.000Z',
        completedAt: '2026-01-28T00:00:01.000Z',
        newSyncTimestamp: '2026-01-28T00:00:01.000Z',
      };
      mockSyncService.syncDatabase.mockResolvedValue(mockResult);

      const result = (await notionSyncHandlers.sync(mockContext, {
        fullSync: true,
        dryRun: true,
      })) as SyncHandlerResult;

      expect(result.dryRun).toBe(true);
      expect(mockSyncService.syncDatabase).toHaveBeenCalledWith(expect.any(Object), {
        fullSync: true,
        dryRun: true,
      });
    });
  });

  describe('status', () => {
    it('should return scheduler and config status', async () => {
      const mockConfig = {
        databases: [
          {
            notionDatabaseId: 'db-123',
            projectScopeId: 'proj-1',
            syncEnabled: true,
            fieldMappings: [],
          },
          {
            notionDatabaseId: 'db-456',
            projectScopeId: 'proj-2',
            syncEnabled: false,
            fieldMappings: [],
          },
        ],
      };
      mockLoadConfig.mockReturnValue(mockConfig);

      mockGetSchedulerStatus.mockReturnValue({
        running: true,
        schedule: '0 5 * * *',
        nextRun: new Date('2026-01-29T05:00:00.000Z'),
        lastRun: new Date('2026-01-28T05:00:00.000Z'),
        lastRunSuccess: true,
        lastRunError: null,
      });

      const result = (await notionSyncHandlers.status(mockContext, {})) as StatusHandlerResult;

      expect(result.scheduler.running).toBe(true);
      expect(result.config.loaded).toBe(true);
      expect(result.config.databaseCount).toBe(2);
    });

    it('should handle config load error gracefully', async () => {
      mockLoadConfig.mockImplementation(() => {
        throw new Error('Config file not found');
      });

      mockGetSchedulerStatus.mockReturnValue({
        running: false,
        schedule: null,
        nextRun: null,
        lastRun: null,
        lastRunSuccess: null,
        lastRunError: null,
      });

      const result = (await notionSyncHandlers.status(mockContext, {})) as StatusHandlerResult;

      expect(result.config.loaded).toBe(false);
      expect(result.config.error).toContain('Config file not found');
      expect(result.scheduler.running).toBe(false);
    });
  });

  describe('list_databases', () => {
    it('should return configured databases', async () => {
      const mockConfig = {
        databases: [
          {
            notionDatabaseId: 'db-123',
            projectScopeId: 'proj-1',
            syncEnabled: true,
            fieldMappings: [
              { notionProperty: 'Name', taskField: 'title' },
              { notionProperty: 'Status', taskField: 'status' },
            ],
            lastSyncTimestamp: '2026-01-28T00:00:00.000Z',
          },
          {
            notionDatabaseId: 'db-456',
            projectScopeId: 'proj-2',
            syncEnabled: false,
            fieldMappings: [{ notionProperty: 'Title', taskField: 'title' }],
          },
        ],
      };
      mockLoadConfig.mockReturnValue(mockConfig);

      const result = (await notionSyncHandlers.list_databases(
        mockContext,
        {}
      )) as ListDatabasesResult;

      expect(result.totalCount).toBe(2);
      expect(result.enabledCount).toBe(1);
      expect(result.databases).toHaveLength(2);
      expect(result.databases[0]).toEqual({
        notionDatabaseId: 'db-123',
        projectScopeId: 'proj-1',
        syncEnabled: true,
        fieldMappingCount: 2,
        lastSyncTimestamp: '2026-01-28T00:00:00.000Z',
      });
      expect(result.databases[1]).toEqual({
        notionDatabaseId: 'db-456',
        projectScopeId: 'proj-2',
        syncEnabled: false,
        fieldMappingCount: 1,
        lastSyncTimestamp: undefined,
      });
    });

    it('should throw error when config not found', async () => {
      mockLoadConfig.mockImplementation(() => {
        throw new Error('Config file not found');
      });

      await expect(notionSyncHandlers.list_databases(mockContext, {})).rejects.toThrow(
        'Config file not found'
      );
    });

    it('should use custom config path when provided', async () => {
      const mockConfig = {
        databases: [],
      };
      mockLoadConfig.mockReturnValue(mockConfig);

      await notionSyncHandlers.list_databases(mockContext, {
        configPath: '/custom/path/config.json',
      });

      expect(mockLoadConfig).toHaveBeenCalledWith('/custom/path/config.json');
    });
  });
});
