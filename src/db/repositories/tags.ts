/**
 * Tag, EntryTag, and EntryRelation Repositories
 *
 * Factory functions that accept DatabaseDeps for dependency injection.
 */

import { eq, and } from 'drizzle-orm';
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
import type { DatabaseDeps } from '../../core/types.js';
import { transactionWithDb } from '../connection.js';
import type {
  ITagRepository,
  IEntryTagRepository,
  IEntryRelationRepository,
  CreateTagInput,
  ListTagsFilter,
  AttachTagInput,
  CreateRelationInput,
  ListRelationsFilter,
} from '../../core/interfaces/repositories.js';

// Re-export input types for backward compatibility
export type {
  CreateTagInput,
  ListTagsFilter,
  AttachTagInput,
  CreateRelationInput,
  ListRelationsFilter,
} from '../../core/interfaces/repositories.js';

// =============================================================================
// TAG REPOSITORY FACTORY
// =============================================================================

/**
 * Create a tag repository with injected database dependencies
 */
export function createTagRepository(deps: DatabaseDeps): ITagRepository {
  const { db, sqlite } = deps;

  const repo: ITagRepository = {
    async create(input: CreateTagInput): Promise<Tag> {
      const id = generateId();

      const tag: NewTag = {
        id,
        name: input.name,
        category: input.category ?? 'custom',
        isPredefined: input.isPredefined ?? false,
        description: input.description,
      };

      db.insert(tags).values(tag).run();

      const result = await repo.getById(id);
      if (!result) {
        throw new Error(`Failed to create tag ${id}`);
      }
      return result;
    },

    async getById(id: string): Promise<Tag | undefined> {
      return db.select().from(tags).where(eq(tags.id, id)).get();
    },

    async getByName(name: string): Promise<Tag | undefined> {
      return db.select().from(tags).where(eq(tags.name, name)).get();
    },

    async getOrCreate(
      name: string,
      category: 'language' | 'domain' | 'category' | 'meta' | 'custom' = 'custom'
    ): Promise<Tag> {
      const existing = await repo.getByName(name);
      if (existing) return existing;

      try {
        return await repo.create({ name, category });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isUnique =
          message.includes('UNIQUE constraint failed') && message.includes('tags.name');
        if (!isUnique) throw error;

        const createdByOther = await repo.getByName(name);
        if (createdByOther) return createdByOther;
        throw error;
      }
    },

    async list(filter: ListTagsFilter = {}, options: PaginationOptions = {}): Promise<Tag[]> {
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

    async delete(id: string): Promise<boolean> {
      // Use transactionWithDb helper for consistent SQLite/PostgreSQL handling
      return transactionWithDb(sqlite, () => {
        // Remove all entry_tags associations first
        db.delete(entryTags).where(eq(entryTags.tagId, id)).run();

        // Delete the tag
        const result = db.delete(tags).where(eq(tags.id, id)).run();
        return result.changes > 0;
      });
    },

    async seedPredefined(): Promise<void> {
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
        {
          name: 'sql',
          category: 'language',
          isPredefined: true,
          description: 'SQL query language',
        },
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
        {
          name: 'required',
          category: 'meta',
          isPredefined: true,
          description: 'Required/mandatory',
        },
        {
          name: 'optional',
          category: 'meta',
          isPredefined: true,
          description: 'Optional/nice-to-have',
        },
      ];

      for (const tag of predefinedTags) {
        const existing = await repo.getByName(tag.name);
        if (!existing) {
          await repo.create(tag);
        }
      }
    },
  };

  return repo;
}

// =============================================================================
// ENTRY TAGS REPOSITORY FACTORY
// =============================================================================

/**
 * Create an entry tag repository with injected database dependencies
 */
export function createEntryTagRepository(
  deps: DatabaseDeps,
  tagRepo: ITagRepository
): IEntryTagRepository {
  const { db } = deps;

  const repo: IEntryTagRepository = {
    async attach(input: AttachTagInput): Promise<EntryTag> {
      // Get or create the tag
      let tagId = input.tagId;
      if (!tagId && input.tagName) {
        const tag = await tagRepo.getOrCreate(input.tagName);
        tagId = tag.id;
      }

      if (!tagId) {
        throw new Error('Either tagId or tagName must be provided');
      }

      // Create the association
      const id = generateId();
      const entryTag: NewEntryTag = {
        id,
        entryType: input.entryType,
        entryId: input.entryId,
        tagId,
      };

      try {
        db.insert(entryTags).values(entryTag).run();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isUnique =
          message.includes('UNIQUE constraint failed') && message.includes('entry_tags.entry_type');
        if (!isUnique) throw error;
      }

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

      const byId = db.select().from(entryTags).where(eq(entryTags.id, id)).get();
      if (byId) return byId;
      if (existing) return existing;
      throw new Error(`Failed to create entry tag ${id}`);
    },

    async detach(entryType: EntryType, entryId: string, tagId: string): Promise<boolean> {
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

    async getTagsForEntry(entryType: EntryType, entryId: string): Promise<Tag[]> {
      // Optimized: Single query with JOIN instead of two round-trips
      return db
        .select({
          id: tags.id,
          name: tags.name,
          category: tags.category,
          isPredefined: tags.isPredefined,
          description: tags.description,
          createdAt: tags.createdAt,
        })
        .from(tags)
        .innerJoin(entryTags, eq(tags.id, entryTags.tagId))
        .where(and(eq(entryTags.entryType, entryType), eq(entryTags.entryId, entryId)))
        .all();
    },

    async getEntriesWithTag(tagId: string, entryType?: EntryType): Promise<EntryTag[]> {
      if (entryType) {
        return db
          .select()
          .from(entryTags)
          .where(and(eq(entryTags.tagId, tagId), eq(entryTags.entryType, entryType)))
          .all();
      }

      return db.select().from(entryTags).where(eq(entryTags.tagId, tagId)).all();
    },

    async removeAllFromEntry(entryType: EntryType, entryId: string): Promise<number> {
      const result = db
        .delete(entryTags)
        .where(and(eq(entryTags.entryType, entryType), eq(entryTags.entryId, entryId)))
        .run();
      return result.changes;
    },
  };

  return repo;
}

// =============================================================================
// ENTRY RELATIONS REPOSITORY FACTORY
// =============================================================================

/**
 * Create an entry relation repository with injected database dependencies
 */
export function createEntryRelationRepository(deps: DatabaseDeps): IEntryRelationRepository {
  const { db } = deps;

  const repo: IEntryRelationRepository = {
    async create(input: CreateRelationInput): Promise<EntryRelation> {
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

      const result = db.select().from(entryRelations).where(eq(entryRelations.id, id)).get();
      if (!result) {
        throw new Error(`Failed to create entry relation ${id}`);
      }
      return result;
    },

    async getById(id: string): Promise<EntryRelation | undefined> {
      return db.select().from(entryRelations).where(eq(entryRelations.id, id)).get();
    },

    async list(
      filter: ListRelationsFilter = {},
      options: PaginationOptions = {}
    ): Promise<EntryRelation[]> {
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

    async getFromEntry(entryType: EntryType, entryId: string): Promise<EntryRelation[]> {
      return db
        .select()
        .from(entryRelations)
        .where(and(eq(entryRelations.sourceType, entryType), eq(entryRelations.sourceId, entryId)))
        .all();
    },

    async getToEntry(entryType: EntryType, entryId: string): Promise<EntryRelation[]> {
      return db
        .select()
        .from(entryRelations)
        .where(and(eq(entryRelations.targetType, entryType), eq(entryRelations.targetId, entryId)))
        .all();
    },

    async delete(id: string): Promise<boolean> {
      const result = db.delete(entryRelations).where(eq(entryRelations.id, id)).run();
      return result.changes > 0;
    },

    async deleteByEntries(
      sourceType: EntryType,
      sourceId: string,
      targetType: EntryType,
      targetId: string,
      relationType: RelationType
    ): Promise<boolean> {
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

    async removeAllForEntry(entryType: EntryType, entryId: string): Promise<number> {
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

  return repo;
}
