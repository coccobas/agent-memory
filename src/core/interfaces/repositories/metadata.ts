/**
 * Metadata Repository Interfaces
 *
 * Tags, Entry Tags, and Entry Relations
 */

import type { Tag, EntryTag, EntryRelation, EntryType, RelationType } from '../../../db/schema.js';
import type { PaginationOptions } from '../../../db/repositories/base.js';

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

export interface ITagRepository {
  /**
   * Create a new tag.
   * @param input - Tag creation parameters
   * @returns Created tag
   * @throws {AgentMemoryError} E1000 - Missing required field (name)
   * @throws {AgentMemoryError} E2001 - Tag with same name already exists
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  create(input: CreateTagInput): Promise<Tag>;

  /**
   * Get a tag by ID.
   * @param id - Tag ID
   * @returns Tag if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getById(id: string): Promise<Tag | undefined>;

  /**
   * Get a tag by name.
   * @param name - Tag name
   * @returns Tag if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getByName(name: string): Promise<Tag | undefined>;

  /**
   * Get an existing tag by name or create it if it doesn't exist.
   * @param name - Tag name
   * @param category - Optional tag category
   * @returns Existing or newly created tag
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getOrCreate(
    name: string,
    category?: 'language' | 'domain' | 'category' | 'meta' | 'custom'
  ): Promise<Tag>;

  /**
   * List tags matching filter criteria.
   * @param filter - Filter options (category, isPredefined)
   * @param options - Pagination options
   * @returns Array of tags
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  list(filter?: ListTagsFilter, options?: PaginationOptions): Promise<Tag[]>;

  /**
   * Delete a tag by ID.
   * @param id - Tag ID
   * @returns true if deleted, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  delete(id: string): Promise<boolean>;

  /**
   * Seed predefined tags into the database.
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  seedPredefined(): Promise<void>;
}

// =============================================================================
// ENTRY TAG REPOSITORY
// =============================================================================

export interface AttachTagInput {
  entryType: EntryType;
  entryId: string;
  tagId?: string;
  tagName?: string;
}

export interface IEntryTagRepository {
  /**
   * Attach a tag to an entry.
   * @param input - Attachment parameters (entry type, entry ID, tag ID or name)
   * @returns Created entry-tag association
   * @throws {AgentMemoryError} E1000 - Missing required field (entryType, entryId, tagId or tagName)
   * @throws {AgentMemoryError} E2000 - Entry or tag not found
   * @throws {AgentMemoryError} E2001 - Tag already attached to entry
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  attach(input: AttachTagInput): Promise<EntryTag>;

  /**
   * Detach a tag from an entry.
   * @param entryType - Type of the entry
   * @param entryId - Entry ID
   * @param tagId - Tag ID
   * @returns true if detached, false if association not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  detach(entryType: EntryType, entryId: string, tagId: string): Promise<boolean>;

  /**
   * Get all tags attached to an entry.
   * @param entryType - Type of the entry
   * @param entryId - Entry ID
   * @returns Array of tags
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getTagsForEntry(entryType: EntryType, entryId: string): Promise<Tag[]>;

  /**
   * Get all entries with a specific tag.
   * @param tagId - Tag ID
   * @param entryType - Optional filter by entry type
   * @returns Array of entry-tag associations
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getEntriesWithTag(tagId: string, entryType?: EntryType): Promise<EntryTag[]>;

  /**
   * Remove all tags from an entry.
   * @param entryType - Type of the entry
   * @param entryId - Entry ID
   * @returns Number of tags removed
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  removeAllFromEntry(entryType: EntryType, entryId: string): Promise<number>;
}

// =============================================================================
// ENTRY RELATION REPOSITORY
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

export interface IEntryRelationRepository {
  /**
   * Create a relation between two entries.
   * @param input - Relation creation parameters
   * @returns Created relation
   * @throws {AgentMemoryError} E1000 - Missing required field (sourceType, sourceId, targetType, targetId, relationType)
   * @throws {AgentMemoryError} E2000 - Source or target entry not found
   * @throws {AgentMemoryError} E2001 - Relation already exists between entries
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  create(input: CreateRelationInput): Promise<EntryRelation>;

  /**
   * Get a relation by ID.
   * @param id - Relation ID
   * @returns Relation if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getById(id: string): Promise<EntryRelation | undefined>;

  /**
   * List relations matching filter criteria.
   * @param filter - Filter options (source, target, relation type)
   * @param options - Pagination options
   * @returns Array of relations
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  list(filter?: ListRelationsFilter, options?: PaginationOptions): Promise<EntryRelation[]>;

  /**
   * Get all relations originating from an entry.
   * @param entryType - Source entry type
   * @param entryId - Source entry ID
   * @returns Array of relations from this entry
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getFromEntry(entryType: EntryType, entryId: string): Promise<EntryRelation[]>;

  /**
   * Get all relations targeting an entry.
   * @param entryType - Target entry type
   * @param entryId - Target entry ID
   * @returns Array of relations to this entry
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getToEntry(entryType: EntryType, entryId: string): Promise<EntryRelation[]>;

  /**
   * Delete a relation by ID.
   * @param id - Relation ID
   * @returns true if deleted, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  delete(id: string): Promise<boolean>;

  /**
   * Delete a specific relation between two entries.
   * @param sourceType - Source entry type
   * @param sourceId - Source entry ID
   * @param targetType - Target entry type
   * @param targetId - Target entry ID
   * @param relationType - Type of relation
   * @returns true if deleted, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  deleteByEntries(
    sourceType: EntryType,
    sourceId: string,
    targetType: EntryType,
    targetId: string,
    relationType: RelationType
  ): Promise<boolean>;

  /**
   * Remove all relations involving an entry (both as source and target).
   * @param entryType - Entry type
   * @param entryId - Entry ID
   * @returns Number of relations removed
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  removeAllForEntry(entryType: EntryType, entryId: string): Promise<number>;
}
