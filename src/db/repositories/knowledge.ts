import { eq, and, isNull, desc } from 'drizzle-orm';
import { getDb } from '../connection.js';
import {
  knowledge,
  knowledgeVersions,
  conflictLog,
  type Knowledge,
  type NewKnowledge,
  type KnowledgeVersion,
  type NewKnowledgeVersion,
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

export interface CreateKnowledgeInput {
  scopeType: ScopeType;
  scopeId?: string;
  title: string;
  category?: 'decision' | 'fact' | 'context' | 'reference';
  content: string;
  source?: string;
  confidence?: number;
  validUntil?: string;
  createdBy?: string;
}

export interface UpdateKnowledgeInput {
  category?: 'decision' | 'fact' | 'context' | 'reference';
  content?: string;
  source?: string;
  confidence?: number;
  validUntil?: string;
  changeReason?: string;
  updatedBy?: string;
}

export interface ListKnowledgeFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  category?: 'decision' | 'fact' | 'context' | 'reference';
  includeInactive?: boolean;
  inherit?: boolean;
}

export interface KnowledgeWithVersion extends Knowledge {
  currentVersion?: KnowledgeVersion;
}

// =============================================================================
// REPOSITORY
// =============================================================================

export const knowledgeRepo = {
  /**
   * Create a new knowledge entry with initial version
   *
   * @param input - Knowledge creation parameters including scope, title, and initial content
   * @returns The created knowledge entry with its current version
   * @throws Error if a knowledge entry with the same title already exists in the scope
   */
  create(input: CreateKnowledgeInput): KnowledgeWithVersion {
    return transaction(() => {
      const db = getDb();
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
        validUntil: input.validUntil,
        createdBy: input.createdBy,
        changeReason: 'Initial version',
      };

      db.insert(knowledgeVersions).values(version).run();

      const result = this.getById(knowledgeId);
      if (!result) {
        throw new Error(`Failed to create knowledge entry ${knowledgeId}`);
      }
      return result;
    });
  },

  /**
   * Get knowledge entry by ID with current version
   *
   * @param id - The knowledge entry ID
   * @returns The knowledge entry with its current version, or undefined if not found
   */
  getById(id: string): KnowledgeWithVersion | undefined {
    const db = getDb();

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
  },

  /**
   * Get knowledge by title within a scope (with optional inheritance)
   *
   * @param title - The knowledge entry title
   * @param scopeType - The scope type to search in
   * @param scopeId - The scope ID (required for non-global scopes)
   * @param inherit - Whether to search parent scopes if not found (default: true)
   * @returns The knowledge entry with its current version, or undefined if not found
   */
  getByTitle(
    title: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit = true
  ): KnowledgeWithVersion | undefined {
    const db = getDb();

    // First, try exact scope match
    const exactMatch = scopeId
      ? db
          .select()
          .from(knowledge)
          .where(
            and(
              eq(knowledge.title, title),
              eq(knowledge.scopeType, scopeType),
              eq(knowledge.scopeId, scopeId),
              eq(knowledge.isActive, true)
            )
          )
          .get()
      : db
          .select()
          .from(knowledge)
          .where(
            and(
              eq(knowledge.title, title),
              eq(knowledge.scopeType, scopeType),
              isNull(knowledge.scopeId),
              eq(knowledge.isActive, true)
            )
          )
          .get();

    if (exactMatch) {
      const currentVersion = exactMatch.currentVersionId
        ? db
            .select()
            .from(knowledgeVersions)
            .where(eq(knowledgeVersions.id, exactMatch.currentVersionId))
            .get()
        : undefined;
      return { ...exactMatch, currentVersion };
    }

    // If not found and inherit is true, search parent scopes
    if (inherit && scopeType !== 'global') {
      const globalMatch = db
        .select()
        .from(knowledge)
        .where(
          and(
            eq(knowledge.title, title),
            eq(knowledge.scopeType, 'global'),
            isNull(knowledge.scopeId),
            eq(knowledge.isActive, true)
          )
        )
        .get();

      if (globalMatch) {
        const currentVersion = globalMatch.currentVersionId
          ? db
              .select()
              .from(knowledgeVersions)
              .where(eq(knowledgeVersions.id, globalMatch.currentVersionId))
              .get()
          : undefined;
        return { ...globalMatch, currentVersion };
      }
    }

    return undefined;
  },

  /**
   * List knowledge entries with filtering and pagination
   *
   * @param filter - Optional filters for scope, category, and active status
   * @param options - Optional pagination parameters (limit, offset)
   * @returns Array of knowledge entries matching the filter criteria
   */
  list(filter: ListKnowledgeFilter = {}, options: PaginationOptions = {}): KnowledgeWithVersion[] {
    const db = getDb();
    const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = options.offset ?? 0;

    const conditions = [];

    if (filter.scopeType !== undefined) {
      conditions.push(eq(knowledge.scopeType, filter.scopeType));
    }

    if (filter.scopeId !== undefined) {
      conditions.push(eq(knowledge.scopeId, filter.scopeId));
    } else if (filter.scopeType === 'global') {
      conditions.push(isNull(knowledge.scopeId));
    }

    if (filter.category !== undefined) {
      conditions.push(eq(knowledge.category, filter.category));
    }

    if (!filter.includeInactive) {
      conditions.push(eq(knowledge.isActive, true));
    }

    let query = db.select().from(knowledge);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const entries = query.limit(limit).offset(offset).all();

    // Fetch current versions
    return entries.map((entry) => {
      const currentVersion = entry.currentVersionId
        ? db
            .select()
            .from(knowledgeVersions)
            .where(eq(knowledgeVersions.id, entry.currentVersionId))
            .get()
        : undefined;
      return { ...entry, currentVersion };
    });
  },

  /**
   * Update a knowledge entry (creates new version)
   *
   * @param id - The knowledge entry ID to update
   * @param input - Update parameters (fields not provided inherit from previous version)
   * @returns The updated knowledge entry with its new current version, or undefined if entry not found
   * @remarks Creates a new version and detects conflicts if another update happened within 5 seconds
   */
  update(id: string, input: UpdateKnowledgeInput): KnowledgeWithVersion | undefined {
    return transaction(() => {
      const db = getDb();

      const existing = this.getById(id);
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

      // Check for conflict
      let conflictFlag = false;
      if (latestVersion) {
        const lastWriteTime = new Date(latestVersion.createdAt).getTime();
        const currentTime = Date.now();
        if (currentTime - lastWriteTime < CONFLICT_WINDOW_MS) {
          conflictFlag = true;

          db.insert(conflictLog)
            .values({
              id: generateId(),
              entryType: 'knowledge',
              entryId: id,
              versionAId: latestVersion.id,
              versionBId: newVersionId,
            })
            .run();
        }
      }

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
        validUntil: input.validUntil ?? previousVersion?.validUntil,
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

      return this.getById(id);
    });
  },

  /**
   * Get version history for a knowledge entry
   */
  getHistory(knowledgeId: string): KnowledgeVersion[] {
    const db = getDb();
    return db
      .select()
      .from(knowledgeVersions)
      .where(eq(knowledgeVersions.knowledgeId, knowledgeId))
      .orderBy(desc(knowledgeVersions.versionNum))
      .all();
  },

  /**
   * Deactivate a knowledge entry (soft delete)
   */
  deactivate(id: string): boolean {
    const db = getDb();
    const result = db.update(knowledge).set({ isActive: false }).where(eq(knowledge.id, id)).run();
    return result.changes > 0;
  },

  /**
   * Reactivate a knowledge entry
   */
  reactivate(id: string): boolean {
    const db = getDb();
    const result = db.update(knowledge).set({ isActive: true }).where(eq(knowledge.id, id)).run();
    return result.changes > 0;
  },

  /**
   * Hard delete a knowledge entry and all versions
   */
  delete(id: string): boolean {
    return transaction(() => {
      const db = getDb();
      db.delete(knowledgeVersions).where(eq(knowledgeVersions.knowledgeId, id)).run();
      const result = db.delete(knowledge).where(eq(knowledge.id, id)).run();
      return result.changes > 0;
    });
  },
};
