/**
 * Observe handlers for auto-capture memory extraction
 */

import {
  getExtractionService,
  type ExtractedEntry,
  type ExtractedEntity,
  type ExtractedRelationship,
  type ExtractionInput,
} from '../../services/extraction.service.js';
import { checkForDuplicates, type SimilarEntry } from '../../services/duplicate.service.js';
import { guidelineRepo, type CreateGuidelineInput } from '../../db/repositories/guidelines.js';
import { knowledgeRepo, type CreateKnowledgeInput } from '../../db/repositories/knowledge.js';
import { toolRepo, type CreateToolInput } from '../../db/repositories/tools.js';
import { logAction } from '../../services/audit.service.js';
import { config } from '../../config/index.js';

import {
  createValidationError,
  createExtractionUnavailableError,
  createExtractionError,
} from '../errors.js';
import { createComponentLogger } from '../../utils/logger.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isScopeType,
  isBoolean,
  isNumber,
  isArray,
} from '../../utils/type-guards.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import type { ScopeType } from '../types.js';
import { entryTagRepo, entryRelationRepo } from '../../db/repositories/tags.js';
import { sessionRepo } from '../../db/repositories/scopes.js';
import { getDb } from '../../db/connection.js';
import { sessions } from '../../db/schema.js';
import type { RelationType, EntryType } from '../../db/schema.js';

const logger = createComponentLogger('observe');

interface ProcessedEntry extends ExtractedEntry {
  isDuplicate: boolean;
  similarEntries: SimilarEntry[];
  shouldStore: boolean;
}

interface StoredEntry {
  id: string;
  type: 'guideline' | 'knowledge' | 'tool';
  name: string;
}

type ObserveCommitEntry = ExtractedEntry & {
  confidence: number;
  content: string;
  type: 'guideline' | 'knowledge' | 'tool';
};

function parseEnvBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parseEnvNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function mergeSessionMetadata(
  sessionId: string,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const existing = sessionRepo.getById(sessionId);
  const existingMeta = existing?.metadata ?? {};
  return { ...existingMeta, ...patch };
}

function ensureSessionIdExists(sessionId: string, projectId?: string, agentId?: string): void {
  if (sessionRepo.getById(sessionId)) return;

  const db = getDb();
  db.insert(sessions)
    .values({
      id: sessionId,
      projectId: projectId ?? null,
      name: 'Session (auto-created by observe.commit)',
      purpose: 'Auto-created to store observe entries',
      agentId: agentId ?? null,
      status: 'active',
      metadata: { source: 'observe.commit' },
    })
    .run();
}

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

/**
 * Normalize and validate entity input for commit flow
 */
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

/**
 * Normalize and validate relationship input for commit flow
 */
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

/**
 * Store an entity as a knowledge entry with category 'entity'
 */
function storeEntity(
  entity: ExtractedEntity,
  scopeType: ScopeType,
  scopeId: string | undefined,
  agentId?: string
): StoredEntry | null {
  // Check for duplicates
  const duplicateCheck = checkForDuplicates('knowledge', entity.name, scopeType, scopeId ?? null);
  if (duplicateCheck.isDuplicate) {
    logger.debug({ entityName: entity.name }, 'Skipping duplicate entity');
    return null;
  }

  const input: CreateKnowledgeInput = {
    scopeType,
    scopeId,
    title: entity.name,
    content: entity.description || `${entity.entityType}: ${entity.name}`,
    category: 'fact', // Use 'fact' category for entities (valid knowledge category)
    source: `Extracted entity (${entity.entityType})`,
    createdBy: agentId,
  };

  const knowledge = knowledgeRepo.create(input);

  logAction({
    agentId,
    action: 'create',
    entryType: 'knowledge',
    entryId: knowledge.id,
    scopeType,
    scopeId: scopeId ?? null,
  });

  // Tag with entity markers
  try {
    entryTagRepo.attach({ entryType: 'knowledge', entryId: knowledge.id, tagName: 'entity' });
    entryTagRepo.attach({
      entryType: 'knowledge',
      entryId: knowledge.id,
      tagName: `entity-type:${entity.entityType}`,
    });
  } catch (error) {
    logger.warn(
      { entityId: knowledge.id, error: error instanceof Error ? error.message : String(error) },
      'Failed to attach entity tags'
    );
  }

  return {
    id: knowledge.id,
    type: 'knowledge',
    name: knowledge.title,
  };
}

/**
 * Build a name-to-ID map from stored entries for relationship resolution
 */
function buildNameToIdMap(
  storedEntries: StoredEntry[],
  storedEntities: StoredEntry[]
): Map<string, { id: string; type: EntryType }> {
  const map = new Map<string, { id: string; type: EntryType }>();

  for (const entry of storedEntries) {
    map.set(entry.name.toLowerCase(), { id: entry.id, type: entry.type });
  }

  for (const entity of storedEntities) {
    // Entities are stored as knowledge entries
    map.set(entity.name.toLowerCase(), { id: entity.id, type: 'knowledge' });
  }

  return map;
}

/**
 * Create relations from extracted relationships
 */
function createExtractedRelations(
  relationships: ExtractedRelationship[],
  nameToIdMap: Map<string, { id: string; type: EntryType }>,
  confidenceThreshold: number = 0.8
): { created: number; skipped: number; errors: number } {
  let created = 0;
  let skipped = 0;
  let errors = 0;

  // Map extracted source types to entry types
  const sourceTypeToEntryType: Record<string, EntryType> = {
    guideline: 'guideline',
    knowledge: 'knowledge',
    tool: 'tool',
    entity: 'knowledge', // Entities are stored as knowledge
  };

  // Map extracted relation types to schema relation types
  const relationTypeMap: Record<string, RelationType> = {
    depends_on: 'depends_on',
    related_to: 'related_to',
    applies_to: 'applies_to',
    conflicts_with: 'conflicts_with',
  };

  for (const rel of relationships) {
    // Skip low-confidence relationships
    if (rel.confidence < confidenceThreshold) {
      skipped++;
      continue;
    }

    // Look up source and target by name
    const source = nameToIdMap.get(rel.sourceRef.toLowerCase());
    const target = nameToIdMap.get(rel.targetRef.toLowerCase());

    if (!source || !target) {
      logger.debug(
        { sourceRef: rel.sourceRef, targetRef: rel.targetRef },
        'Could not resolve relationship references'
      );
      skipped++;
      continue;
    }

    const sourceType = sourceTypeToEntryType[rel.sourceType];
    const targetType = sourceTypeToEntryType[rel.targetType];
    const relationType = relationTypeMap[rel.relationType];

    if (!sourceType || !targetType || !relationType) {
      skipped++;
      continue;
    }

    try {
      entryRelationRepo.create({
        sourceType,
        sourceId: source.id,
        targetType,
        targetId: target.id,
        relationType,
      });
      created++;
    } catch (error) {
      logger.warn(
        {
          sourceRef: rel.sourceRef,
          targetRef: rel.targetRef,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to create relation'
      );
      errors++;
    }
  }

  return { created, skipped, errors };
}

export const observeHandlers = {
  /**
   * Extract memory entries from raw context using LLM
   */
  async extract(params: Record<string, unknown>) {
    // Extract and validate parameters
    const context = getRequiredParam(params, 'context', isString);
    const contextType = getOptionalParam(params, 'contextType', isString) as
      | 'conversation'
      | 'code'
      | 'mixed'
      | undefined;
    const scopeType = (getOptionalParam(params, 'scopeType', isScopeType) ||
      'project') as ScopeType;
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
      const duplicateCheck = checkForDuplicates(entryType, name, scopeType, scopeId ?? null);

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
            const stored = storeEntry(entry, scopeType, scopeId, agentId);
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
            const stored = storeEntity(entity, scopeType, scopeId, agentId);
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
        const relationResults = createExtractedRelations(
          result.relationships ?? [],
          nameToIdMap,
          relationConfidenceThreshold
        );
        relationsCreated = relationResults.created;
        relationsSkipped = relationResults.skipped + relationResults.errors;
      }
    }

    // Log audit (omit entryType as 'observation' is not a valid EntryType)
    logAction({
      agentId,
      action: 'query', // Using 'query' as extraction is read-like
      scopeType,
      scopeId: scopeId ?? null,
      resultCount: result.entries.length + (result.entities ?? []).length,
    });

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
  },

  /**
   * Get extraction service status
   */
  status() {
    const service = getExtractionService();
    return {
      available: service.isAvailable(),
      provider: service.getProvider(),
      configured: service.getProvider() !== 'disabled',
    };
  },

  /**
   * Client-assisted extraction: return a strict schema and prompt template.
   *
   * Intended for environments where the *same* LLM driving the conversation
   * performs the extraction and then calls `memory_observe` with `commit`.
   */
  draft(params: Record<string, unknown>) {
    const sessionId = getRequiredParam(params, 'sessionId', isString);
    const projectId = getOptionalParam(params, 'projectId', isString);

    const autoPromoteDefault = parseEnvBool('AGENT_MEMORY_OBSERVE_AUTO_PROMOTE_DEFAULT', true);
    const autoPromote = getOptionalParam(params, 'autoPromote', isBoolean) ?? autoPromoteDefault;
    const autoPromoteThresholdDefault = parseEnvNumber(
      'AGENT_MEMORY_OBSERVE_AUTO_PROMOTE_THRESHOLD',
      0.85
    );
    const autoPromoteThreshold =
      getOptionalParam(params, 'autoPromoteThreshold', isNumber) ?? autoPromoteThresholdDefault;

    const focusAreas = getOptionalParam(params, 'focusAreas', isArray) as
      | ('decisions' | 'facts' | 'rules' | 'tools')[]
      | undefined;

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        sessionId: { type: 'string' },
        projectId: { type: ['string', 'null'] },
        autoPromote: { type: 'boolean' },
        autoPromoteThreshold: { type: 'number' },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ['guideline', 'knowledge', 'tool'] },
              name: { type: 'string' }, // required for guideline/tool
              title: { type: 'string' }, // required for knowledge
              content: { type: 'string' },
              category: { type: 'string' },
              priority: { type: 'number' },
              confidence: { type: 'number' },
              rationale: { type: 'string' },
              suggestedTags: { type: 'array', items: { type: 'string' } },
            },
            required: ['type', 'content', 'confidence'],
          },
        },
        entities: {
          type: 'array',
          description: 'Named entities extracted from context (technologies, components, etc.)',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              entityType: {
                type: 'string',
                enum: ['person', 'technology', 'component', 'concept', 'organization'],
              },
              description: { type: 'string' },
              confidence: { type: 'number' },
            },
            required: ['name', 'entityType', 'confidence'],
          },
        },
        relationships: {
          type: 'array',
          description: 'Relationships between extracted entries/entities',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              sourceRef: { type: 'string', description: 'Name of source entry/entity' },
              sourceType: {
                type: 'string',
                enum: ['guideline', 'knowledge', 'tool', 'entity'],
              },
              targetRef: { type: 'string', description: 'Name of target entry/entity' },
              targetType: {
                type: 'string',
                enum: ['guideline', 'knowledge', 'tool', 'entity'],
              },
              relationType: {
                type: 'string',
                enum: ['depends_on', 'related_to', 'applies_to', 'conflicts_with'],
              },
              confidence: { type: 'number' },
            },
            required: [
              'sourceRef',
              'sourceType',
              'targetRef',
              'targetType',
              'relationType',
              'confidence',
            ],
          },
        },
      },
      required: ['sessionId', 'entries'],
    } as const;

    const instructions = [
      'Extract durable memory from the session transcript: concrete decisions, stable facts, reusable rules, important tools, named entities, and relationships.',
      'Prefer fewer, higher-quality entries. Avoid ephemeral state (temporary TODOs, one-off stack traces, momentary preferences).',
      'Set `confidence` in [0,1]. Use higher confidence only when the transcript clearly supports it.',
      'For `knowledge`, use `title` (short) and `content` (detail). For `guideline`/`tool`, use `name` + `content`.',
      'For `entities`, extract named technologies, components, people, organizations, and concepts. Use `entityType` to categorize.',
      'For `relationships`, link extracted items using: depends_on, related_to, applies_to, conflicts_with. Relations with confidence >= 0.8 are auto-created.',
      projectId
        ? `Auto-promote is ${autoPromote ? 'ON' : 'OFF'} (threshold ${autoPromoteThreshold}). High-confidence items may be stored at project scope.`
        : 'No `projectId` provided, so entries will be stored at session scope only.',
      focusAreas?.length ? `Focus areas: ${focusAreas.join(', ')}` : undefined,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      success: true,
      draft: {
        schema,
        instructions,
        defaults: {
          sessionId,
          projectId: projectId ?? null,
          autoPromote,
          autoPromoteThreshold,
        },
        commitToolCallExample: {
          name: 'memory_observe',
          arguments: {
            action: 'commit',
            sessionId,
            projectId,
            autoPromote,
            autoPromoteThreshold,
            entries: [
              {
                type: 'guideline',
                name: 'example-guideline-name',
                content: 'A durable rule extracted from the transcript.',
                category: 'process',
                priority: 70,
                confidence: 0.9,
                rationale: 'Why this should be remembered',
                suggestedTags: ['example'],
              },
            ],
            entities: [
              {
                name: 'PostgreSQL',
                entityType: 'technology',
                description: 'Primary database used by the project',
                confidence: 0.9,
              },
            ],
            relationships: [
              {
                sourceRef: 'UserService',
                sourceType: 'entity',
                targetRef: 'PostgreSQL',
                targetType: 'entity',
                relationType: 'depends_on',
                confidence: 0.85,
              },
            ],
          },
        },
      },
    };
  },

  /**
   * Client-assisted extraction: accept extracted entries and store them.
   *
   * - High-confidence entries can auto-promote to project scope (default on)
   * - Lower-confidence entries are stored at session scope and tagged for review
   */
  commit(params: Record<string, unknown>) {
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

    const relationConfidenceThreshold = 0.8; // Higher threshold for relations

    // Ensure session exists (commit can be called without hooks)
    ensureSessionIdExists(sessionId, projectId, agentId);

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

      const saved = storeEntry(processed, targetScopeType, targetScopeId, agentId);
      if (!saved) continue;
      stored.push(saved);

      if (targetScopeType === 'project') storedToProject += 1;
      else storedToSession += 1;

      const isCandidate = targetScopeType === 'session';
      if (isCandidate) {
        needsReviewCount += 1;
        try {
          entryTagRepo.attach({
            entryType: saved.type,
            entryId: saved.id,
            tagName: 'needs_review',
          });
          entryTagRepo.attach({ entryType: saved.type, entryId: saved.id, tagName: 'candidate' });
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
          entryTagRepo.attach({ entryType: saved.type, entryId: saved.id, tagName });
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
        const saved = storeEntity(entity, targetScopeType, targetScopeId, agentId);
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
      const relationResults = createExtractedRelations(
        relationships,
        nameToIdMap,
        relationConfidenceThreshold
      );
      relationsCreated = relationResults.created;
      relationsSkipped = relationResults.skipped + relationResults.errors;
    }

    const committedAt = new Date().toISOString();
    const reviewedAt = needsReviewCount === 0 ? committedAt : undefined;
    const nextMeta = mergeSessionMetadata(sessionId, {
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
    sessionRepo.update(sessionId, { metadata: nextMeta });

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
  },
};

/**
 * Store an extracted entry to the appropriate repository
 */
function storeEntry(
  entry: ProcessedEntry,
  scopeType: ScopeType,
  scopeId: string | undefined,
  agentId?: string
): StoredEntry | null {
  if (entry.type === 'guideline') {
    const input: CreateGuidelineInput = {
      scopeType,
      scopeId,
      name: entry.name || 'unnamed-guideline',
      content: entry.content,
      category: entry.category,
      priority: entry.priority,
      rationale: entry.rationale,
      createdBy: agentId,
    };
    const guideline = guidelineRepo.create(input);

    logAction({
      agentId,
      action: 'create',
      entryType: 'guideline',
      entryId: guideline.id,
      scopeType,
      scopeId: scopeId ?? null,
    });

    return {
      id: guideline.id,
      type: 'guideline',
      name: guideline.name,
    };
  }

  if (entry.type === 'knowledge') {
    const input: CreateKnowledgeInput = {
      scopeType,
      scopeId,
      title: entry.title || 'Untitled Knowledge',
      content: entry.content,
      category: entry.category as 'decision' | 'fact' | 'context' | 'reference' | undefined,
      source: entry.rationale, // Using rationale as source
      createdBy: agentId,
    };
    const knowledge = knowledgeRepo.create(input);

    logAction({
      agentId,
      action: 'create',
      entryType: 'knowledge',
      entryId: knowledge.id,
      scopeType,
      scopeId: scopeId ?? null,
    });

    return {
      id: knowledge.id,
      type: 'knowledge',
      name: knowledge.title,
    };
  }

  if (entry.type === 'tool') {
    const input: CreateToolInput = {
      scopeType,
      scopeId,
      name: entry.name || 'unnamed-tool',
      description: entry.content,
      category: entry.category as 'mcp' | 'cli' | 'function' | 'api' | undefined,
      createdBy: agentId,
    };
    const tool = toolRepo.create(input);

    logAction({
      agentId,
      action: 'create',
      entryType: 'tool',
      entryId: tool.id,
      scopeType,
      scopeId: scopeId ?? null,
    });

    return {
      id: tool.id,
      type: 'tool',
      name: tool.name,
    };
  }

  return null;
}
