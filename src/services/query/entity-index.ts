/**
 * Entity Index Service
 *
 * Manages the entity index for entity-aware retrieval.
 * Provides methods for building and querying the entity index.
 *
 * Features:
 * - Build index from memory entry content
 * - Fast entity lookup by value
 * - Batch operations for efficiency
 * - Index maintenance (add/remove entries)
 */

import { eq, and, inArray, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/connection.js';
import { entityIndex, type EntityType, type NewEntityIndexRow } from '../../db/schema/entity-index.js';
import { EntityExtractor, type ExtractedEntity } from './entity-extractor.js';
import type { QueryEntryType } from './types.js';

/**
 * Entity lookup result
 */
export interface EntityLookupResult {
  /** Entry IDs that contain the entity */
  entryIds: string[];
  /** Entity type that was matched */
  entityType: EntityType;
  /** The normalized entity value that was matched */
  normalizedValue: string;
}

/**
 * Entity index service class
 */
export class EntityIndex {
  private extractor: EntityExtractor;
  private db: DbClient;

  constructor(db: DbClient, extractor?: EntityExtractor) {
    this.db = db;
    this.extractor = extractor ?? new EntityExtractor();
  }

  /**
   * Index entities from an entry's content
   *
   * @param entryId - The ID of the memory entry
   * @param entryType - The type of the entry (tool, guideline, knowledge, experience)
   * @param content - The content to extract entities from
   * @returns Number of entities indexed
   */
  async indexEntry(entryId: string, entryType: QueryEntryType, content: string): Promise<number> {
    const entities = this.extractor.extract(content);

    if (entities.length === 0) {
      return 0;
    }

    // First, remove existing entities for this entry (update scenario)
    await this.removeEntry(entryId);

    // Insert new entities
    const rows: NewEntityIndexRow[] = entities.map((entity) => ({
      entityValue: entity.normalizedValue,
      entityType: entity.type,
      entryType,
      entryId,
    }));

    // Use batch insert with conflict handling
    await this.db
      .insert(entityIndex)
      .values(rows)
      .onConflictDoNothing()
      .execute();

    return entities.length;
  }

  /**
   * Index entities from multiple entries in batch
   *
   * @param entries - Array of entries with id, type, and content
   * @returns Total number of entities indexed
   */
  async indexBatch(
    entries: Array<{ id: string; type: QueryEntryType; content: string }>
  ): Promise<number> {
    let totalIndexed = 0;
    const allRows: NewEntityIndexRow[] = [];
    const entryIds = new Set<string>();

    // Extract entities from all entries
    for (const entry of entries) {
      const entities = this.extractor.extract(entry.content);
      entryIds.add(entry.id);

      for (const entity of entities) {
        allRows.push({
          entityValue: entity.normalizedValue,
          entityType: entity.type,
          entryType: entry.type,
          entryId: entry.id,
        });
      }

      totalIndexed += entities.length;
    }

    if (allRows.length === 0) {
      return 0;
    }

    // Remove existing entities for all entries being indexed
    if (entryIds.size > 0) {
      await this.db
        .delete(entityIndex)
        .where(inArray(entityIndex.entryId, Array.from(entryIds)))
        .execute();
    }

    // Batch insert with chunking for large datasets
    const BATCH_SIZE = 500;
    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      const chunk = allRows.slice(i, i + BATCH_SIZE);
      await this.db
        .insert(entityIndex)
        .values(chunk)
        .onConflictDoNothing()
        .execute();
    }

    return totalIndexed;
  }

  /**
   * Remove all entities for an entry
   *
   * @param entryId - The ID of the entry to remove
   */
  async removeEntry(entryId: string): Promise<void> {
    await this.db.delete(entityIndex).where(eq(entityIndex.entryId, entryId)).execute();
  }

  /**
   * Remove entities for multiple entries
   *
   * @param entryIds - The IDs of entries to remove
   */
  async removeEntries(entryIds: string[]): Promise<void> {
    if (entryIds.length === 0) return;

    await this.db
      .delete(entityIndex)
      .where(inArray(entityIndex.entryId, entryIds))
      .execute();
  }

  /**
   * Look up entries by entity value (exact match)
   *
   * Uses the raw value for lookup - caller should pass the normalized value
   * or use lookupMultiple with extracted entities for proper normalization.
   *
   * @param entityValue - The entity value to look up (should be normalized)
   * @returns Array of entry IDs that contain this entity
   */
  lookup(entityValue: string): string[] {
    // Try both exact match and lowercase match for flexibility
    // This handles cases where the entity type isn't known at lookup time
    const rows = this.db
      .select({ entryId: entityIndex.entryId })
      .from(entityIndex)
      .where(eq(entityIndex.entityValue, entityValue))
      .all();

    // If no exact match, try lowercase (for paths, packages, URLs, commands)
    if (rows.length === 0) {
      const lowerValue = entityValue.toLowerCase();
      if (lowerValue !== entityValue) {
        const lowerRows = this.db
          .select({ entryId: entityIndex.entryId })
          .from(entityIndex)
          .where(eq(entityIndex.entityValue, lowerValue))
          .all();
        return lowerRows.map((r) => r.entryId);
      }
    }

    return rows.map((r) => r.entryId);
  }

  /**
   * Look up entries by multiple entities (OR logic)
   *
   * @param entities - Array of extracted entities to look up
   * @returns Map from entry ID to matched entity count
   */
  lookupMultiple(entities: ExtractedEntity[]): Map<string, number> {
    if (entities.length === 0) {
      return new Map();
    }

    const normalizedValues = entities.map((e) => e.normalizedValue);

    const rows = this.db
      .select({
        entryId: entityIndex.entryId,
        matchCount: sql<number>`COUNT(*)`.as('match_count'),
      })
      .from(entityIndex)
      .where(inArray(entityIndex.entityValue, normalizedValues))
      .groupBy(entityIndex.entryId)
      .all();

    return new Map(rows.map((r) => [r.entryId, r.matchCount]));
  }

  /**
   * Look up entries by entity value with type filter
   *
   * @param entityValue - The normalized entity value to look up
   * @param entityType - Filter by entity type
   * @returns Array of entry IDs
   */
  lookupByType(entityValue: string, entityType: EntityType): string[] {
    const normalizedValue = entityValue.toLowerCase();

    const rows = this.db
      .select({ entryId: entityIndex.entryId })
      .from(entityIndex)
      .where(
        and(
          eq(entityIndex.entityValue, normalizedValue),
          eq(entityIndex.entityType, entityType)
        )
      )
      .all();

    return rows.map((r) => r.entryId);
  }

  /**
   * Look up entries by entity value with entry type filter
   *
   * @param entityValue - The normalized entity value to look up
   * @param entryType - Filter by entry type (tool, guideline, knowledge, experience)
   * @returns Array of entry IDs
   */
  lookupByEntryType(entityValue: string, entryType: QueryEntryType): string[] {
    const normalizedValue = entityValue.toLowerCase();

    const rows = this.db
      .select({ entryId: entityIndex.entryId })
      .from(entityIndex)
      .where(
        and(eq(entityIndex.entityValue, normalizedValue), eq(entityIndex.entryType, entryType))
      )
      .all();

    return rows.map((r) => r.entryId);
  }

  /**
   * Get all entities for an entry
   *
   * @param entryId - The entry ID
   * @returns Array of entity type/value pairs
   */
  getEntitiesForEntry(entryId: string): Array<{ type: EntityType; value: string }> {
    const rows = this.db
      .select({
        type: entityIndex.entityType,
        value: entityIndex.entityValue,
      })
      .from(entityIndex)
      .where(eq(entityIndex.entryId, entryId))
      .all();

    return rows.map((r) => ({ type: r.type as EntityType, value: r.value }));
  }

  /**
   * Count total indexed entities
   *
   * @returns Total number of entity index rows
   */
  async count(): Promise<number> {
    const result = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(entityIndex)
      .get();

    return result?.count ?? 0;
  }

  /**
   * Get entity statistics
   *
   * @returns Statistics about the entity index
   */
  async getStats(): Promise<{
    totalEntities: number;
    byType: Record<EntityType, number>;
    byEntryType: Record<QueryEntryType, number>;
  }> {
    const byTypeRows = this.db
      .select({
        entityType: entityIndex.entityType,
        count: sql<number>`COUNT(*)`,
      })
      .from(entityIndex)
      .groupBy(entityIndex.entityType)
      .all();

    const byEntryTypeRows = this.db
      .select({
        entryType: entityIndex.entryType,
        count: sql<number>`COUNT(*)`,
      })
      .from(entityIndex)
      .groupBy(entityIndex.entryType)
      .all();

    const byType: Record<EntityType, number> = {
      FILE_PATH: 0,
      FUNCTION_NAME: 0,
      PACKAGE_NAME: 0,
      URL: 0,
      ERROR_CODE: 0,
      COMMAND: 0,
      CUSTOM: 0,
    };

    const byEntryType: Record<QueryEntryType, number> = {
      tool: 0,
      guideline: 0,
      knowledge: 0,
      experience: 0,
    };

    let totalEntities = 0;

    for (const row of byTypeRows) {
      byType[row.entityType as EntityType] = row.count;
      totalEntities += row.count;
    }

    for (const row of byEntryTypeRows) {
      byEntryType[row.entryType as QueryEntryType] = row.count;
    }

    return {
      totalEntities,
      byType,
      byEntryType,
    };
  }

  /**
   * Clear the entire entity index
   * WARNING: This removes all indexed entities
   */
  async clear(): Promise<void> {
    await this.db.delete(entityIndex).execute();
  }
}

/**
 * Singleton instance cache
 */
let entityIndexInstance: EntityIndex | null = null;

/**
 * Get the singleton entity index instance
 *
 * @param db - Database client
 * @returns EntityIndex instance
 */
export function getEntityIndex(db: DbClient): EntityIndex {
  if (!entityIndexInstance) {
    entityIndexInstance = new EntityIndex(db);
  }
  return entityIndexInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetEntityIndex(): void {
  entityIndexInstance = null;
}
