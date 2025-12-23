/**
 * Import Handler
 *
 * Context-aware handler for importing memory entries from various formats.
 */

import { createImportService, type ImportOptions } from '../../services/import.service.js';
import { createValidationError } from '../../core/errors.js';
import type { ScopeType } from '../../db/schema.js';
import type { AppContext } from '../../core/context.js';
import { requireAdminKey } from '../../utils/admin.js';

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
async function importEntries(context: AppContext, params: Record<string, unknown>) {
  requireAdminKey(params);
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

  // Create import service with injected repositories
  const importService = createImportService({
    toolRepo: context.repos.tools,
    guidelineRepo: context.repos.guidelines,
    knowledgeRepo: context.repos.knowledge,
    tagRepo: context.repos.tags,
    entryTagRepo: context.repos.entryTags,
  });

  let result;
  switch (format) {
    case 'openapi':
      result = await importService.importFromOpenAPI(importParams.content, options);
      break;
    case 'yaml':
      result = await importService.importFromYaml(importParams.content, options);
      break;
    case 'markdown':
      result = await importService.importFromMarkdown(importParams.content, options);
      break;
    case 'json':
    default:
      result = await importService.importFromJson(importParams.content, options);
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
