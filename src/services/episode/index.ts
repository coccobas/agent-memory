/**
 * Episode Service
 *
 * Orchestrates episode operations, providing:
 * - Timeline queries
 * - Causal chain traversal using graph
 * - Entity linking through graph edges
 * - "What happened during X?" aggregation
 */

import type {
  IEpisodeRepository,
  INodeRepository,
  IEdgeRepository,
  CreateEpisodeInput,
  UpdateEpisodeInput,
  ListEpisodesFilter,
  AddEpisodeEventInput,
  EpisodeWithEvents,
  LinkedEntity,
} from '../../core/interfaces/repositories.js';
import type { PaginationOptions } from '../../db/repositories/base.js';
import type { Episode, EpisodeEvent, EpisodeOutcomeType, ScopeType } from '../../db/schema.js';
import { createNotFoundError } from '../../core/errors.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('episode-service');

/**
 * Safely parse JSON, returning undefined on parse errors instead of throwing.
 * Bug fix: Prevents uncaught SyntaxError from malformed event data.
 */
function safeParseJson(str: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    logger.warn({ data: str.slice(0, 100) }, 'Failed to parse event data JSON');
    return undefined;
  }
}

/**
 * Timeline entry - represents what happened during an episode
 */
export interface TimelineEntry {
  timestamp: string;
  type: 'episode_start' | 'episode_end' | 'event' | 'linked_entity';
  name: string;
  description?: string;
  episodeId: string;
  eventId?: string;
  entryType?: string;
  entryId?: string;
  data?: Record<string, unknown>;
}

/**
 * What happened result - comprehensive view of an episode
 */
export interface WhatHappenedResult {
  episode: EpisodeWithEvents;
  timeline: TimelineEntry[];
  linkedEntities: LinkedEntity[];
  childEpisodes: EpisodeWithEvents[];
  metrics: {
    durationMs: number | null;
    eventCount: number;
    linkedEntityCount: number;
    childEpisodeCount: number;
  };
}

/**
 * Causal chain entry
 */
export interface CausalChainEntry {
  episode: Episode;
  depth: number;
  relationship: 'caused_by' | 'caused' | 'continued_from' | 'continued_by' | 'self';
}

/**
 * Episode Service Dependencies
 */
export interface EpisodeServiceDeps {
  episodeRepo: IEpisodeRepository;
  nodeRepo?: INodeRepository;
  edgeRepo?: IEdgeRepository;
}

/**
 * Create the Episode Service
 */
export function createEpisodeService(deps: EpisodeServiceDeps) {
  const { episodeRepo, nodeRepo, edgeRepo } = deps;

  return {
    // ==========================================================================
    // CRUD Operations (delegated to repository)
    // ==========================================================================

    async create(input: CreateEpisodeInput): Promise<EpisodeWithEvents> {
      return episodeRepo.create(input);
    },

    async getById(id: string, includeEvents = false): Promise<EpisodeWithEvents | undefined> {
      return episodeRepo.getById(id, includeEvents);
    },

    async list(
      filter?: ListEpisodesFilter,
      options?: PaginationOptions
    ): Promise<EpisodeWithEvents[]> {
      return episodeRepo.list(filter, options);
    },

    async update(id: string, input: UpdateEpisodeInput): Promise<EpisodeWithEvents | undefined> {
      return episodeRepo.update(id, input);
    },

    async deactivate(id: string): Promise<boolean> {
      return episodeRepo.deactivate(id);
    },

    async delete(id: string): Promise<boolean> {
      return episodeRepo.delete(id);
    },

    // ==========================================================================
    // Lifecycle Management
    // ==========================================================================

    async start(id: string): Promise<EpisodeWithEvents> {
      return episodeRepo.start(id);
    },

    async complete(
      id: string,
      outcome: string,
      outcomeType: EpisodeOutcomeType
    ): Promise<EpisodeWithEvents> {
      return episodeRepo.complete(id, outcome, outcomeType);
    },

    async fail(id: string, outcome: string): Promise<EpisodeWithEvents> {
      return episodeRepo.fail(id, outcome);
    },

    async cancel(id: string, reason?: string): Promise<EpisodeWithEvents> {
      return episodeRepo.cancel(id, reason);
    },

    // ==========================================================================
    // Event Tracking
    // ==========================================================================

    async addEvent(input: AddEpisodeEventInput): Promise<EpisodeEvent> {
      return episodeRepo.addEvent(input);
    },

    async getEvents(episodeId: string): Promise<EpisodeEvent[]> {
      return episodeRepo.getEvents(episodeId);
    },

    // ==========================================================================
    // Entity Linking (via Graph)
    // ==========================================================================

    async linkEntity(
      episodeId: string,
      entryType: string,
      entryId: string,
      role?: string
    ): Promise<void> {
      if (!nodeRepo || !edgeRepo) {
        throw new Error('Graph repositories not available for entity linking');
      }

      // Find the episode node
      const episodeNode = await nodeRepo.getByEntry('episode' as never, episodeId);
      if (!episodeNode) {
        throw createNotFoundError('episode node', episodeId);
      }

      // Find the target entity node
      const targetNode = await nodeRepo.getByEntry(entryType as never, entryId);
      if (!targetNode) {
        // If the target node doesn't exist, we can still record the link in events
        await episodeRepo.addEvent({
          episodeId,
          eventType: 'linked_entity',
          name: `Linked ${entryType}`,
          description: `Linked ${entryType} ${entryId}`,
          entryType,
          entryId,
          data: { role },
        });
        return;
      }

      // Create edge: episode --episode_contains--> entity
      await edgeRepo.create({
        edgeTypeName: 'episode_contains',
        sourceId: episodeNode.id,
        targetId: targetNode.id,
        properties: {
          role: role ?? 'referenced',
          addedAt: new Date().toISOString(),
        },
      });
    },

    async getLinkedEntities(episodeId: string): Promise<LinkedEntity[]> {
      if (!nodeRepo || !edgeRepo) {
        // Fall back to event-based linking
        const events = await episodeRepo.getEvents(episodeId);
        return events
          .filter((e): e is typeof e & { entryType: string; entryId: string } =>
            Boolean(e.entryType && e.entryId)
          )
          .map((e) => ({
            entryType: e.entryType,
            entryId: e.entryId,
            role: e.data ? (safeParseJson(e.data)?.role as string | undefined) : undefined,
          }));
      }

      // Find the episode node
      const episodeNode = await nodeRepo.getByEntry('episode' as never, episodeId);
      if (!episodeNode) {
        return [];
      }

      // Get all outgoing episode_contains edges
      const edges = await edgeRepo.getOutgoingEdges(episodeNode.id, 'episode_contains');

      // Fetch target nodes and their entry information
      const linkedEntities: LinkedEntity[] = [];
      for (const edge of edges) {
        const targetNode = await nodeRepo.getById(edge.targetId);
        if (targetNode && targetNode.entryType && targetNode.entryId) {
          linkedEntities.push({
            entryType: targetNode.entryType,
            entryId: targetNode.entryId,
            role: edge.properties ? (edge.properties.role as string) : undefined,
          });
        }
      }

      return linkedEntities;
    },

    /**
     * Link multiple captured experiences to an episode
     * Convenience method for integrating with CaptureService results
     */
    async linkCapturedExperiences(
      episodeId: string,
      experienceIds: string[],
      role = 'captured'
    ): Promise<{ linked: number; errors: number }> {
      let linked = 0;
      let errors = 0;

      for (const expId of experienceIds) {
        try {
          await this.linkEntity(episodeId, 'experience', expId, role);
          linked++;
        } catch (error) {
          logger.warn(
            {
              episodeId,
              experienceId: expId,
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to link experience to episode'
          );
          errors++;
        }
      }

      return { linked, errors };
    },

    // ==========================================================================
    // Timeline Queries
    // ==========================================================================

    async getTimeline(
      sessionId: string,
      options?: { start?: string; end?: string }
    ): Promise<TimelineEntry[]> {
      // Get all episodes for the session
      const episodeList = await episodeRepo.list({
        sessionId,
        includeInactive: false,
      });

      // Filter by time range if specified
      let filteredEpisodes = episodeList;
      if (options?.start || options?.end) {
        filteredEpisodes = episodeList.filter((ep) => {
          if (options.start && ep.startedAt && ep.startedAt < options.start) {
            return false;
          }
          if (options.end && ep.startedAt && ep.startedAt > options.end) {
            return false;
          }
          return true;
        });
      }

      // Build timeline entries
      const timeline: TimelineEntry[] = [];

      for (const ep of filteredEpisodes) {
        // Episode start
        if (ep.startedAt) {
          timeline.push({
            timestamp: ep.startedAt,
            type: 'episode_start',
            name: `Started: ${ep.name}`,
            description: ep.description ?? undefined,
            episodeId: ep.id,
          });
        }

        // Get events for this episode
        const events = await episodeRepo.getEvents(ep.id);
        for (const event of events) {
          timeline.push({
            timestamp: event.occurredAt,
            type: 'event',
            name: event.name,
            description: event.description ?? undefined,
            episodeId: ep.id,
            eventId: event.id,
            entryType: event.entryType ?? undefined,
            entryId: event.entryId ?? undefined,
            data: event.data ? safeParseJson(event.data) : undefined,
          });
        }

        // Episode end
        if (ep.endedAt) {
          timeline.push({
            timestamp: ep.endedAt,
            type: 'episode_end',
            name: `Ended: ${ep.name}`,
            description: ep.outcome ?? undefined,
            episodeId: ep.id,
            data: { outcomeType: ep.outcomeType },
          });
        }
      }

      // Sort by timestamp
      timeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      return timeline;
    },

    // ==========================================================================
    // "What Happened During X?" Query
    // ==========================================================================

    async whatHappened(episodeId: string): Promise<WhatHappenedResult> {
      const episode = await episodeRepo.getById(episodeId, true);
      if (!episode) {
        throw createNotFoundError('episode', episodeId);
      }

      // Get events
      const events = episode.events ?? [];

      // Get linked entities
      const linkedEntities = await this.getLinkedEntities(episodeId);

      // Get child episodes
      const childEpisodes = await episodeRepo.getChildren(episodeId);

      // Build timeline
      const timeline: TimelineEntry[] = [];

      // Add episode start
      if (episode.startedAt) {
        timeline.push({
          timestamp: episode.startedAt,
          type: 'episode_start',
          name: `Started: ${episode.name}`,
          description: episode.description ?? undefined,
          episodeId: episode.id,
        });
      }

      // Add events
      for (const event of events) {
        timeline.push({
          timestamp: event.occurredAt,
          type: 'event',
          name: event.name,
          description: event.description ?? undefined,
          episodeId: episode.id,
          eventId: event.id,
          entryType: event.entryType ?? undefined,
          entryId: event.entryId ?? undefined,
          data: event.data ? safeParseJson(event.data) : undefined,
        });
      }

      // Add episode end
      if (episode.endedAt) {
        timeline.push({
          timestamp: episode.endedAt,
          type: 'episode_end',
          name: `Ended: ${episode.name}`,
          description: episode.outcome ?? undefined,
          episodeId: episode.id,
          data: { outcomeType: episode.outcomeType },
        });
      }

      // Sort timeline
      timeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      return {
        episode,
        timeline,
        linkedEntities,
        childEpisodes,
        metrics: {
          durationMs: episode.durationMs,
          eventCount: events.length,
          linkedEntityCount: linkedEntities.length,
          childEpisodeCount: childEpisodes.length,
        },
      };
    },

    // ==========================================================================
    // Causal Chain Traversal
    // ==========================================================================

    async traceCausalChain(
      episodeId: string,
      direction: 'forward' | 'backward',
      maxDepth = 10
    ): Promise<CausalChainEntry[]> {
      const chain: CausalChainEntry[] = [];
      const visited = new Set<string>();

      // Get the starting episode
      const startEpisode = await episodeRepo.getById(episodeId, false);
      if (!startEpisode) {
        throw createNotFoundError('episode', episodeId);
      }

      // Add the starting episode
      chain.push({
        episode: startEpisode,
        depth: 0,
        relationship: 'self',
      });
      visited.add(episodeId);

      if (!nodeRepo || !edgeRepo) {
        // Without graph, we can only trace through parent-child hierarchy
        if (direction === 'backward') {
          const ancestors = await episodeRepo.getAncestors(episodeId);
          for (let i = 0; i < ancestors.length && i < maxDepth; i++) {
            const ancestor = ancestors[i];
            if (ancestor) {
              chain.push({
                episode: ancestor,
                depth: i + 1,
                relationship: 'caused_by',
              });
            }
          }
        } else {
          // Forward: get children recursively
          const processChildren = async (parentId: string, depth: number) => {
            if (depth >= maxDepth) return;
            const children = await episodeRepo.getChildren(parentId);
            for (const child of children) {
              if (!visited.has(child.id)) {
                visited.add(child.id);
                chain.push({
                  episode: child,
                  depth,
                  relationship: 'caused',
                });
                await processChildren(child.id, depth + 1);
              }
            }
          };
          await processChildren(episodeId, 1);
        }
        return chain;
      }

      // With graph, we can trace through caused_by and continued_from edges
      const episodeNode = await nodeRepo.getByEntry('episode' as never, episodeId);
      if (!episodeNode) {
        return chain;
      }

      const edgeTypes =
        direction === 'backward' ? ['caused_by', 'continued_from'] : ['caused', 'continued_by'];

      const traverse = async (nodeId: string, depth: number) => {
        if (depth >= maxDepth) return;

        for (const edgeType of edgeTypes) {
          const edges =
            direction === 'backward'
              ? await edgeRepo.getOutgoingEdges(nodeId, edgeType)
              : await edgeRepo.getIncomingEdges(nodeId, edgeType);

          for (const edge of edges) {
            const targetNodeId = direction === 'backward' ? edge.targetId : edge.sourceId;
            const targetNode = await nodeRepo.getById(targetNodeId);

            if (targetNode && targetNode.entryType === 'episode' && targetNode.entryId) {
              if (!visited.has(targetNode.entryId)) {
                visited.add(targetNode.entryId);

                const episode = await episodeRepo.getById(targetNode.entryId, false);
                if (episode) {
                  const relationship = edgeType as CausalChainEntry['relationship'];
                  chain.push({
                    episode,
                    depth,
                    relationship,
                  });
                  await traverse(targetNodeId, depth + 1);
                }
              }
            }
          }
        }
      };

      await traverse(episodeNode.id, 1);

      // Sort by depth
      chain.sort((a, b) => a.depth - b.depth);

      return chain;
    },

    // ==========================================================================
    // Additional Temporal Queries
    // ==========================================================================

    async getActiveEpisode(sessionId: string): Promise<EpisodeWithEvents | undefined> {
      return episodeRepo.getActiveEpisode(sessionId);
    },

    async getEpisodesInRange(
      start: string,
      end: string,
      scopeType?: ScopeType,
      scopeId?: string
    ): Promise<EpisodeWithEvents[]> {
      return episodeRepo.getEpisodesInRange(start, end, scopeType, scopeId);
    },

    async getChildren(parentId: string): Promise<EpisodeWithEvents[]> {
      return episodeRepo.getChildren(parentId);
    },

    async getAncestors(episodeId: string): Promise<Episode[]> {
      return episodeRepo.getAncestors(episodeId);
    },
  };
}

export type EpisodeService = ReturnType<typeof createEpisodeService>;
