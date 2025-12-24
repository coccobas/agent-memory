/**
 * memory_consolidate tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { handleConsolidation } from '../handlers/consolidation.handler.js';
import type { ConsolidationParams } from '../types.js';

export const memoryConsolidateDescriptor: ToolDescriptor = {
  name: 'memory_consolidate',
  description: `Consolidate similar memory entries to reduce redundancy and improve coherence.

Actions:
- find_similar: Find groups of semantically similar entries (dry run)
- dedupe: Remove near-duplicates, keeping the primary entry
- merge: Combine content from similar entries into one
- abstract: Create relations between similar entries without modifying them
- archive_stale: Archive entries older than staleDays (based on recency decay)

Use this when memory has accumulated many similar entries that should be consolidated.
Example: {"action":"find_similar","scopeType":"project","scopeId":"proj-123","threshold":0.85}
Example: {"action":"archive_stale","scopeType":"project","scopeId":"proj-123","staleDays":90,"dryRun":true}`,
  commonParams: {
    scopeType: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
      description: 'Scope type to consolidate within',
    },
    scopeId: {
      type: 'string',
      description: 'Scope ID (required for non-global scopes)',
    },
    entryTypes: {
      type: 'array',
      items: { type: 'string', enum: ['tool', 'guideline', 'knowledge'] },
      description: 'Entry types to consolidate (default: all)',
    },
    threshold: {
      type: 'number',
      description: 'Similarity threshold 0-1 (default: 0.85). Higher = stricter matching.',
    },
    staleDays: {
      type: 'number',
      description: 'For archive_stale: entries older than this (in days) are considered stale',
    },
    minRecencyScore: {
      type: 'number',
      description: 'For archive_stale: only archive if recencyScore is below this (0-1)',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of groups to process (default: 20)',
    },
    dryRun: {
      type: 'boolean',
      description: 'If true, only report what would be consolidated without making changes',
    },
    consolidatedBy: {
      type: 'string',
      description: 'Agent/user identifier for audit trail',
    },
  },
  actions: {
    find_similar: {
      contextHandler: (ctx, p) =>
        handleConsolidation(ctx, { action: 'find_similar', ...p } as ConsolidationParams),
    },
    dedupe: {
      contextHandler: (ctx, p) =>
        handleConsolidation(ctx, { action: 'dedupe', ...p } as ConsolidationParams),
    },
    merge: {
      contextHandler: (ctx, p) =>
        handleConsolidation(ctx, { action: 'merge', ...p } as ConsolidationParams),
    },
    abstract: {
      contextHandler: (ctx, p) =>
        handleConsolidation(ctx, { action: 'abstract', ...p } as ConsolidationParams),
    },
    archive_stale: {
      contextHandler: (ctx, p) =>
        handleConsolidation(ctx, { action: 'archive_stale', ...p } as ConsolidationParams),
    },
  },
};
