/**
 * memory_status tool descriptor
 *
 * User-facing dashboard showing project context and memory counts.
 * Unlike memory_health (infrastructure), this shows content summary.
 *
 * Single tool call replaces: quickstart + project list + session list + entity counts
 */

import type { SimpleToolDescriptor } from './types.js';
import type { AppContext } from '../../core/context.js';
import { formatStatusTerminal } from '../../utils/terminal-formatter.js';
import { formatStatusMinto, type StatusMintoInput } from '../../utils/minto-formatter.js';

export interface StatusResult {
  project: {
    id: string;
    name: string;
    rootPath?: string;
  } | null;
  session: {
    id: string;
    name: string;
    status: string;
  } | null;
  counts: {
    guidelines: number;
    knowledge: number;
    tools: number;
    sessions: number;
  };
  topEntries?: {
    guidelines: Array<{ id: string; name: string; priority: number }>;
    knowledge: Array<{ id: string; title: string }>;
  };
  health?: {
    score: number;
    grade: 'excellent' | 'good' | 'fair' | 'poor';
  } | null;
  graph?: {
    nodes: number;
    edges: number;
  } | null;
  librarian?: {
    pendingRecommendations: number;
    previews?: Array<{ id: string; title: string; type: string }>;
  };
  episode?: {
    id: string;
    name: string;
    status: string;
  } | null;
  _display?: string;
}

export const memoryStatusDescriptor: SimpleToolDescriptor = {
  name: 'memory_status',
  visibility: 'core',
  description: `Get a compact dashboard of your memory status.

Returns project info, active session, and entry counts in one call.
Use this instead of multiple list calls to understand memory state.

Example: {}
Example: {"includeTopEntries": true}

Returns: project, session, counts (guidelines, knowledge, tools, sessions)

NOTE: The response includes a \`_display\` field with pre-formatted terminal output.
When displaying to users, output the \`_display\` content verbatim instead of reformatting to markdown.`,
  params: {
    includeTopEntries: {
      type: 'boolean',
      description: 'Include top 5 entries per type (default: false)',
    },
    mintoStyle: {
      type: 'boolean',
      description:
        'Use Minto Pyramid format (default: true). Set false for verbose dashboard output.',
    },
  },
  contextHandler: async (
    ctx: AppContext,
    args?: Record<string, unknown>
  ): Promise<StatusResult> => {
    const includeTopEntries = (args?.includeTopEntries as boolean) ?? false;
    const mintoStyle = (args?.mintoStyle as boolean) ?? true;

    // Get project and session from auto-detection (single call)
    const detected = ctx.services.contextDetection
      ? (await ctx.services.contextDetection.enrichParams({})).detected
      : { project: null, session: null };

    // Build scope filter for project-scoped counts
    const projectId = detected.project?.id;
    const scopeFilter = projectId ? { scopeType: 'project' as const, scopeId: projectId } : {};

    // Get project-scoped counts by fetching lists
    // This ensures counts match what the user sees when listing entries
    // Using a high limit to get accurate counts (could be optimized with COUNT queries later)
    const [guidelinesList, knowledgeList, toolsList, sessionsList] = await Promise.all([
      ctx.repos.guidelines.list(scopeFilter, { limit: 10000 }),
      ctx.repos.knowledge.list(scopeFilter, { limit: 10000 }),
      ctx.repos.tools.list(scopeFilter, { limit: 10000 }),
      projectId ? ctx.repos.sessions.list({ projectId }, { limit: 10000 }) : Promise.resolve([]),
    ]);

    const guidelinesCount = guidelinesList.length;
    const knowledgeCount = knowledgeList.length;
    const toolsCount = toolsList.length;
    const sessionsCount = sessionsList.length;

    // Optionally get top entries (reuse already-fetched lists)
    let topEntries: StatusResult['topEntries'] | undefined;
    if (includeTopEntries) {
      topEntries = {
        guidelines: guidelinesList.slice(0, 5).map((g) => ({
          id: g.id,
          name: g.name,
          priority: g.priority,
        })),
        knowledge: knowledgeList.slice(0, 5).map((k) => ({
          id: k.id,
          title: k.title,
        })),
      };
    }

    // Get pending librarian recommendations
    let librarian: StatusResult['librarian'] | undefined;
    if (projectId && ctx.services.librarian) {
      try {
        const store = ctx.services.librarian.getRecommendationStore();
        const count = await store.count({
          status: 'pending',
          scopeType: 'project',
          scopeId: projectId,
        });
        if (count > 0) {
          const previews = await store.list(
            { status: 'pending', scopeType: 'project', scopeId: projectId },
            { limit: 3 }
          );
          librarian = {
            pendingRecommendations: count,
            previews: previews.map((r) => ({ id: r.id, title: r.title, type: r.type })),
          };
        }
      } catch {
        // Non-fatal
      }
    }

    // Get memory health score
    let health: StatusResult['health'] | undefined;
    if (projectId && ctx.services.librarian) {
      try {
        if (ctx.services.librarian.hasMaintenanceOrchestrator()) {
          const memoryHealth = await ctx.services.librarian.getHealth('project', projectId);
          health = {
            score: memoryHealth.score,
            grade: memoryHealth.grade,
          };
        }
      } catch {
        // Non-fatal
      }
    }

    // Get graph statistics
    let graph: StatusResult['graph'] | undefined;
    if (projectId && ctx.repos.graphNodes && ctx.repos.graphEdges) {
      try {
        const [nodes, edges] = await Promise.all([
          ctx.repos.graphNodes.list({ scopeType: 'project', scopeId: projectId }, { limit: 10000 }),
          ctx.repos.graphEdges.list({}, { limit: 10000 }),
        ]);
        if (nodes.length > 0 || edges.length > 0) {
          graph = { nodes: nodes.length, edges: edges.length };
        }
      } catch {
        // Non-fatal
      }
    }

    // Get active episode
    let episode: StatusResult['episode'] | undefined;
    const sessionId = detected.session?.id;
    if (sessionId && ctx.services.episode) {
      try {
        const activeEpisode = await ctx.services.episode.getActiveEpisode(sessionId);
        if (activeEpisode) {
          episode = {
            id: activeEpisode.id,
            name: activeEpisode.name,
            status: activeEpisode.status,
          };
        }
      } catch {
        // Non-fatal
      }
    }

    // Build the result object
    const result: StatusResult = {
      project: detected.project
        ? {
            id: detected.project.id,
            name: detected.project.name,
            rootPath: detected.project.rootPath,
          }
        : null,
      session: detected.session
        ? {
            id: detected.session.id,
            name: detected.session.name ?? 'Unnamed session',
            status: detected.session.status,
          }
        : null,
      counts: {
        guidelines: guidelinesCount,
        knowledge: knowledgeCount,
        tools: toolsCount,
        sessions: sessionsCount,
      },
      topEntries,
      health,
      graph,
      librarian,
      episode,
    };

    if (mintoStyle) {
      const mintoInput: StatusMintoInput = {
        project: result.project,
        session: result.session,
        counts: result.counts,
        health: result.health,
        graph: result.graph,
        librarian: result.librarian,
        episode: result.episode,
      };
      result._display = formatStatusMinto(mintoInput);
    } else {
      result._display = formatStatusTerminal(result);
    }

    return result;
  },
};
