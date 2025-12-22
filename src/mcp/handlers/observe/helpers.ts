/**
 * Shared helper functions for observe handlers
 */

import { checkForDuplicates } from '../../../services/duplicate.service.js';
import { guidelineRepo, type CreateGuidelineInput } from '../../../db/repositories/guidelines.js';
import { knowledgeRepo, type CreateKnowledgeInput } from '../../../db/repositories/knowledge.js';
import { toolRepo, type CreateToolInput } from '../../../db/repositories/tools.js';
import { logAction } from '../../../services/audit.service.js';
import { createComponentLogger } from '../../../utils/logger.js';
import type { ScopeType } from '../../types.js';
import { entryTagRepo, entryRelationRepo } from '../../../db/repositories/tags.js';
import { sessionRepo } from '../../../db/repositories/scopes.js';
import { getDb } from '../../../db/connection.js';
import { sessions } from '../../../db/schema.js';
import type { RelationType, EntryType } from '../../../db/schema.js';
import type {
  ExtractedEntity,
  ExtractedRelationship,
} from '../../../services/extraction.service.js';
import type { ProcessedEntry, StoredEntry } from './types.js';

const logger = createComponentLogger('observe');

// =============================================================================
// ENVIRONMENT PARSING
// =============================================================================

export function parseEnvBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export function parseEnvNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

// =============================================================================
// SESSION UTILITIES
// =============================================================================

export function mergeSessionMetadata(
  sessionId: string,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const existing = sessionRepo.getById(sessionId);
  const existingMeta = existing?.metadata ?? {};
  return { ...existingMeta, ...patch };
}

export function ensureSessionIdExists(
  sessionId: string,
  projectId?: string,
  agentId?: string
): void {
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

// =============================================================================
// ENTITY STORAGE
// =============================================================================

/**
 * Store an entity as a knowledge entry with category 'fact'
 */
export function storeEntity(
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
    category: 'fact',
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

// =============================================================================
// ENTRY STORAGE
// =============================================================================

/**
 * Store an extracted entry to the appropriate repository
 */
export function storeEntry(
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
      source: entry.rationale,
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

// =============================================================================
// RELATIONSHIP MANAGEMENT
// =============================================================================

/**
 * Build a name-to-ID map from stored entries for relationship resolution
 */
export function buildNameToIdMap(
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
export function createExtractedRelations(
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
    entity: 'knowledge',
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
