/**
 * Memory Consolidation Handler
 *
 * MCP handler for memory consolidation operations.
 * Implements the memory evolution aspect from "Memory in the Age of AI Agents" paper.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  consolidate,
  findSimilarGroups,
  archiveStale,
  type ConsolidationParams as ServiceConsolidationParams,
  type ConsolidationStrategy,
} from '../../services/consolidation.service.js';
import { isScopeType, isString, isNumber, isBoolean, isArray } from '../../utils/type-guards.js';
import type { EntryType } from '../../db/schema.js';
import type { ConsolidationParams } from '../types.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import { createValidationError } from '../../core/errors.js';

// =============================================================================
// TOOL DEFINITION
// =============================================================================

export const consolidationTool: Tool = {
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
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['find_similar', 'dedupe', 'merge', 'abstract', 'archive_stale'],
        description: 'Consolidation action to perform',
      },
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
        items: {
          type: 'string',
          enum: ['tool', 'guideline', 'knowledge'],
        },
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
    required: ['action', 'scopeType'],
  },
};

// =============================================================================
// TYPE GUARDS
// =============================================================================

function isConsolidationAction(
  v: unknown
): v is 'find_similar' | 'dedupe' | 'merge' | 'abstract' | 'archive_stale' {
  return (
    v === 'find_similar' ||
    v === 'dedupe' ||
    v === 'merge' ||
    v === 'abstract' ||
    v === 'archive_stale'
  );
}

function isEntryType(v: unknown): v is EntryType {
  return v === 'tool' || v === 'guideline' || v === 'knowledge';
}

function isEntryTypeArray(v: unknown): v is EntryType[] {
  return isArray(v) && v.every(isEntryType);
}

// =============================================================================
// HANDLER
// =============================================================================

export async function handleConsolidation(args: ConsolidationParams): Promise<unknown> {
  const action = args.action;
  if (!isConsolidationAction(action)) {
    throw createValidationError(
      'action',
      `invalid value: ${String(action)}`,
      'Must be one of: find_similar, dedupe, merge, abstract, archive_stale'
    );
  }

  const scopeType = args.scopeType;
  if (!isScopeType(scopeType)) {
    throw createValidationError(
      'scopeType',
      'is required',
      'Must be one of: global, org, project, or session'
    );
  }

  // Validate scopeId for non-global scopes
  const scopeId = isString(args.scopeId) ? args.scopeId : undefined;
  if (scopeType !== 'global' && !scopeId) {
    throw createValidationError(
      'scopeId',
      `is required for scopeType "${scopeType}"`,
      'Provide the scope ID for non-global scopes'
    );
  }

  const entryTypes = isEntryTypeArray(args.entryTypes)
    ? args.entryTypes
    : (['guideline', 'knowledge', 'tool'] as EntryType[]);

  const threshold = isNumber(args.threshold) ? args.threshold : 0.85;
  if (threshold < 0 || threshold > 1) {
    throw createValidationError(
      'threshold',
      'must be between 0 and 1',
      'Provide a value like 0.85 for 85% similarity matching'
    );
  }

  const limit = isNumber(args.limit) ? args.limit : 20;
  const dryRun = isBoolean(args.dryRun) ? args.dryRun : false;
  const consolidatedBy = isString(args.consolidatedBy) ? args.consolidatedBy : undefined;

  if (action === 'find_similar') {
    // Just find similar groups without consolidating
    const groups = await findSimilarGroups({
      scopeType,
      scopeId,
      entryTypes,
      threshold,
      limit,
    });

    return formatTimestamps({
      action: 'find_similar',
      groupsFound: groups.length,
      entriesInGroups: groups.reduce((sum, g) => sum + g.members.length + 1, 0),
      threshold,
      groups: groups.map((g) => ({
        primaryId: g.primaryId,
        primaryName: g.primaryName,
        entryType: g.entryType,
        memberCount: g.members.length,
        averageSimilarity: Math.round(g.averageSimilarity * 100) / 100,
        members: g.members.map((m) => ({
          id: m.id,
          name: m.name,
          similarity: Math.round(m.similarity * 100) / 100,
        })),
      })),
      hint:
        groups.length > 0
          ? 'Use action "dedupe" or "merge" to consolidate these groups'
          : 'No similar entries found above threshold',
    });
  }

  // Handle archive_stale action
  if (action === 'archive_stale') {
    const staleDays = isNumber(args.staleDays) ? args.staleDays : undefined;
    if (staleDays === undefined || staleDays <= 0) {
      throw createValidationError(
        'staleDays',
        'is required and must be a positive number for archive_stale action',
        'Provide the number of days after which entries are considered stale'
      );
    }

    const minRecencyScore = isNumber(args.minRecencyScore) ? args.minRecencyScore : undefined;
    if (minRecencyScore !== undefined && (minRecencyScore < 0 || minRecencyScore > 1)) {
      throw createValidationError(
        'minRecencyScore',
        'must be between 0 and 1',
        'Provide a value like 0.3 to archive entries with low recency scores'
      );
    }

    const result = await archiveStale({
      scopeType,
      scopeId,
      entryTypes,
      staleDays,
      minRecencyScore,
      dryRun,
      archivedBy: consolidatedBy,
    });

    return formatTimestamps({
      action: 'archive_stale',
      dryRun: result.dryRun,
      staleDays: result.staleDays,
      minRecencyScore: result.minRecencyScore,
      entriesScanned: result.entriesScanned,
      entriesArchived: result.entriesArchived,
      errors: result.errors.length > 0 ? result.errors : undefined,
      archivedEntries: result.archivedEntries.slice(0, 50), // Limit output size
      message: result.dryRun
        ? `Would archive ${result.entriesArchived} stale entries (older than ${staleDays} days)`
        : `Archived ${result.entriesArchived} stale entries`,
    });
  }

  // Map action to strategy
  const strategyMap: Record<string, ConsolidationStrategy> = {
    dedupe: 'dedupe',
    merge: 'semantic_merge',
    abstract: 'abstract',
  };

  const strategy = strategyMap[action];
  if (!strategy) {
    throw createValidationError(
      'action',
      `unknown action: ${action}`,
      'Use find_similar, dedupe, merge, abstract, or archive_stale'
    );
  }

  const serviceParams: ServiceConsolidationParams = {
    scopeType,
    scopeId,
    entryTypes,
    strategy,
    threshold,
    limit,
    dryRun,
    consolidatedBy,
  };

  const result = await consolidate(serviceParams);

  return formatTimestamps({
    action,
    strategy: result.strategy,
    dryRun: result.dryRun,
    groupsFound: result.groupsFound,
    entriesProcessed: result.entriesProcessed,
    entriesMerged: result.entriesMerged,
    entriesDeactivated: result.entriesDeactivated,
    errors: result.errors.length > 0 ? result.errors : undefined,
    groups: result.groups.map((g) => ({
      primaryId: g.primaryId,
      primaryName: g.primaryName,
      entryType: g.entryType,
      memberCount: g.members.length,
      averageSimilarity: Math.round(g.averageSimilarity * 100) / 100,
    })),
    message: result.dryRun
      ? `Would consolidate ${result.entriesProcessed} entries in ${result.groupsFound} groups`
      : `Consolidated ${result.entriesProcessed} entries in ${result.groupsFound} groups`,
  });
}
