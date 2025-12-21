/**
 * memory_conflict tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { conflictHandlers } from '../handlers/conflicts.handler.js';
import type { ConflictListParams, ConflictResolveParams } from '../types.js';

export const memoryConflictDescriptor: ToolDescriptor = {
  name: 'memory_conflict',
  description: 'Manage version conflicts. Actions: list, resolve',
  commonParams: {
    entryType: {
      type: 'string',
      enum: ['tool', 'guideline', 'knowledge'],
      description: 'Filter by entry type (list)',
    },
    resolved: {
      type: 'boolean',
      description: 'Filter by resolved status (list, default: unresolved only)',
    },
    id: { type: 'string', description: 'Conflict ID (resolve)' },
    resolution: { type: 'string', description: 'Resolution description (resolve)' },
    resolvedBy: { type: 'string', description: 'Who resolved it (resolve)' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    list: {
      handler: (p) => conflictHandlers.list(p as unknown as ConflictListParams),
    },
    resolve: {
      handler: (p) => conflictHandlers.resolve(p as unknown as ConflictResolveParams),
    },
  },
};
