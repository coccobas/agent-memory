/**
 * Unit tests for MCP permissions helper
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  requirePermission,
  requireAgentId,
  checkPermissionForFilter,
} from '../../src/mcp/helpers/permissions.js';
import type { PermissionService } from '../../src/services/permission.service.js';

describe('MCP Permissions Helper', () => {
  let mockPermissionService: { check: ReturnType<typeof vi.fn> };
  let originalEnv: string | undefined;

  beforeEach(() => {
    mockPermissionService = {
      check: vi.fn().mockReturnValue(true),
    };
    originalEnv = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = originalEnv;
    } else {
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    }
  });

  describe('requirePermission', () => {
    it('should allow access when agent has permission', () => {
      expect(() =>
        requirePermission(
          mockPermissionService as unknown as PermissionService,
          'agent-1',
          'read',
          'project',
          'proj-123'
        )
      ).not.toThrow();

      expect(mockPermissionService.check).toHaveBeenCalledWith(
        'agent-1',
        'read',
        'tool',
        null,
        'project',
        'proj-123'
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
          'proj-123',
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
          'global'
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
          'global'
        )
      ).not.toThrow();

      // Permission check should not be called when skipping
      expect(mockPermissionService.check).not.toHaveBeenCalled();
    });

    it('should use provided entryType', () => {
      requirePermission(
        mockPermissionService as unknown as PermissionService,
        'agent-1',
        'write',
        'project',
        'proj-1',
        'guideline'
      );

      expect(mockPermissionService.check).toHaveBeenCalledWith(
        'agent-1',
        'write',
        'guideline',
        null,
        'project',
        'proj-1'
      );
    });

    it('should handle null scopeId', () => {
      requirePermission(
        mockPermissionService as unknown as PermissionService,
        'agent-1',
        'read',
        'global',
        null
      );

      expect(mockPermissionService.check).toHaveBeenCalledWith(
        'agent-1',
        'read',
        'tool',
        null,
        'global',
        null
      );
    });
  });

  describe('requireAgentId', () => {
    it('should not throw when agentId provided', () => {
      expect(() => requireAgentId('agent-1')).not.toThrow();
    });

    it('should throw when agentId undefined in strict mode', () => {
      expect(() => requireAgentId(undefined)).toThrow(
        /agentId.*must be provided|Authentication required/i
      );
    });

    it('should not throw when agentId undefined in permissive mode', () => {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';

      expect(() => requireAgentId(undefined)).not.toThrow();
    });

    it('should work as type guard', () => {
      // This test validates the type assertion
      const agentId: string | undefined = 'agent-1';
      requireAgentId(agentId);
      // After requireAgentId, TypeScript should know agentId is string
      expect(agentId.length).toBeGreaterThan(0);
    });
  });

  describe('checkPermissionForFilter', () => {
    it('should return true when agent has permission', () => {
      mockPermissionService.check.mockReturnValue(true);

      const result = checkPermissionForFilter(
        mockPermissionService as unknown as PermissionService,
        'agent-1',
        'read',
        'tool',
        'tool-123',
        'project',
        'proj-1'
      );

      expect(result).toBe(true);
      expect(mockPermissionService.check).toHaveBeenCalledWith(
        'agent-1',
        'read',
        'tool',
        'tool-123',
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
        'guideline',
        'g-1',
        'org',
        'org-1'
      );

      expect(result).toBe(false);
    });

    it('should return true when agentId undefined in permissive mode', () => {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';

      const result = checkPermissionForFilter(
        mockPermissionService as unknown as PermissionService,
        undefined,
        'read',
        'knowledge',
        null,
        'global',
        null
      );

      expect(result).toBe(true);
      expect(mockPermissionService.check).not.toHaveBeenCalled();
    });

    it('should return false when agentId undefined in strict mode', () => {
      const result = checkPermissionForFilter(
        mockPermissionService as unknown as PermissionService,
        undefined,
        'read',
        'tool',
        null,
        'global',
        null
      );

      expect(result).toBe(false);
    });

    it('should support delete action', () => {
      mockPermissionService.check.mockReturnValue(true);

      const result = checkPermissionForFilter(
        mockPermissionService as unknown as PermissionService,
        'agent-1',
        'delete',
        'tool',
        'tool-1',
        'project',
        'proj-1'
      );

      expect(result).toBe(true);
      expect(mockPermissionService.check).toHaveBeenCalledWith(
        'agent-1',
        'delete',
        'tool',
        'tool-1',
        'project',
        'proj-1'
      );
    });
  });
});
