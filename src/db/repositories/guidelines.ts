/**
 * Guideline Repository
 *
 * Factory function that accepts DatabaseDeps for dependency injection.
 */

import { eq, and, desc, asc } from 'drizzle-orm';
import { transactionWithRetry } from '../connection.js';
import {
  guidelines,
  guidelineVersions,
  type NewGuideline,
  type GuidelineVersion,
  type NewGuidelineVersion,
  type ScopeType,
} from '../schema.js';
import {
  generateId,
  type PaginationOptions,
  cascadeDeleteRelatedRecordsWithDb,
  asyncVectorCleanup,
  checkAndLogConflictWithDb,
} from './base.js';
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
  IGuidelineRepository,
  CreateGuidelineInput,
  UpdateGuidelineInput,
  ListGuidelinesFilter,
  GuidelineWithVersion,
} from '../../core/interfaces/repositories.js';

// Re-export types for backward compatibility
export type {
  CreateGuidelineInput,
  UpdateGuidelineInput,
  ListGuidelinesFilter,
  GuidelineWithVersion,
} from '../../core/interfaces/repositories.js';

// =============================================================================
// GUIDELINE REPOSITORY FACTORY
// =============================================================================

/**
 * Create a guideline repository with injected database dependencies
 */
export function createGuidelineRepository(deps: DatabaseDeps): IGuidelineRepository {
  const { db, sqlite } = deps;

  // Helper to fetch guideline with version (used within transactions)
  function getByIdSync(id: string): GuidelineWithVersion | undefined {
    const guideline = db.select().from(guidelines).where(eq(guidelines.id, id)).get();
    if (!guideline) return undefined;

    const currentVersion = guideline.currentVersionId
      ? db
          .select()
          .from(guidelineVersions)
          .where(eq(guidelineVersions.id, guideline.currentVersionId))
          .get()
      : undefined;

    return { ...guideline, currentVersion };
  }

  const repo: IGuidelineRepository = {
    async create(input: CreateGuidelineInput): Promise<GuidelineWithVersion> {
      return transactionWithRetry(sqlite, () => {
        const guidelineId = generateId();
        const versionId = generateId();

        // Create the guideline entry
        const guideline: NewGuideline = {
          id: guidelineId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          name: input.name,
          category: input.category,
          priority: input.priority ?? 50,
          currentVersionId: versionId,
          isActive: true,
          createdBy: input.createdBy,
        };

        db.insert(guidelines).values(guideline).run();

        // Create the initial version
        const version: NewGuidelineVersion = {
          id: versionId,
          guidelineId,
          versionNum: 1,
          content: input.content,
          rationale: input.rationale,
          examples: input.examples,
          createdBy: input.createdBy,
          changeReason: 'Initial version',
        };

        db.insert(guidelineVersions).values(version).run();

        const result = getByIdSync(guidelineId);
        if (!result) {
          throw new Error(`Failed to create guideline ${guidelineId}`);
        }

        // Generate embedding asynchronously (fire-and-forget)
        const text = extractTextForEmbedding('guideline', input.name, {
          content: input.content,
          rationale: input.rationale,
        });
        generateEmbeddingAsync({
          entryType: 'guideline',
          entryId: guidelineId,
          versionId: versionId,
          text,
        });

        return result;
      });
    },

    async getById(id: string): Promise<GuidelineWithVersion | undefined> {
      return getByIdSync(id);
    },

    async getByName(
      name: string,
      scopeType: ScopeType,
      scopeId?: string,
      inherit = true
    ): Promise<GuidelineWithVersion | undefined> {
      // First, try exact scope match
      const exactMatch = db
        .select()
        .from(guidelines)
        .where(buildExactScopeConditions(guidelines, guidelines.name, name, scopeType, scopeId))
        .get();

      if (exactMatch) {
        const versionsMap = batchFetchVersionsWithDb<GuidelineVersion>(db, guidelineVersions, [
          exactMatch.currentVersionId,
        ]);
        return attachVersions([exactMatch], versionsMap)[0];
      }

      // If not found and inherit is true, search parent scopes
      if (inherit && scopeType !== 'global') {
        const globalMatch = db
          .select()
          .from(guidelines)
          .where(buildGlobalScopeConditions(guidelines, guidelines.name, name))
          .get();

        if (globalMatch) {
          const versionsMap = batchFetchVersionsWithDb<GuidelineVersion>(db, guidelineVersions, [
            globalMatch.currentVersionId,
          ]);
          return attachVersions([globalMatch], versionsMap)[0];
        }
      }

      return undefined;
    },

    async list(
      filter: ListGuidelinesFilter = {},
      options: PaginationOptions = {}
    ): Promise<GuidelineWithVersion[]> {
      const { limit, offset } = normalizePagination(options);

      // Build conditions using shared utility + category-specific condition
      const conditions = buildScopeConditions(guidelines, filter);
      if (filter.category !== undefined) {
        conditions.push(eq(guidelines.category, filter.category));
      }

      let query = db.select().from(guidelines);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const guidelinesList = query
        .orderBy(desc(guidelines.priority))
        .limit(limit)
        .offset(offset)
        .all();

      // Batch fetch versions using shared utility
      const versionsMap = batchFetchVersionsWithDb<GuidelineVersion>(
        db,
        guidelineVersions,
        guidelinesList.map((g) => g.currentVersionId)
      );

      return attachVersions(guidelinesList, versionsMap);
    },

    async update(id: string, input: UpdateGuidelineInput): Promise<GuidelineWithVersion | undefined> {
      return transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) return undefined;

        // Get current version number
        const latestVersion = db
          .select()
          .from(guidelineVersions)
          .where(eq(guidelineVersions.guidelineId, id))
          .orderBy(desc(guidelineVersions.versionNum))
          .get();

        const newVersionNum = (latestVersion?.versionNum ?? 0) + 1;
        const newVersionId = generateId();

        // Check for conflict using shared helper
        const conflictFlag = latestVersion
          ? checkAndLogConflictWithDb(
              db,
              'guideline',
              id,
              latestVersion.id,
              newVersionId,
              new Date(latestVersion.createdAt)
            )
          : false;

        // Update guideline metadata if needed
        if (input.category !== undefined || input.priority !== undefined) {
          db.update(guidelines)
            .set({
              ...(input.category !== undefined && { category: input.category }),
              ...(input.priority !== undefined && { priority: input.priority }),
            })
            .where(eq(guidelines.id, id))
            .run();
        }

        // Create new version
        const previousVersion = existing.currentVersion;
        const newVersion: NewGuidelineVersion = {
          id: newVersionId,
          guidelineId: id,
          versionNum: newVersionNum,
          content: input.content ?? previousVersion?.content ?? '',
          rationale: input.rationale ?? previousVersion?.rationale,
          examples: input.examples ?? previousVersion?.examples,
          createdBy: input.updatedBy,
          changeReason: input.changeReason,
          conflictFlag,
        };

        db.insert(guidelineVersions).values(newVersion).run();

        // Update current version pointer
        db.update(guidelines)
          .set({ currentVersionId: newVersionId })
          .where(eq(guidelines.id, id))
          .run();

        // Generate embedding asynchronously (fire-and-forget)
        const text = extractTextForEmbedding('guideline', existing.name, {
          content: newVersion.content,
          rationale: newVersion.rationale ?? undefined,
        });
        generateEmbeddingAsync({
          entryType: 'guideline',
          entryId: id,
          versionId: newVersionId,
          text,
        });

        return getByIdSync(id);
      });
    },

    async getHistory(guidelineId: string): Promise<GuidelineVersion[]> {
      return db
        .select()
        .from(guidelineVersions)
        .where(eq(guidelineVersions.guidelineId, guidelineId))
        .orderBy(asc(guidelineVersions.versionNum))
        .all();
    },

    async deactivate(id: string): Promise<boolean> {
      const result = db
        .update(guidelines)
        .set({ isActive: false })
        .where(eq(guidelines.id, id))
        .run();
      const success = result.changes > 0;

      if (success) {
        asyncVectorCleanup('guideline', id);
      }

      return success;
    },

    async reactivate(id: string): Promise<boolean> {
      const result = db
        .update(guidelines)
        .set({ isActive: true })
        .where(eq(guidelines.id, id))
        .run();
      return result.changes > 0;
    },

    async delete(id: string): Promise<boolean> {
      const result = transactionWithRetry(sqlite, () => {
        // Delete related records (tags, relations, embeddings, permissions)
        cascadeDeleteRelatedRecordsWithDb(db, 'guideline', id);

        // Delete versions
        db.delete(guidelineVersions).where(eq(guidelineVersions.guidelineId, id)).run();

        // Delete guideline
        const deleteResult = db.delete(guidelines).where(eq(guidelines.id, id)).run();
        return deleteResult.changes > 0;
      });

      if (result) {
        asyncVectorCleanup('guideline', id);
      }

      return result;
    },
  };

  return repo;
}
