/**
 * Export Handler
 *
 * Handles exporting memory entries to various formats (JSON, Markdown, YAML)
 * Supports optional file output to configured export directory
 */

import { writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { join, basename, resolve, relative, isAbsolute } from 'node:path';
import {
  exportToJson,
  exportToMarkdown,
  exportToYaml,
  exportToOpenAPI,
  type ExportOptions,
} from '../../services/export.service.js';
import { createPermissionError, createValidationError } from '../../core/errors.js';
import { config } from '../../config/index.js';
import { getRequiredParam, isString } from '../../utils/type-guards.js';
import type { AppContext } from '../../core/context.js';
import { requireAdminKey } from '../../utils/admin.js';

interface ExportParams {
  types?: ('tools' | 'guidelines' | 'knowledge')[];
  scopeType?: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;
  tags?: string[];
  format?: 'json' | 'markdown' | 'yaml' | 'openapi';
  includeVersions?: boolean;
  includeInactive?: boolean;
  /** Optional filename to save export to configured export directory */
  filename?: string;
}

/**
 * Export entries to specified format
 */
function exportEntries(context: AppContext, params: Record<string, unknown>) {
  const exportParams = params as unknown as ExportParams;
  const format = exportParams.format || 'json';
  const agentId = getRequiredParam(params, 'agentId', isString);

  // Validate format
  if (!['json', 'markdown', 'yaml', 'openapi'].includes(format)) {
    throw createValidationError('format', 'must be json, markdown, yaml, or openapi');
  }

  // Permission check (read)
  const scopeType = exportParams.scopeType ?? 'global';
  const scopeId = exportParams.scopeId;
  const requestedTypes = exportParams.types ?? (['tools', 'guidelines', 'knowledge'] as const);
  const typeToEntryType = {
    tools: 'tool',
    guidelines: 'guideline',
    knowledge: 'knowledge',
  } as const;

  const denied = requestedTypes.filter(
    (t) =>
      !context.services.permission.check(
        agentId,
        'read',
        typeToEntryType[t],
        null,
        scopeType,
        scopeId ?? null
      )
  );
  if (denied.length > 0) {
    throw createPermissionError('read', 'export', denied.join(','));
  }

  const options: ExportOptions = {
    types: exportParams.types,
    scopeType: exportParams.scopeType,
    scopeId: exportParams.scopeId,
    tags: exportParams.tags,
    format,
    includeVersions: exportParams.includeVersions || false,
    includeInactive: exportParams.includeInactive || false,
  };

  let result;
  switch (format) {
    case 'openapi':
      result = exportToOpenAPI(options, context.db);
      break;
    case 'markdown':
      result = exportToMarkdown(options, context.db);
      break;
    case 'yaml':
      result = exportToYaml(options, context.db);
      break;
    case 'json':
    default:
      result = exportToJson(options, context.db);
      break;
  }

  // If filename provided, save to export directory
  let filePath: string | undefined;
  if (exportParams.filename) {
    // Writing exports to disk is a high-impact operation; require admin key.
    requireAdminKey(params);
    const exportDir = config.paths.export;

    // Ensure export directory exists
    if (!existsSync(exportDir)) {
      mkdirSync(exportDir, { recursive: true });
    }

    // Determine file extension based on format
    const extensions: Record<string, string> = {
      json: '.json',
      markdown: '.md',
      yaml: '.yaml',
      openapi: '.json',
    };
    const ext = extensions[format] || '.json';

    // Add extension if not present
    const filename = exportParams.filename.endsWith(ext)
      ? exportParams.filename
      : `${exportParams.filename}${ext}`;

    // Security: Prevent path traversal attacks
    // Only allow basename - reject paths with directory separators, traversal sequences, and null bytes
    const safeFilename = basename(filename);
    if (safeFilename !== filename || filename.includes('..') || filename.includes('\0')) {
      throw createValidationError(
        'filename',
        'contains invalid path characters',
        'Use a simple filename without directory separators or null bytes'
      );
    }

    filePath = join(exportDir, safeFilename);

    // Security: Prevent symlink attacks - check if target exists and resolve real path
    if (existsSync(filePath)) {
      try {
        // Resolve symlinks to real path
        const realPath = realpathSync(filePath);
        const realExportDir = realpathSync(exportDir);

        // Verify real path is within export directory
        const relPath = relative(realExportDir, realPath);
        if (relPath.startsWith('..') || isAbsolute(relPath)) {
          throw createValidationError(
            'filename',
            'Target path (resolved) is outside export directory',
            'Remove symlink or use different filename'
          );
        }
      } catch (error) {
        // realpathSync throws if symlink target doesn't exist
        throw createValidationError(
          'filename',
          'Cannot resolve target path - invalid symlink',
          'Remove symlink or use different filename'
        );
      }
    }

    // Double-check resolved path stays within exportDir (pre-write validation)
    const resolvedPath = resolve(filePath);
    const resolvedExportDir = resolve(exportDir);
    const relPath = relative(resolvedExportDir, resolvedPath);
    if (relPath.startsWith('..') || isAbsolute(relPath)) {
      throw createValidationError(
        'filename',
        'would escape export directory',
        'Use a simple filename without directory separators'
      );
    }

    // Safe to write - no symlink attack possible
    writeFileSync(filePath, result.content, 'utf-8');
  }

  return {
    success: true,
    format: result.format,
    content: result.content,
    metadata: result.metadata,
    ...(filePath && { filePath }),
  };
}

export const exportHandlers = {
  export: (context: AppContext, params: Record<string, unknown>) => exportEntries(context, params),
};
