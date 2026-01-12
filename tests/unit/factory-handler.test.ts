import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCrudHandlers, type BaseEntry } from '../../src/mcp/handlers/factory.js';
import type { AppContext } from '../../src/core/context.js';
import type { ScopeType } from '../../src/db/schema.js';

vi.mock('../../src/db/connection.js', () => ({
  transactionWithDb: vi.fn((_db, fn) => fn()),
}));
vi.mock('../../src/services/duplicate.service.js', () => ({
  checkForDuplicates: vi.fn().mockReturnValue({ isDuplicate: false }),
}));
vi.mock('../../src/services/audit.service.js', () => ({
  logAction: vi.fn(),
}));
vi.mock('../../src/services/redflag.service.js', () => ({
  createRedFlagService: vi.fn().mockReturnValue({
    detectRedFlags: vi.fn().mockResolvedValue([]),
  }),
}));
vi.mock('../../src/services/validation.service.js', () => ({
  createValidationService: vi.fn().mockReturnValue({
    validateEntry: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
  }),
}));
vi.mock('../../src/utils/events.js', () => ({
  emitEntryChanged: vi.fn(),
}));
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

interface TestEntry extends BaseEntry {
  name: string;
  content: string;
  currentVersion?: { content: string };
}

interface CreateInput {
  scopeType: ScopeType;
  scopeId?: string;
  name: string;
  content: string;
}

interface UpdateInput {
  content?: string;
}

describe('Handler Factory', () => {
  let mockContext: AppContext;
  let mockRepo: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    getByName: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    getHistory: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let mockPermissionService: {
    check: ReturnType<typeof vi.fn>;
    checkBatch: ReturnType<typeof vi.fn>;
  };
  let handlers: ReturnType<typeof createCrudHandlers<TestEntry, CreateInput, UpdateInput>>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = {
      create: vi.fn(),
      update: vi.fn(),
      getById: vi.fn(),
      getByName: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      getHistory: vi.fn().mockResolvedValue([]),
      deactivate: vi.fn(),
      delete: vi.fn(),
    };
    mockPermissionService = {
      check: vi.fn().mockReturnValue(true),
      checkBatch: vi.fn().mockReturnValue(new Map()),
    };
    mockContext = {
      db: {} as any,
      sqlite: {} as any,
      repos: {
        guidelines: mockRepo,
      } as any,
      services: {
        permission: mockPermissionService,
      } as any,
    };

    handlers = createCrudHandlers<TestEntry, CreateInput, UpdateInput>({
      entryType: 'guideline',
      getRepo: () => mockRepo as any,
      responseKey: 'guideline',
      responseListKey: 'guidelines',
      nameField: 'name',
      extractAddParams: (params, defaults) => ({
        scopeType: defaults.scopeType!,
        scopeId: defaults.scopeId,
        name: params.name as string,
        content: params.content as string,
      }),
      extractUpdateParams: (params) => ({
        content: params.content as string | undefined,
      }),
      getNameValue: (params) => params.name as string,
      getContentForRedFlags: (entry) => entry.currentVersion?.content || '',
      getValidationData: (params) => params,
    });
  });

  describe('add', () => {
    it('should create an entry', async () => {
      mockRepo.create.mockResolvedValue({
        id: 'entry-1',
        name: 'Test',
        content: 'Content',
        scopeType: 'project',
        scopeId: 'proj-1',
        isActive: true,
        createdAt: new Date().toISOString(),
      });

      const result = await handlers.add(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
        agentId: 'agent-1',
        name: 'Test',
        content: 'Content',
      });

      expect(result.success).toBe(true);
      expect(result.guideline.name).toBe('Test');
    });

    it('should throw when scopeId missing for non-global scope', async () => {
      await expect(
        handlers.add(mockContext, {
          scopeType: 'project',
          agentId: 'agent-1',
          name: 'Test',
          content: 'Content',
        })
      ).rejects.toThrow('scopeId');
    });

    it('should allow global scope without scopeId', async () => {
      mockRepo.create.mockResolvedValue({
        id: 'entry-1',
        scopeType: 'global',
        scopeId: null,
        isActive: true,
        createdAt: new Date().toISOString(),
      });

      const result = await handlers.add(mockContext, {
        scopeType: 'global',
        agentId: 'agent-1',
        name: 'Test',
        content: 'Content',
      });

      expect(result.success).toBe(true);
    });

    it('should throw on permission denied', async () => {
      mockPermissionService.check.mockReturnValue(false);

      await expect(
        handlers.add(mockContext, {
          scopeType: 'project',
          scopeId: 'proj-1',
          agentId: 'agent-1',
          name: 'Test',
          content: 'Content',
        })
      ).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update an entry', async () => {
      mockRepo.getById.mockResolvedValue({
        id: 'entry-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        isActive: true,
      });
      mockRepo.update.mockResolvedValue({
        id: 'entry-1',
        content: 'Updated',
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      const result = await handlers.update(mockContext, {
        id: 'entry-1',
        agentId: 'agent-1',
        content: 'Updated',
      });

      expect(result.success).toBe(true);
    });

    it('should throw when entry not found', async () => {
      mockRepo.getById.mockResolvedValue(undefined);

      await expect(
        handlers.update(mockContext, {
          id: 'nonexistent',
          agentId: 'agent-1',
        })
      ).rejects.toThrow();
    });

    it('should throw when update returns undefined', async () => {
      mockRepo.getById.mockResolvedValue({
        id: 'entry-1',
        scopeType: 'project',
        scopeId: 'proj-1',
      });
      mockRepo.update.mockResolvedValue(undefined);

      await expect(
        handlers.update(mockContext, {
          id: 'entry-1',
          agentId: 'agent-1',
        })
      ).rejects.toThrow();
    });
  });

  describe('get', () => {
    it('should get entry by id', async () => {
      mockRepo.getById.mockResolvedValue({
        id: 'entry-1',
        name: 'Test',
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      const result = await handlers.get(mockContext, {
        id: 'entry-1',
        agentId: 'agent-1',
      });

      expect(result.guideline.id).toBe('entry-1');
    });

    it('should get entry by name', async () => {
      mockRepo.getByName.mockResolvedValue({
        id: 'entry-1',
        name: 'Test',
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      const result = await handlers.get(mockContext, {
        name: 'Test',
        scopeType: 'project',
        agentId: 'agent-1',
      });

      expect(result.guideline.name).toBe('Test');
    });

    it('should throw when neither id nor name provided', async () => {
      await expect(
        handlers.get(mockContext, { agentId: 'agent-1' })
      ).rejects.toThrow('id or name');
    });

    it('should throw when entry not found', async () => {
      mockRepo.getById.mockResolvedValue(undefined);

      await expect(
        handlers.get(mockContext, { id: 'nonexistent', agentId: 'agent-1' })
      ).rejects.toThrow();
    });

    it('should throw when name used without scopeType', async () => {
      await expect(
        handlers.get(mockContext, { name: 'Test', agentId: 'agent-1' })
      ).rejects.toThrow('scopeType');
    });
  });

  describe('list', () => {
    it('should list entries', async () => {
      const entries = [
        { id: 'e-1', scopeType: 'project', scopeId: 'p-1' },
        { id: 'e-2', scopeType: 'project', scopeId: 'p-1' },
      ];
      mockRepo.list.mockResolvedValue(entries);
      mockPermissionService.checkBatch.mockReturnValue(
        new Map([['e-1', true], ['e-2', true]])
      );

      const result = await handlers.list(mockContext, {
        agentId: 'agent-1',
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.guidelines).toHaveLength(2);
      expect(result.meta.returnedCount).toBe(2);
    });

    it('should filter by permission', async () => {
      const entries = [
        { id: 'e-1', scopeType: 'project', scopeId: 'p-1' },
        { id: 'e-2', scopeType: 'project', scopeId: 'p-1' },
      ];
      mockRepo.list.mockResolvedValue(entries);
      mockPermissionService.checkBatch.mockReturnValue(
        new Map([['e-1', true], ['e-2', false]])
      );

      const result = await handlers.list(mockContext, {
        agentId: 'agent-1',
      });

      expect(result.guidelines).toHaveLength(1);
    });

    it('should indicate hasMore when more records exist', async () => {
      const entries = Array.from({ length: 21 }, (_, i) => ({
        id: `e-${i}`,
        scopeType: 'global' as ScopeType,
        scopeId: null,
      }));
      mockRepo.list.mockResolvedValue(entries);
      mockPermissionService.checkBatch.mockReturnValue(
        new Map(entries.slice(0, 20).map(e => [e.id, true]))
      );

      const result = await handlers.list(mockContext, {
        agentId: 'agent-1',
        limit: 20,
      });

      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.nextCursor).toBeDefined();
    });
  });

  describe('history', () => {
    it('should get entry history', async () => {
      mockRepo.getById.mockResolvedValue({
        id: 'entry-1',
        scopeType: 'project',
        scopeId: 'proj-1',
      });
      mockRepo.getHistory.mockResolvedValue([
        { version: 1, content: 'v1' },
        { version: 2, content: 'v2' },
      ]);

      const result = await handlers.history(mockContext, {
        id: 'entry-1',
        agentId: 'agent-1',
      });

      expect(result.versions).toHaveLength(2);
    });
  });

  describe('deactivate', () => {
    it('should deactivate an entry', async () => {
      mockRepo.getById.mockResolvedValue({
        id: 'entry-1',
        scopeType: 'project',
        scopeId: 'proj-1',
      });
      mockRepo.deactivate.mockResolvedValue(true);

      const result = await handlers.deactivate(mockContext, {
        id: 'entry-1',
        agentId: 'agent-1',
      });

      expect(result.success).toBe(true);
    });

    it('should throw when deactivate fails', async () => {
      mockRepo.getById.mockResolvedValue({
        id: 'entry-1',
        scopeType: 'project',
        scopeId: 'proj-1',
      });
      mockRepo.deactivate.mockResolvedValue(false);

      await expect(
        handlers.deactivate(mockContext, {
          id: 'entry-1',
          agentId: 'agent-1',
        })
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('should permanently delete an entry', async () => {
      mockRepo.getById.mockResolvedValue({
        id: 'entry-1',
        scopeType: 'project',
        scopeId: 'proj-1',
      });
      mockRepo.delete.mockResolvedValue(true);

      const result = await handlers.delete(mockContext, {
        id: 'entry-1',
        agentId: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('permanently deleted');
    });
  });

  describe('bulk_add', () => {
    it('should add multiple entries', async () => {
      // Setup batch permission check to allow all
      mockPermissionService.checkBatch.mockReturnValue(
        new Map([['new-0', true], ['new-1', true]])
      );
      mockRepo.create
        .mockResolvedValueOnce({ id: 'e-1', name: 'Entry 1' })
        .mockResolvedValueOnce({ id: 'e-2', name: 'Entry 2' });

      const result = await handlers.bulk_add(mockContext, {
        agentId: 'agent-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        entries: [
          { name: 'Entry 1', content: 'Content 1' },
          { name: 'Entry 2', content: 'Content 2' },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });

    it('should use checkBatch for permission checking', async () => {
      mockPermissionService.checkBatch.mockReturnValue(
        new Map([['new-0', true], ['new-1', true]])
      );
      mockRepo.create.mockResolvedValue({ id: 'e-1' });

      await handlers.bulk_add(mockContext, {
        agentId: 'agent-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        entries: [
          { name: 'Entry 1', content: 'Content 1' },
          { name: 'Entry 2', content: 'Content 2' },
        ],
      });

      // Verify checkBatch was called with synthetic IDs
      expect(mockPermissionService.checkBatch).toHaveBeenCalledWith(
        'agent-1',
        'write',
        expect.arrayContaining([
          expect.objectContaining({ id: 'new-0', scopeType: 'project', scopeId: 'proj-1' }),
          expect.objectContaining({ id: 'new-1', scopeType: 'project', scopeId: 'proj-1' }),
        ])
      );
    });

    it('should fail-fast when any entry permission is denied', async () => {
      // First entry allowed, second denied
      mockPermissionService.checkBatch.mockReturnValue(
        new Map([['new-0', true], ['new-1', false]])
      );

      await expect(
        handlers.bulk_add(mockContext, {
          agentId: 'agent-1',
          scopeType: 'project',
          scopeId: 'proj-1',
          entries: [
            { name: 'Entry 1', content: 'Content 1' },
            { name: 'Entry 2', content: 'Content 2' },
          ],
        })
      ).rejects.toThrow();

      // Verify create was never called (fail-fast before any creation)
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('should throw on empty entries', async () => {
      await expect(
        handlers.bulk_add(mockContext, {
          agentId: 'agent-1',
          scopeType: 'project',
          scopeId: 'proj-1',
          entries: [],
        })
      ).rejects.toThrow('non-empty');
    });

    it('should allow per-entry scope overrides', async () => {
      mockPermissionService.checkBatch.mockReturnValue(new Map([['new-0', true]]));
      mockRepo.create.mockResolvedValue({ id: 'e-1' });

      await handlers.bulk_add(mockContext, {
        agentId: 'agent-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        entries: [
          { name: 'Entry 1', content: 'Content', scopeType: 'global' },
        ],
      });

      // Verify checkBatch used entry-level scopeType override
      // Note: scopeId falls back to default when not explicitly overridden
      expect(mockPermissionService.checkBatch).toHaveBeenCalledWith(
        'agent-1',
        'write',
        expect.arrayContaining([
          expect.objectContaining({ id: 'new-0', scopeType: 'global' }),
        ])
      );

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ scopeType: 'global' })
      );
    });

    it('should respect per-entry scopeId override', async () => {
      mockPermissionService.checkBatch.mockReturnValue(new Map([['new-0', true]]));
      mockRepo.create.mockResolvedValue({ id: 'e-1' });

      await handlers.bulk_add(mockContext, {
        agentId: 'agent-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        entries: [
          { name: 'Entry 1', content: 'Content', scopeType: 'org', scopeId: 'org-1' },
        ],
      });

      // Verify checkBatch used both entry-level overrides
      expect(mockPermissionService.checkBatch).toHaveBeenCalledWith(
        'agent-1',
        'write',
        expect.arrayContaining([
          expect.objectContaining({ id: 'new-0', scopeType: 'org', scopeId: 'org-1' }),
        ])
      );
    });
  });

  describe('bulk_update', () => {
    it('should update multiple entries', async () => {
      mockRepo.getById
        .mockResolvedValueOnce({ id: 'e-1', scopeType: 'project', scopeId: 'p-1' })
        .mockResolvedValueOnce({ id: 'e-2', scopeType: 'project', scopeId: 'p-1' });
      mockPermissionService.checkBatch.mockReturnValue(
        new Map([['e-1', true], ['e-2', true]])
      );
      mockRepo.update
        .mockResolvedValue({ id: 'e-1', scopeType: 'project', scopeId: 'p-1' });

      const result = await handlers.bulk_update(mockContext, {
        agentId: 'agent-1',
        updates: [
          { id: 'e-1', content: 'Updated 1' },
          { id: 'e-2', content: 'Updated 2' },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });

    it('should use checkBatch for permission checking', async () => {
      mockRepo.getById
        .mockResolvedValueOnce({ id: 'e-1', scopeType: 'project', scopeId: 'p-1' })
        .mockResolvedValueOnce({ id: 'e-2', scopeType: 'org', scopeId: 'org-1' });
      mockPermissionService.checkBatch.mockReturnValue(
        new Map([['e-1', true], ['e-2', true]])
      );
      mockRepo.update.mockResolvedValue({ id: 'e-1' });

      await handlers.bulk_update(mockContext, {
        agentId: 'agent-1',
        updates: [
          { id: 'e-1', content: 'Updated 1' },
          { id: 'e-2', content: 'Updated 2' },
        ],
      });

      // Verify checkBatch was called with actual entry IDs and scopes
      expect(mockPermissionService.checkBatch).toHaveBeenCalledWith(
        'agent-1',
        'write',
        expect.arrayContaining([
          expect.objectContaining({ id: 'e-1', scopeType: 'project', scopeId: 'p-1' }),
          expect.objectContaining({ id: 'e-2', scopeType: 'org', scopeId: 'org-1' }),
        ])
      );
    });

    it('should fail-fast when any entry permission is denied', async () => {
      mockRepo.getById
        .mockResolvedValueOnce({ id: 'e-1', scopeType: 'project', scopeId: 'p-1' })
        .mockResolvedValueOnce({ id: 'e-2', scopeType: 'project', scopeId: 'p-1' });
      // Second entry permission denied
      mockPermissionService.checkBatch.mockReturnValue(
        new Map([['e-1', true], ['e-2', false]])
      );

      await expect(
        handlers.bulk_update(mockContext, {
          agentId: 'agent-1',
          updates: [
            { id: 'e-1', content: 'Updated 1' },
            { id: 'e-2', content: 'Updated 2' },
          ],
        })
      ).rejects.toThrow();

      // Verify update was never called (fail-fast before any update)
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('should throw on empty updates', async () => {
      await expect(
        handlers.bulk_update(mockContext, {
          agentId: 'agent-1',
          updates: [],
        })
      ).rejects.toThrow('non-empty');
    });
  });

  describe('bulk_delete', () => {
    it('should delete multiple entries', async () => {
      mockRepo.getById
        .mockResolvedValueOnce({ id: 'e-1', scopeType: 'project', scopeId: 'p-1' })
        .mockResolvedValueOnce({ id: 'e-2', scopeType: 'project', scopeId: 'p-1' });
      mockPermissionService.checkBatch.mockReturnValue(
        new Map([['e-1', true], ['e-2', true]])
      );
      mockRepo.deactivate.mockResolvedValue(true);

      const result = await handlers.bulk_delete(mockContext, {
        agentId: 'agent-1',
        ids: ['e-1', 'e-2'],
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });

    it('should use checkBatch for permission checking', async () => {
      mockRepo.getById
        .mockResolvedValueOnce({ id: 'e-1', scopeType: 'project', scopeId: 'p-1' })
        .mockResolvedValueOnce({ id: 'e-2', scopeType: 'global', scopeId: null });
      mockPermissionService.checkBatch.mockReturnValue(
        new Map([['e-1', true], ['e-2', true]])
      );
      mockRepo.deactivate.mockResolvedValue(true);

      await handlers.bulk_delete(mockContext, {
        agentId: 'agent-1',
        ids: ['e-1', 'e-2'],
      });

      // Verify checkBatch was called with actual entry IDs and scopes
      expect(mockPermissionService.checkBatch).toHaveBeenCalledWith(
        'agent-1',
        'write',
        expect.arrayContaining([
          expect.objectContaining({ id: 'e-1', scopeType: 'project', scopeId: 'p-1' }),
          expect.objectContaining({ id: 'e-2', scopeType: 'global', scopeId: null }),
        ])
      );
    });

    it('should fail-fast when any entry permission is denied', async () => {
      mockRepo.getById
        .mockResolvedValueOnce({ id: 'e-1', scopeType: 'project', scopeId: 'p-1' })
        .mockResolvedValueOnce({ id: 'e-2', scopeType: 'project', scopeId: 'p-1' });
      // Second entry permission denied
      mockPermissionService.checkBatch.mockReturnValue(
        new Map([['e-1', true], ['e-2', false]])
      );

      await expect(
        handlers.bulk_delete(mockContext, {
          agentId: 'agent-1',
          ids: ['e-1', 'e-2'],
        })
      ).rejects.toThrow();

      // Verify deactivate was never called (fail-fast before any deletion)
      expect(mockRepo.deactivate).not.toHaveBeenCalled();
    });

    it('should throw on empty ids', async () => {
      await expect(
        handlers.bulk_delete(mockContext, {
          agentId: 'agent-1',
          ids: [],
        })
      ).rejects.toThrow('non-empty');
    });

    it('should throw on non-string id', async () => {
      await expect(
        handlers.bulk_delete(mockContext, {
          agentId: 'agent-1',
          ids: [123],
        })
      ).rejects.toThrow('not a string');
    });
  });

  /**
   * Cache Invalidation Event Tests
   *
   * These tests verify that all mutation operations emit cache invalidation events.
   * Without these events, caches can serve stale data after mutations.
   *
   * See ADR-0021: Event-Driven Cache Invalidation
   */
  describe('cache invalidation events', () => {
    let mockEventEmit: ReturnType<typeof vi.fn>;
    let contextWithEvents: AppContext;

    beforeEach(() => {
      mockEventEmit = vi.fn();
      contextWithEvents = {
        ...mockContext,
        unifiedAdapters: {
          event: {
            emit: mockEventEmit,
          },
        } as any,
      };
    });

    it('should emit event on add (create)', async () => {
      mockRepo.create.mockResolvedValue({
        id: 'entry-1',
        name: 'Test',
        content: 'Content',
        scopeType: 'project',
        scopeId: 'proj-1',
        isActive: true,
        createdAt: new Date().toISOString(),
      });

      await handlers.add(contextWithEvents, {
        scopeType: 'project',
        scopeId: 'proj-1',
        agentId: 'agent-1',
        name: 'Test',
        content: 'Content',
      });

      expect(mockEventEmit).toHaveBeenCalledWith({
        entryType: 'guideline',
        entryId: 'entry-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        action: 'create',
      });
    });

    it('should emit event on update', async () => {
      mockRepo.getById.mockResolvedValue({
        id: 'entry-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        isActive: true,
      });
      mockRepo.update.mockResolvedValue({
        id: 'entry-1',
        content: 'Updated',
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      await handlers.update(contextWithEvents, {
        id: 'entry-1',
        agentId: 'agent-1',
        content: 'Updated',
      });

      expect(mockEventEmit).toHaveBeenCalledWith({
        entryType: 'guideline',
        entryId: 'entry-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        action: 'update',
      });
    });

    it('should emit event on deactivate', async () => {
      mockRepo.getById.mockResolvedValue({
        id: 'entry-1',
        scopeType: 'project',
        scopeId: 'proj-1',
      });
      mockRepo.deactivate.mockResolvedValue(true);

      await handlers.deactivate(contextWithEvents, {
        id: 'entry-1',
        agentId: 'agent-1',
      });

      expect(mockEventEmit).toHaveBeenCalledWith({
        entryType: 'guideline',
        entryId: 'entry-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        action: 'deactivate',
      });
    });

    it('should emit event on delete', async () => {
      mockRepo.getById.mockResolvedValue({
        id: 'entry-1',
        scopeType: 'project',
        scopeId: 'proj-1',
      });
      mockRepo.delete.mockResolvedValue(true);

      await handlers.delete(contextWithEvents, {
        id: 'entry-1',
        agentId: 'agent-1',
      });

      expect(mockEventEmit).toHaveBeenCalledWith({
        entryType: 'guideline',
        entryId: 'entry-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        action: 'delete',
      });
    });

    it('should emit events on bulk_add', async () => {
      mockPermissionService.checkBatch.mockReturnValue(
        new Map([['new-0', true], ['new-1', true]])
      );
      mockRepo.create
        .mockResolvedValueOnce({ id: 'e-1', name: 'Entry 1', scopeType: 'project', scopeId: 'proj-1' })
        .mockResolvedValueOnce({ id: 'e-2', name: 'Entry 2', scopeType: 'project', scopeId: 'proj-1' });

      await handlers.bulk_add(contextWithEvents, {
        agentId: 'agent-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        entries: [
          { name: 'Entry 1', content: 'Content 1' },
          { name: 'Entry 2', content: 'Content 2' },
        ],
      });

      expect(mockEventEmit).toHaveBeenCalledTimes(2);
      expect(mockEventEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          entryType: 'guideline',
          entryId: 'e-1',
          action: 'create',
        })
      );
      expect(mockEventEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          entryType: 'guideline',
          entryId: 'e-2',
          action: 'create',
        })
      );
    });

    it('should emit events on bulk_update', async () => {
      mockRepo.getById
        .mockResolvedValueOnce({ id: 'e-1', scopeType: 'project', scopeId: 'p-1' })
        .mockResolvedValueOnce({ id: 'e-2', scopeType: 'project', scopeId: 'p-1' });
      mockPermissionService.checkBatch.mockReturnValue(
        new Map([['e-1', true], ['e-2', true]])
      );
      mockRepo.update
        .mockResolvedValueOnce({ id: 'e-1', scopeType: 'project', scopeId: 'p-1' })
        .mockResolvedValueOnce({ id: 'e-2', scopeType: 'project', scopeId: 'p-1' });

      await handlers.bulk_update(contextWithEvents, {
        agentId: 'agent-1',
        updates: [
          { id: 'e-1', content: 'Updated 1' },
          { id: 'e-2', content: 'Updated 2' },
        ],
      });

      expect(mockEventEmit).toHaveBeenCalledTimes(2);
      expect(mockEventEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          entryType: 'guideline',
          entryId: 'e-1',
          action: 'update',
        })
      );
      expect(mockEventEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          entryType: 'guideline',
          entryId: 'e-2',
          action: 'update',
        })
      );
    });

    it('should emit events on bulk_delete', async () => {
      mockRepo.getById
        .mockResolvedValueOnce({ id: 'e-1', scopeType: 'project', scopeId: 'p-1' })
        .mockResolvedValueOnce({ id: 'e-2', scopeType: 'project', scopeId: 'p-1' });
      mockPermissionService.checkBatch.mockReturnValue(
        new Map([['e-1', true], ['e-2', true]])
      );
      mockRepo.deactivate.mockResolvedValue(true);

      await handlers.bulk_delete(contextWithEvents, {
        agentId: 'agent-1',
        ids: ['e-1', 'e-2'],
      });

      expect(mockEventEmit).toHaveBeenCalledTimes(2);
      expect(mockEventEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          entryType: 'guideline',
          entryId: 'e-1',
          action: 'deactivate',
        })
      );
      expect(mockEventEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          entryType: 'guideline',
          entryId: 'e-2',
          action: 'deactivate',
        })
      );
    });

    it('should handle missing unifiedAdapters gracefully', async () => {
      // Context without unifiedAdapters should not throw
      mockRepo.create.mockResolvedValue({
        id: 'entry-1',
        name: 'Test',
        scopeType: 'project',
        scopeId: 'proj-1',
        isActive: true,
        createdAt: new Date().toISOString(),
      });

      // This should not throw even without unifiedAdapters
      const result = await handlers.add(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
        agentId: 'agent-1',
        name: 'Test',
        content: 'Content',
      });

      expect(result.success).toBe(true);
    });
  });
});
