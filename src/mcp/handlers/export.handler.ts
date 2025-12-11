/**
 * Export Handler
 *
 * Handles exporting memory entries to various formats (JSON, Markdown, YAML)
 */

import {
  exportToJson,
  exportToMarkdown,
  exportToYaml,
  exportToOpenAPI,
  type ExportOptions,
} from '../../services/export.service.js';
import { createValidationError } from '../errors.js';

interface ExportParams {
  types?: ('tools' | 'guidelines' | 'knowledge')[];
  scopeType?: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;
  tags?: string[];
  format?: 'json' | 'markdown' | 'yaml' | 'openapi';
  includeVersions?: boolean;
  includeInactive?: boolean;
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

  return {
    success: true,
    format: result.format,
    content: result.content,
    metadata: result.metadata,
  };
}

export const exportHandlers = {
  export: exportEntries,
};

