/**
 * Commit handler - Store client-extracted entries
 *
 * Context-aware handler that receives AppContext for dependency injection.
 */

import type { AppContext } from '../../../core/context.js';
import { checkForDuplicates } from '../../../services/duplicate.service.js';
import { logAction } from '../../../services/audit.service.js';
import { createValidationError } from '../../../core/errors.js';
import { createComponentLogger } from '../../../utils/logger.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isBoolean,
  isNumber,
  isArray,
} from '../../../utils/type-guards.js';
import { formatTimestamps } from '../../../utils/timestamp-formatter.js';
import type { ScopeType } from '../../types.js';
import type {
  ExtractedEntity,
  ExtractedRelationship,
} from '../../../services/extraction.service.js';
import type { ProcessedEntry, StoredEntry, ObserveCommitEntry } from './types.js';
import {
  parseEnvBool,
  parseEnvNumber,
  mergeSessionMetadata,
  ensureSessionIdExists,
  storeEntry,
  storeEntity,
  buildNameToIdMap,
  createExtractedRelations,
} from './helpers.js';

const logger = createComponentLogger('observe.commit');

// =============================================================================
// NORMALIZATION FUNCTIONS
// =============================================================================

function normalizeCommitEntry(raw: unknown, index: number): ObserveCommitEntry {
  if (!raw || typeof raw !== 'object') {
    throw createValidationError(
      `entries[${index}]`,
      'must be an object',
      'Provide an entry object'
    );
  }

  const obj = raw as Record<string, unknown>;
  const type = obj.type;
  if (type !== 'guideline' && type !== 'knowledge' && type !== 'tool') {
    throw createValidationError(
      `entries[${index}].type`,
      'must be one of guideline|knowledge|tool',
      'Set entry.type correctly'
    );
  }

  const confidence = obj.confidence;
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    throw createValidationError(
      `entries[${index}].confidence`,
      'must be a number between 0 and 1',
      'Set confidence between 0 and 1'
    );
  }

  const content = obj.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw createValidationError(
      `entries[${index}].content`,
      'must be a non-empty string',
      'Provide entry.content'
    );
  }

  const name = typeof obj.name === 'string' ? obj.name : undefined;
  const title = typeof obj.title === 'string' ? obj.title : undefined;

  if (type === 'guideline' && (!name || name.trim().length === 0)) {
    throw createValidationError(
      `entries[${index}].name`,
      'is required for guideline entries',
      'Provide guideline.name'
    );
  }
  if (type === 'tool' && (!name || name.trim().length === 0)) {
    throw createValidationError(
      `entries[${index}].name`,
      'is required for tool entries',
      'Provide tool.name'
    );
  }
  if (type === 'knowledge' && (!title || title.trim().length === 0)) {
    throw createValidationError(
      `entries[${index}].title`,
      'is required for knowledge entries',
      'Provide knowledge.title'
    );
  }

  const category = typeof obj.category === 'string' ? obj.category : undefined;
  const priority = typeof obj.priority === 'number' ? obj.priority : undefined;
  const rationale = typeof obj.rationale === 'string' ? obj.rationale : undefined;
  const suggestedTags = Array.isArray(obj.suggestedTags)
    ? obj.suggestedTags.filter((t) => typeof t === 'string')
    : undefined;

  return {
    type,
    name,
    title,
    content,
    category,
    priority,
    confidence,
    rationale,
    suggestedTags,
  };
}

function normalizeCommitEntity(raw: unknown, index: number): ExtractedEntity | null {
  if (!raw || typeof raw !== 'object') {
    throw createValidationError(
      `entities[${index}]`,
      'must be an object',
      'Provide an entity object'
    );
  }

  const obj = raw as Record<string, unknown>;

  const name = obj.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw createValidationError(
      `entities[${index}].name`,
      'must be a non-empty string',
      'Provide entity.name'
    );
  }

  const entityType = obj.entityType;
  const validEntityTypes = ['person', 'technology', 'component', 'concept', 'organization'];
  if (typeof entityType !== 'string' || !validEntityTypes.includes(entityType)) {
    throw createValidationError(
      `entities[${index}].entityType`,
      `must be one of: ${validEntityTypes.join(', ')}`,
      'Set entity.entityType correctly'
    );
  }

  const confidence = obj.confidence;
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    throw createValidationError(
      `entities[${index}].confidence`,
      'must be a number between 0 and 1',
      'Set confidence between 0 and 1'
    );
  }

  const description = typeof obj.description === 'string' ? obj.description : undefined;

  return {
    name: name.trim(),
    entityType: entityType as ExtractedEntity['entityType'],
    description,
    confidence,
  };
}

function normalizeCommitRelationship(raw: unknown, index: number): ExtractedRelationship | null {
  if (!raw || typeof raw !== 'object') {
    throw createValidationError(
      `relationships[${index}]`,
      'must be an object',
      'Provide a relationship object'
    );
  }

  const obj = raw as Record<string, unknown>;

  const sourceRef = obj.sourceRef;
  if (typeof sourceRef !== 'string' || sourceRef.trim().length === 0) {
    throw createValidationError(
      `relationships[${index}].sourceRef`,
      'must be a non-empty string',
      'Provide relationship.sourceRef'
    );
  }

  const sourceType = obj.sourceType;
  const validSourceTypes = ['guideline', 'knowledge', 'tool', 'entity'];
  if (typeof sourceType !== 'string' || !validSourceTypes.includes(sourceType)) {
    throw createValidationError(
      `relationships[${index}].sourceType`,
      `must be one of: ${validSourceTypes.join(', ')}`,
      'Set relationship.sourceType correctly'
    );
  }

  const targetRef = obj.targetRef;
  if (typeof targetRef !== 'string' || targetRef.trim().length === 0) {
    throw createValidationError(
      `relationships[${index}].targetRef`,
      'must be a non-empty string',
      'Provide relationship.targetRef'
    );
  }

  const targetType = obj.targetType;
  if (typeof targetType !== 'string' || !validSourceTypes.includes(targetType)) {
    throw createValidationError(
      `relationships[${index}].targetType`,
      `must be one of: ${validSourceTypes.join(', ')}`,
      'Set relationship.targetType correctly'
    );
  }

  const relationType = obj.relationType;
  const validRelationTypes = ['depends_on', 'related_to', 'applies_to', 'conflicts_with'];
  if (typeof relationType !== 'string' || !validRelationTypes.includes(relationType)) {
    throw createValidationError(
      `relationships[${index}].relationType`,
      `must be one of: ${validRelationTypes.join(', ')}`,
      'Set relationship.relationType correctly'
    );
  }

  const confidence = obj.confidence;
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    throw createValidationError(
      `relationships[${index}].confidence`,
      'must be a number between 0 and 1',
      'Set confidence between 0 and 1'
    );
  }

  return {
    sourceRef: sourceRef.trim(),
    sourceType: sourceType as ExtractedRelationship['sourceType'],
    targetRef: targetRef.trim(),
    targetType: targetType as ExtractedRelationship['targetType'],
    relationType: relationType as ExtractedRelationship['relationType'],
    confidence,
  };
}

// =============================================================================
// COMMIT HANDLER
// =============================================================================

/**
 * Client-assisted extraction: accept extracted entries and store them.
 *
 * - High-confidence entries can auto-promote to project scope (default on)
 * - Lower-confidence entries are stored at session scope and tagged for review
 */
export async function commit(context: AppContext, params: Record<string, unknown>) {
  const sessionId = getRequiredParam(params, 'sessionId', isString);
  const projectId = getOptionalParam(params, 'projectId', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);

  const rawEntries = getRequiredParam(params, 'entries', isArray);
  const entries = rawEntries.map((e, i) => normalizeCommitEntry(e, i));

  // Parse entities (optional)
  const rawEntities = getOptionalParam(params, 'entities', isArray) || [];
  const entities: ExtractedEntity[] = rawEntities
    .map((e, i) => normalizeCommitEntity(e, i))
    .filter((e): e is ExtractedEntity => e !== null);

  // Parse relationships (optional)
  const rawRelationships = getOptionalParam(params, 'relationships', isArray) || [];
  const relationships: ExtractedRelationship[] = rawRelationships
    .map((r, i) => normalizeCommitRelationship(r, i))
    .filter((r): r is ExtractedRelationship => r !== null);

  const autoPromoteDefault = parseEnvBool('AGENT_MEMORY_OBSERVE_AUTO_PROMOTE_DEFAULT', true);
  const autoPromote = getOptionalParam(params, 'autoPromote', isBoolean) ?? autoPromoteDefault;
  const autoPromoteThresholdDefault = parseEnvNumber(
    'AGENT_MEMORY_OBSERVE_AUTO_PROMOTE_THRESHOLD',
    0.85
  );
  const autoPromoteThreshold =
    getOptionalParam(params, 'autoPromoteThreshold', isNumber) ?? autoPromoteThresholdDefault;

  const relationConfidenceThreshold = 0.8;

  // Ensure session exists
  await ensureSessionIdExists(context.db, context.repos, sessionId, projectId, agentId);

  const stored: StoredEntry[] = [];
  const storedEntities: StoredEntry[] = [];
  const skippedDuplicates: Array<{ type: string; name: string; scopeType: ScopeType }> = [];
  let storedToProject = 0;
  let storedToSession = 0;
  let needsReviewCount = 0;
  let relationsCreated = 0;
  let relationsSkipped = 0;

  // Store entries
  for (const entry of entries) {
    const wantsProject = autoPromote && entry.confidence >= autoPromoteThreshold && !!projectId;
    const targetScopeType: ScopeType = wantsProject ? 'project' : 'session';
    const targetScopeId = wantsProject ? projectId : sessionId;

    const entryType = entry.type;
    const entryName = entry.name || entry.title || 'Unnamed';
    const duplicateCheck = checkForDuplicates(
      entryType,
      entryName,
      targetScopeType,
      targetScopeId ?? null
    );

    if (duplicateCheck.isDuplicate) {
      skippedDuplicates.push({ type: entryType, name: entryName, scopeType: targetScopeType });
      continue;
    }

    const processed: ProcessedEntry = {
      ...entry,
      isDuplicate: false,
      similarEntries: duplicateCheck.similarEntries.slice(0, 3),
      shouldStore: true,
    };

    const saved = await storeEntry(context.repos, processed, targetScopeType, targetScopeId, agentId);
    if (!saved) continue;
    stored.push(saved);

    if (targetScopeType === 'project') storedToProject += 1;
    else storedToSession += 1;

    const isCandidate = targetScopeType === 'session';
    if (isCandidate) {
      needsReviewCount += 1;
      try {
        await context.repos.entryTags.attach({
          entryType: saved.type,
          entryId: saved.id,
          tagName: 'needs_review',
        });
        await context.repos.entryTags.attach({ entryType: saved.type, entryId: saved.id, tagName: 'candidate' });
      } catch (error) {
        logger.warn(
          {
            entryType: saved.type,
            entryId: saved.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to attach candidate tags'
        );
      }
    }

    const suggestedTags = Array.isArray(entry.suggestedTags) ? entry.suggestedTags : [];
    for (const tagName of suggestedTags) {
      if (typeof tagName !== 'string' || !tagName.trim()) continue;
      try {
        await context.repos.entryTags.attach({ entryType: saved.type, entryId: saved.id, tagName });
      } catch {
        // best-effort
      }
    }
  }

  // Store entities
  for (const entity of entities) {
    const wantsProject = autoPromote && entity.confidence >= autoPromoteThreshold && !!projectId;
    const targetScopeType: ScopeType = wantsProject ? 'project' : 'session';
    const targetScopeId = wantsProject ? projectId : sessionId;

    try {
      const saved = await storeEntity(context.repos, entity, targetScopeType, targetScopeId, agentId);
      if (saved) {
        storedEntities.push(saved);
      }
    } catch (error) {
      logger.warn(
        {
          entityName: entity.name,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to store entity in commit'
      );
    }
  }

  // Create relations
  if (relationships.length > 0 && (stored.length > 0 || storedEntities.length > 0)) {
    const nameToIdMap = buildNameToIdMap(stored, storedEntities);
    const relationResults = await createExtractedRelations(
      context.repos,
      relationships,
      nameToIdMap,
      relationConfidenceThreshold
    );
    relationsCreated = relationResults.created;
    relationsSkipped = relationResults.skipped + relationResults.errors;
  }

  const committedAt = new Date().toISOString();
  const reviewedAt = needsReviewCount === 0 ? committedAt : undefined;
  const nextMeta = await mergeSessionMetadata(context.repos, sessionId, {
    observe: {
      committedAt,
      committedBy: agentId ?? null,
      autoPromote,
      autoPromoteThreshold,
      totalReceived: entries.length,
      entitiesReceived: entities.length,
      relationshipsReceived: relationships.length,
      storedCount: stored.length,
      entitiesStoredCount: storedEntities.length,
      relationsCreated,
      storedToProject,
      storedToSession,
      needsReviewCount,
      ...(reviewedAt ? { reviewedAt } : {}),
    },
  });
  await context.repos.sessions.update(sessionId, { metadata: nextMeta });

  logAction({
    agentId,
    action: 'create',
    scopeType: 'session',
    scopeId: sessionId,
    resultCount: stored.length + storedEntities.length,
  });

  return formatTimestamps({
    success: true,
    stored: {
      entries: stored,
      entities: storedEntities,
      relationsCreated,
    },
    skippedDuplicates,
    meta: {
      sessionId,
      projectId: projectId ?? null,
      autoPromote,
      autoPromoteThreshold,
      totalReceived: entries.length,
      entitiesReceived: entities.length,
      relationshipsReceived: relationships.length,
      storedCount: stored.length,
      entitiesStoredCount: storedEntities.length,
      relationsCreated,
      relationsSkipped,
      storedToProject,
      storedToSession,
      needsReviewCount,
      committedAt,
      reviewedAt: reviewedAt ?? null,
    },
  });
}
