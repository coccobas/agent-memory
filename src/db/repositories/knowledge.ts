/**
 * Knowledge Repository
 *
 * Factory function that accepts DatabaseDeps for dependency injection.
 */

import { eq, and, desc, asc } from 'drizzle-orm';
import { transactionWithRetry } from '../connection.js';
import {
  knowledge,
  knowledgeVersions,
  type NewKnowledge,
  type KnowledgeVersion,
  type NewKnowledgeVersion,
  type ScopeType,
} from '../schema.js';
import {
  generateId,
  type PaginationOptions,
  cascadeDeleteRelatedRecordsWithDb,
  asyncVectorCleanup,
  checkAndLogConflictWithDb,
} from './base.js';
import { createConflictError } from '../../core/errors.js';
import { generateEmbeddingAsync, extractTextForEmbedding } from './embedding-hooks.js';
import {
  normalizePagination,
  buildScopeConditions,
  batchFetchVersionsWithDb,
  attachVersions,
  buildExactScopeConditions,
  buildGlobalScopeConditions,
} from './entry-utils.js';
import type { DatabaseDeps } from '../../core/types.js';
import type {
  IKnowledgeRepository,
  CreateKnowledgeInput,
  UpdateKnowledgeInput,
  ListKnowledgeFilter,
  KnowledgeWithVersion,
} from '../../core/interfaces/repositories.js';
import { validateKnowledgeInput } from './validation.js';

// Re-export types for backward compatibility
export type {
  CreateKnowledgeInput,
  UpdateKnowledgeInput,
  ListKnowledgeFilter,
  KnowledgeWithVersion,
} from '../../core/interfaces/repositories.js';

// =============================================================================
// KNOWLEDGE REPOSITORY FACTORY
// =============================================================================

/**
 * Create a knowledge repository with injected database dependencies
 */
export function createKnowledgeRepository(deps: DatabaseDeps): IKnowledgeRepository {
  const { db, sqlite } = deps;

  // Helper to fetch knowledge with version (used within transactions)
  function getByIdSync(id: string): KnowledgeWithVersion | undefined {
    const entry = db.select().from(knowledge).where(eq(knowledge.id, id)).get();
    if (!entry) return undefined;

    const currentVersion = entry.currentVersionId
      ? db
          .select()
          .from(knowledgeVersions)
          .where(eq(knowledgeVersions.id, entry.currentVersionId))
          .get()
      : undefined;

    return { ...entry, currentVersion };
  }

  const repo: IKnowledgeRepository = {
    async create(input: CreateKnowledgeInput): Promise<KnowledgeWithVersion> {
      // Validate input before processing (throws on invalid input)
      validateKnowledgeInput(input);

      return await transactionWithRetry(sqlite, () => {
        const knowledgeId = generateId();
        const versionId = generateId();

        // Create the knowledge entry
        const entry: NewKnowledge = {
          id: knowledgeId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          title: input.title,
          category: input.category,
          currentVersionId: versionId,
          isActive: true,
          createdBy: input.createdBy,
        };

        db.insert(knowledge).values(entry).run();

        // Create the initial version
        const version: NewKnowledgeVersion = {
          id: versionId,
          knowledgeId,
          versionNum: 1,
          content: input.content,
          source: input.source,
          confidence: input.confidence ?? 1.0,
          validFrom: input.validFrom,
          validUntil: input.validUntil,
          createdBy: input.createdBy,
          changeReason: 'Initial version',
        };

        db.insert(knowledgeVersions).values(version).run();

        const result = getByIdSync(knowledgeId);
        if (!result) {
          throw createConflictError('knowledge', `failed to create with id ${knowledgeId}`);
        }

        // Generate embedding asynchronously (fire-and-forget)
        const text = extractTextForEmbedding('knowledge', input.title, {
          content: input.content,
          source: input.source,
        });
        generateEmbeddingAsync({
          entryType: 'knowledge',
          entryId: knowledgeId,
          versionId: versionId,
          text,
        });

        return result;
      });
    },

    async getById(id: string): Promise<KnowledgeWithVersion | undefined> {
      return getByIdSync(id);
    },

    async getByTitle(
      title: string,
      scopeType: ScopeType,
      scopeId?: string,
      inherit = true
    ): Promise<KnowledgeWithVersion | undefined> {
      // First, try exact scope match
      const exactMatch = db
        .select()
        .from(knowledge)
        .where(buildExactScopeConditions(knowledge, knowledge.title, title, scopeType, scopeId))
        .get();

      if (exactMatch) {
        const versionsMap = batchFetchVersionsWithDb<KnowledgeVersion>(db, knowledgeVersions, [
          exactMatch.currentVersionId,
        ]);
        return attachVersions([exactMatch], versionsMap)[0];
      }

      // If not found and inherit is true, search parent scopes
      if (inherit && scopeType !== 'global') {
        const globalMatch = db
          .select()
          .from(knowledge)
          .where(buildGlobalScopeConditions(knowledge, knowledge.title, title))
          .get();

        if (globalMatch) {
          const versionsMap = batchFetchVersionsWithDb<KnowledgeVersion>(db, knowledgeVersions, [
            globalMatch.currentVersionId,
          ]);
          return attachVersions([globalMatch], versionsMap)[0];
        }
      }

      return undefined;
    },

    async list(
      filter: ListKnowledgeFilter = {},
      options: PaginationOptions = {}
    ): Promise<KnowledgeWithVersion[]> {
      const { limit, offset } = normalizePagination(options);

      // Build conditions using shared utility + category-specific condition
      const conditions = buildScopeConditions(knowledge, filter);
      if (filter.category !== undefined) {
        conditions.push(eq(knowledge.category, filter.category));
      }

      let query = db.select().from(knowledge);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const entries = query.limit(limit).offset(offset).all();

      // Batch fetch versions using shared utility
      const versionsMap = batchFetchVersionsWithDb<KnowledgeVersion>(
        db,
        knowledgeVersions,
        entries.map((e) => e.currentVersionId)
      );

      return attachVersions(entries, versionsMap);
    },

    async update(
      id: string,
      input: UpdateKnowledgeInput
    ): Promise<KnowledgeWithVersion | undefined> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) return undefined;

        // Get current version number
        const latestVersion = db
          .select()
          .from(knowledgeVersions)
          .where(eq(knowledgeVersions.knowledgeId, id))
          .orderBy(desc(knowledgeVersions.versionNum))
          .get();

        const newVersionNum = (latestVersion?.versionNum ?? 0) + 1;
        const newVersionId = generateId();

        // Check for conflict using shared helper
        const conflictFlag = latestVersion
          ? checkAndLogConflictWithDb(
              db,
              'knowledge',
              id,
              latestVersion.id,
              newVersionId,
              new Date(latestVersion.createdAt)
            )
          : false;

        // Update knowledge metadata if needed
        if (input.category !== undefined) {
          db.update(knowledge).set({ category: input.category }).where(eq(knowledge.id, id)).run();
        }

        // Create new version
        const previousVersion = existing.currentVersion;
        const newVersion: NewKnowledgeVersion = {
          id: newVersionId,
          knowledgeId: id,
          versionNum: newVersionNum,
          content: input.content ?? previousVersion?.content ?? '',
          source: input.source ?? previousVersion?.source,
          confidence: input.confidence ?? previousVersion?.confidence ?? 1.0,
          validFrom: input.validFrom ?? previousVersion?.validFrom,
          validUntil: input.validUntil ?? previousVersion?.validUntil,
          invalidatedBy: input.invalidatedBy ?? previousVersion?.invalidatedBy,
          createdBy: input.updatedBy,
          changeReason: input.changeReason,
          conflictFlag,
        };

        db.insert(knowledgeVersions).values(newVersion).run();

        // Update current version pointer
        db.update(knowledge)
          .set({ currentVersionId: newVersionId })
          .where(eq(knowledge.id, id))
          .run();

        // Generate embedding asynchronously (fire-and-forget)
        const text = extractTextForEmbedding('knowledge', existing.title, {
          content: newVersion.content,
          source: newVersion.source ?? undefined,
        });
        generateEmbeddingAsync({
          entryType: 'knowledge',
          entryId: id,
          versionId: newVersionId,
          text,
        });

        return getByIdSync(id);
      });
    },

    async getHistory(knowledgeId: string): Promise<KnowledgeVersion[]> {
      return db
        .select()
        .from(knowledgeVersions)
        .where(eq(knowledgeVersions.knowledgeId, knowledgeId))
        .orderBy(asc(knowledgeVersions.versionNum))
        .all();
    },

    async deactivate(id: string): Promise<boolean> {
      const result = db
        .update(knowledge)
        .set({ isActive: false })
        .where(eq(knowledge.id, id))
        .run();
      const success = result.changes > 0;

      if (success) {
        asyncVectorCleanup('knowledge', id);
      }

      return success;
    },

    async reactivate(id: string): Promise<boolean> {
      const result = db.update(knowledge).set({ isActive: true }).where(eq(knowledge.id, id)).run();
      return result.changes > 0;
    },

    async delete(id: string): Promise<boolean> {
      const result = await transactionWithRetry(sqlite, () => {
        // Delete related records (tags, relations, embeddings, permissions)
        cascadeDeleteRelatedRecordsWithDb(db, 'knowledge', id);

        // Delete versions
        db.delete(knowledgeVersions).where(eq(knowledgeVersions.knowledgeId, id)).run();

        // Delete knowledge entry
        const deleteResult = db.delete(knowledge).where(eq(knowledge.id, id)).run();
        return deleteResult.changes > 0;
      });

      if (result) {
        asyncVectorCleanup('knowledge', id);
      }

      return result;
    },
  };

  return repo;
}
