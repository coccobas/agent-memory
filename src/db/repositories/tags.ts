import { eq, and, inArray } from 'drizzle-orm';
import { getDb } from '../connection.js';
import {
  tags,
  entryTags,
  entryRelations,
  type Tag,
  type NewTag,
  type EntryTag,
  type NewEntryTag,
  type EntryRelation,
  type NewEntryRelation,
  type EntryType,
  type RelationType,
} from '../schema.js';
import { generateId, type PaginationOptions, DEFAULT_LIMIT, MAX_LIMIT } from './base.js';
import { transaction } from '../connection.js';

// =============================================================================
// TAG REPOSITORY
// =============================================================================

export interface CreateTagInput {
  name: string;
  category?: 'language' | 'domain' | 'category' | 'meta' | 'custom';
  isPredefined?: boolean;
  description?: string;
}

export interface ListTagsFilter {
  category?: 'language' | 'domain' | 'category' | 'meta' | 'custom';
  isPredefined?: boolean;
}

export const tagRepo = {
  /**
   * Create a new tag
   */
  create(input: CreateTagInput): Tag {
    const db = getDb();
    const id = generateId();

    const tag: NewTag = {
      id,
      name: input.name,
      category: input.category ?? 'custom',
      isPredefined: input.isPredefined ?? false,
      description: input.description,
    };

    db.insert(tags).values(tag).run();

    return this.getById(id)!;
  },

  /**
   * Get tag by ID
   */
  getById(id: string): Tag | undefined {
    const db = getDb();
    return db.select().from(tags).where(eq(tags.id, id)).get();
  },

  /**
   * Get tag by name
   */
  getByName(name: string): Tag | undefined {
    const db = getDb();
    return db.select().from(tags).where(eq(tags.name, name)).get();
  },

  /**
   * Get or create tag by name
   */
  getOrCreate(
    name: string,
    category: 'language' | 'domain' | 'category' | 'meta' | 'custom' = 'custom'
  ): Tag {
    const existing = this.getByName(name);
    if (existing) return existing;

    return this.create({ name, category });
  },

  /**
   * List tags
   */
  list(filter: ListTagsFilter = {}, options: PaginationOptions = {}): Tag[] {
    const db = getDb();
    const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = options.offset ?? 0;

    const conditions = [];

    if (filter.category !== undefined) {
      conditions.push(eq(tags.category, filter.category));
    }

    if (filter.isPredefined !== undefined) {
      conditions.push(eq(tags.isPredefined, filter.isPredefined));
    }

    let query = db.select().from(tags);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    return query.limit(limit).offset(offset).all();
  },

  /**
   * Delete a tag
   */
  delete(id: string): boolean {
    return transaction(() => {
      const db = getDb();

      // Remove all entry_tags associations first
      db.delete(entryTags).where(eq(entryTags.tagId, id)).run();

      // Delete the tag
      const result = db.delete(tags).where(eq(tags.id, id)).run();
      return result.changes > 0;
    });
  },

  /**
   * Seed predefined tags
   */
  seedPredefined(): void {
    const predefinedTags: CreateTagInput[] = [
      // Languages
      {
        name: 'python',
        category: 'language',
        isPredefined: true,
        description: 'Python programming language',
      },
      {
        name: 'typescript',
        category: 'language',
        isPredefined: true,
        description: 'TypeScript programming language',
      },
      {
        name: 'javascript',
        category: 'language',
        isPredefined: true,
        description: 'JavaScript programming language',
      },
      {
        name: 'rust',
        category: 'language',
        isPredefined: true,
        description: 'Rust programming language',
      },
      {
        name: 'go',
        category: 'language',
        isPredefined: true,
        description: 'Go programming language',
      },
      { name: 'sql', category: 'language', isPredefined: true, description: 'SQL query language' },
      {
        name: 'bash',
        category: 'language',
        isPredefined: true,
        description: 'Bash shell scripting',
      },

      // Domains
      { name: 'web', category: 'domain', isPredefined: true, description: 'Web development' },
      {
        name: 'cli',
        category: 'domain',
        isPredefined: true,
        description: 'Command-line interfaces',
      },
      { name: 'api', category: 'domain', isPredefined: true, description: 'API development' },
      {
        name: 'database',
        category: 'domain',
        isPredefined: true,
        description: 'Database design and operations',
      },
      { name: 'ml', category: 'domain', isPredefined: true, description: 'Machine learning' },
      {
        name: 'devops',
        category: 'domain',
        isPredefined: true,
        description: 'DevOps and infrastructure',
      },
      {
        name: 'security',
        category: 'domain',
        isPredefined: true,
        description: 'Security practices',
      },
      { name: 'testing', category: 'domain', isPredefined: true, description: 'Testing and QA' },

      // Categories
      {
        name: 'code_style',
        category: 'category',
        isPredefined: true,
        description: 'Code formatting and style',
      },
      {
        name: 'architecture',
        category: 'category',
        isPredefined: true,
        description: 'System architecture',
      },
      {
        name: 'behavior',
        category: 'category',
        isPredefined: true,
        description: 'Agent behavior rules',
      },
      {
        name: 'performance',
        category: 'category',
        isPredefined: true,
        description: 'Performance optimization',
      },
      {
        name: 'error_handling',
        category: 'category',
        isPredefined: true,
        description: 'Error handling patterns',
      },
      {
        name: 'logging',
        category: 'category',
        isPredefined: true,
        description: 'Logging practices',
      },

      // Meta
      {
        name: 'deprecated',
        category: 'meta',
        isPredefined: true,
        description: 'Deprecated, should not be used',
      },
      {
        name: 'experimental',
        category: 'meta',
        isPredefined: true,
        description: 'Experimental, may change',
      },
      {
        name: 'stable',
        category: 'meta',
        isPredefined: true,
        description: 'Stable and production-ready',
      },
      { name: 'required', category: 'meta', isPredefined: true, description: 'Required/mandatory' },
      {
        name: 'optional',
        category: 'meta',
        isPredefined: true,
        description: 'Optional/nice-to-have',
      },
    ];

    for (const tag of predefinedTags) {
      const existing = this.getByName(tag.name);
      if (!existing) {
        this.create(tag);
      }
    }
  },
};

// =============================================================================
// ENTRY TAGS REPOSITORY
// =============================================================================

export interface AttachTagInput {
  entryType: EntryType;
  entryId: string;
  tagId?: string;
  tagName?: string;
}

export const entryTagRepo = {
  /**
   * Attach a tag to an entry
   */
  attach(input: AttachTagInput): EntryTag {
    const db = getDb();

    // Get or create the tag
    let tagId = input.tagId;
    if (!tagId && input.tagName) {
      const tag = tagRepo.getOrCreate(input.tagName);
      tagId = tag.id;
    }

    if (!tagId) {
      throw new Error('Either tagId or tagName must be provided');
    }

    // Check if already attached
    const existing = db
      .select()
      .from(entryTags)
      .where(
        and(
          eq(entryTags.entryType, input.entryType),
          eq(entryTags.entryId, input.entryId),
          eq(entryTags.tagId, tagId)
        )
      )
      .get();

    if (existing) return existing;

    // Create the association
    const id = generateId();
    const entryTag: NewEntryTag = {
      id,
      entryType: input.entryType,
      entryId: input.entryId,
      tagId,
    };

    db.insert(entryTags).values(entryTag).run();

    return db.select().from(entryTags).where(eq(entryTags.id, id)).get()!;
  },

  /**
   * Detach a tag from an entry
   */
  detach(entryType: EntryType, entryId: string, tagId: string): boolean {
    const db = getDb();
    const result = db
      .delete(entryTags)
      .where(
        and(
          eq(entryTags.entryType, entryType),
          eq(entryTags.entryId, entryId),
          eq(entryTags.tagId, tagId)
        )
      )
      .run();
    return result.changes > 0;
  },

  /**
   * Get all tags for an entry
   */
  getTagsForEntry(entryType: EntryType, entryId: string): Tag[] {
    const db = getDb();

    const associations = db
      .select()
      .from(entryTags)
      .where(and(eq(entryTags.entryType, entryType), eq(entryTags.entryId, entryId)))
      .all();

    if (associations.length === 0) return [];

    const tagIds = associations.map((a) => a.tagId);
    return db.select().from(tags).where(inArray(tags.id, tagIds)).all();
  },

  /**
   * Get all entries with a specific tag
   */
  getEntriesWithTag(tagId: string, entryType?: EntryType): EntryTag[] {
    const db = getDb();

    if (entryType) {
      return db
        .select()
        .from(entryTags)
        .where(and(eq(entryTags.tagId, tagId), eq(entryTags.entryType, entryType)))
        .all();
    }

    return db.select().from(entryTags).where(eq(entryTags.tagId, tagId)).all();
  },

  /**
   * Remove all tags from an entry
   */
  removeAllFromEntry(entryType: EntryType, entryId: string): number {
    const db = getDb();
    const result = db
      .delete(entryTags)
      .where(and(eq(entryTags.entryType, entryType), eq(entryTags.entryId, entryId)))
      .run();
    return result.changes;
  },
};

// =============================================================================
// ENTRY RELATIONS REPOSITORY
// =============================================================================

export interface CreateRelationInput {
  sourceType: EntryType;
  sourceId: string;
  targetType: EntryType;
  targetId: string;
  relationType: RelationType;
  createdBy?: string;
}

export interface ListRelationsFilter {
  sourceType?: EntryType;
  sourceId?: string;
  targetType?: EntryType;
  targetId?: string;
  relationType?: RelationType;
}

export const entryRelationRepo = {
  /**
   * Create a relation between entries
   */
  create(input: CreateRelationInput): EntryRelation {
    const db = getDb();

    // Check if already exists
    const existing = db
      .select()
      .from(entryRelations)
      .where(
        and(
          eq(entryRelations.sourceType, input.sourceType),
          eq(entryRelations.sourceId, input.sourceId),
          eq(entryRelations.targetType, input.targetType),
          eq(entryRelations.targetId, input.targetId),
          eq(entryRelations.relationType, input.relationType)
        )
      )
      .get();

    if (existing) return existing;

    const id = generateId();
    const relation: NewEntryRelation = {
      id,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      targetType: input.targetType,
      targetId: input.targetId,
      relationType: input.relationType,
      createdBy: input.createdBy,
    };

    db.insert(entryRelations).values(relation).run();

    return db.select().from(entryRelations).where(eq(entryRelations.id, id)).get()!;
  },

  /**
   * Get relation by ID
   */
  getById(id: string): EntryRelation | undefined {
    const db = getDb();
    return db.select().from(entryRelations).where(eq(entryRelations.id, id)).get();
  },

  /**
   * List relations with filtering
   */
  list(filter: ListRelationsFilter = {}, options: PaginationOptions = {}): EntryRelation[] {
    const db = getDb();
    const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = options.offset ?? 0;

    const conditions = [];

    if (filter.sourceType !== undefined) {
      conditions.push(eq(entryRelations.sourceType, filter.sourceType));
    }
    if (filter.sourceId !== undefined) {
      conditions.push(eq(entryRelations.sourceId, filter.sourceId));
    }
    if (filter.targetType !== undefined) {
      conditions.push(eq(entryRelations.targetType, filter.targetType));
    }
    if (filter.targetId !== undefined) {
      conditions.push(eq(entryRelations.targetId, filter.targetId));
    }
    if (filter.relationType !== undefined) {
      conditions.push(eq(entryRelations.relationType, filter.relationType));
    }

    let query = db.select().from(entryRelations);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    return query.limit(limit).offset(offset).all();
  },

  /**
   * Get relations from an entry
   */
  getFromEntry(entryType: EntryType, entryId: string): EntryRelation[] {
    const db = getDb();
    return db
      .select()
      .from(entryRelations)
      .where(and(eq(entryRelations.sourceType, entryType), eq(entryRelations.sourceId, entryId)))
      .all();
  },

  /**
   * Get relations to an entry
   */
  getToEntry(entryType: EntryType, entryId: string): EntryRelation[] {
    const db = getDb();
    return db
      .select()
      .from(entryRelations)
      .where(and(eq(entryRelations.targetType, entryType), eq(entryRelations.targetId, entryId)))
      .all();
  },

  /**
   * Delete a relation
   */
  delete(id: string): boolean {
    const db = getDb();
    const result = db.delete(entryRelations).where(eq(entryRelations.id, id)).run();
    return result.changes > 0;
  },

  /**
   * Delete relation by source, target, and type
   */
  deleteByEntries(
    sourceType: EntryType,
    sourceId: string,
    targetType: EntryType,
    targetId: string,
    relationType: RelationType
  ): boolean {
    const db = getDb();
    const result = db
      .delete(entryRelations)
      .where(
        and(
          eq(entryRelations.sourceType, sourceType),
          eq(entryRelations.sourceId, sourceId),
          eq(entryRelations.targetType, targetType),
          eq(entryRelations.targetId, targetId),
          eq(entryRelations.relationType, relationType)
        )
      )
      .run();
    return result.changes > 0;
  },

  /**
   * Remove all relations from/to an entry
   */
  removeAllForEntry(entryType: EntryType, entryId: string): number {
    const db = getDb();

    const fromResult = db
      .delete(entryRelations)
      .where(and(eq(entryRelations.sourceType, entryType), eq(entryRelations.sourceId, entryId)))
      .run();

    const toResult = db
      .delete(entryRelations)
      .where(and(eq(entryRelations.targetType, entryType), eq(entryRelations.targetId, entryId)))
      .run();

    return fromResult.changes + toResult.changes;
  },
};
