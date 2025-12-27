/**
 * Consolidation Helpers
 *
 * Shared helper functions for consolidation operations.
 */

import { eq, and, isNull, inArray } from 'drizzle-orm';
import type { DbClient } from '../../db/connection.js';
import {
  tools,
  toolVersions,
  guidelines,
  guidelineVersions,
  knowledge,
  knowledgeVersions,
  entryRelations,
  type ScopeType,
  type EntryType,
} from '../../db/schema.js';
import { generateId } from '../../db/repositories/base.js';
import type { EntryForConsolidation } from './types.js';
import { createNotFoundError } from '../../core/errors.js';

// =============================================================================
// ENTRY FETCHING
// =============================================================================

/**
 * Get all active entries of a type within a scope for consolidation
 */
export function getEntriesForConsolidation(
  entryType: EntryType,
  scopeType: ScopeType,
  scopeId: string | undefined,
  db: DbClient
): EntryForConsolidation[] {
  if (entryType === 'tool') {
    const entries = db
      .select({
        id: tools.id,
        name: tools.name,
        versionId: tools.currentVersionId,
        createdAt: tools.createdAt,
      })
      .from(tools)
      .where(
        and(
          eq(tools.scopeType, scopeType),
          scopeId ? eq(tools.scopeId, scopeId) : isNull(tools.scopeId),
          eq(tools.isActive, true)
        )
      )
      .all();

    // Batch fetch all versions in a single query
    const versionIds = entries.map((e) => e.versionId).filter((id): id is string => id !== null);
    const versions =
      versionIds.length > 0
        ? db
            .select({ id: toolVersions.id, description: toolVersions.description })
            .from(toolVersions)
            .where(inArray(toolVersions.id, versionIds))
            .all()
        : [];
    const versionMap = new Map(versions.map((v) => [v.id, v]));

    return entries.map((e) => {
      const version = e.versionId ? versionMap.get(e.versionId) : null;
      return {
        id: e.id,
        name: e.name,
        content: version?.description || '',
        createdAt: e.createdAt || '',
      };
    });
  } else if (entryType === 'guideline') {
    const entries = db
      .select({
        id: guidelines.id,
        name: guidelines.name,
        versionId: guidelines.currentVersionId,
        createdAt: guidelines.createdAt,
      })
      .from(guidelines)
      .where(
        and(
          eq(guidelines.scopeType, scopeType),
          scopeId ? eq(guidelines.scopeId, scopeId) : isNull(guidelines.scopeId),
          eq(guidelines.isActive, true)
        )
      )
      .all();

    // Batch fetch all versions in a single query
    const versionIds = entries.map((e) => e.versionId).filter((id): id is string => id !== null);
    const versions =
      versionIds.length > 0
        ? db
            .select({ id: guidelineVersions.id, content: guidelineVersions.content })
            .from(guidelineVersions)
            .where(inArray(guidelineVersions.id, versionIds))
            .all()
        : [];
    const versionMap = new Map(versions.map((v) => [v.id, v]));

    return entries.map((e) => {
      const version = e.versionId ? versionMap.get(e.versionId) : null;
      return {
        id: e.id,
        name: e.name,
        content: version?.content || '',
        createdAt: e.createdAt || '',
      };
    });
  } else {
    // knowledge
    const entries = db
      .select({
        id: knowledge.id,
        title: knowledge.title,
        versionId: knowledge.currentVersionId,
        createdAt: knowledge.createdAt,
      })
      .from(knowledge)
      .where(
        and(
          eq(knowledge.scopeType, scopeType),
          scopeId ? eq(knowledge.scopeId, scopeId) : isNull(knowledge.scopeId),
          eq(knowledge.isActive, true)
        )
      )
      .all();

    // Batch fetch all versions in a single query
    const versionIds = entries.map((e) => e.versionId).filter((id): id is string => id !== null);
    const versions =
      versionIds.length > 0
        ? db
            .select({ id: knowledgeVersions.id, content: knowledgeVersions.content })
            .from(knowledgeVersions)
            .where(inArray(knowledgeVersions.id, versionIds))
            .all()
        : [];
    const versionMap = new Map(versions.map((v) => [v.id, v]));

    return entries.map((e) => {
      const version = e.versionId ? versionMap.get(e.versionId) : null;
      return {
        id: e.id,
        name: e.title,
        content: version?.content || '',
        createdAt: e.createdAt || '',
      };
    });
  }
}

/**
 * Get full details for specific entry IDs
 */
export function getEntryDetails(
  entryType: EntryType,
  ids: string[],
  db: DbClient
): EntryForConsolidation[] {
  if (ids.length === 0) return [];

  if (entryType === 'tool') {
    const entries = db
      .select({
        id: tools.id,
        name: tools.name,
        versionId: tools.currentVersionId,
        createdAt: tools.createdAt,
      })
      .from(tools)
      .where(inArray(tools.id, ids))
      .all();

    // Batch fetch all versions
    const versionIds = entries.map((e) => e.versionId).filter((id): id is string => id !== null);
    const versions =
      versionIds.length > 0
        ? db
            .select({
              id: toolVersions.id,
              description: toolVersions.description,
              createdAt: toolVersions.createdAt,
            })
            .from(toolVersions)
            .where(inArray(toolVersions.id, versionIds))
            .all()
        : [];
    const versionMap = new Map(versions.map((v) => [v.id, v]));

    return entries.map((e) => {
      const version = e.versionId ? versionMap.get(e.versionId) : null;
      return {
        id: e.id,
        name: e.name,
        content: version?.description || '',
        createdAt: e.createdAt || '',
        updatedAt: version?.createdAt || undefined,
      };
    });
  } else if (entryType === 'guideline') {
    const entries = db
      .select({
        id: guidelines.id,
        name: guidelines.name,
        versionId: guidelines.currentVersionId,
        createdAt: guidelines.createdAt,
      })
      .from(guidelines)
      .where(inArray(guidelines.id, ids))
      .all();

    // Batch fetch all versions
    const versionIds = entries.map((e) => e.versionId).filter((id): id is string => id !== null);
    const versions =
      versionIds.length > 0
        ? db
            .select({
              id: guidelineVersions.id,
              content: guidelineVersions.content,
              createdAt: guidelineVersions.createdAt,
            })
            .from(guidelineVersions)
            .where(inArray(guidelineVersions.id, versionIds))
            .all()
        : [];
    const versionMap = new Map(versions.map((v) => [v.id, v]));

    return entries.map((e) => {
      const version = e.versionId ? versionMap.get(e.versionId) : null;
      return {
        id: e.id,
        name: e.name,
        content: version?.content || '',
        createdAt: e.createdAt || '',
        updatedAt: version?.createdAt || undefined,
      };
    });
  } else {
    const entries = db
      .select({
        id: knowledge.id,
        title: knowledge.title,
        versionId: knowledge.currentVersionId,
        createdAt: knowledge.createdAt,
      })
      .from(knowledge)
      .where(inArray(knowledge.id, ids))
      .all();

    // Batch fetch all versions
    const versionIds = entries.map((e) => e.versionId).filter((id): id is string => id !== null);
    const versions =
      versionIds.length > 0
        ? db
            .select({
              id: knowledgeVersions.id,
              content: knowledgeVersions.content,
              createdAt: knowledgeVersions.createdAt,
            })
            .from(knowledgeVersions)
            .where(inArray(knowledgeVersions.id, versionIds))
            .all()
        : [];
    const versionMap = new Map(versions.map((v) => [v.id, v]));

    return entries.map((e) => {
      const version = e.versionId ? versionMap.get(e.versionId) : null;
      return {
        id: e.id,
        name: e.title,
        content: version?.content || '',
        createdAt: e.createdAt || '',
        updatedAt: version?.createdAt || undefined,
      };
    });
  }
}

// =============================================================================
// ENTRY OPERATIONS
// =============================================================================

/**
 * Deactivate a single entry
 */
export function deactivateEntry(entryType: EntryType, id: string, db: DbClient): void {
  if (entryType === 'tool') {
    db.update(tools).set({ isActive: false }).where(eq(tools.id, id)).run();
  } else if (entryType === 'guideline') {
    db.update(guidelines).set({ isActive: false }).where(eq(guidelines.id, id)).run();
  } else {
    db.update(knowledge).set({ isActive: false }).where(eq(knowledge.id, id)).run();
  }
}

/**
 * Batch deactivate multiple entries of the same type (O(1) instead of O(n))
 */
export function batchDeactivateEntries(entryType: EntryType, ids: string[], db: DbClient): void {
  if (ids.length === 0) return;

  if (entryType === 'tool') {
    db.update(tools).set({ isActive: false }).where(inArray(tools.id, ids)).run();
  } else if (entryType === 'guideline') {
    db.update(guidelines).set({ isActive: false }).where(inArray(guidelines.id, ids)).run();
  } else {
    db.update(knowledge).set({ isActive: false }).where(inArray(knowledge.id, ids)).run();
  }
}

/**
 * Update entry content with a new version
 */
export function updateEntryContent(
  entryType: EntryType,
  id: string,
  content: string,
  changeReason: string,
  updatedBy: string | undefined,
  db: DbClient
): void {
  if (entryType === 'guideline') {
    const entry = db.select().from(guidelines).where(eq(guidelines.id, id)).get();
    if (!entry) throw createNotFoundError('Guideline', id);

    const currentVersion = entry.currentVersionId
      ? db
          .select()
          .from(guidelineVersions)
          .where(eq(guidelineVersions.id, entry.currentVersionId))
          .get()
      : null;

    const newVersionId = generateId();
    const newVersionNum = (currentVersion?.versionNum ?? 0) + 1;

    db.insert(guidelineVersions)
      .values({
        id: newVersionId,
        guidelineId: id,
        versionNum: newVersionNum,
        content,
        rationale: currentVersion?.rationale,
        changeReason,
        createdBy: updatedBy,
      })
      .run();

    db.update(guidelines)
      .set({ currentVersionId: newVersionId })
      .where(eq(guidelines.id, id))
      .run();
  } else if (entryType === 'knowledge') {
    const entry = db.select().from(knowledge).where(eq(knowledge.id, id)).get();
    if (!entry) throw createNotFoundError('Knowledge', id);

    const currentVersion = entry.currentVersionId
      ? db
          .select()
          .from(knowledgeVersions)
          .where(eq(knowledgeVersions.id, entry.currentVersionId))
          .get()
      : null;

    const newVersionId = generateId();
    const newVersionNum = (currentVersion?.versionNum ?? 0) + 1;

    db.insert(knowledgeVersions)
      .values({
        id: newVersionId,
        knowledgeId: id,
        versionNum: newVersionNum,
        content,
        source: currentVersion?.source,
        confidence: currentVersion?.confidence,
        validUntil: currentVersion?.validUntil,
        changeReason,
        createdBy: updatedBy,
      })
      .run();

    db.update(knowledge).set({ currentVersionId: newVersionId }).where(eq(knowledge.id, id)).run();
  } else if (entryType === 'tool') {
    const entry = db.select().from(tools).where(eq(tools.id, id)).get();
    if (!entry) throw createNotFoundError('Tool', id);

    const currentVersion = entry.currentVersionId
      ? db.select().from(toolVersions).where(eq(toolVersions.id, entry.currentVersionId)).get()
      : null;

    const newVersionId = generateId();
    const newVersionNum = (currentVersion?.versionNum ?? 0) + 1;

    db.insert(toolVersions)
      .values({
        id: newVersionId,
        toolId: id,
        versionNum: newVersionNum,
        description: content,
        parameters: currentVersion?.parameters,
        examples: currentVersion?.examples,
        constraints: currentVersion?.constraints,
        changeReason,
        createdBy: updatedBy,
      })
      .run();

    db.update(tools).set({ currentVersionId: newVersionId }).where(eq(tools.id, id)).run();
  }
}

// =============================================================================
// RELATIONS
// =============================================================================

type ConsolidationRelationType = 'consolidated_into' | 'merged_into' | 'related';

/**
 * Create a relation to track consolidation provenance
 */
export function createConsolidationRelation(
  entryType: EntryType,
  sourceId: string,
  targetId: string,
  relationType: ConsolidationRelationType,
  db: DbClient
): void {
  // Map our consolidation relation types to schema relation types
  const schemaRelationType = relationType === 'related' ? 'related_to' : 'related_to';

  db.insert(entryRelations)
    .values({
      id: generateId(),
      sourceType: entryType,
      sourceId,
      targetType: entryType,
      targetId,
      relationType: schemaRelationType,
      createdBy: 'consolidation-service',
    })
    .run();
}

// =============================================================================
// CONTENT MERGING
// =============================================================================

/**
 * Create merged content from primary and member contents
 * Attempts to deduplicate and combine information
 */
export function createMergedContent(primaryContent: string, memberContents: string[]): string {
  // Simple strategy: append unique sentences from members
  const primarySentences = new Set(
    primaryContent
      .split(/[.!?]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 10)
  );

  const uniqueAdditions: string[] = [];

  for (const content of memberContents) {
    const sentences = content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    for (const sentence of sentences) {
      const normalized = sentence.toLowerCase();
      if (!primarySentences.has(normalized)) {
        primarySentences.add(normalized);
        uniqueAdditions.push(sentence);
      }
    }
  }

  if (uniqueAdditions.length === 0) {
    return primaryContent;
  }

  return `${primaryContent}\n\n[Consolidated from similar entries:]\n${uniqueAdditions.join('. ')}.`;
}

// =============================================================================
// RECENCY SCORING
// =============================================================================

/**
 * Calculate exponential decay score (same as query service)
 */
export function calculateRecencyScore(ageDays: number, halfLifeDays: number = 30): number {
  if (ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Calculate age in days from timestamp
 */
export function getAgeDays(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  try {
    const ts = new Date(timestamp).getTime();
    if (Number.isNaN(ts)) return null;
    const ageMs = Math.max(Date.now() - ts, 0);
    return ageMs / (1000 * 60 * 60 * 24);
  } catch {
    return null;
  }
}
