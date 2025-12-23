/**
 * Tool Repository
 *
 * Factory function that accepts DatabaseDeps for dependency injection.
 */

import { eq, and, desc, asc } from 'drizzle-orm';
import { transactionWithRetry } from '../connection.js';
import {
  tools,
  toolVersions,
  type NewTool,
  type ToolVersion,
  type NewToolVersion,
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
  IToolRepository,
  CreateToolInput,
  UpdateToolInput,
  ListToolsFilter,
  ToolWithVersion,
} from '../../core/interfaces/repositories.js';

// Re-export types for backward compatibility
export type {
  CreateToolInput,
  UpdateToolInput,
  ListToolsFilter,
  ToolWithVersion,
} from '../../core/interfaces/repositories.js';

// =============================================================================
// TOOL REPOSITORY FACTORY
// =============================================================================

/**
 * Create a tool repository with injected database dependencies
 */
export function createToolRepository(deps: DatabaseDeps): IToolRepository {
  const { db, sqlite } = deps;

  // Helper to fetch tool with version (used within transactions)
  function getByIdSync(id: string): ToolWithVersion | undefined {
    const tool = db.select().from(tools).where(eq(tools.id, id)).get();
    if (!tool) return undefined;

    const currentVersion = tool.currentVersionId
      ? db.select().from(toolVersions).where(eq(toolVersions.id, tool.currentVersionId)).get()
      : undefined;

    return { ...tool, currentVersion };
  }

  const repo: IToolRepository = {
    async create(input: CreateToolInput): Promise<ToolWithVersion> {
      return transactionWithRetry(sqlite, () => {
        const toolId = generateId();
        const versionId = generateId();

        // Create the tool entry
        const tool: NewTool = {
          id: toolId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          name: input.name,
          category: input.category,
          currentVersionId: versionId,
          isActive: true,
          createdBy: input.createdBy,
        };

        db.insert(tools).values(tool).run();

        // Create the initial version
        const version: NewToolVersion = {
          id: versionId,
          toolId,
          versionNum: 1,
          description: input.description,
          parameters: input.parameters,
          examples: input.examples,
          constraints: input.constraints,
          createdBy: input.createdBy,
          changeReason: 'Initial version',
        };

        db.insert(toolVersions).values(version).run();

        const result = getByIdSync(toolId);
        if (!result) {
          throw new Error(`Failed to create tool ${toolId}`);
        }

        // Generate embedding asynchronously (fire-and-forget)
        const text = extractTextForEmbedding('tool', input.name, {
          description: input.description,
          constraints: input.constraints,
        });
        generateEmbeddingAsync({
          entryType: 'tool',
          entryId: toolId,
          versionId: versionId,
          text,
        });

        return result;
      });
    },

    async getById(id: string): Promise<ToolWithVersion | undefined> {
      return getByIdSync(id);
    },

    async getByName(
      name: string,
      scopeType: ScopeType,
      scopeId?: string,
      inherit = true
    ): Promise<ToolWithVersion | undefined> {
      // First, try exact scope match
      const exactMatch = db
        .select()
        .from(tools)
        .where(buildExactScopeConditions(tools, tools.name, name, scopeType, scopeId))
        .get();

      if (exactMatch) {
        const versionsMap = batchFetchVersionsWithDb<ToolVersion>(db, toolVersions, [
          exactMatch.currentVersionId,
        ]);
        return attachVersions([exactMatch], versionsMap)[0];
      }

      // If not found and inherit is true, search parent scopes
      if (inherit && scopeType !== 'global') {
        const globalMatch = db
          .select()
          .from(tools)
          .where(buildGlobalScopeConditions(tools, tools.name, name))
          .get();

        if (globalMatch) {
          const versionsMap = batchFetchVersionsWithDb<ToolVersion>(db, toolVersions, [
            globalMatch.currentVersionId,
          ]);
          return attachVersions([globalMatch], versionsMap)[0];
        }
      }

      return undefined;
    },

    async list(filter: ListToolsFilter = {}, options: PaginationOptions = {}): Promise<ToolWithVersion[]> {
      const { limit, offset } = normalizePagination(options);

      // Build conditions using shared utility + category-specific condition
      const conditions = buildScopeConditions(tools, filter);
      if (filter.category !== undefined) {
        conditions.push(eq(tools.category, filter.category));
      }

      let query = db.select().from(tools);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const toolsList = query.limit(limit).offset(offset).all();

      // Batch fetch versions using shared utility
      const versionsMap = batchFetchVersionsWithDb<ToolVersion>(
        db,
        toolVersions,
        toolsList.map((t) => t.currentVersionId)
      );

      return attachVersions(toolsList, versionsMap);
    },

    async update(id: string, input: UpdateToolInput): Promise<ToolWithVersion | undefined> {
      return transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) return undefined;

        // Get current version number
        const latestVersion = db
          .select()
          .from(toolVersions)
          .where(eq(toolVersions.toolId, id))
          .orderBy(desc(toolVersions.versionNum))
          .get();

        const newVersionNum = (latestVersion?.versionNum ?? 0) + 1;
        const newVersionId = generateId();

        // Check for conflict using shared helper
        const conflictFlag = latestVersion
          ? checkAndLogConflictWithDb(
              db,
              'tool',
              id,
              latestVersion.id,
              newVersionId,
              new Date(latestVersion.createdAt)
            )
          : false;

        // Create new version (inherit from previous if not specified)
        const previousVersion = existing.currentVersion;
        const newVersion: NewToolVersion = {
          id: newVersionId,
          toolId: id,
          versionNum: newVersionNum,
          description: input.description ?? previousVersion?.description,
          parameters: input.parameters ?? previousVersion?.parameters,
          examples: input.examples ?? previousVersion?.examples,
          constraints: input.constraints ?? previousVersion?.constraints,
          createdBy: input.updatedBy,
          changeReason: input.changeReason,
          conflictFlag,
        };

        db.insert(toolVersions).values(newVersion).run();

        // Update tool's current version pointer
        db.update(tools).set({ currentVersionId: newVersionId }).where(eq(tools.id, id)).run();

        // Generate embedding asynchronously (fire-and-forget)
        const text = extractTextForEmbedding('tool', existing.name, {
          description: newVersion.description ?? undefined,
          constraints: newVersion.constraints ?? undefined,
        });
        generateEmbeddingAsync({
          entryType: 'tool',
          entryId: id,
          versionId: newVersionId,
          text,
        });

        return getByIdSync(id);
      });
    },

    async getHistory(toolId: string): Promise<ToolVersion[]> {
      return db
        .select()
        .from(toolVersions)
        .where(eq(toolVersions.toolId, toolId))
        .orderBy(asc(toolVersions.versionNum))
        .all();
    },

    async deactivate(id: string): Promise<boolean> {
      const result = db.update(tools).set({ isActive: false }).where(eq(tools.id, id)).run();
      const success = result.changes > 0;

      if (success) {
        asyncVectorCleanup('tool', id);
      }

      return success;
    },

    async reactivate(id: string): Promise<boolean> {
      const result = db.update(tools).set({ isActive: true }).where(eq(tools.id, id)).run();
      return result.changes > 0;
    },

    async delete(id: string): Promise<boolean> {
      const result = transactionWithRetry(sqlite, () => {
        // Delete related records (tags, relations, embeddings, permissions)
        cascadeDeleteRelatedRecordsWithDb(db, 'tool', id);

        // Delete versions
        db.delete(toolVersions).where(eq(toolVersions.toolId, id)).run();

        // Delete tool
        const deleteResult = db.delete(tools).where(eq(tools.id, id)).run();
        return deleteResult.changes > 0;
      });

      if (result) {
        asyncVectorCleanup('tool', id);
      }

      return result;
    },
  };

  return repo;
}
