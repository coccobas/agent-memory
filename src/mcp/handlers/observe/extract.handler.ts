/**
 * Extract handler - LLM-based memory extraction
 *
 * Context-aware handler that receives AppContext for dependency injection.
 */

import type { AppContext } from '../../../core/context.js';
import {
  getExtractionService,
  type ExtractionInput,
} from '../../../services/extraction.service.js';
import { checkForDuplicates } from '../../../services/duplicate.service.js';
import { logAction } from '../../../services/audit.service.js';
import { config } from '../../../config/index.js';
import {
  createValidationError,
  createExtractionUnavailableError,
  createExtractionError,
} from '../../../core/errors.js';
import { createComponentLogger } from '../../../utils/logger.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isScopeType,
  isBoolean,
  isNumber,
  isArray,
} from '../../../utils/type-guards.js';
import { formatTimestamps } from '../../../utils/timestamp-formatter.js';
import type { ScopeType } from '../../types.js';
import type { ProcessedEntry, StoredEntry } from './types.js';
import { storeEntry, storeEntity, buildNameToIdMap, createExtractedRelations } from './helpers.js';

const logger = createComponentLogger('observe.extract');

/**
 * Extract memory entries from raw context using LLM
 */
export async function extract(appContext: AppContext, params: Record<string, unknown>) {
  // Extract and validate parameters
  const context = getRequiredParam(params, 'context', isString);
  const contextType = getOptionalParam(params, 'contextType', isString) as
    | 'conversation'
    | 'code'
    | 'mixed'
    | undefined;
  const scopeType = (getOptionalParam(params, 'scopeType', isScopeType) || 'project') as ScopeType;
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const autoStore = getOptionalParam(params, 'autoStore', isBoolean) || false;
  const confidenceThreshold = getOptionalParam(params, 'confidenceThreshold', isNumber);
  const focusAreas = getOptionalParam(params, 'focusAreas', isArray) as
    | ('decisions' | 'facts' | 'rules' | 'tools')[]
    | undefined;
  const agentId = getOptionalParam(params, 'agentId', isString);

  // Validate scope
  if (scopeType !== 'global' && !scopeId) {
    throw createValidationError(
      'scopeId',
      `is required for ${scopeType} scope`,
      'Provide the ID of the parent scope'
    );
  }

  // Check if extraction service is available
  const extractionService = getExtractionService();
  if (!extractionService.isAvailable()) {
    throw createExtractionUnavailableError();
  }

  // Prepare extraction input
  const extractionInput: ExtractionInput = {
    context,
    contextType,
    focusAreas,
  };

  // Extract entries using LLM
  let result;
  try {
    result = await extractionService.extract(extractionInput);
  } catch (error) {
    throw createExtractionError(
      extractionService.getProvider(),
      error instanceof Error ? error.message : String(error)
    );
  }

  // Process each extracted entry for duplicates
  // Use per-entry-type thresholds if no explicit threshold provided
  const thresholds = config.extraction.confidenceThresholds;
  const getThreshold = (type: 'guideline' | 'knowledge' | 'tool') =>
    confidenceThreshold ?? thresholds[type];

  const processedEntries: ProcessedEntry[] = result.entries.map((entry) => {
    const entryType = entry.type;
    const name = entry.name || entry.title || 'Unnamed';

    // Check for duplicates
    const duplicateCheck = checkForDuplicates(entryType, name, scopeType, scopeId ?? null, appContext.db);

    // Determine if entry should be stored using per-type threshold
    const typeThreshold = getThreshold(entryType);
    const meetsThreshold = entry.confidence >= typeThreshold;
    const shouldStore = meetsThreshold && !duplicateCheck.isDuplicate;

    return {
      ...entry,
      isDuplicate: duplicateCheck.isDuplicate,
      similarEntries: duplicateCheck.similarEntries.slice(0, 3),
      shouldStore,
    };
  });

  // Auto-store if enabled
  const storedEntries: StoredEntry[] = [];
  const storedEntities: StoredEntry[] = [];
  // Use per-type thresholds for entities and relationships
  const entityThreshold = confidenceThreshold ?? thresholds.entity;
  const relationConfidenceThreshold = confidenceThreshold ?? thresholds.relationship;
  let relationsCreated = 0;
  let relationsSkipped = 0;

  if (autoStore) {
    // Store entries
    for (const entry of processedEntries) {
      if (entry.shouldStore) {
        try {
          const stored = await storeEntry(appContext.repos, entry, scopeType, scopeId, agentId, appContext.db);
          if (stored) {
            storedEntries.push(stored);
          }
        } catch (error) {
          logger.warn(
            {
              entryName: entry.name || entry.title,
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to auto-store extracted entry'
          );
        }
      }
    }

    // Store entities (if any were extracted)
    for (const entity of result.entities ?? []) {
      if (entity.confidence >= entityThreshold) {
        try {
          const stored = await storeEntity(appContext.repos, entity, scopeType, scopeId, agentId, appContext.db);
          if (stored) {
            storedEntities.push(stored);
          }
        } catch (error) {
          logger.warn(
            {
              entityName: entity.name,
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to auto-store extracted entity'
          );
        }
      }
    }

    // Create relations (if any were extracted)
    if (
      (result.relationships ?? []).length > 0 &&
      (storedEntries.length > 0 || storedEntities.length > 0)
    ) {
      const nameToIdMap = buildNameToIdMap(storedEntries, storedEntities);
      const relationResults = await createExtractedRelations(
        appContext.repos,
        result.relationships ?? [],
        nameToIdMap,
        relationConfidenceThreshold
      );
      relationsCreated = relationResults.created;
      relationsSkipped = relationResults.skipped + relationResults.errors;
    }
  }

  // Log audit
  logAction({
    agentId,
    action: 'query',
    scopeType,
    scopeId: scopeId ?? null,
    resultCount: result.entries.length + (result.entities ?? []).length,
  }, appContext.db);

  return formatTimestamps({
    success: true,
    extraction: {
      entries: processedEntries.map((e) => ({
        type: e.type,
        name: e.name,
        title: e.title,
        content: e.content,
        category: e.category,
        priority: e.priority,
        confidence: e.confidence,
        rationale: e.rationale,
        suggestedTags: e.suggestedTags,
        isDuplicate: e.isDuplicate,
        similarEntries: e.similarEntries,
        shouldStore: e.shouldStore,
      })),
      entities: (result.entities ?? []).map((e) => ({
        name: e.name,
        entityType: e.entityType,
        description: e.description,
        confidence: e.confidence,
      })),
      relationships: (result.relationships ?? []).map((r) => ({
        sourceRef: r.sourceRef,
        sourceType: r.sourceType,
        targetRef: r.targetRef,
        targetType: r.targetType,
        relationType: r.relationType,
        confidence: r.confidence,
      })),
      model: result.model,
      provider: result.provider,
      processingTimeMs: result.processingTimeMs,
      tokensUsed: result.tokensUsed,
    },
    stored: autoStore
      ? {
          entries: storedEntries,
          entities: storedEntities,
          relationsCreated,
        }
      : undefined,
    meta: {
      totalExtracted: result.entries.length,
      entitiesExtracted: (result.entities ?? []).length,
      relationshipsExtracted: (result.relationships ?? []).length,
      duplicatesFound: processedEntries.filter((e) => e.isDuplicate).length,
      aboveThreshold: processedEntries.filter((e) => e.shouldStore).length,
      storedCount: storedEntries.length,
      entitiesStoredCount: storedEntities.length,
      relationsCreated,
      relationsSkipped,
    },
  });
}
