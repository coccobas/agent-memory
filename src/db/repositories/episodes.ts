/**
 * Episode Repository
 *
 * Manages episodes - bounded temporal activity groupings.
 * Enables "what happened during X?" and causal chain queries.
 * Factory function that accepts DatabaseDeps for dependency injection.
 */

import { eq, and, asc, desc, gte, lte } from 'drizzle-orm';
import { transactionWithRetry } from '../connection.js';
import {
  episodes,
  episodeEvents,
  type NewEpisode,
  type NewEpisodeEvent,
  type EpisodeEvent,
  type ScopeType,
  type EpisodeOutcomeType,
} from '../schema.js';
import { generateId, type PaginationOptions } from './base.js';
import { syncEntryToNodeAsync } from './graph-sync-hooks.js';
import type { DatabaseDeps } from '../../core/types.js';
import type {
  IEpisodeRepository,
  CreateEpisodeInput,
  UpdateEpisodeInput,
  ListEpisodesFilter,
  AddEpisodeEventInput,
  EpisodeWithEvents,
  LinkedEntity,
} from '../../core/interfaces/repositories.js';
import { createNotFoundError, createConflictError } from '../../core/errors.js';

// Re-export types for backward compatibility
export type {
  CreateEpisodeInput,
  UpdateEpisodeInput,
  ListEpisodesFilter,
  AddEpisodeEventInput,
  EpisodeWithEvents,
  LinkedEntity,
} from '../../core/interfaces/repositories.js';

// =============================================================================
// EPISODE REPOSITORY FACTORY
// =============================================================================

/**
 * Create an episode repository with injected database dependencies
 */
export function createEpisodeRepository(deps: DatabaseDeps): IEpisodeRepository {
  const { db, sqlite } = deps;

  // Helper to fetch episode with events (used within transactions)
  function getByIdSync(id: string, includeEvents = false): EpisodeWithEvents | undefined {
    const entry = db.select().from(episodes).where(eq(episodes.id, id)).get();
    if (!entry) return undefined;

    let events: EpisodeEvent[] | undefined;
    if (includeEvents) {
      events = db
        .select()
        .from(episodeEvents)
        .where(eq(episodeEvents.episodeId, id))
        .orderBy(asc(episodeEvents.sequenceNum))
        .all();
    }

    return { ...entry, events };
  }

  // Helper to calculate parent depth
  function getParentDepth(parentId: string | undefined): number {
    if (!parentId) return 0;
    const parent = db.select().from(episodes).where(eq(episodes.id, parentId)).get();
    return parent ? (parent.depth ?? 0) + 1 : 0;
  }

  // Helper to get next sequence number for events
  function getNextSequenceNum(episodeId: string): number {
    const lastEvent = db
      .select()
      .from(episodeEvents)
      .where(eq(episodeEvents.episodeId, episodeId))
      .orderBy(desc(episodeEvents.sequenceNum))
      .get();
    return (lastEvent?.sequenceNum ?? 0) + 1;
  }

  const repo: IEpisodeRepository = {
    async create(input: CreateEpisodeInput): Promise<EpisodeWithEvents> {
      return await transactionWithRetry(sqlite, () => {
        const episodeId = generateId();
        const depth = getParentDepth(input.parentEpisodeId);

        const entry: NewEpisode = {
          id: episodeId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          sessionId: input.sessionId,
          conversationId: input.conversationId,
          name: input.name,
          description: input.description,
          status: 'planned',
          parentEpisodeId: input.parentEpisodeId,
          depth,
          triggerType: input.triggerType,
          triggerRef: input.triggerRef,
          tags: input.tags ? JSON.stringify(input.tags) : null,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          plannedAt: new Date().toISOString(),
          createdBy: input.createdBy,
          isActive: true,
        };

        db.insert(episodes).values(entry).run();

        const result = getByIdSync(episodeId, false);
        if (!result) {
          throw createConflictError('episode', `failed to create entry ${episodeId}`);
        }

        // Sync to graph node asynchronously
        syncEntryToNodeAsync({
          entryType: 'episode',
          entryId: episodeId,
          name: input.name,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          properties: {
            status: 'planned',
            triggerType: input.triggerType,
            depth,
          },
          createdBy: input.createdBy,
        });

        return result;
      });
    },

    async getById(id: string, includeEvents = false): Promise<EpisodeWithEvents | undefined> {
      return getByIdSync(id, includeEvents);
    },

    async list(
      filter: ListEpisodesFilter = {},
      options: PaginationOptions = {}
    ): Promise<EpisodeWithEvents[]> {
      const { limit = 100, offset = 0 } = options;

      // Build conditions
      const conditions = [];

      if (filter.scopeType !== undefined) {
        conditions.push(eq(episodes.scopeType, filter.scopeType));
      }
      if (filter.scopeId !== undefined) {
        conditions.push(eq(episodes.scopeId, filter.scopeId));
      }
      if (filter.sessionId !== undefined) {
        conditions.push(eq(episodes.sessionId, filter.sessionId));
      }
      if (filter.status !== undefined) {
        conditions.push(eq(episodes.status, filter.status));
      }
      if (filter.parentEpisodeId !== undefined) {
        conditions.push(eq(episodes.parentEpisodeId, filter.parentEpisodeId));
      }
      if (!filter.includeInactive) {
        conditions.push(eq(episodes.isActive, true));
      }

      let query = db.select().from(episodes);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const entries = query.orderBy(desc(episodes.createdAt)).limit(limit).offset(offset).all();

      return entries.map((e) => ({ ...e, events: undefined }));
    },

    async update(id: string, input: UpdateEpisodeInput): Promise<EpisodeWithEvents | undefined> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) return undefined;

        const updates: Partial<NewEpisode> = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.description !== undefined) updates.description = input.description;
        if (input.conversationId !== undefined) updates.conversationId = input.conversationId;
        if (input.tags !== undefined) updates.tags = JSON.stringify(input.tags);
        if (input.metadata !== undefined) updates.metadata = JSON.stringify(input.metadata);

        if (Object.keys(updates).length > 0) {
          db.update(episodes).set(updates).where(eq(episodes.id, id)).run();
        }

        return getByIdSync(id);
      });
    },

    async deactivate(id: string): Promise<boolean> {
      const result = db.update(episodes).set({ isActive: false }).where(eq(episodes.id, id)).run();
      return result.changes > 0;
    },

    async delete(id: string): Promise<boolean> {
      return await transactionWithRetry(sqlite, () => {
        // Delete events first (cascade should handle this, but be explicit)
        db.delete(episodeEvents).where(eq(episodeEvents.episodeId, id)).run();

        // Delete episode
        const deleteResult = db.delete(episodes).where(eq(episodes.id, id)).run();
        return deleteResult.changes > 0;
      });
    },

    // Lifecycle management

    async start(id: string): Promise<EpisodeWithEvents> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) {
          throw createNotFoundError('episode', id);
        }

        if (existing.status !== 'planned') {
          throw createConflictError(
            'episode',
            `cannot start episode in status '${existing.status}'`
          );
        }

        const now = new Date().toISOString();
        db.update(episodes)
          .set({
            status: 'active',
            startedAt: now,
          })
          .where(eq(episodes.id, id))
          .run();

        // Add started event
        const eventId = generateId();
        const seqNum = getNextSequenceNum(id);
        const event: NewEpisodeEvent = {
          id: eventId,
          episodeId: id,
          eventType: 'started',
          name: 'Episode started',
          occurredAt: now,
          sequenceNum: seqNum,
        };
        db.insert(episodeEvents).values(event).run();

        const result = getByIdSync(id, true);
        if (!result) {
          throw createNotFoundError('episode', id);
        }
        return result;
      });
    },

    async complete(
      id: string,
      outcome: string,
      outcomeType: EpisodeOutcomeType
    ): Promise<EpisodeWithEvents> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) {
          throw createNotFoundError('episode', id);
        }

        if (existing.status !== 'active') {
          throw createConflictError(
            'episode',
            `cannot complete episode in status '${existing.status}'`
          );
        }

        const now = new Date().toISOString();
        const durationMs = existing.startedAt
          ? new Date(now).getTime() - new Date(existing.startedAt).getTime()
          : null;

        db.update(episodes)
          .set({
            status: 'completed',
            outcome,
            outcomeType,
            endedAt: now,
            durationMs,
          })
          .where(eq(episodes.id, id))
          .run();

        // Add completed event
        const eventId = generateId();
        const seqNum = getNextSequenceNum(id);
        const event: NewEpisodeEvent = {
          id: eventId,
          episodeId: id,
          eventType: 'completed',
          name: 'Episode completed',
          description: outcome,
          occurredAt: now,
          sequenceNum: seqNum,
          data: JSON.stringify({ outcomeType }),
        };
        db.insert(episodeEvents).values(event).run();

        const result = getByIdSync(id, true);
        if (!result) {
          throw createNotFoundError('episode', id);
        }
        return result;
      });
    },

    async fail(id: string, outcome: string): Promise<EpisodeWithEvents> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) {
          throw createNotFoundError('episode', id);
        }

        if (existing.status !== 'active') {
          throw createConflictError(
            'episode',
            `cannot fail episode in status '${existing.status}'`
          );
        }

        const now = new Date().toISOString();
        const durationMs = existing.startedAt
          ? new Date(now).getTime() - new Date(existing.startedAt).getTime()
          : null;

        db.update(episodes)
          .set({
            status: 'failed',
            outcome,
            outcomeType: 'failure',
            endedAt: now,
            durationMs,
          })
          .where(eq(episodes.id, id))
          .run();

        // Add error event
        const eventId = generateId();
        const seqNum = getNextSequenceNum(id);
        const event: NewEpisodeEvent = {
          id: eventId,
          episodeId: id,
          eventType: 'error',
          name: 'Episode failed',
          description: outcome,
          occurredAt: now,
          sequenceNum: seqNum,
        };
        db.insert(episodeEvents).values(event).run();

        const result = getByIdSync(id, true);
        if (!result) {
          throw createNotFoundError('episode', id);
        }
        return result;
      });
    },

    async cancel(id: string, reason?: string): Promise<EpisodeWithEvents> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) {
          throw createNotFoundError('episode', id);
        }

        if (existing.status === 'completed' || existing.status === 'failed') {
          throw createConflictError(
            'episode',
            `cannot cancel episode in status '${existing.status}'`
          );
        }

        const now = new Date().toISOString();
        const durationMs = existing.startedAt
          ? new Date(now).getTime() - new Date(existing.startedAt).getTime()
          : null;

        db.update(episodes)
          .set({
            status: 'cancelled',
            outcome: reason ?? 'Cancelled',
            outcomeType: 'abandoned',
            endedAt: now,
            durationMs,
          })
          .where(eq(episodes.id, id))
          .run();

        const result = getByIdSync(id, true);
        if (!result) {
          throw createNotFoundError('episode', id);
        }
        return result;
      });
    },

    // Event tracking

    async addEvent(input: AddEpisodeEventInput): Promise<EpisodeEvent> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(input.episodeId);
        if (!existing) {
          throw createNotFoundError('episode', input.episodeId);
        }

        const eventId = generateId();
        const seqNum = getNextSequenceNum(input.episodeId);

        const event: NewEpisodeEvent = {
          id: eventId,
          episodeId: input.episodeId,
          eventType: input.eventType,
          name: input.name,
          description: input.description,
          entryType: input.entryType,
          entryId: input.entryId,
          occurredAt: new Date().toISOString(),
          sequenceNum: seqNum,
          data: input.data ? JSON.stringify(input.data) : null,
        };

        db.insert(episodeEvents).values(event).run();

        const created = db.select().from(episodeEvents).where(eq(episodeEvents.id, eventId)).get();

        if (!created) {
          throw createConflictError('episodeEvent', 'failed to create event');
        }

        return created;
      });
    },

    async getEvents(episodeId: string): Promise<EpisodeEvent[]> {
      return db
        .select()
        .from(episodeEvents)
        .where(eq(episodeEvents.episodeId, episodeId))
        .orderBy(asc(episodeEvents.sequenceNum))
        .all();
    },

    // Entity linking - delegated to graph service
    // These methods are placeholders that will be implemented via the EpisodeService
    // which has access to the graph repositories

    async linkEntity(
      _episodeId: string,
      _entryType: string,
      _entryId: string,
      _role?: string
    ): Promise<void> {
      // This is implemented in EpisodeService using graph edges
      // The repository provides the interface but defers to the service
      throw new Error(
        'linkEntity must be called through EpisodeService which has access to graph repositories'
      );
    },

    async getLinkedEntities(_episodeId: string): Promise<LinkedEntity[]> {
      // This is implemented in EpisodeService using graph queries
      throw new Error(
        'getLinkedEntities must be called through EpisodeService which has access to graph repositories'
      );
    },

    // Temporal queries

    async getActiveEpisode(sessionId: string): Promise<EpisodeWithEvents | undefined> {
      const entry = db
        .select()
        .from(episodes)
        .where(
          and(
            eq(episodes.sessionId, sessionId),
            eq(episodes.status, 'active'),
            eq(episodes.isActive, true)
          )
        )
        .orderBy(desc(episodes.startedAt))
        .get();

      if (!entry) return undefined;
      return { ...entry, events: undefined };
    },

    async getEpisodesInRange(
      start: string,
      end: string,
      scopeType?: ScopeType,
      scopeId?: string
    ): Promise<EpisodeWithEvents[]> {
      const conditions = [
        eq(episodes.isActive, true),
        // Episodes that overlap with the range:
        // started before end AND (ended after start OR not ended yet)
        gte(episodes.startedAt, start),
        lte(episodes.startedAt, end),
      ];

      if (scopeType !== undefined) {
        conditions.push(eq(episodes.scopeType, scopeType));
      }
      if (scopeId !== undefined) {
        conditions.push(eq(episodes.scopeId, scopeId));
      }

      const entries = db
        .select()
        .from(episodes)
        .where(and(...conditions))
        .orderBy(asc(episodes.startedAt))
        .all();

      return entries.map((e) => ({ ...e, events: undefined }));
    },

    // Hierarchy queries

    async getChildren(parentId: string): Promise<EpisodeWithEvents[]> {
      const entries = db
        .select()
        .from(episodes)
        .where(and(eq(episodes.parentEpisodeId, parentId), eq(episodes.isActive, true)))
        .orderBy(asc(episodes.createdAt))
        .all();

      return entries.map((e) => ({ ...e, events: undefined }));
    },

    async getAncestors(episodeId: string): Promise<EpisodeWithEvents[]> {
      const ancestors: EpisodeWithEvents[] = [];
      let currentId: string | null = episodeId;

      while (currentId) {
        const episode = db.select().from(episodes).where(eq(episodes.id, currentId)).get();

        if (!episode) break;
        if (episode.id !== episodeId) {
          ancestors.push({ ...episode, events: undefined });
        }
        currentId = episode.parentEpisodeId;
      }

      return ancestors;
    },
  };

  return repo;
}
