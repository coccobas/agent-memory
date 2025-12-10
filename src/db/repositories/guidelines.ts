import { eq, and, isNull, desc } from 'drizzle-orm';
import { getDb } from '../connection.js';
import {
  guidelines,
  guidelineVersions,
  conflictLog,
  type Guideline,
  type NewGuideline,
  type GuidelineVersion,
  type NewGuidelineVersion,
  type ScopeType,
} from '../schema.js';
import { generateId, CONFLICT_WINDOW_MS, type PaginationOptions, DEFAULT_LIMIT, MAX_LIMIT } from './base.js';
import { transaction } from '../connection.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateGuidelineInput {
  scopeType: ScopeType;
  scopeId?: string;
  name: string;
  category?: string;
  priority?: number;
  content: string;
  rationale?: string;
  examples?: { bad?: string[]; good?: string[] };
  createdBy?: string;
}

export interface UpdateGuidelineInput {
  category?: string;
  priority?: number;
  content?: string;
  rationale?: string;
  examples?: { bad?: string[]; good?: string[] };
  changeReason?: string;
  updatedBy?: string;
}

export interface ListGuidelinesFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  category?: string;
  includeInactive?: boolean;
  inherit?: boolean;
}

export interface GuidelineWithVersion extends Guideline {
  currentVersion?: GuidelineVersion;
}

// =============================================================================
// REPOSITORY
// =============================================================================

export const guidelineRepo = {
  /**
   * Create a new guideline with initial version
   */
  create(input: CreateGuidelineInput): GuidelineWithVersion {
    return transaction(() => {
      const db = getDb();
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

      return this.getById(guidelineId)!;
    });
  },

  /**
   * Get guideline by ID with current version
   */
  getById(id: string): GuidelineWithVersion | undefined {
    const db = getDb();

    const guideline = db.select().from(guidelines).where(eq(guidelines.id, id)).get();
    if (!guideline) return undefined;

    const currentVersion = guideline.currentVersionId
      ? db.select().from(guidelineVersions).where(eq(guidelineVersions.id, guideline.currentVersionId)).get()
      : undefined;

    return { ...guideline, currentVersion };
  },

  /**
   * Get guideline by name within a scope (with optional inheritance)
   */
  getByName(name: string, scopeType: ScopeType, scopeId?: string, inherit = true): GuidelineWithVersion | undefined {
    const db = getDb();

    // First, try exact scope match
    const exactMatch = scopeId
      ? db.select().from(guidelines)
          .where(and(
            eq(guidelines.name, name),
            eq(guidelines.scopeType, scopeType),
            eq(guidelines.scopeId, scopeId),
            eq(guidelines.isActive, true)
          ))
          .get()
      : db.select().from(guidelines)
          .where(and(
            eq(guidelines.name, name),
            eq(guidelines.scopeType, scopeType),
            isNull(guidelines.scopeId),
            eq(guidelines.isActive, true)
          ))
          .get();

    if (exactMatch) {
      const currentVersion = exactMatch.currentVersionId
        ? db.select().from(guidelineVersions).where(eq(guidelineVersions.id, exactMatch.currentVersionId)).get()
        : undefined;
      return { ...exactMatch, currentVersion };
    }

    // If not found and inherit is true, search parent scopes
    if (inherit && scopeType !== 'global') {
      const globalMatch = db.select().from(guidelines)
        .where(and(
          eq(guidelines.name, name),
          eq(guidelines.scopeType, 'global'),
          isNull(guidelines.scopeId),
          eq(guidelines.isActive, true)
        ))
        .get();

      if (globalMatch) {
        const currentVersion = globalMatch.currentVersionId
          ? db.select().from(guidelineVersions).where(eq(guidelineVersions.id, globalMatch.currentVersionId)).get()
          : undefined;
        return { ...globalMatch, currentVersion };
      }
    }

    return undefined;
  },

  /**
   * List guidelines with filtering (ordered by priority desc)
   */
  list(filter: ListGuidelinesFilter = {}, options: PaginationOptions = {}): GuidelineWithVersion[] {
    const db = getDb();
    const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = options.offset ?? 0;

    const conditions = [];

    if (filter.scopeType !== undefined) {
      conditions.push(eq(guidelines.scopeType, filter.scopeType));
    }

    if (filter.scopeId !== undefined) {
      conditions.push(eq(guidelines.scopeId, filter.scopeId));
    } else if (filter.scopeType === 'global') {
      conditions.push(isNull(guidelines.scopeId));
    }

    if (filter.category !== undefined) {
      conditions.push(eq(guidelines.category, filter.category));
    }

    if (!filter.includeInactive) {
      conditions.push(eq(guidelines.isActive, true));
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

    // Fetch current versions
    return guidelinesList.map((guideline) => {
      const currentVersion = guideline.currentVersionId
        ? db.select().from(guidelineVersions).where(eq(guidelineVersions.id, guideline.currentVersionId)).get()
        : undefined;
      return { ...guideline, currentVersion };
    });
  },

  /**
   * Update a guideline (creates new version)
   */
  update(id: string, input: UpdateGuidelineInput): GuidelineWithVersion | undefined {
    return transaction(() => {
      const db = getDb();

      const existing = this.getById(id);
      if (!existing) return undefined;

      // Get current version number
      const latestVersion = db.select()
        .from(guidelineVersions)
        .where(eq(guidelineVersions.guidelineId, id))
        .orderBy(desc(guidelineVersions.versionNum))
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

          db.insert(conflictLog).values({
            id: generateId(),
            entryType: 'guideline',
            entryId: id,
            versionAId: latestVersion.id,
            versionBId: newVersionId,
          }).run();
        }
      }

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

      return this.getById(id);
    });
  },

  /**
   * Get version history for a guideline
   */
  getHistory(guidelineId: string): GuidelineVersion[] {
    const db = getDb();
    return db.select()
      .from(guidelineVersions)
      .where(eq(guidelineVersions.guidelineId, guidelineId))
      .orderBy(desc(guidelineVersions.versionNum))
      .all();
  },

  /**
   * Deactivate a guideline (soft delete)
   */
  deactivate(id: string): boolean {
    const db = getDb();
    const result = db.update(guidelines)
      .set({ isActive: false })
      .where(eq(guidelines.id, id))
      .run();
    return result.changes > 0;
  },

  /**
   * Reactivate a guideline
   */
  reactivate(id: string): boolean {
    const db = getDb();
    const result = db.update(guidelines)
      .set({ isActive: true })
      .where(eq(guidelines.id, id))
      .run();
    return result.changes > 0;
  },

  /**
   * Hard delete a guideline and all versions
   */
  delete(id: string): boolean {
    return transaction(() => {
      const db = getDb();
      db.delete(guidelineVersions).where(eq(guidelineVersions.guidelineId, id)).run();
      const result = db.delete(guidelines).where(eq(guidelines.id, id)).run();
      return result.changes > 0;
    });
  },
};
