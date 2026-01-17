import { describe, it, expect, vi, beforeEach } from 'vitest';
import { permissionHandlers } from '../../src/mcp/handlers/permissions.handler.js';
import * as adminUtil from '../../src/utils/admin.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/utils/admin.js');

describe('Permissions Handler', () => {
  let mockContext: AppContext;
  let mockPermissionService: {
    grant: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
    check: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminUtil.requireAdminKey).mockImplementation(() => {});
    mockPermissionService = {
      grant: vi.fn(),
      revoke: vi.fn(),
      check: vi.fn(),
      list: vi.fn(),
    };
    mockContext = {
      db: {} as any,
      repos: {} as any,
      services: {
        permission: mockPermissionService,
      } as any,
    };
  });

  describe('grant', () => {
    it('should grant a permission', () => {
      mockPermissionService.grant.mockReturnValue(undefined);

      const result = permissionHandlers.grant(mockContext, {
        admin_key: 'key',
        agent_id: 'agent-1',
        permission: 'write',
      });

      // Handler constructs its own permission object
      expect(result.permission).toEqual(
        expect.objectContaining({
          agentId: 'agent-1',
          permission: 'write',
        })
      );
      expect(result.permission.id).toMatch(/^agent-1:global::.*:write$/);
      expect(result.message).toContain('granted');
    });

    it('should pass scope and entry type', () => {
      mockPermissionService.grant.mockReturnValue({});

      permissionHandlers.grant(mockContext, {
        admin_key: 'key',
        agent_id: 'agent-1',
        permission: 'read',
        scope_type: 'project',
        scope_id: 'proj-123',
        entry_type: 'guideline',
      });

      expect(mockPermissionService.grant).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          permission: 'read',
          scopeType: 'project',
          scopeId: 'proj-123',
          entryType: 'guideline',
        })
      );
    });

    it('should require admin key', () => {
      vi.mocked(adminUtil.requireAdminKey).mockImplementation(() => {
        throw new Error('Admin key required');
      });

      expect(() =>
        permissionHandlers.grant(mockContext, {
          agent_id: 'agent-1',
          permission: 'write',
        })
      ).toThrow('Admin key required');
    });
  });

  describe('revoke', () => {
    it('should revoke a permission by agent_id', () => {
      permissionHandlers.revoke(mockContext, {
        admin_key: 'key',
        agent_id: 'agent-1',
      });

      expect(mockPermissionService.revoke).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-1' })
      );
    });

    it('should pass scope filters', () => {
      permissionHandlers.revoke(mockContext, {
        admin_key: 'key',
        agent_id: 'agent-1',
        scope_type: 'project',
        scope_id: 'proj-123',
        entry_type: 'tool',
      });

      expect(mockPermissionService.revoke).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          scopeType: 'project',
          scopeId: 'proj-123',
          entryType: 'tool',
        })
      );
    });

    it('should throw when neither permission_id nor agent_id provided', () => {
      expect(() => permissionHandlers.revoke(mockContext, { admin_key: 'key' })).toThrow();
    });

    it('should require admin key', () => {
      vi.mocked(adminUtil.requireAdminKey).mockImplementation(() => {
        throw new Error('Admin key required');
      });

      expect(() => permissionHandlers.revoke(mockContext, { agent_id: 'agent-1' })).toThrow(
        'Admin key required'
      );
    });
  });

  describe('check', () => {
    it('should check if agent has permission', () => {
      mockPermissionService.check.mockReturnValue(true);

      const result = permissionHandlers.check(mockContext, {
        agent_id: 'agent-1',
        action: 'write',
        scope_type: 'project',
      });

      expect(result.has_permission).toBe(true);
      expect(result.agent_id).toBe('agent-1');
      expect(result.action).toBe('write');
    });

    it('should return false when no permission', () => {
      mockPermissionService.check.mockReturnValue(false);

      const result = permissionHandlers.check(mockContext, {
        agent_id: 'agent-1',
        action: 'write',
        scope_type: 'project',
      });

      expect(result.has_permission).toBe(false);
    });

    it('should pass scope_id and entry_type', () => {
      mockPermissionService.check.mockReturnValue(true);

      permissionHandlers.check(mockContext, {
        agent_id: 'agent-1',
        action: 'read',
        scope_type: 'project',
        scope_id: 'proj-123',
        entry_type: 'knowledge',
      });

      expect(mockPermissionService.check).toHaveBeenCalledWith(
        'agent-1',
        'read',
        'knowledge',
        null,
        'project',
        'proj-123'
      );
    });

    it('should throw when agent_id missing', () => {
      expect(() =>
        permissionHandlers.check(mockContext, { action: 'write', scope_type: 'project' })
      ).toThrow();
    });

    it('should throw when action missing', () => {
      expect(() =>
        permissionHandlers.check(mockContext, { agent_id: 'agent-1', scope_type: 'project' })
      ).toThrow();
    });
  });

  describe('list', () => {
    it('should list permissions', () => {
      const mockPerms = [
        { id: 'perm-1', agentId: 'agent-1', permission: 'write' },
        { id: 'perm-2', agentId: 'agent-2', permission: 'read' },
      ];
      mockPermissionService.list.mockReturnValue(mockPerms);

      const result = permissionHandlers.list(mockContext, { admin_key: 'key' });

      expect(result.permissions).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by agent_id', () => {
      mockPermissionService.list.mockReturnValue([]);

      permissionHandlers.list(mockContext, {
        admin_key: 'key',
        agent_id: 'agent-1',
      });

      expect(mockPermissionService.list).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-1' })
      );
    });

    it('should apply pagination', () => {
      const mockPerms = Array.from({ length: 20 }, (_, i) => ({
        id: `perm-${i}`,
        agentId: 'agent-1',
        permission: 'read',
      }));
      mockPermissionService.list.mockReturnValue(mockPerms);

      const result = permissionHandlers.list(mockContext, {
        admin_key: 'key',
        limit: 5,
        offset: 10,
      });

      expect(result.permissions).toHaveLength(5);
      expect(result.offset).toBe(10);
      expect(result.total).toBe(20);
    });

    it('should require admin key', () => {
      vi.mocked(adminUtil.requireAdminKey).mockImplementation(() => {
        throw new Error('Admin key required');
      });

      expect(() => permissionHandlers.list(mockContext, {})).toThrow('Admin key required');
    });
  });
});
