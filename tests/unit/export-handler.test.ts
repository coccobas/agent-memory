import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportHandlers } from '../../src/mcp/handlers/export.handler.js';
import * as exportService from '../../src/services/export.service.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/services/export.service.js');
vi.mock('../../src/utils/admin.js', () => ({
  requireAdminKey: vi.fn(),
}));
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
}));

describe('Export Handler', () => {
  let mockContext: AppContext;
  let mockPermissionService: {
    check: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissionService = {
      check: vi.fn().mockReturnValue(true),
    };
    mockContext = {
      db: {} as any,
      repos: {} as any,
      services: {
        permission: mockPermissionService,
      } as any,
    };

    vi.mocked(exportService.exportToJson).mockReturnValue({
      content: '{}',
      format: 'json',
      metadata: { exportedAt: '2024-01-01' },
    });
    vi.mocked(exportService.exportToMarkdown).mockReturnValue({
      content: '# Export',
      format: 'markdown',
      metadata: { exportedAt: '2024-01-01' },
    });
    vi.mocked(exportService.exportToYaml).mockReturnValue({
      content: 'key: value',
      format: 'yaml',
      metadata: { exportedAt: '2024-01-01' },
    });
    vi.mocked(exportService.exportToOpenAPI).mockReturnValue({
      content: '{}',
      format: 'openapi',
      metadata: { exportedAt: '2024-01-01' },
    });
  });

  it('should export to JSON by default', () => {
    const result = exportHandlers.export(mockContext, {
      agentId: 'agent-1',
    });

    expect(result.success).toBe(true);
    expect(result.format).toBe('json');
    expect(exportService.exportToJson).toHaveBeenCalled();
  });

  it('should export to markdown format', () => {
    const result = exportHandlers.export(mockContext, {
      agentId: 'agent-1',
      format: 'markdown',
    });

    expect(result.success).toBe(true);
    expect(result.format).toBe('markdown');
    expect(exportService.exportToMarkdown).toHaveBeenCalled();
  });

  it('should export to YAML format', () => {
    const result = exportHandlers.export(mockContext, {
      agentId: 'agent-1',
      format: 'yaml',
    });

    expect(result.format).toBe('yaml');
    expect(exportService.exportToYaml).toHaveBeenCalled();
  });

  it('should export to OpenAPI format', () => {
    const result = exportHandlers.export(mockContext, {
      agentId: 'agent-1',
      format: 'openapi',
    });

    expect(result.format).toBe('openapi');
    expect(exportService.exportToOpenAPI).toHaveBeenCalled();
  });

  it('should throw on invalid format', () => {
    expect(() =>
      exportHandlers.export(mockContext, {
        agentId: 'agent-1',
        format: 'invalid',
      })
    ).toThrow();
  });

  it('should pass export options', () => {
    exportHandlers.export(mockContext, {
      agentId: 'agent-1',
      types: ['guidelines'],
      scopeType: 'project',
      scopeId: 'proj-1',
      includeVersions: true,
      includeInactive: true,
    });

    expect(exportService.exportToJson).toHaveBeenCalledWith(
      expect.objectContaining({
        types: ['guidelines'],
        scopeType: 'project',
        scopeId: 'proj-1',
        includeVersions: true,
        includeInactive: true,
      }),
      expect.anything()
    );
  });

  it('should throw on permission denied', () => {
    mockPermissionService.check.mockReturnValue(false);

    expect(() =>
      exportHandlers.export(mockContext, {
        agentId: 'agent-1',
      })
    ).toThrow();
  });

  it('should filter tags', () => {
    exportHandlers.export(mockContext, {
      agentId: 'agent-1',
      tags: ['important', 'security'],
    });

    expect(exportService.exportToJson).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['important', 'security'],
      }),
      expect.anything()
    );
  });
});
