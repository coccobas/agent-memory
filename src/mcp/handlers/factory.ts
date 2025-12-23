/**
 * Generic Handler Factory
 *
 * Generates CRUD handlers for entry types (tool, guideline, knowledge)
 * with common middleware for permissions, validation, audit logging, etc.
 *
 * Eliminates ~40% code duplication across handler files.
 */

import { transactionWithDb } from '../../db/connection.js';
import { checkForDuplicates } from '../../services/duplicate.service.js';
import { logAction } from '../../services/audit.service.js';
import { createRedFlagService } from '../../services/redflag.service.js';
import { emitEntryChanged } from '../../utils/events.js';
import { createValidationService } from '../../services/validation.service.js';
// Permission checks via context.services.permission (no legacy imports)
import { createValidationError, createNotFoundError, createPermissionError } from '../../core/errors.js';
import { createComponentLogger } from '../../utils/logger.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isScopeType,
  isNumber,
  isBoolean,
  isArray,
  isArrayOfObjects,
  isObject,
} from '../../utils/type-guards.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import { normalizePagination } from '../../db/repositories/entry-utils.js';
import { encodeCursor } from '../../db/repositories/base.js';
import type { ScopeType } from '../../db/schema.js';
import type { AppContext } from '../../core/context.js';
import type { ContextAwareHandler } from '../descriptors/types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Minimal entry shape that all entry types share.
 * Repos return types with version info nested (e.g., ToolWithVersion).
 */
export interface BaseEntry {
  id: string;
  scopeType: ScopeType;
  scopeId: string | null;
  isActive: boolean;
  createdAt: string;
}

/**
 * Repository interface that all entry repos must implement
 */
export interface EntryRepository<TEntry extends BaseEntry, TCreateInput, TUpdateInput> {
  create(input: TCreateInput): Promise<TEntry>;
  update(id: string, input: TUpdateInput): Promise<TEntry | undefined>;
  getById(id: string): Promise<TEntry | undefined>;
  getByName?(
    name: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit?: boolean
  ): Promise<TEntry | undefined>;
  getByTitle?(
    title: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit?: boolean
  ): Promise<TEntry | undefined>;
  list(
    filter: { scopeType?: ScopeType; scopeId?: string; includeInactive?: boolean },
    pagination?: { limit?: number; offset?: number }
  ): Promise<TEntry[]>;
  getHistory(id: string): Promise<unknown[]>;
  deactivate(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

/**
 * Entry type names
 */
export type EntryType = 'tool' | 'guideline' | 'knowledge';

/**
 * Configuration for the handler factory
 */
export interface HandlerFactoryConfig<TEntry extends BaseEntry, TCreateInput, TUpdateInput> {
  /** Entry type name used for logging, permissions, etc. */
  entryType: EntryType;
  /**
   * Function to get the repository from AppContext.repos
   * This enables dependency injection at handler call time
   */
  getRepo: (context: AppContext) => EntryRepository<TEntry, TCreateInput, TUpdateInput>;
  /** Key name for the entry in response objects (e.g., 'tool', 'guideline', 'knowledge') */
  responseKey: string;
  /** Key name for the list in response objects (e.g., 'tools', 'guidelines', 'knowledge') */
  responseListKey: string;
  /** Name field used for duplicate checking and lookup (e.g., 'name' or 'title') */
  nameField: 'name' | 'title';
  /** Function to extract add params from raw request */
  extractAddParams: (
    params: Record<string, unknown>,
    defaults: { scopeType?: ScopeType; scopeId?: string }
  ) => TCreateInput;
  /** Function to extract update params from raw request */
  extractUpdateParams: (params: Record<string, unknown>) => TUpdateInput;
  /** Get the name/title value from params for duplicate checking */
  getNameValue: (params: Record<string, unknown>) => string;
  /** Get the content value from an entry for red flag detection */
  getContentForRedFlags: (entry: TEntry) => string;
  /** Get validation data from params */
  getValidationData: (
    params: Record<string, unknown>,
    existingEntry?: TEntry
  ) => Record<string, unknown>;
  /** Optional additional type guards for list filtering */
  listFilterGuards?: Record<string, (v: unknown) => boolean>;
  /** Optional function to add extra filters for list */
  extractListFilters?: (params: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Return type for createCrudHandlers - context-aware handlers
 */
export interface CrudHandlers {
  add: ContextAwareHandler;
  update: ContextAwareHandler;
  get: ContextAwareHandler;
  list: ContextAwareHandler;
  history: ContextAwareHandler;
  deactivate: ContextAwareHandler;
  delete: ContextAwareHandler;
  bulk_add: ContextAwareHandler;
  bulk_update: ContextAwareHandler;
  bulk_delete: ContextAwareHandler;
}

// =============================================================================
// Factory Implementation
// =============================================================================

/**
 * Creates a complete set of context-aware CRUD handlers for an entry type
 */
export function createCrudHandlers<TEntry extends BaseEntry, TCreateInput, TUpdateInput>(
  config: HandlerFactoryConfig<TEntry, TCreateInput, TUpdateInput>
): CrudHandlers {
  const logger = createComponentLogger(config.entryType + 's');

  // Helper: Check permission and throw if denied
  function requirePermission(
    context: AppContext,
    agentId: string,
    permission: 'read' | 'write' | 'delete',
    scopeType: ScopeType,
    scopeId: string | null,
    entryId: string | null = null
  ): void {
    const hasPermission = context.services!.permission.check(
      agentId,
      permission,
      config.entryType,
      entryId,
      scopeType,
      scopeId
    );

    if (!hasPermission) {
      throw createPermissionError(permission, config.entryType, entryId ?? undefined);
    }
  }

  // Helper: Get entry by ID and verify it exists
  async function getExistingEntry(
    repo: EntryRepository<TEntry, TCreateInput, TUpdateInput>,
    id: string
  ): Promise<TEntry> {
    const entry = await repo.getById(id);
    if (entry === undefined) {
      throw createNotFoundError(config.entryType, id);
    }
    return entry;
  }

  return {
    /**
     * Add a new entry
     */
    async add(context: AppContext, params: Record<string, unknown>) {
      const repo = config.getRepo(context);
      const scopeType = getRequiredParam(params, 'scopeType', isScopeType);
      const scopeId = getOptionalParam(params, 'scopeId', isString);
      const agentId = getRequiredParam(params, 'agentId', isString);

      // Validate scope
      if (scopeType !== 'global' && !scopeId) {
        throw createValidationError(
          'scopeId',
          `is required for ${scopeType} scope`,
          'Provide the ID of the parent scope'
        );
      }

      // Check permission (write required for add)
      requirePermission(context, agentId, 'write', scopeType, scopeId ?? null);

      // Get name/title for duplicate checking
      const nameValue = config.getNameValue(params);

      // Check for duplicates (warn but don't block)
      const duplicateCheck = checkForDuplicates(
        config.entryType,
        nameValue,
        scopeType,
        scopeId ?? null,
        context.db
      );
      if (duplicateCheck.isDuplicate) {
        logger.warn(
          {
            [config.nameField]: nameValue,
            scopeType,
            scopeId,
            similarEntries: duplicateCheck.similarEntries.map((e) => ({
              name: e.name,
              similarity: e.similarity,
            })),
          },
          `Potential duplicate ${config.entryType} found`
        );
      }

      // Validate entry data
      const validationData = config.getValidationData(params);
      const validationService = createValidationService(context.repos.guidelines);
      const validation = await validationService.validateEntry(config.entryType, validationData, scopeType, scopeId);
      if (!validation.valid) {
        throw createValidationError(
          'entry',
          `Validation failed: ${validation.errors.map((e: { message: string }) => e.message).join(', ')}`,
          'Check the validation errors and correct the input data'
        );
      }

      // Extract typed input and create entry
      const input = config.extractAddParams(params, { scopeType, scopeId });
      const entry = await repo.create(input);

      // Check for red flags
      const content = config.getContentForRedFlags(entry);
      const redFlagService = createRedFlagService({
        guidelineRepo: context.repos.guidelines,
        knowledgeRepo: context.repos.knowledge,
        toolRepo: context.repos.tools,
      });
      const redFlags = await redFlagService.detectRedFlags({
        type: config.entryType,
        content,
      });
      if (redFlags.length > 0) {
        logger.warn(
          {
            [config.nameField]: nameValue,
            [`${config.entryType}Id`]: entry.id,
            redFlags: redFlags.map((f: { pattern: string; severity: string; description: string }) => ({
              pattern: f.pattern,
              severity: f.severity,
              description: f.description,
            })),
          },
          `Red flags detected in ${config.entryType}`
        );
      }

      // Log audit
      logAction({
        agentId,
        action: 'create',
        entryType: config.entryType,
        entryId: entry.id,
        scopeType,
        scopeId: scopeId ?? null,
      }, context.db);

      return formatTimestamps({
        success: true,
        [config.responseKey]: entry,
        redFlags: redFlags.length > 0 ? redFlags : undefined,
      });
    },

    /**
     * Update an existing entry
     */
    async update(context: AppContext, params: Record<string, unknown>) {
      const repo = config.getRepo(context);
      const id = getRequiredParam(params, 'id', isString);
      const agentId = getRequiredParam(params, 'agentId', isString);

      // Get existing entry to check scope and permission
      const existingEntry = await getExistingEntry(repo, id);

      // Check permission (write required for update)
      requirePermission(context, agentId, 'write', existingEntry.scopeType, existingEntry.scopeId, id);

      // Validate entry data
      const validationData = config.getValidationData(params, existingEntry);
      const validationService = createValidationService(context.repos.guidelines);
      const validation = await validationService.validateEntry(
        config.entryType,
        validationData,
        existingEntry.scopeType,
        existingEntry.scopeId ?? undefined
      );
      if (!validation.valid) {
        throw createValidationError(
          'entry',
          `Validation failed: ${validation.errors.map((e: { message: string }) => e.message).join(', ')}`,
          'Check the validation errors and correct the input data'
        );
      }

      // Extract update input and update
      const input = config.extractUpdateParams(params);
      const entry = await repo.update(id, input);
      if (!entry) {
        throw createNotFoundError(config.entryType, id);
      }

      // Emit entry changed event (cache listens for these)
      emitEntryChanged({
        entryType: config.entryType,
        entryId: id,
        scopeType: existingEntry.scopeType,
        scopeId: existingEntry.scopeId ?? null,
        action: 'update',
      });

      // Log audit
      logAction({
        agentId,
        action: 'update',
        entryType: config.entryType,
        entryId: id,
        scopeType: existingEntry.scopeType,
        scopeId: existingEntry.scopeId ?? null,
      }, context.db);

      return formatTimestamps({ success: true, [config.responseKey]: entry });
    },

    /**
     * Get a single entry by ID or name
     */
    async get(context: AppContext, params: Record<string, unknown>) {
      const repo = config.getRepo(context);
      const id = getOptionalParam(params, 'id', isString);
      const nameOrTitle = getOptionalParam(params, config.nameField, isString);
      const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
      const scopeId = getOptionalParam(params, 'scopeId', isString);
      const inherit = getOptionalParam(params, 'inherit', isBoolean);
      const agentId = getRequiredParam(params, 'agentId', isString);

      if (!id && !nameOrTitle) {
        throw createValidationError(
          `id or ${config.nameField}`,
          'is required',
          `Provide either the ${config.entryType} ID or ${config.nameField} with scopeType`
        );
      }

      let entry: TEntry | undefined = undefined;
      if (id) {
        entry = await repo.getById(id);
      } else if (nameOrTitle && scopeType) {
        // Use appropriate lookup method based on name field
        if (config.nameField === 'name' && repo.getByName) {
          entry = await repo.getByName(nameOrTitle, scopeType, scopeId, inherit ?? true);
        } else if (config.nameField === 'title' && repo.getByTitle) {
          entry = await repo.getByTitle(nameOrTitle, scopeType, scopeId, inherit ?? true);
        }
      } else {
        throw createValidationError(
          'scopeType',
          `is required when using ${config.nameField}`,
          `Provide scopeType when searching by ${config.nameField}`
        );
      }

      if (entry === undefined) {
        throw createNotFoundError(config.entryType, id || nameOrTitle);
      }

      // Check permission (read required for get)
      requirePermission(context, agentId, 'read', entry.scopeType, entry.scopeId, entry.id);

      // Log audit
      logAction({
        agentId,
        action: 'read',
        entryType: config.entryType,
        entryId: entry.id,
        scopeType: entry.scopeType,
        scopeId: entry.scopeId ?? null,
      }, context.db);

      return formatTimestamps({ [config.responseKey]: entry });
    },

    /**
     * List entries with optional filters
     * Supports cursor-based pagination for efficient traversal of large datasets.
     */
    async list(context: AppContext, params: Record<string, unknown>) {
      const repo = config.getRepo(context);
      const agentId = getRequiredParam(params, 'agentId', isString);
      const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
      const scopeId = getOptionalParam(params, 'scopeId', isString);
      const includeInactive = getOptionalParam(params, 'includeInactive', isBoolean);
      const limitParam = getOptionalParam(params, 'limit', isNumber);
      const offsetParam = getOptionalParam(params, 'offset', isNumber);
      const cursor = getOptionalParam(params, 'cursor', isString);

      // Normalize pagination (cursor takes precedence over offset)
      const { limit, offset } = normalizePagination({
        limit: limitParam,
        offset: offsetParam,
        cursor,
      });

      // Build filter with extra type-specific filters
      const filter: Record<string, unknown> = {
        scopeType,
        scopeId,
        includeInactive,
        ...(config.extractListFilters?.(params) ?? {}),
      };

      // Fetch limit+1 to detect if there are more records (without COUNT query)
      const all = await repo.list(
        filter as { scopeType?: ScopeType; scopeId?: string; includeInactive?: boolean },
        { limit: limit + 1, offset }
      );

      // Determine if there are more records
      const hasMore = all.length > limit;
      const recordsToCheck = hasMore ? all.slice(0, limit) : all;

      // Use batch permission check for efficiency (single DB query)
      const batchEntries = recordsToCheck.map((e) => ({
        id: e.id,
        entryType: config.entryType,
        scopeType: e.scopeType,
        scopeId: e.scopeId,
      }));

      const permissionResults = context.services!.permission.checkBatch(agentId, 'read', batchEntries);

      // Filter entries by permission results
      const entries = recordsToCheck.filter((e) => permissionResults.get(e.id) === true);

      return formatTimestamps({
        [config.responseListKey]: entries,
        meta: {
          returnedCount: entries.length,
          hasMore,
          truncated: hasMore,
          nextCursor: hasMore ? encodeCursor(offset + limit) : undefined,
        },
      });
    },

    /**
     * Get version history for an entry
     */
    async history(context: AppContext, params: Record<string, unknown>) {
      const repo = config.getRepo(context);
      const id = getRequiredParam(params, 'id', isString);
      const agentId = getRequiredParam(params, 'agentId', isString);

      const entry = await getExistingEntry(repo, id);
      requirePermission(context, agentId, 'read', entry.scopeType, entry.scopeId, id);

      const versions = await repo.getHistory(id);
      return formatTimestamps({ versions });
    },

    /**
     * Soft-delete an entry (deactivate)
     */
    async deactivate(context: AppContext, params: Record<string, unknown>) {
      const repo = config.getRepo(context);
      const id = getRequiredParam(params, 'id', isString);
      const agentId = getRequiredParam(params, 'agentId', isString);

      const existingEntry = await getExistingEntry(repo, id);

      // Check permission (delete/write required for deactivate)
      requirePermission(context, agentId, 'write', existingEntry.scopeType, existingEntry.scopeId, id);

      const success = await repo.deactivate(id);
      if (!success) {
        throw createNotFoundError(config.entryType, id);
      }

      // Log audit
      logAction({
        agentId,
        action: 'delete',
        entryType: config.entryType,
        entryId: id,
        scopeType: existingEntry.scopeType,
        scopeId: existingEntry.scopeId ?? null,
      }, context.db);

      return { success: true };
    },

    /**
     * Hard-delete an entry permanently
     */
    async delete(context: AppContext, params: Record<string, unknown>) {
      const repo = config.getRepo(context);
      const id = getRequiredParam(params, 'id', isString);
      const agentId = getRequiredParam(params, 'agentId', isString);

      const existingEntry = await getExistingEntry(repo, id);

      // Check permission (delete required for hard delete)
      requirePermission(context, agentId, 'write', existingEntry.scopeType, existingEntry.scopeId, id);

      const success = await repo.delete(id);
      if (!success) {
        throw createNotFoundError(config.entryType, id);
      }

      // Emit entry changed event (cache listens for these)
      emitEntryChanged({
        entryType: config.entryType,
        entryId: id,
        scopeType: existingEntry.scopeType,
        scopeId: existingEntry.scopeId ?? null,
        action: 'delete',
      });

      // Log audit
      logAction({
        agentId,
        action: 'delete',
        entryType: config.entryType,
        entryId: id,
        scopeType: existingEntry.scopeType,
        scopeId: existingEntry.scopeId ?? null,
      }, context.db);

      return { success: true, message: `${config.entryType} permanently deleted` };
    },

    /**
     * Bulk add multiple entries in a transaction
     */
    async bulk_add(context: AppContext, params: Record<string, unknown>) {
      const repo = config.getRepo(context);
      const entries = getRequiredParam(params, 'entries', isArrayOfObjects);
      const agentId = getRequiredParam(params, 'agentId', isString);
      const defaultScopeType = getOptionalParam(params, 'scopeType', isScopeType);
      const defaultScopeId = getOptionalParam(params, 'scopeId', isString);

      if (entries.length === 0) {
        throw createValidationError(
          'entries',
          'must be a non-empty array',
          `Provide an array of ${config.entryType} entries to add`
        );
      }

      // Check permissions for all entries
      for (const entry of entries) {
        if (!isObject(entry)) continue;
        const entryObj = entry;
        const entryScopeType = isScopeType(entryObj.scopeType)
          ? entryObj.scopeType
          : defaultScopeType;
        const entryScopeId = isString(entryObj.scopeId) ? entryObj.scopeId : defaultScopeId;
        requirePermission(
          context,
          agentId,
          'write',
          entryScopeType as ScopeType,
          entryScopeId ?? null
        );
      }

      // Execute in transaction for atomicity
      // Note: repo methods return Promises but SQLite is sync underneath,
      // so promises resolve immediately within the sync transaction callback
      const promises = transactionWithDb(context.sqlite, () => {
        return entries.map((entry) => {
          if (!isObject(entry)) {
            throw createValidationError(
              'entry',
              'must be an object',
              'Each entry must be a valid object'
            );
          }

          const entryObj = entry;
          const scopeType = isScopeType(entryObj.scopeType) ? entryObj.scopeType : defaultScopeType;
          const scopeId = isString(entryObj.scopeId) ? entryObj.scopeId : defaultScopeId;

          if (!scopeType) {
            throw createValidationError(
              'scopeType',
              'is required',
              "Specify 'global', 'org', 'project', or 'session' at entry or top level"
            );
          }

          if (scopeType !== 'global' && !scopeId) {
            throw createValidationError(
              'scopeId',
              `is required for ${scopeType} scope`,
              'Provide the ID of the parent scope'
            );
          }

          const input = config.extractAddParams(entryObj, { scopeType, scopeId });
          return repo.create(input);
        });
      });

      // Await all promises (already resolved since SQLite is sync)
      const results = await Promise.all(promises);

      return formatTimestamps({
        success: true,
        [config.responseListKey]: results,
        count: results.length,
      });
    },

    /**
     * Bulk update multiple entries in a transaction
     */
    async bulk_update(context: AppContext, params: Record<string, unknown>) {
      const repo = config.getRepo(context);
      const updates = getRequiredParam(params, 'updates', isArrayOfObjects);
      const agentId = getRequiredParam(params, 'agentId', isString);

      if (updates.length === 0) {
        throw createValidationError(
          'updates',
          'must be a non-empty array',
          `Provide an array of ${config.entryType} updates`
        );
      }

      // Check permissions for all entries (await repo calls outside transaction)
      for (const update of updates) {
        if (!isObject(update)) continue;
        const updateObj = update;
        const id = updateObj.id;
        if (!isString(id)) continue;
        const existingEntry = await repo.getById(id);
        if (!existingEntry) {
          throw createNotFoundError(config.entryType, id);
        }
        requirePermission(
          context,
          agentId,
          'write',
          existingEntry.scopeType,
          existingEntry.scopeId,
          id
        );
      }

      // Execute in transaction
      // Note: repo methods return Promises but SQLite is sync underneath
      const promises = transactionWithDb(context.sqlite, () => {
        return updates.map((update) => {
          if (!isObject(update)) {
            throw createValidationError(
              'update',
              'must be an object',
              'Each update must be a valid object'
            );
          }

          const updateObj = update;
          const id = updateObj.id;
          if (!isString(id)) {
            throw createValidationError(
              'id',
              'is required',
              `Provide the ${config.entryType} ID to update`
            );
          }

          const input = config.extractUpdateParams(updateObj);
          // Return promise that will be awaited after transaction
          return repo.update(id, input).then((entry) => {
            if (!entry) {
              throw createNotFoundError(config.entryType, id);
            }
            return entry;
          });
        });
      });

      // Await all promises (already resolved since SQLite is sync)
      const results = await Promise.all(promises);

      // Emit events after transaction completes successfully
      for (const result of results) {
        emitEntryChanged({
          entryType: config.entryType,
          entryId: result.id,
          scopeType: result.scopeType,
          scopeId: result.scopeId ?? null,
          action: 'update',
        });
      }

      return formatTimestamps({
        success: true,
        [config.responseListKey]: results,
        count: results.length,
      });
    },

    /**
     * Bulk delete (deactivate) multiple entries in a transaction
     */
    async bulk_delete(context: AppContext, params: Record<string, unknown>) {
      const repo = config.getRepo(context);
      const idsParam = getRequiredParam(params, 'ids', isArray);
      const agentId = getRequiredParam(params, 'agentId', isString);

      // Validate all IDs are strings
      const ids: string[] = [];
      for (let i = 0; i < idsParam.length; i++) {
        const id = idsParam[i];
        if (!isString(id)) {
          throw createValidationError(
            'ids',
            `element at index ${i} is not a string`,
            'All IDs must be strings'
          );
        }
        ids.push(id);
      }

      if (ids.length === 0) {
        throw createValidationError(
          'ids',
          'must be a non-empty array',
          `Provide an array of ${config.entryType} IDs to delete`
        );
      }

      // Check permissions for all entries (await repo calls outside transaction)
      for (const id of ids) {
        const existingEntry = await repo.getById(id);
        if (!existingEntry) {
          throw createNotFoundError(config.entryType, id);
        }
        requirePermission(
          context,
          agentId,
          'write',
          existingEntry.scopeType,
          existingEntry.scopeId,
          id
        );
      }

      // Execute in transaction
      // Note: repo methods return Promises but SQLite is sync underneath
      const promises = transactionWithDb(context.sqlite, () => {
        return ids.map((id) => {
          return repo.deactivate(id).then((success) => {
            if (!success) {
              throw createNotFoundError(config.entryType, id);
            }
            return { id, success: true };
          });
        });
      });

      // Await all promises (already resolved since SQLite is sync)
      const results = await Promise.all(promises);

      return formatTimestamps({ success: true, deleted: results, count: results.length });
    },
  };
}
