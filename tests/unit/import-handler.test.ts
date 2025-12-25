import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importHandlers } from '../../src/mcp/handlers/import.handler.js';
import * as importService from '../../src/services/import.service.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/services/import.service.js', () => ({
  createImportService: vi.fn().mockReturnValue({
    importFromJson: vi.fn(),
    importFromYaml: vi.fn(),
    importFromMarkdown: vi.fn(),
    importFromOpenAPI: vi.fn(),
  }),
}));
vi.mock('../../src/utils/admin.js', () => ({
  requireAdminKey: vi.fn(),
}));

describe('Import Handler', () => {
  let mockContext: AppContext;
  let mockImportService: {
    importFromJson: ReturnType<typeof vi.fn>;
    importFromYaml: ReturnType<typeof vi.fn>;
    importFromMarkdown: ReturnType<typeof vi.fn>;
    importFromOpenAPI: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockImportService = {
      importFromJson: vi.fn().mockResolvedValue({
        success: true,
        created: 2,
        updated: 0,
        skipped: 0,
        errors: [],
        details: [],
      }),
      importFromYaml: vi.fn().mockResolvedValue({
        success: true,
        created: 1,
        updated: 1,
        skipped: 0,
        errors: [],
        details: [],
      }),
      importFromMarkdown: vi.fn().mockResolvedValue({
        success: true,
        created: 3,
        updated: 0,
        skipped: 0,
        errors: [],
        details: [],
      }),
      importFromOpenAPI: vi.fn().mockResolvedValue({
        success: true,
        created: 5,
        updated: 0,
        skipped: 0,
        errors: [],
        details: [],
      }),
    };
    vi.mocked(importService.createImportService).mockReturnValue(mockImportService as any);

    mockContext = {
      db: {} as any,
      repos: {
        tools: {} as any,
        guidelines: {} as any,
        knowledge: {} as any,
        tags: {} as any,
        entryTags: {} as any,
      } as any,
      services: {} as any,
    };
  });

  it('should import from JSON by default', async () => {
    const result = await importHandlers.import(mockContext, {
      content: '{"tools":[]}',
      admin_key: 'key',
    });

    expect(result.success).toBe(true);
    expect(result.created).toBe(2);
    expect(mockImportService.importFromJson).toHaveBeenCalledWith(
      '{"tools":[]}',
      expect.anything()
    );
  });

  it('should import from YAML', async () => {
    const result = await importHandlers.import(mockContext, {
      content: 'tools: []',
      format: 'yaml',
      admin_key: 'key',
    });

    expect(result.success).toBe(true);
    expect(mockImportService.importFromYaml).toHaveBeenCalled();
  });

  it('should import from Markdown', async () => {
    const result = await importHandlers.import(mockContext, {
      content: '# Guidelines',
      format: 'markdown',
      admin_key: 'key',
    });

    expect(result.success).toBe(true);
    expect(mockImportService.importFromMarkdown).toHaveBeenCalled();
  });

  it('should import from OpenAPI', async () => {
    const result = await importHandlers.import(mockContext, {
      content: '{"openapi":"3.0.0"}',
      format: 'openapi',
      admin_key: 'key',
    });

    expect(result.success).toBe(true);
    expect(result.created).toBe(5);
    expect(mockImportService.importFromOpenAPI).toHaveBeenCalled();
  });

  it('should throw when content is missing', async () => {
    await expect(
      importHandlers.import(mockContext, {
        admin_key: 'key',
      })
    ).rejects.toThrow('content');
  });

  it('should throw on invalid format', async () => {
    await expect(
      importHandlers.import(mockContext, {
        content: '{}',
        format: 'invalid',
        admin_key: 'key',
      })
    ).rejects.toThrow('format');
  });

  it('should pass conflict strategy', async () => {
    await importHandlers.import(mockContext, {
      content: '{}',
      conflictStrategy: 'skip',
      admin_key: 'key',
    });

    expect(mockImportService.importFromJson).toHaveBeenCalledWith(
      '{}',
      expect.objectContaining({ conflictStrategy: 'skip' })
    );
  });

  it('should pass scope mapping', async () => {
    await importHandlers.import(mockContext, {
      content: '{}',
      scopeMapping: { 'old-proj': { type: 'project', id: 'new-proj' } },
      admin_key: 'key',
    });

    expect(mockImportService.importFromJson).toHaveBeenCalledWith(
      '{}',
      expect.objectContaining({
        scopeMapping: { 'old-proj': { type: 'project', id: 'new-proj' } },
      })
    );
  });

  it('should pass generateNewIds option', async () => {
    await importHandlers.import(mockContext, {
      content: '{}',
      generateNewIds: true,
      admin_key: 'key',
    });

    expect(mockImportService.importFromJson).toHaveBeenCalledWith(
      '{}',
      expect.objectContaining({ generateNewIds: true })
    );
  });

  it('should pass importedBy for audit trail', async () => {
    await importHandlers.import(mockContext, {
      content: '{}',
      importedBy: 'admin-user',
      admin_key: 'key',
    });

    expect(mockImportService.importFromJson).toHaveBeenCalledWith(
      '{}',
      expect.objectContaining({ importedBy: 'admin-user' })
    );
  });

  it('should return errors from import service', async () => {
    mockImportService.importFromJson.mockResolvedValue({
      success: false,
      created: 1,
      updated: 0,
      skipped: 1,
      errors: ['Invalid entry format'],
      details: [],
    });

    const result = await importHandlers.import(mockContext, {
      content: '{}',
      admin_key: 'key',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Invalid entry format');
  });
});
