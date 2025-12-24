/**
 * Retrieval Repository
 *
 * CRUD operations for memory_retrievals table
 */

import { eq, and, desc, isNull } from 'drizzle-orm';
import type { DrizzleDb } from '../../../db/repositories/base.js';
import { generateId, now } from '../../../db/repositories/base.js';
import {
  memoryRetrievals,
  retrievalOutcomes,
  type MemoryRetrieval,
  type NewMemoryRetrieval,
  type EntryType,
} from '../../../db/schema/feedback.js';
import type { RecordRetrievalParams } from '../types.js';
import { createComponentLogger } from '../../../utils/logger.js';

const logger = createComponentLogger('feedback:retrieval-repo');

// =============================================================================
// RETRIEVAL REPOSITORY
// =============================================================================

export class RetrievalRepository {
  constructor(private db: DrizzleDb) {}

  /**
   * Create a new retrieval record
   */
  async create(params: RecordRetrievalParams): Promise<string> {
    const id = generateId();

    const newRetrieval: NewMemoryRetrieval = {
      id,
      sessionId: params.sessionId,
      queryText: params.queryText,
      queryEmbedding: params.queryEmbedding,
      entryType: params.entryType,
      entryId: params.entryId,
      retrievalRank: params.retrievalRank,
      retrievalScore: params.retrievalScore,
      retrievedAt: now(),
    };

    this.db.insert(memoryRetrievals).values(newRetrieval).run();

    logger.debug({ id, sessionId: params.sessionId, entryType: params.entryType }, 'Retrieval recorded');

    return id;
  }

  /**
   * Create multiple retrieval records in batch
   */
  async createBatch(params: RecordRetrievalParams[]): Promise<string[]> {
    if (params.length === 0) {
      return [];
    }

    const ids: string[] = [];
    const retrievals: NewMemoryRetrieval[] = params.map((p) => {
      const id = generateId();
      ids.push(id);

      return {
        id,
        sessionId: p.sessionId,
        queryText: p.queryText,
        queryEmbedding: p.queryEmbedding,
        entryType: p.entryType,
        entryId: p.entryId,
        retrievalRank: p.retrievalRank,
        retrievalScore: p.retrievalScore,
        retrievedAt: now(),
      };
    });

    this.db.insert(memoryRetrievals).values(retrievals).run();

    logger.debug({ count: ids.length, sessionId: params[0]?.sessionId }, 'Batch retrievals recorded');

    return ids;
  }

  /**
   * Get all retrievals for a session
   */
  async getBySession(sessionId: string): Promise<MemoryRetrieval[]> {
    const retrievals = this.db
      .select()
      .from(memoryRetrievals)
      .where(eq(memoryRetrievals.sessionId, sessionId))
      .orderBy(desc(memoryRetrievals.retrievedAt))
      .all();

    return retrievals;
  }

  /**
   * Get all retrievals for a specific entry
   */
  async getByEntry(entryType: EntryType, entryId: string): Promise<MemoryRetrieval[]> {
    const retrievals = this.db
      .select()
      .from(memoryRetrievals)
      .where(
        and(
          eq(memoryRetrievals.entryType, entryType),
          eq(memoryRetrievals.entryId, entryId)
        )
      )
      .orderBy(desc(memoryRetrievals.retrievedAt))
      .all();

    return retrievals;
  }

  /**
   * Get retrievals not yet linked to outcomes (for a session)
   */
  async getUnlinked(sessionId: string): Promise<MemoryRetrieval[]> {
    // Subquery to get retrieval IDs that are already linked
    const linkedRetrievalIds = this.db
      .select({ retrievalId: retrievalOutcomes.retrievalId })
      .from(retrievalOutcomes)
      .all()
      .map((r) => r.retrievalId);

    // Get retrievals for this session that aren't in the linked set
    const allRetrievals = await this.getBySession(sessionId);
    const unlinked = allRetrievals.filter((r) => !linkedRetrievalIds.includes(r.id));

    return unlinked;
  }

  /**
   * Get a specific retrieval by ID
   */
  async getById(id: string): Promise<MemoryRetrieval | undefined> {
    const retrieval = this.db
      .select()
      .from(memoryRetrievals)
      .where(eq(memoryRetrievals.id, id))
      .get();

    return retrieval;
  }

  /**
   * Count retrievals for an entry
   */
  async countByEntry(entryType: EntryType, entryId: string): Promise<number> {
    const retrievals = await this.getByEntry(entryType, entryId);
    return retrievals.length;
  }

  /**
   * Get retrievals within a date range
   */
  async getByDateRange(startDate: string, endDate: string): Promise<MemoryRetrieval[]> {
    const retrievals = this.db
      .select()
      .from(memoryRetrievals)
      .where(
        and(
          // SQLite string comparison works for ISO timestamps
          this.db.$with('start', () => memoryRetrievals.retrievedAt >= startDate),
          this.db.$with('end', () => memoryRetrievals.retrievedAt <= endDate)
        )
      )
      .orderBy(desc(memoryRetrievals.retrievedAt))
      .all();

    return retrievals;
  }
}

/**
 * Factory function to create a retrieval repository
 */
export function createRetrievalRepository(db: DrizzleDb): RetrievalRepository {
  return new RetrievalRepository(db);
}
