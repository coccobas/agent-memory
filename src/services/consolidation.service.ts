/**
 * Memory Consolidation Service
 *
 * Implements memory consolidation as described in "Memory in the Age of AI Agents" (arXiv:2512.13564).
 * Consolidation merges semantically similar entries, abstracts patterns, and maintains provenance.
 *
 * Strategies:
 * - semantic_merge: Merge entries with high semantic similarity
 * - dedupe: Remove near-duplicates, keeping the most recent
 * - abstract: Create a higher-level summary from related entries
 */

import { eq, and, isNull, inArray } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
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
} from '../db/schema.js';
import { generateId } from '../db/repositories/base.js';
import { getEmbeddingService } from './embedding.service.js';
import { getVectorService } from './vector.service.js';
import { createComponentLogger } from '../utils/logger.js';
import { config } from '../config/index.js';

const logger = createComponentLogger('consolidation');

// =============================================================================
// TYPES
// =============================================================================

export type ConsolidationStrategy = 'semantic_merge' | 'dedupe' | 'abstract';

export interface ConsolidationParams {
  scopeType: ScopeType;
  scopeId?: string;
  entryTypes?: EntryType[];
  strategy: ConsolidationStrategy;
  threshold?: number; // Similarity threshold (0-1), default 0.85
  dryRun?: boolean; // If true, only report what would be consolidated
  limit?: number; // Max number of consolidation groups to process
  consolidatedBy?: string; // Agent/user ID for audit
}

export interface SimilarityGroup {
  primaryId: string;
  primaryName: string;
  entryType: EntryType;
  members: Array<{
    id: string;
    name: string;
    similarity: number;
    createdAt: string;
    updatedAt?: string;
  }>;
  averageSimilarity: number;
}

export interface ConsolidationResult {
  strategy: ConsolidationStrategy;
  dryRun: boolean;
  groupsFound: number;
  entriesProcessed: number;
  entriesMerged: number;
  entriesDeactivated: number;
  groups: SimilarityGroup[];
  errors: string[];
}

// =============================================================================
// CONSOLIDATION SERVICE
// =============================================================================

/**
 * Find groups of semantically similar entries
 */
export async function findSimilarGroups(
  params: Omit<ConsolidationParams, 'strategy' | 'dryRun'>
): Promise<SimilarityGroup[]> {
  const {
    scopeType,
    scopeId,
    entryTypes = ['guideline', 'knowledge', 'tool'],
    threshold = config.semanticSearch.duplicateThreshold,
    limit = 20,
  } = params;

  const embeddingService = getEmbeddingService();
  const vectorService = getVectorService();

  if (!embeddingService.isAvailable()) {
    logger.warn('Embeddings not available, cannot find similar groups');
    return [];
  }

  const groups: SimilarityGroup[] = [];
  const processedIds = new Set<string>();

  for (const entryType of entryTypes) {
    // Get all entries of this type in scope
    const entries = getEntriesForConsolidation(entryType, scopeType, scopeId);

    for (const entry of entries) {
      if (processedIds.has(entry.id)) continue;
      if (groups.length >= limit) break;

      // Generate embedding for this entry
      const text = `${entry.name}: ${entry.content}`;
      let embedding: number[];

      try {
        const result = await embeddingService.embed(text);
        embedding = result.embedding;
      } catch (error) {
        logger.debug({ entryId: entry.id, error }, 'Failed to generate embedding');
        continue;
      }

      // Search for similar entries
      let similar: Awaited<ReturnType<typeof vectorService.searchSimilar>>;
      try {
        similar = await vectorService.searchSimilar(embedding, [entryType], 20);
      } catch (error) {
        // Log error but continue - dimension mismatch or other issues shouldn't block consolidation
        logger.warn({ entryId: entry.id, error }, 'Failed to search similar entries');
        continue;
      }

      // Filter by threshold and exclude self
      const similarEntries = similar
        .filter((s) => s.entryId !== entry.id && s.score >= threshold)
        .filter((s) => !processedIds.has(s.entryId));

      if (similarEntries.length > 0) {
        // Get full entry details for similar entries
        const memberDetails = getEntryDetails(
          entryType,
          similarEntries.map((s) => s.entryId)
        );

        // Build Map for O(1) lookups instead of O(n) find per member
        const detailsById = new Map(memberDetails.map((d) => [d.id, d]));

        const members = similarEntries
          .map((s) => {
            const detail = detailsById.get(s.entryId);
            if (!detail) return null;
            return {
              id: s.entryId,
              name: detail.name,
              similarity: s.score,
              createdAt: detail.createdAt,
              updatedAt: detail.updatedAt,
            };
          })
          .filter((m): m is NonNullable<typeof m> => m !== null);

        if (members.length > 0) {
          const group: SimilarityGroup = {
            primaryId: entry.id,
            primaryName: entry.name,
            entryType,
            members,
            averageSimilarity: members.reduce((sum, m) => sum + m.similarity, 0) / members.length,
          };

          groups.push(group);

          // Mark all members as processed to avoid duplicate groups
          processedIds.add(entry.id);
          members.forEach((m) => processedIds.add(m.id));
        }
      }
    }
  }

  // Sort by average similarity (highest first)
  groups.sort((a, b) => b.averageSimilarity - a.averageSimilarity);

  return groups.slice(0, limit);
}

/**
 * Execute consolidation based on strategy
 */
export async function consolidate(params: ConsolidationParams): Promise<ConsolidationResult> {
  const {
    strategy,
    dryRun = false,
    threshold = config.semanticSearch.duplicateThreshold,
    consolidatedBy,
  } = params;

  const result: ConsolidationResult = {
    strategy,
    dryRun,
    groupsFound: 0,
    entriesProcessed: 0,
    entriesMerged: 0,
    entriesDeactivated: 0,
    groups: [],
    errors: [],
  };

  try {
    // Find similar groups
    const groups = await findSimilarGroups({
      ...params,
      threshold,
    });

    result.groupsFound = groups.length;
    result.groups = groups;

    if (dryRun) {
      // Just return what would be consolidated
      result.entriesProcessed = groups.reduce((sum, g) => sum + g.members.length + 1, 0);
      return result;
    }

    // Execute consolidation based on strategy
    for (const group of groups) {
      try {
        switch (strategy) {
          case 'dedupe':
            await executeDedupeStrategy(group, consolidatedBy);
            result.entriesDeactivated += group.members.length;
            break;

          case 'semantic_merge':
            await executeMergeStrategy(group, consolidatedBy);
            result.entriesMerged += group.members.length;
            break;

          case 'abstract':
            // Abstract strategy creates a new summary entry
            // For now, just link related entries
            await executeAbstractStrategy(group, consolidatedBy);
            break;

          default: {
            // Exhaustiveness check - ensures all strategies are handled
            const _exhaustive: never = strategy;
            throw new Error(`Unknown consolidation strategy: ${_exhaustive}`);
          }
        }

        result.entriesProcessed += group.members.length + 1;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to consolidate group ${group.primaryId}: ${errorMsg}`);
        logger.error({ group: group.primaryId, error }, 'Consolidation failed for group');
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Consolidation failed: ${errorMsg}`);
    logger.error({ error }, 'Consolidation failed');
  }

  return result;
}

// =============================================================================
// STRATEGY IMPLEMENTATIONS
// =============================================================================

/**
 * Dedupe strategy: Keep the primary (most recent or highest quality), deactivate others
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function executeDedupeStrategy(
  group: SimilarityGroup,
  _consolidatedBy?: string
): Promise<void> {
  // Batch deactivate all duplicate entries (single UPDATE instead of N)
  const memberIds = group.members.map((m) => m.id);
  batchDeactivateEntries(group.entryType, memberIds);

  // Create relations to track provenance
  for (const member of group.members) {
    createConsolidationRelation(group.entryType, member.id, group.primaryId, 'consolidated_into');
  }

  logger.info(
    {
      primaryId: group.primaryId,
      deactivatedCount: group.members.length,
    },
    'Dedupe consolidation completed'
  );
}

/**
 * Merge strategy: Combine content from similar entries into the primary
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function executeMergeStrategy(
  group: SimilarityGroup,
  consolidatedBy?: string
): Promise<void> {
  // Get full content of all entries
  const allEntryIds = [group.primaryId, ...group.members.map((m) => m.id)];
  const entries = getEntryDetails(group.entryType, allEntryIds);

  // Build a Map for O(1) lookups instead of O(n) find per member
  const entriesById = new Map(entries.map((e) => [e.id, e]));

  const primaryEntry = entriesById.get(group.primaryId);
  if (!primaryEntry) {
    throw new Error(`Primary entry ${group.primaryId} not found`);
  }

  // Combine content (append unique points from members) - O(1) lookups
  const memberContents = group.members
    .map((m) => {
      const entry = entriesById.get(m.id);
      return entry?.content || '';
    })
    .filter((c) => c.length > 0);

  // Create merged content
  const mergedContent = createMergedContent(primaryEntry.content, memberContents);

  // Update primary entry with merged content
  updateEntryContent(
    group.entryType,
    group.primaryId,
    mergedContent,
    `Merged from ${group.members.length} similar entries`,
    consolidatedBy
  );

  // Batch deactivate merged entries (single UPDATE instead of N)
  const memberIds = group.members.map((m) => m.id);
  batchDeactivateEntries(group.entryType, memberIds);

  // Create relations to track provenance
  for (const member of group.members) {
    createConsolidationRelation(group.entryType, member.id, group.primaryId, 'merged_into');
  }

  logger.info(
    {
      primaryId: group.primaryId,
      mergedCount: group.members.length,
    },
    'Merge consolidation completed'
  );
}

/**
 * Abstract strategy: Create relations between similar entries without modifying them
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function executeAbstractStrategy(
  group: SimilarityGroup,
  _consolidatedBy?: string
): Promise<void> {
  // Link all members as related to the primary
  for (const member of group.members) {
    createConsolidationRelation(group.entryType, group.primaryId, member.id, 'related');
  }

  logger.info(
    {
      primaryId: group.primaryId,
      relatedCount: group.members.length,
    },
    'Abstract consolidation completed (relations created)'
  );
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface EntryForConsolidation {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

function getEntriesForConsolidation(
  entryType: EntryType,
  scopeType: ScopeType,
  scopeId?: string
): EntryForConsolidation[] {
  const db = getDb();

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

    // Batch fetch all versions in a single query (fixes N+1 pattern)
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

    // Batch fetch all versions in a single query (fixes N+1 pattern)
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

    // Batch fetch all versions in a single query (fixes N+1 pattern)
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

function getEntryDetails(entryType: EntryType, ids: string[]): EntryForConsolidation[] {
  if (ids.length === 0) return [];

  const db = getDb();

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

    // Batch fetch all versions in a single query (fixes N+1 pattern)
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

    // Batch fetch all versions in a single query (fixes N+1 pattern)
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

    // Batch fetch all versions in a single query (fixes N+1 pattern)
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

function deactivateEntry(entryType: EntryType, id: string, _deactivatedBy?: string): void {
  const db = getDb();

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
function batchDeactivateEntries(entryType: EntryType, ids: string[]): void {
  if (ids.length === 0) return;

  const db = getDb();

  if (entryType === 'tool') {
    db.update(tools).set({ isActive: false }).where(inArray(tools.id, ids)).run();
  } else if (entryType === 'guideline') {
    db.update(guidelines).set({ isActive: false }).where(inArray(guidelines.id, ids)).run();
  } else {
    db.update(knowledge).set({ isActive: false }).where(inArray(knowledge.id, ids)).run();
  }
}

function updateEntryContent(
  entryType: EntryType,
  id: string,
  content: string,
  changeReason: string,
  updatedBy?: string
): void {
  const db = getDb();

  if (entryType === 'guideline') {
    const entry = db.select().from(guidelines).where(eq(guidelines.id, id)).get();
    if (!entry) throw new Error(`Guideline ${id} not found`);

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
    if (!entry) throw new Error(`Knowledge ${id} not found`);

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
    if (!entry) throw new Error(`Tool ${id} not found`);

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

function createConsolidationRelation(
  entryType: EntryType,
  sourceId: string,
  targetId: string,
  relationType: 'consolidated_into' | 'merged_into' | 'related'
): void {
  const db = getDb();

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

/**
 * Create merged content from primary and member contents
 * Attempts to deduplicate and combine information
 */
function createMergedContent(primaryContent: string, memberContents: string[]): string {
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
// AUTO-ARCHIVE STALE ENTRIES
// =============================================================================

export interface ArchiveStaleParams {
  scopeType: ScopeType;
  scopeId?: string;
  entryTypes?: EntryType[];
  staleDays: number; // Entries older than this are considered stale
  minRecencyScore?: number; // Optional: only archive if recencyScore is below this (0-1)
  dryRun?: boolean;
  archivedBy?: string;
}

export interface ArchiveStaleResult {
  dryRun: boolean;
  staleDays: number;
  minRecencyScore?: number;
  entriesScanned: number;
  entriesArchived: number;
  archivedEntries: Array<{
    id: string;
    type: EntryType;
    name: string;
    ageDays: number;
    recencyScore: number;
  }>;
  errors: string[];
}

/**
 * Calculate exponential decay score (same as query service)
 */
function calculateRecencyScore(ageDays: number, halfLifeDays: number = 30): number {
  if (ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Calculate age in days from timestamp
 */
function getAgeDays(timestamp: string | null | undefined): number | null {
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

/**
 * Archive stale entries based on age and/or recency score
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function archiveStale(params: ArchiveStaleParams): Promise<ArchiveStaleResult> {
  const {
    scopeType,
    scopeId,
    entryTypes = ['guideline', 'knowledge', 'tool'],
    staleDays,
    minRecencyScore,
    dryRun = false,
    archivedBy,
  } = params;

  const result: ArchiveStaleResult = {
    dryRun,
    staleDays,
    minRecencyScore,
    entriesScanned: 0,
    entriesArchived: 0,
    archivedEntries: [],
    errors: [],
  };

  // Get per-entry-type half-life days from config
  const getHalfLifeDays = (type: EntryType): number => {
    const perType = config.recency?.decayHalfLifeDays;
    if (perType && type in perType) {
      return perType[type as keyof typeof perType];
    }
    return config.recency?.defaultDecayHalfLifeDays ?? 30;
  };

  try {
    for (const entryType of entryTypes) {
      const halfLifeDays = getHalfLifeDays(entryType);
      const entries = getEntriesForConsolidation(entryType, scopeType, scopeId);

      for (const entry of entries) {
        result.entriesScanned++;

        // Use updatedAt if available, otherwise createdAt
        const timestamp = entry.updatedAt || entry.createdAt;
        const ageDays = getAgeDays(timestamp);

        if (ageDays === null) continue;

        // Check if entry is stale based on age
        if (ageDays < staleDays) continue;

        // Calculate recency score using per-entry-type half-life
        const recencyScore = calculateRecencyScore(ageDays, halfLifeDays);

        // If minRecencyScore is specified, only archive if recencyScore is below it
        if (minRecencyScore !== undefined && recencyScore >= minRecencyScore) continue;

        // Entry is stale - archive it
        result.archivedEntries.push({
          id: entry.id,
          type: entryType,
          name: entry.name,
          ageDays: Math.round(ageDays * 10) / 10,
          recencyScore: Math.round(recencyScore * 1000) / 1000,
        });

        if (!dryRun) {
          try {
            deactivateEntry(entryType, entry.id, archivedBy);
            result.entriesArchived++;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            result.errors.push(`Failed to archive ${entryType} ${entry.id}: ${errorMsg}`);
          }
        }
      }
    }

    if (dryRun) {
      result.entriesArchived = result.archivedEntries.length;
    }

    logger.info(
      {
        dryRun,
        staleDays,
        minRecencyScore,
        scanned: result.entriesScanned,
        archived: result.entriesArchived,
      },
      'Archive stale entries completed'
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Archive stale failed: ${errorMsg}`);
    logger.error({ error }, 'Archive stale entries failed');
  }

  return result;
}
