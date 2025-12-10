import { eq, and, isNull, desc } from 'drizzle-orm';
import { getDb } from '../connection.js';
import {
  tools,
  toolVersions,
  conflictLog,
  type Tool,
  type NewTool,
  type ToolVersion,
  type NewToolVersion,
  type ScopeType,
} from '../schema.js';
import {
  generateId,
  CONFLICT_WINDOW_MS,
  type PaginationOptions,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from './base.js';
import { transaction } from '../connection.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateToolInput {
  scopeType: ScopeType;
  scopeId?: string;
  name: string;
  category?: 'mcp' | 'cli' | 'function' | 'api';
  description?: string;
  parameters?: Record<string, unknown>;
  examples?: Array<Record<string, unknown>>;
  constraints?: string;
  createdBy?: string;
}

export interface UpdateToolInput {
  description?: string;
  parameters?: Record<string, unknown>;
  examples?: Array<Record<string, unknown>>;
  constraints?: string;
  changeReason?: string;
  updatedBy?: string;
}

export interface ListToolsFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  category?: 'mcp' | 'cli' | 'function' | 'api';
  includeInactive?: boolean;
  inherit?: boolean;
}

export interface ToolWithVersion extends Tool {
  currentVersion?: ToolVersion;
}

// =============================================================================
// REPOSITORY
// =============================================================================

export const toolRepo = {
  /**
   * Create a new tool with initial version
   *
   * @param input - Tool creation parameters including scope, name, and initial version content
   * @returns The created tool with its current version
   * @throws Error if a tool with the same name already exists in the scope
   */
  create(input: CreateToolInput): ToolWithVersion {
    return transaction(() => {
      const db = getDb();
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

      return this.getById(toolId)!;
    });
  },

  /**
   * Get tool by ID with current version
   *
   * @param id - The tool ID
   * @returns The tool with its current version, or undefined if not found
   */
  getById(id: string): ToolWithVersion | undefined {
    const db = getDb();

    const tool = db.select().from(tools).where(eq(tools.id, id)).get();
    if (!tool) return undefined;

    const currentVersion = tool.currentVersionId
      ? db.select().from(toolVersions).where(eq(toolVersions.id, tool.currentVersionId)).get()
      : undefined;

    return { ...tool, currentVersion };
  },

  /**
   * Get tool by name within a scope (with optional inheritance)
   *
   * @param name - The tool name
   * @param scopeType - The scope type to search in
   * @param scopeId - The scope ID (required for non-global scopes)
   * @param inherit - Whether to search parent scopes if not found (default: true)
   * @returns The tool with its current version, or undefined if not found
   */
  getByName(
    name: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit = true
  ): ToolWithVersion | undefined {
    const db = getDb();

    // First, try exact scope match
    const exactMatch = scopeId
      ? db
          .select()
          .from(tools)
          .where(
            and(
              eq(tools.name, name),
              eq(tools.scopeType, scopeType),
              eq(tools.scopeId, scopeId),
              eq(tools.isActive, true)
            )
          )
          .get()
      : db
          .select()
          .from(tools)
          .where(
            and(
              eq(tools.name, name),
              eq(tools.scopeType, scopeType),
              isNull(tools.scopeId),
              eq(tools.isActive, true)
            )
          )
          .get();

    if (exactMatch) {
      const currentVersion = exactMatch.currentVersionId
        ? db
            .select()
            .from(toolVersions)
            .where(eq(toolVersions.id, exactMatch.currentVersionId))
            .get()
        : undefined;
      return { ...exactMatch, currentVersion };
    }

    // If not found and inherit is true, search parent scopes
    if (inherit && scopeType !== 'global') {
      // For now, just try global scope
      const globalMatch = db
        .select()
        .from(tools)
        .where(
          and(
            eq(tools.name, name),
            eq(tools.scopeType, 'global'),
            isNull(tools.scopeId),
            eq(tools.isActive, true)
          )
        )
        .get();

      if (globalMatch) {
        const currentVersion = globalMatch.currentVersionId
          ? db
              .select()
              .from(toolVersions)
              .where(eq(toolVersions.id, globalMatch.currentVersionId))
              .get()
          : undefined;
        return { ...globalMatch, currentVersion };
      }
    }

    return undefined;
  },

  /**
   * List tools with filtering and pagination
   *
   * @param filter - Optional filters for scope, category, and active status
   * @param options - Optional pagination parameters (limit, offset)
   * @returns Array of tools matching the filter criteria, each with its current version
   */
  list(filter: ListToolsFilter = {}, options: PaginationOptions = {}): ToolWithVersion[] {
    const db = getDb();
    const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = options.offset ?? 0;

    const conditions = [];

    if (filter.scopeType !== undefined) {
      conditions.push(eq(tools.scopeType, filter.scopeType));
    }

    if (filter.scopeId !== undefined) {
      conditions.push(eq(tools.scopeId, filter.scopeId));
    } else if (filter.scopeType === 'global') {
      conditions.push(isNull(tools.scopeId));
    }

    if (filter.category !== undefined) {
      conditions.push(eq(tools.category, filter.category));
    }

    if (!filter.includeInactive) {
      conditions.push(eq(tools.isActive, true));
    }

    let query = db.select().from(tools);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const toolsList = query.limit(limit).offset(offset).all();

    // Fetch current versions
    return toolsList.map((tool) => {
      const currentVersion = tool.currentVersionId
        ? db.select().from(toolVersions).where(eq(toolVersions.id, tool.currentVersionId)).get()
        : undefined;
      return { ...tool, currentVersion };
    });
  },

  /**
   * Update a tool (creates new version)
   *
   * @param id - The tool ID to update
   * @param input - Update parameters (fields not provided inherit from previous version)
   * @returns The updated tool with its new current version, or undefined if tool not found
   * @remarks Creates a new version and detects conflicts if another update happened within 5 seconds
   */
  update(id: string, input: UpdateToolInput): ToolWithVersion | undefined {
    return transaction(() => {
      const db = getDb();

      const existing = this.getById(id);
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

      // Check for conflict (another write within the window)
      let conflictFlag = false;
      if (latestVersion) {
        const lastWriteTime = new Date(latestVersion.createdAt).getTime();
        const currentTime = Date.now();
        if (currentTime - lastWriteTime < CONFLICT_WINDOW_MS) {
          conflictFlag = true;

          // Log the conflict
          db.insert(conflictLog)
            .values({
              id: generateId(),
              entryType: 'tool',
              entryId: id,
              versionAId: latestVersion.id,
              versionBId: newVersionId,
            })
            .run();
        }
      }

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

      return this.getById(id);
    });
  },

  /**
   * Get version history for a tool
   *
   * @param toolId - The tool ID
   * @returns Array of all versions for the tool, ordered by version number (newest first)
   */
  getHistory(toolId: string): ToolVersion[] {
    const db = getDb();
    return db
      .select()
      .from(toolVersions)
      .where(eq(toolVersions.toolId, toolId))
      .orderBy(desc(toolVersions.versionNum))
      .all();
  },

  /**
   * Deactivate a tool (soft delete)
   *
   * @param id - The tool ID to deactivate
   * @returns True if the tool was successfully deactivated
   */
  deactivate(id: string): boolean {
    const db = getDb();
    const result = db.update(tools).set({ isActive: false }).where(eq(tools.id, id)).run();
    return result.changes > 0;
  },

  /**
   * Reactivate a tool
   *
   * @param id - The tool ID to reactivate
   * @returns True if the tool was successfully reactivated
   */
  reactivate(id: string): boolean {
    const db = getDb();
    const result = db.update(tools).set({ isActive: true }).where(eq(tools.id, id)).run();
    return result.changes > 0;
  },

  /**
   * Hard delete a tool and all versions
   */
  delete(id: string): boolean {
    return transaction(() => {
      const db = getDb();

      // Delete versions first
      db.delete(toolVersions).where(eq(toolVersions.toolId, id)).run();

      // Delete tool
      const result = db.delete(tools).where(eq(tools.id, id)).run();
      return result.changes > 0;
    });
  },
};
