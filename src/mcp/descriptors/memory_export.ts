/**
 * memory_export tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { exportHandlers } from '../handlers/export.handler.js';

export const memoryExportDescriptor: ToolDescriptor = {
  name: 'memory_export',
  description: 'Export memory entries to various formats. Actions: export',
  commonParams: {
    agentId: { type: 'string', description: 'Agent identifier for access control/auditing' },
    admin_key: { type: 'string', description: 'Admin key (required when writing to disk)' },
    format: {
      type: 'string',
      enum: ['json', 'markdown', 'yaml', 'openapi'],
      description: 'Export format (default: json)',
    },
    types: {
      type: 'array',
      items: { type: 'string', enum: ['tools', 'guidelines', 'knowledge'] },
      description: 'Entry types to export (default: all)',
    },
    scopeType: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
      description: 'Scope type to export from',
    },
    scopeId: { type: 'string', description: 'Scope ID (required if scopeType specified)' },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Filter by tags (include entries with any of these tags)',
    },
    includeVersions: {
      type: 'boolean',
      description: 'Include version history in export (default: false)',
    },
    includeInactive: {
      type: 'boolean',
      description: 'Include inactive/deleted entries (default: false)',
    },
    filename: {
      type: 'string',
      description:
        'Optional filename to save export to configured export directory. If not provided, content is returned in response only.',
    },
  },
  actions: {
    export: { contextHandler: exportHandlers.export },
  },
};
