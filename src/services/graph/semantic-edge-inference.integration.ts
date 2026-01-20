/**
 * Semantic Edge Inference - Database Integration
 *
 * Provides concrete implementations of the SemanticEdgeInferenceDeps interface
 * that connect to the actual database repositories and services.
 */

import type { AppDb } from '../../core/types.js';
import type { Repositories } from '../../core/interfaces/repositories.js';
import type { IVectorService } from '../../core/context.js';
import type { GraphSyncService } from './sync.service.js';
import type { SemanticEdgeInferenceDeps } from './semantic-edge-inference.service.js';
import type { EntryWithEmbedding } from './semantic-edge-inference.types.js';
import { entryEmbeddings } from '../../db/schema/embeddings.js';
import { knowledge, guidelines, tools } from '../../db/schema/memory.js';
import { experiences } from '../../db/schema/experiences.js';
import { eq, and, inArray } from 'drizzle-orm';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('semantic-edge-inference-integration');

// =============================================================================
// INTEGRATION FACTORY
// =============================================================================

export interface SemanticEdgeInferenceIntegrationDeps {
  db: AppDb;
  repos: Repositories;
  graphSync: GraphSyncService;
  vector?: IVectorService;
}

/**
 * Create database-integrated dependencies for SemanticEdgeInferenceService
 */
export function createSemanticEdgeInferenceDeps(
  deps: SemanticEdgeInferenceIntegrationDeps
): SemanticEdgeInferenceDeps {
  const { db, repos, graphSync, vector } = deps;

  return {
    /**
     * Get entries with embeddings from vector store
     */
    getEntriesWithEmbeddings: async (params) => {
      const { scopeType, scopeId, entryTypes, limit, offset } = params;

      const results: EntryWithEmbedding[] = [];

      // For each entry type, query entries and their embeddings
      for (const entryType of entryTypes) {
        const entriesWithEmbeddings = await getEntriesWithEmbeddingsForType(
          db,
          vector,
          entryType,
          scopeType,
          scopeId,
          limit,
          offset
        );
        results.push(...entriesWithEmbeddings);

        // Respect overall limit
        if (limit && results.length >= limit) {
          return results.slice(0, limit);
        }
      }

      return results;
    },

    /**
     * Create an edge between two entries via GraphSyncService
     */
    createEdge: async (params) => {
      const {
        sourceEntryId,
        sourceEntryType,
        targetEntryId,
        targetEntryType,
        relationType,
        weight,
        createdBy,
      } = params;

      // First ensure both entries have nodes in the graph
      await ensureNodeExists(repos, graphSync, sourceEntryType, sourceEntryId);
      await ensureNodeExists(repos, graphSync, targetEntryType, targetEntryId);

      // Create edge via GraphSyncService
      const edge = await graphSync.syncRelationToEdge({
        relationType: relationType as 'related_to',
        sourceEntryId,
        sourceEntryType: sourceEntryType as 'knowledge' | 'guideline' | 'tool' | 'experience',
        targetEntryId,
        targetEntryType: targetEntryType as 'knowledge' | 'guideline' | 'tool' | 'experience',
        properties: weight !== undefined ? { similarity: weight } : undefined,
        createdBy,
      });

      return {
        created: edge !== null,
        edgeId: edge?.id,
      };
    },

    /**
     * Check if an edge already exists
     */
    edgeExists: async (params) => {
      const { sourceEntryId, sourceEntryType, targetEntryId, targetEntryType, relationType } =
        params;

      // Need graphNodes repository to check for existing nodes
      if (!repos.graphNodes || !repos.graphEdges) {
        logger.debug('Graph repositories not available, cannot check edge existence');
        return false;
      }

      // Find nodes for both entries
      const sourceNode = await repos.graphNodes.getByEntry(
        sourceEntryType as 'knowledge' | 'guideline' | 'tool' | 'experience' | 'task' | 'episode',
        sourceEntryId
      );
      const targetNode = await repos.graphNodes.getByEntry(
        targetEntryType as 'knowledge' | 'guideline' | 'tool' | 'experience' | 'task' | 'episode',
        targetEntryId
      );

      if (!sourceNode || !targetNode) {
        return false;
      }

      // Check for existing edge
      const edges = await repos.graphEdges.getOutgoingEdges(sourceNode.id, relationType);
      return edges.some((e) => e.targetId === targetNode.id);
    },
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get entries with embeddings for a specific type
 */
async function getEntriesWithEmbeddingsForType(
  db: AppDb,
  vector: IVectorService | undefined,
  entryType: 'tool' | 'guideline' | 'knowledge' | 'experience',
  scopeType: string,
  scopeId: string | undefined,
  limit?: number,
  offset?: number
): Promise<EntryWithEmbedding[]> {
  // Query entries from database filtered by scope
  const entries = await getEntriesForType(db, entryType, scopeType, scopeId, limit, offset);

  if (entries.length === 0) return [];

  // If we have a vector service with getByEntryIds, fetch the embeddings
  if (vector && vector.getByEntryIds) {
    try {
      const entryRequests = entries.map((e) => ({
        entryType,
        entryId: e.id,
      }));

      const embeddingsMap = await vector.getByEntryIds(entryRequests);

      // Filter to entries that have embeddings
      const results: EntryWithEmbedding[] = [];
      for (const entry of entries) {
        const key = `${entryType}:${entry.id}`;
        const embedding = embeddingsMap.get(key);

        if (embedding && embedding.length > 0) {
          results.push({
            entryId: entry.id,
            entryType,
            scopeType,
            scopeId: scopeId ?? null,
            embedding,
            name: entry.name,
          });
        }
      }

      // Apply offset/limit after filtering
      const sliced = results.slice(offset ?? 0, limit ? (offset ?? 0) + limit : undefined);

      logger.debug(
        {
          entryType,
          requested: entries.length,
          withEmbeddings: results.length,
          returned: sliced.length,
        },
        'Retrieved entries with embeddings'
      );

      return sliced;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error), entryType },
        'Failed to get embeddings from vector service'
      );
    }
  }

  // Fallback: Check embedding tracking table (can identify which entries have embeddings but not the vectors)
  const entryIds = entries.map((e) => e.id);

  const embeddingRecords = db
    .select()
    .from(entryEmbeddings)
    .where(
      and(
        eq(entryEmbeddings.entryType, entryType),
        inArray(entryEmbeddings.entryId, entryIds),
        eq(entryEmbeddings.hasEmbedding, true)
      )
    )
    .all();

  if (embeddingRecords.length > 0) {
    logger.warn(
      { entryType, entriesWithEmbeddings: embeddingRecords.length },
      'Vector service unavailable - cannot retrieve embedding vectors for comparison'
    );
  }

  return [];
}

type ScopeType = 'global' | 'org' | 'project' | 'session';

/**
 * Get entries of a specific type
 */
async function getEntriesForType(
  db: AppDb,
  entryType: 'tool' | 'guideline' | 'knowledge' | 'experience',
  scopeType: string,
  scopeId: string | undefined,
  limit?: number,
  _offset?: number
): Promise<Array<{ id: string; name: string; scopeType: string; scopeId: string | null }>> {
  const typedScopeType = scopeType as ScopeType;

  switch (entryType) {
    case 'knowledge':
      return getKnowledgeEntries(db, typedScopeType, scopeId, limit);
    case 'guideline':
      return getGuidelineEntries(db, typedScopeType, scopeId, limit);
    case 'tool':
      return getToolEntries(db, typedScopeType, scopeId, limit);
    case 'experience':
      return getExperienceEntries(db, typedScopeType, scopeId, limit);
  }
}

async function getKnowledgeEntries(
  db: AppDb,
  scopeType: ScopeType,
  scopeId: string | undefined,
  limit?: number
): Promise<Array<{ id: string; name: string; scopeType: string; scopeId: string | null }>> {
  const condition = scopeId
    ? and(
        eq(knowledge.scopeType, scopeType),
        eq(knowledge.scopeId, scopeId),
        eq(knowledge.isActive, true)
      )
    : and(eq(knowledge.scopeType, scopeType), eq(knowledge.isActive, true));

  const baseQuery = db
    .select({
      id: knowledge.id,
      name: knowledge.title,
      scopeType: knowledge.scopeType,
      scopeId: knowledge.scopeId,
    })
    .from(knowledge)
    .where(condition);

  return limit ? baseQuery.limit(limit).all() : baseQuery.all();
}

async function getGuidelineEntries(
  db: AppDb,
  scopeType: ScopeType,
  scopeId: string | undefined,
  limit?: number
): Promise<Array<{ id: string; name: string; scopeType: string; scopeId: string | null }>> {
  const condition = scopeId
    ? and(
        eq(guidelines.scopeType, scopeType),
        eq(guidelines.scopeId, scopeId),
        eq(guidelines.isActive, true)
      )
    : and(eq(guidelines.scopeType, scopeType), eq(guidelines.isActive, true));

  const baseQuery = db
    .select({
      id: guidelines.id,
      name: guidelines.name,
      scopeType: guidelines.scopeType,
      scopeId: guidelines.scopeId,
    })
    .from(guidelines)
    .where(condition);

  return limit ? baseQuery.limit(limit).all() : baseQuery.all();
}

async function getToolEntries(
  db: AppDb,
  scopeType: ScopeType,
  scopeId: string | undefined,
  limit?: number
): Promise<Array<{ id: string; name: string; scopeType: string; scopeId: string | null }>> {
  const condition = scopeId
    ? and(eq(tools.scopeType, scopeType), eq(tools.scopeId, scopeId), eq(tools.isActive, true))
    : and(eq(tools.scopeType, scopeType), eq(tools.isActive, true));

  const baseQuery = db
    .select({
      id: tools.id,
      name: tools.name,
      scopeType: tools.scopeType,
      scopeId: tools.scopeId,
    })
    .from(tools)
    .where(condition);

  return limit ? baseQuery.limit(limit).all() : baseQuery.all();
}

async function getExperienceEntries(
  db: AppDb,
  scopeType: ScopeType,
  scopeId: string | undefined,
  limit?: number
): Promise<Array<{ id: string; name: string; scopeType: string; scopeId: string | null }>> {
  const condition = scopeId
    ? and(
        eq(experiences.scopeType, scopeType),
        eq(experiences.scopeId, scopeId),
        eq(experiences.isActive, true)
      )
    : and(eq(experiences.scopeType, scopeType), eq(experiences.isActive, true));

  const baseQuery = db
    .select({
      id: experiences.id,
      name: experiences.title,
      scopeType: experiences.scopeType,
      scopeId: experiences.scopeId,
    })
    .from(experiences)
    .where(condition);

  return limit ? baseQuery.limit(limit).all() : baseQuery.all();
}

/**
 * Ensure a node exists in the graph for an entry
 */
async function ensureNodeExists(
  repos: Repositories,
  graphSync: GraphSyncService,
  entryType: string,
  entryId: string
): Promise<void> {
  // Check if node already exists via graphNodes repository
  if (repos.graphNodes) {
    const existingNode = await repos.graphNodes.getByEntry(
      entryType as 'knowledge' | 'guideline' | 'tool' | 'experience' | 'task' | 'episode',
      entryId
    );
    if (existingNode) {
      return;
    }
  }

  // Get entry details to create node
  const entry = await getEntryById(repos, entryType, entryId);
  if (!entry) {
    logger.warn({ entryType, entryId }, 'Entry not found, cannot create graph node');
    return;
  }

  // Create node via sync service
  await graphSync.syncEntryToNode({
    entryType: entryType as 'knowledge' | 'guideline' | 'tool' | 'experience',
    entryId,
    name: entry.name,
    scopeType: entry.scopeType as 'global' | 'org' | 'project' | 'session',
    scopeId: entry.scopeId ?? undefined,
    createdBy: 'semantic-inference',
  });
}

/**
 * Get entry by ID from the appropriate repository
 */
async function getEntryById(
  repos: Repositories,
  entryType: string,
  entryId: string
): Promise<{ name: string; scopeType: string; scopeId: string | null } | null> {
  switch (entryType) {
    case 'knowledge': {
      const entry = await repos.knowledge.getById(entryId);
      return entry
        ? { name: entry.title ?? entryId, scopeType: entry.scopeType, scopeId: entry.scopeId }
        : null;
    }
    case 'guideline': {
      const entry = await repos.guidelines.getById(entryId);
      return entry
        ? { name: entry.name, scopeType: entry.scopeType, scopeId: entry.scopeId }
        : null;
    }
    case 'tool': {
      const entry = await repos.tools.getById(entryId);
      return entry
        ? { name: entry.name, scopeType: entry.scopeType, scopeId: entry.scopeId }
        : null;
    }
    case 'experience': {
      const entry = await repos.experiences.getById(entryId);
      return entry
        ? { name: entry.title ?? entryId, scopeType: entry.scopeType, scopeId: entry.scopeId }
        : null;
    }
    default:
      return null;
  }
}
