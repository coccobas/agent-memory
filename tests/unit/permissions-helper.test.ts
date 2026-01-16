import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  requirePermission,
  requireAgentId,
  checkPermissionForFilter,
} from '../../src/mcp/helpers/permissions.js';
import type { PermissionService } from '../../src/services/permission.service.js';

describe('Permissions Helper', () => {
  let mockPermissionService: {
    check: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissionService = {
      check: vi.fn().mockReturnValue(true),
    };
    // Clear environment variable
    delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
  });

  afterEach(() => {
    delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
  });

  describe('requirePermission', () => {
    it('should allow when agent has permission', () => {
      expect(() =>
        requirePermission(
          mockPermissionService as unknown as PermissionService,
          'agent-1',
          'read',
          'project',
          'proj-1',
          'guideline'
        )
      ).not.toThrow();

      expect(mockPermissionService.check).toHaveBeenCalledWith(
        'agent-1',
        'read',
        'guideline',
        null,
        'project',
        'proj-1'
      );
    });

    it('should throw when agent lacks permission', () => {
      mockPermissionService.check.mockReturnValue(false);

      expect(() =>
        requirePermission(
          mockPermissionService as unknown as PermissionService,
          'agent-1',
          'write',
          'project',
          'proj-1',
          'knowledge'
        )
      ).toThrow('Permission denied');
    });

    it('should throw when agentId missing in strict mode', () => {
      expect(() =>
        requirePermission(
          mockPermissionService as unknown as PermissionService,
          undefined,
          'read',
          'project',
          'proj-1'
        )
      ).toThrow(/agentId.*must be provided|Authentication required/i);
    });

    it('should allow when agentId missing in permissive mode', () => {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';

      expect(() =>
        requirePermission(
          mockPermissionService as unknown as PermissionService,
          undefined,
          'read',
          'project',
          'proj-1'
        )
      ).not.toThrow();

      // Should not call permission service when agentId is missing
      expect(mockPermissionService.check).not.toHaveBeenCalled();
    });

    it('should use default entryType when not provided', () => {
      requirePermission(
        mockPermissionService as unknown as PermissionService,
        'agent-1',
        'read',
        'global'
      );

      expect(mockPermissionService.check).toHaveBeenCalledWith(
        'agent-1',
        'read',
        'tool', // default
        null,
        'global',
        null
      );
    });

    it('should handle null scopeId', () => {
      requirePermission(
        mockPermissionService as unknown as PermissionService,
        'agent-1',
        'write',
        'project',
        null,
        'tool'
      );

      expect(mockPermissionService.check).toHaveBeenCalledWith(
        'agent-1',
        'write',
        'tool',
        null,
        'project',
        null
      );
    });

    it('should handle undefined entryType', () => {
      requirePermission(
        mockPermissionService as unknown as PermissionService,
        'agent-1',
        'read',
        'org',
        'org-1',
        null
      );

      expect(mockPermissionService.check).toHaveBeenCalledWith(
        'agent-1',
        'read',
        'tool', // fallback
        null,
        'org',
        'org-1'
      );
    });
  });

  describe('requireAgentId', () => {
    it('should pass when agentId is provided', () => {
      expect(() => requireAgentId('agent-1')).not.toThrow();
    });

    it('should throw when agentId is undefined in strict mode', () => {
      expect(() => requireAgentId(undefined)).toThrow(
        /agentId.*must be provided|Authentication required/i
      );
    });

    it('should pass when agentId is undefined in permissive mode', () => {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';

      expect(() => requireAgentId(undefined)).not.toThrow();
    });
  });

  describe('checkPermissionForFilter', () => {
    it('should return true when agent has permission', () => {
      const result = checkPermissionForFilter(
        mockPermissionService as unknown as PermissionService,
        'agent-1',
        'read',
        'guideline',
        'g-1',
        'project',
        'proj-1'
      );

      expect(result).toBe(true);
      expect(mockPermissionService.check).toHaveBeenCalledWith(
        'agent-1',
        'read',
        'guideline',
        'g-1',
        'project',
        'proj-1'
      );
    });

    it('should return false when agent lacks permission', () => {
      mockPermissionService.check.mockReturnValue(false);

      const result = checkPermissionForFilter(
        mockPermissionService as unknown as PermissionService,
        'agent-1',
        'write',
        'knowledge',
        'k-1',
        'project',
        'proj-1'
      );

      expect(result).toBe(false);
    });

    it('should return false when agentId missing in strict mode', () => {
      const result = checkPermissionForFilter(
        mockPermissionService as unknown as PermissionService,
        undefined,
        'read',
        'tool',
        't-1',
        'global',
        null
      );

      expect(result).toBe(false);
      expect(mockPermissionService.check).not.toHaveBeenCalled();
    });

    it('should return true when agentId missing in permissive mode', () => {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';

      const result = checkPermissionForFilter(
        mockPermissionService as unknown as PermissionService,
        undefined,
        'read',
        'tool',
        't-1',
        'global',
        null
      );

      expect(result).toBe(true);
      expect(mockPermissionService.check).not.toHaveBeenCalled();
    });

    it('should handle delete action', () => {
      const result = checkPermissionForFilter(
        mockPermissionService as unknown as PermissionService,
        'agent-1',
        'delete',
        'guideline',
        'g-1',
        'session',
        'sess-1'
      );

      expect(result).toBe(true);
      expect(mockPermissionService.check).toHaveBeenCalledWith(
        'agent-1',
        'delete',
        'guideline',
        'g-1',
        'session',
        'sess-1'
      );
    });

    it('should handle null entryId', () => {
      const result = checkPermissionForFilter(
        mockPermissionService as unknown as PermissionService,
        'agent-1',
        'read',
        'knowledge',
        null,
        'project',
        'proj-1'
      );

      expect(result).toBe(true);
      expect(mockPermissionService.check).toHaveBeenCalledWith(
        'agent-1',
        'read',
        'knowledge',
        null,
        'project',
        'proj-1'
      );
    });
  });
});
