/**
 * Commit handler - Store client-extracted entries
 *
 * Context-aware handler that receives AppContext for dependency injection.
 * The handler validates and normalizes input, then delegates to ObserveCommitService.
 */

import type { AppContext } from '../../../core/context.js';
import { logAction } from '../../../services/audit.service.js';
import { createValidationError } from '../../../core/errors.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isBoolean,
  isNumber,
  isArray,
} from '../../../utils/type-guards.js';
import { formatTimestamps } from '../../../utils/timestamp-formatter.js';
import type {
  ExtractedEntity,
  ExtractedRelationship,
} from '../../../services/extraction.service.js';
import type { ObserveCommitEntry } from './types.js';
import { parseEnvBool, parseEnvNumber } from './helpers.js';

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
 * Validates and normalizes input, then delegates to ObserveCommitService.
 * - High-confidence entries can auto-promote to project scope (default on)
 * - Lower-confidence entries are stored at session scope and tagged for review
 */
export async function commit(context: AppContext, params: Record<string, unknown>) {
  // Validate required service
  if (!context.services.observeCommit) {
    throw createValidationError('observeCommit', 'service not available');
  }

  // Parse and validate parameters
  const sessionId = getRequiredParam(params, 'sessionId', isString);
  const projectId = getOptionalParam(params, 'projectId', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);

  // Normalize entries
  const rawEntries = getRequiredParam(params, 'entries', isArray);
  const entries = rawEntries.map((e, i) => normalizeCommitEntry(e, i));

  // Normalize entities (optional)
  const rawEntities = getOptionalParam(params, 'entities', isArray) || [];
  const entities: ExtractedEntity[] = rawEntities
    .map((e, i) => normalizeCommitEntity(e, i))
    .filter((e): e is ExtractedEntity => e !== null);

  // Normalize relationships (optional)
  const rawRelationships = getOptionalParam(params, 'relationships', isArray) || [];
  const relationships: ExtractedRelationship[] = rawRelationships
    .map((r, i) => normalizeCommitRelationship(r, i))
    .filter((r): r is ExtractedRelationship => r !== null);

  // Get auto-promote settings
  const autoPromoteDefault = parseEnvBool('AGENT_MEMORY_OBSERVE_AUTO_PROMOTE_DEFAULT', true);
  const autoPromote = getOptionalParam(params, 'autoPromote', isBoolean) ?? autoPromoteDefault;
  const autoPromoteThresholdDefault = parseEnvNumber(
    'AGENT_MEMORY_OBSERVE_AUTO_PROMOTE_THRESHOLD',
    0.85
  );
  const autoPromoteThreshold =
    getOptionalParam(params, 'autoPromoteThreshold', isNumber) ?? autoPromoteThresholdDefault;

  // Delegate to service for business logic
  const result = await context.services.observeCommit.commit({
    sessionId,
    projectId,
    agentId,
    entries,
    entities,
    relationships,
    autoPromote,
    autoPromoteThreshold,
  });

  // Log audit action
  logAction(
    {
      agentId,
      action: 'create',
      scopeType: 'session',
      scopeId: sessionId,
      resultCount: result.stored.entries.length + result.stored.entities.length,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    stored: result.stored,
    skippedDuplicates: result.skippedDuplicates,
    meta: result.meta,
  });
}
