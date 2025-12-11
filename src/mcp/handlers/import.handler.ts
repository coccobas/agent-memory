/**
 * Import Handler
 *
 * Handles importing memory entries from various formats (JSON, YAML, Markdown)
 */

import {
  importFromJson,
  importFromYaml,
  importFromMarkdown,
  importFromOpenAPI,
  type ImportOptions,
} from '../../services/import.service.js';
import { createValidationError } from '../errors.js';
import type { ScopeType } from '../../db/schema.js';

interface ImportParams {
  content: string;
  format?: 'json' | 'yaml' | 'markdown' | 'openapi';
  conflictStrategy?: 'skip' | 'update' | 'replace' | 'error';
  scopeMapping?: Record<string, { type: ScopeType; id?: string }>;
  generateNewIds?: boolean;
  importedBy?: string;
}

/**
 * Import entries from specified format
 */
function importEntries(params: Record<string, unknown>) {
  const importParams = params as unknown as ImportParams;

  if (!importParams.content) {
    throw createValidationError('content', 'is required', 'Provide the content to import');
  }

  const format = importParams.format || 'json';

  // Validate format
  if (!['json', 'yaml', 'markdown', 'openapi'].includes(format)) {
    throw createValidationError('format', 'must be json, yaml, markdown, or openapi');
  }

  const options: ImportOptions = {
    conflictStrategy: importParams.conflictStrategy || 'update',
    scopeMapping: importParams.scopeMapping,
    generateNewIds: importParams.generateNewIds || false,
    importedBy: importParams.importedBy,
  };

  let result;
  switch (format) {
    case 'openapi':
      result = importFromOpenAPI(importParams.content, options);
      break;
    case 'yaml':
      result = importFromYaml(importParams.content, options);
      break;
    case 'markdown':
      result = importFromMarkdown(importParams.content, options);
      break;
    case 'json':
    default:
      result = importFromJson(importParams.content, options);
      break;
  }

  return {
    success: result.success,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    errors: result.errors,
    details: result.details,
  };
}

export const importHandlers = {
  import: importEntries,
};
