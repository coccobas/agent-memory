/**
 * Export Handler
 *
 * Handles exporting memory entries to various formats (JSON, Markdown, YAML)
 * Supports optional file output to configured export directory
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  exportToJson,
  exportToMarkdown,
  exportToYaml,
  exportToOpenAPI,
  type ExportOptions,
} from '../../services/export.service.js';
import { createValidationError } from '../errors.js';
import { config } from '../../config/index.js';

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
function exportEntries(params: Record<string, unknown>) {
  const exportParams = params as unknown as ExportParams;
  const format = exportParams.format || 'json';

  // Validate format
  if (!['json', 'markdown', 'yaml', 'openapi'].includes(format)) {
    throw createValidationError('format', 'must be json, markdown, yaml, or openapi');
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
      result = exportToOpenAPI(options);
      break;
    case 'markdown':
      result = exportToMarkdown(options);
      break;
    case 'yaml':
      result = exportToYaml(options);
      break;
    case 'json':
    default:
      result = exportToJson(options);
      break;
  }

  // If filename provided, save to export directory
  let filePath: string | undefined;
  if (exportParams.filename) {
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

    filePath = join(exportDir, filename);

    // Ensure parent directory exists (in case filename includes subdirectory)
    const parentDir = dirname(filePath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

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
  export: exportEntries,
};
