/**
 * Shared helper functions for observe handlers
 *
 * All functions accept a repos parameter for dependency injection.
 */

import { checkForDuplicates } from '../../../services/duplicate.service.js';
import type { CreateGuidelineInput } from '../../../db/repositories/guidelines.js';
import type { CreateKnowledgeInput } from '../../../db/repositories/knowledge.js';
import type { CreateToolInput } from '../../../db/repositories/tools.js';
import { logAction } from '../../../services/audit.service.js';
import { createComponentLogger } from '../../../utils/logger.js';
import type { ScopeType } from '../../types.js';
import type { RelationType, EntryType } from '../../../db/schema.js';
import type {
  ExtractedEntity,
  ExtractedRelationship,
} from '../../../services/extraction.service.js';
import type { ProcessedEntry, StoredEntry } from './types.js';
import type { Repositories } from '../../../core/interfaces/repositories.js';
import type { DbClient } from '../../../db/connection.js';
import { parseBoolean, parseNumber } from '../../../config/registry/parsers.js';

const logger = createComponentLogger('observe');

// =============================================================================
// ENVIRONMENT PARSING
// =============================================================================

/**
 * Parse environment variable as boolean
 * Delegates to config parser for consistent behavior
 */
export function parseEnvBool(name: string, defaultValue: boolean): boolean {
  return parseBoolean(process.env[name], defaultValue);
}

/**
 * Parse environment variable as number
 * Delegates to config parser for consistent behavior
 */
export function parseEnvNumber(name: string, defaultValue: number): number {
  return parseNumber(process.env[name], defaultValue);
}

// =============================================================================
// SESSION UTILITIES
// =============================================================================

export async function mergeSessionMetadata(
  repos: Repositories,
  sessionId: string,
  patch: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const existing = await repos.sessions.getById(sessionId);
  const existingMeta = existing?.metadata ?? {};
  return { ...existingMeta, ...patch };
}

/**
 * Ensure a session exists, creating it if necessary via repository.
 * Uses proper repository layer instead of direct DB access.
 */
export async function ensureSessionIdExists(
  repos: Repositories,
  sessionId: string,
  projectId?: string,
  agentId?: string
): Promise<void> {
  if (await repos.sessions.getById(sessionId)) return;

  await repos.sessions.create({
    projectId: projectId ?? undefined,
    name: 'Session (auto-created by observe.commit)',
    purpose: 'Auto-created to store observe entries',
    agentId: agentId ?? undefined,
    metadata: { source: 'observe.commit' },
  });
}

// =============================================================================
// ENTITY STORAGE
// =============================================================================

/**
 * Store an entity as a knowledge entry with category 'fact'
 */
export async function storeEntity(
  repos: Repositories,
  entity: ExtractedEntity,
  scopeType: ScopeType,
  scopeId: string | undefined,
  agentId: string | undefined,
  db: DbClient
): Promise<StoredEntry | null> {
  // Check for duplicates
  const duplicateCheck = checkForDuplicates(
    'knowledge',
    entity.name,
    scopeType,
    scopeId ?? null,
    db
  );
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

  const knowledge = await repos.knowledge.create(input);

  logAction(
    {
      agentId,
      action: 'create',
      entryType: 'knowledge',
      entryId: knowledge.id,
      scopeType,
      scopeId: scopeId ?? null,
    },
    db
  );

  // Tag with entity markers
  try {
    await repos.entryTags.attach({
      entryType: 'knowledge',
      entryId: knowledge.id,
      tagName: 'entity',
    });
    await repos.entryTags.attach({
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
export async function storeEntry(
  repos: Repositories,
  entry: ProcessedEntry,
  scopeType: ScopeType,
  scopeId: string | undefined,
  agentId: string | undefined,
  db: DbClient
): Promise<StoredEntry | null> {
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
    const guideline = await repos.guidelines.create(input);

    logAction(
      {
        agentId,
        action: 'create',
        entryType: 'guideline',
        entryId: guideline.id,
        scopeType,
        scopeId: scopeId ?? null,
      },
      db
    );

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
    const knowledge = await repos.knowledge.create(input);

    logAction(
      {
        agentId,
        action: 'create',
        entryType: 'knowledge',
        entryId: knowledge.id,
        scopeType,
        scopeId: scopeId ?? null,
      },
      db
    );

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
    const tool = await repos.tools.create(input);

    logAction(
      {
        agentId,
        action: 'create',
        entryType: 'tool',
        entryId: tool.id,
        scopeType,
        scopeId: scopeId ?? null,
      },
      db
    );

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
export async function createExtractedRelations(
  repos: Repositories,
  relationships: ExtractedRelationship[],
  nameToIdMap: Map<string, { id: string; type: EntryType }>,
  confidenceThreshold: number = 0.8
): Promise<{ created: number; skipped: number; errors: number }> {
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
      await repos.entryRelations.create({
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
