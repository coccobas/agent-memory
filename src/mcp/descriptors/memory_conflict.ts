/**
 * memory_conflict tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { conflictHandlers } from '../handlers/conflicts.handler.js';
import type { ConflictListParams, ConflictResolveParams } from '../types.js';

export const memoryConflictDescriptor: ToolDescriptor = {
  name: 'memory_conflict',
  visibility: 'system',
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
      contextHandler: (ctx, p) => conflictHandlers.list(ctx, p as unknown as ConflictListParams),
    },
    resolve: {
      contextHandler: (ctx, p) =>
        conflictHandlers.resolve(ctx, p as unknown as ConflictResolveParams),
    },
  },
};
