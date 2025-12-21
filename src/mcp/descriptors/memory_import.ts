/**
 * memory_import tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { importHandlers } from '../handlers/import.handler.js';

export const memoryImportDescriptor: ToolDescriptor = {
  name: 'memory_import',
  description: 'Import memory entries from various formats. Actions: import',
  required: ['content'],
  commonParams: {
    admin_key: { type: 'string', description: 'Admin key (required)' },
    content: {
      type: 'string',
      description: 'Content to import (JSON string, YAML string, Markdown, or OpenAPI spec)',
    },
    format: {
      type: 'string',
      enum: ['json', 'yaml', 'markdown', 'openapi'],
      description: 'Import format (default: json, auto-detected if possible)',
    },
    conflictStrategy: {
      type: 'string',
      enum: ['skip', 'update', 'replace', 'error'],
      description: 'How to handle conflicts with existing entries (default: update)',
    },
    scopeMapping: {
      type: 'object',
      description:
        'Map scope IDs from import to target scopes: { "oldScopeId": { "type": "org|project|session", "id": "newScopeId" } }',
    },
    generateNewIds: {
      type: 'boolean',
      description:
        'Generate new IDs for imported entries instead of preserving originals (default: false)',
    },
    importedBy: { type: 'string', description: 'Agent ID or identifier for audit trail' },
  },
  actions: {
    import: { handler: importHandlers.import },
  },
};
