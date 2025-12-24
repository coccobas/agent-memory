/**
 * Memory Summarization Handler
 *
 * MCP handler for hierarchical summarization operations.
 * Implements multi-level memory consolidation for efficient retrieval.
 * Context-aware handlers that receive AppContext for dependency injection.
 */

import type { AppContext } from '../../core/context.js';
import { createValidationError, createNotFoundError } from '../../core/errors.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
  isBoolean,
  isScopeType,
  isArray,
} from '../../utils/type-guards.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import type { EntryType } from '../../db/schema.js';
import type { HierarchyLevel, SummaryEntry } from '../../services/summarization/types.js';
import { HierarchicalSummarizationService } from '../../services/summarization/hierarchical-summarization.service.js';
import { EmbeddingService } from '../../services/embedding.service.js';
import { ExtractionService } from '../../services/extraction.service.js';

// =============================================================================
// TYPE GUARDS
// =============================================================================

function isEntryType(value: unknown): value is EntryType {
  return value === 'tool' || value === 'guideline' || value === 'knowledge' || value === 'experience';
}

function isEntryTypeArray(value: unknown): value is EntryType[] {
  return isArray(value) && value.every(isEntryType);
}

function isHierarchyLevel(value: unknown): value is HierarchyLevel {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Build hierarchical summaries for a scope
 *
 * Creates up to 3 levels of summaries:
 * - Level 1: First-level summaries of entry groups
 * - Level 2: Summaries of level 1 summaries
 * - Level 3: Top-level summaries
 */
async function buildSummaries(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const scopeType = getRequiredParam(params, 'scopeType', isScopeType);
  const scopeId = getOptionalParam(params, 'scopeId', isString);

  // Validate scopeId for non-global scopes
  if (scopeType !== 'global' && !scopeId) {
    throw createValidationError(
      'scopeId',
      `is required for scopeType "${scopeType}"`,
      'Provide the scope ID for non-global scopes'
    );
  }

  const entryTypes = getOptionalParam(params, 'entryTypes', isEntryTypeArray);
  const forceRebuild = getOptionalParam(params, 'forceRebuild', isBoolean) ?? false;

  // Validate required services
  if (!context.services?.embedding || !context.services?.vector || !context.services?.extraction) {
    throw createValidationError(
      'services',
      'Embedding, vector, and extraction services are required for summarization',
      'Ensure services are properly initialized'
    );
  }

  const service = new HierarchicalSummarizationService(
    context.db,
    context.services.embedding as EmbeddingService,
    context.services.extraction as ExtractionService,
    context.services.vector
  );

  const result = await service.buildSummaries({
    scopeType,
    scopeId,
    entryTypes: entryTypes as ('tool' | 'guideline' | 'knowledge' | 'experience')[] | undefined,
    forceRebuild,
  });

  return formatTimestamps({
    action: 'build',
    success: true,
    summariesCreated: result.summariesCreated,
    levelsBuilt: result.levelsBuilt,
    processingTimeMs: result.processingTimeMs,
    scopeType,
    scopeId,
    summariesByLevel: result.summariesByLevel,
    stats: result.stats,
    topLevelSummary: result.topLevelSummary ? {
      id: result.topLevelSummary.id,
      title: result.topLevelSummary.title,
      hierarchyLevel: result.topLevelSummary.hierarchyLevel,
      memberCount: result.topLevelSummary.memberCount,
    } : undefined,
    message: forceRebuild
      ? `Rebuilt ${result.summariesCreated} summaries across ${result.levelsBuilt} hierarchy levels`
      : `Created ${result.summariesCreated} new summaries across ${result.levelsBuilt} hierarchy levels`,
  });
}

/**
 * Get build status for a scope
 */
async function getStatus(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const scopeType = getRequiredParam(params, 'scopeType', isScopeType);
  const scopeId = getOptionalParam(params, 'scopeId', isString);

  // Validate scopeId for non-global scopes
  if (scopeType !== 'global' && !scopeId) {
    throw createValidationError(
      'scopeId',
      `is required for scopeType "${scopeType}"`,
      'Provide the scope ID for non-global scopes'
    );
  }

  // Validate required services
  if (!context.services?.embedding || !context.services?.vector || !context.services?.extraction) {
    throw createValidationError(
      'services',
      'Embedding, vector, and extraction services are required for summarization',
      'Ensure services are properly initialized'
    );
  }

  const service = new HierarchicalSummarizationService(
    context.db,
    context.services.embedding as EmbeddingService,
    context.services.extraction as ExtractionService,
    context.services.vector
  );

  const status = await service.getStatus(scopeType, scopeId);

  return formatTimestamps({
    action: 'status',
    ...status,
  });
}

/**
 * Get a single summary by ID
 */
async function getSummary(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const id = getRequiredParam(params, 'id', isString);

  // Validate required services
  if (!context.services?.embedding || !context.services?.vector || !context.services?.extraction) {
    throw createValidationError(
      'services',
      'Embedding, vector, and extraction services are required for summarization',
      'Ensure services are properly initialized'
    );
  }

  const service = new HierarchicalSummarizationService(
    context.db,
    context.services.embedding as EmbeddingService,
    context.services.extraction as ExtractionService,
    context.services.vector
  );

  const summary = await service.getSummary(id);

  if (!summary) {
    throw createNotFoundError('summary', id);
  }

  return formatTimestamps({
    action: 'get',
    summary,
  });
}

/**
 * Search summaries semantically
 */
async function searchSummaries(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const query = getRequiredParam(params, 'query', isString);
  const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const level = getOptionalParam(params, 'level', isHierarchyLevel);
  const limit = getOptionalParam(params, 'limit', isNumber) ?? 10;

  // Validate scopeId if scopeType is provided
  if (scopeType && scopeType !== 'global' && !scopeId) {
    throw createValidationError(
      'scopeId',
      `is required for scopeType "${scopeType}"`,
      'Provide the scope ID for non-global scopes'
    );
  }

  // Validate required services
  if (!context.services?.embedding || !context.services?.vector || !context.services?.extraction) {
    throw createValidationError(
      'services',
      'Embedding, vector, and extraction services are required for semantic search',
      'Ensure services are properly initialized'
    );
  }

  const service = new HierarchicalSummarizationService(
    context.db,
    context.services.embedding as EmbeddingService,
    context.services.extraction as ExtractionService,
    context.services.vector
  );

  const results = await service.searchSummaries({
    query,
    scopeType,
    scopeId,
    level,
    limit,
  });

  return formatTimestamps({
    action: 'search',
    query,
    count: results.length,
    summaries: results.map((s: SummaryEntry) => ({
      id: s.id,
      title: s.title,
      hierarchyLevel: s.hierarchyLevel,
      memberCount: s.memberCount,
      scopeType: s.scopeType,
      scopeId: s.scopeId,
      metadata: s.metadata,
    })),
  });
}

/**
 * Drill down from a summary to its child summaries
 */
async function drillDown(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const summaryId = getRequiredParam(params, 'summaryId', isString);

  // Validate required services
  if (!context.services?.embedding || !context.services?.vector || !context.services?.extraction) {
    throw createValidationError(
      'services',
      'Embedding, vector, and extraction services are required for summarization',
      'Ensure services are properly initialized'
    );
  }

  const service = new HierarchicalSummarizationService(
    context.db,
    context.services.embedding as EmbeddingService,
    context.services.extraction as ExtractionService,
    context.services.vector
  );

  const summary = await service.getSummary(summaryId);
  if (!summary) {
    throw createNotFoundError('summary', summaryId);
  }

  const childSummaries = await service.getChildSummaries(summaryId);

  return formatTimestamps({
    action: 'drill_down',
    summary: {
      id: summary.id,
      title: summary.title,
      content: summary.content,
      hierarchyLevel: summary.hierarchyLevel,
      memberCount: summary.memberCount,
      memberIds: summary.memberIds,
    },
    childSummaries: childSummaries.map((s: SummaryEntry) => ({
      id: s.id,
      title: s.title,
      hierarchyLevel: s.hierarchyLevel,
      memberCount: s.memberCount,
    })),
  });
}

/**
 * Delete all summaries for a scope
 */
async function deleteSummaries(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const scopeType = getRequiredParam(params, 'scopeType', isScopeType);
  const scopeId = getOptionalParam(params, 'scopeId', isString);

  // Validate scopeId for non-global scopes
  if (scopeType !== 'global' && !scopeId) {
    throw createValidationError(
      'scopeId',
      `is required for scopeType "${scopeType}"`,
      'Provide the scope ID for non-global scopes'
    );
  }

  // Validate required services
  if (!context.services?.embedding || !context.services?.vector || !context.services?.extraction) {
    throw createValidationError(
      'services',
      'Embedding, vector, and extraction services are required for summarization',
      'Ensure services are properly initialized'
    );
  }

  const service = new HierarchicalSummarizationService(
    context.db,
    context.services.embedding as EmbeddingService,
    context.services.extraction as ExtractionService,
    context.services.vector
  );

  const deletedCount = await service.deleteSummaries(scopeType, scopeId);

  return formatTimestamps({
    action: 'delete',
    success: true,
    scopeType,
    scopeId,
    deletedCount,
    message: `Deleted ${deletedCount} summaries from ${scopeType}${scopeId ? `:${scopeId}` : ''}`,
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

export const summarizeHandlers = {
  build: buildSummaries,
  status: getStatus,
  get: getSummary,
  search: searchSummaries,
  drill_down: drillDown,
  delete: deleteSummaries,
};
