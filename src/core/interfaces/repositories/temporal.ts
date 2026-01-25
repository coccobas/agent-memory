/**
 * Temporal Repository Interfaces
 *
 * Episodes for temporal activity grouping
 */

import type {
  Episode,
  EpisodeEvent,
  EpisodeStatus,
  EpisodeOutcomeType,
  ScopeType,
} from '../../../db/schema.js';
import type { PaginationOptions } from '../../../db/repositories/base.js';

// =============================================================================
// EPISODE REPOSITORY (Temporal Activity Grouping)
// =============================================================================

export interface CreateEpisodeInput {
  scopeType: ScopeType;
  scopeId?: string;
  sessionId?: string;
  conversationId?: string;
  name: string;
  description?: string;
  parentEpisodeId?: string;
  triggerType?: string;
  triggerRef?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

/** Input for updating an episode */
export interface UpdateEpisodeInput {
  name?: string;
  description?: string;
  conversationId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/** Filter for listing episodes */
export interface ListEpisodesFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  sessionId?: string;
  status?: EpisodeStatus;
  parentEpisodeId?: string;
  includeInactive?: boolean;
}

/** Input for adding an event to an episode */
export interface AddEpisodeEventInput {
  episodeId: string;
  eventType: string;
  name: string;
  description?: string;
  entryType?: string;
  entryId?: string;
  data?: Record<string, unknown>;
}

/** Episode with its events */
export interface EpisodeWithEvents extends Episode {
  events?: EpisodeEvent[];
}

/** Linked entity reference */
export interface LinkedEntity {
  entryType: string;
  entryId: string;
  role?: string;
}

export interface IEpisodeRepository {
  // Standard CRUD

  /**
   * Create a new episode.
   * @param input - Episode creation parameters
   * @returns Created episode
   * @throws {AgentMemoryError} E1000 - Missing required field (name, scopeType)
   * @throws {AgentMemoryError} E2000 - Referenced parent episode not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  create(input: CreateEpisodeInput): Promise<EpisodeWithEvents>;

  /**
   * Get an episode by ID.
   * @param id - Episode ID
   * @param includeEvents - Whether to include events
   * @returns Episode if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getById(id: string, includeEvents?: boolean): Promise<EpisodeWithEvents | undefined>;

  /**
   * List episodes matching filter criteria.
   * @param filter - Filter options (scope, session, status, parent)
   * @param options - Pagination options
   * @returns Array of episodes
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  list(filter?: ListEpisodesFilter, options?: PaginationOptions): Promise<EpisodeWithEvents[]>;

  /**
   * Update an episode.
   * @param id - Episode ID
   * @param input - Update parameters
   * @returns Updated episode, or undefined if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  update(id: string, input: UpdateEpisodeInput): Promise<EpisodeWithEvents | undefined>;

  /**
   * Deactivate an episode (soft delete).
   * @param id - Episode ID
   * @returns true if deactivated, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  deactivate(id: string): Promise<boolean>;

  /**
   * Permanently delete an episode and all its events.
   * @param id - Episode ID
   * @returns true if deleted, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  delete(id: string): Promise<boolean>;

  // Lifecycle management

  /**
   * Start a planned episode (planned → active).
   * @param id - Episode ID
   * @returns Started episode
   * @throws {AgentMemoryError} E2000 - Episode not found
   * @throws {AgentMemoryError} E1002 - Episode not in planned status
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  start(id: string): Promise<EpisodeWithEvents>;

  /**
   * Complete an active episode with outcome.
   * @param id - Episode ID
   * @param outcome - Outcome description
   * @param outcomeType - Outcome type (success, partial, failure, abandoned)
   * @returns Completed episode
   * @throws {AgentMemoryError} E2000 - Episode not found
   * @throws {AgentMemoryError} E1002 - Episode not in active status
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  complete(
    id: string,
    outcome: string,
    outcomeType: EpisodeOutcomeType
  ): Promise<EpisodeWithEvents>;

  /**
   * Mark an episode as failed.
   * @param id - Episode ID
   * @param outcome - Failure description
   * @returns Failed episode
   * @throws {AgentMemoryError} E2000 - Episode not found
   * @throws {AgentMemoryError} E1002 - Episode not in active status
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  fail(id: string, outcome: string): Promise<EpisodeWithEvents>;

  /**
   * Cancel an episode.
   * @param id - Episode ID
   * @param reason - Cancellation reason
   * @returns Cancelled episode
   * @throws {AgentMemoryError} E2000 - Episode not found
   * @throws {AgentMemoryError} E1002 - Episode already completed or cancelled
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  cancel(id: string, reason?: string): Promise<EpisodeWithEvents>;

  // Event tracking

  /**
   * Add an event to an episode.
   * @param input - Event parameters
   * @returns Created event
   * @throws {AgentMemoryError} E1000 - Missing required field (episodeId, eventType, name)
   * @throws {AgentMemoryError} E2000 - Episode not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  addEvent(input: AddEpisodeEventInput): Promise<EpisodeEvent>;

  /**
   * Get all events for an episode.
   * @param episodeId - Episode ID
   * @returns Array of events in chronological order
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getEvents(episodeId: string): Promise<EpisodeEvent[]>;

  // Entity linking (via graph)

  /**
   * Link a memory entry to an episode.
   * @param episodeId - Episode ID
   * @param entryType - Entry type
   * @param entryId - Entry ID
   * @param role - Relationship role (created, modified, referenced)
   * @throws {AgentMemoryError} E2000 - Episode or entry not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  linkEntity(episodeId: string, entryType: string, entryId: string, role?: string): Promise<void>;

  /**
   * Get all entities linked to an episode.
   * @param episodeId - Episode ID
   * @returns Array of linked entities
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getLinkedEntities(episodeId: string): Promise<LinkedEntity[]>;

  // Temporal queries

  /**
   * Get the currently active episode for a session.
   * @param sessionId - Session ID
   * @returns Active episode if exists, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getActiveEpisode(sessionId: string): Promise<EpisodeWithEvents | undefined>;

  /**
   * Get an episode by name within a session.
   * Returns the most recently created episode with that name.
   * @param name - Episode name
   * @param sessionId - Session ID
   * @returns Episode if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getByName(name: string, sessionId: string): Promise<EpisodeWithEvents | undefined>;

  /**
   * Get episodes within a time range.
   * @param start - Range start (ISO timestamp)
   * @param end - Range end (ISO timestamp)
   * @param scopeType - Optional scope type filter
   * @param scopeId - Optional scope ID filter
   * @returns Array of episodes
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getEpisodesInRange(
    start: string,
    end: string,
    scopeType?: ScopeType,
    scopeId?: string
  ): Promise<EpisodeWithEvents[]>;

  // Hierarchy queries

  /**
   * Get child episodes of a parent episode.
   * @param parentId - Parent episode ID
   * @returns Array of child episodes
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getChildren(parentId: string): Promise<EpisodeWithEvents[]>;

  /**
   * Get all ancestor episodes (parent chain).
   * @param episodeId - Episode ID
   * @returns Array of ancestors from immediate parent to root
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getAncestors(episodeId: string): Promise<Episode[]>;
}
