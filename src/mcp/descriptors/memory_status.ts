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
import { getCachedStats } from '../../services/stats.service.js';

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
}

export const memoryStatusDescriptor: SimpleToolDescriptor = {
  name: 'memory_status',
  visibility: 'core',
  description: `Get a compact dashboard of your memory status.

Returns project info, active session, and entry counts in one call.
Use this instead of multiple list calls to understand memory state.

Example: {}
Example: {"includeTopEntries": true}

Returns: project, session, counts (guidelines, knowledge, tools, sessions)`,
  params: {
    includeTopEntries: {
      type: 'boolean',
      description: 'Include top 5 entries per type (default: false)',
    },
  },
  contextHandler: async (ctx: AppContext, args?: Record<string, unknown>): Promise<StatusResult> => {
    const includeTopEntries = (args?.includeTopEntries as boolean) ?? false;

    // Get project and session from auto-detection (single call)
    const detected = ctx.services.contextDetection
      ? (await ctx.services.contextDetection.enrichParams({})).detected
      : { project: null, session: null };

    // Get global counts from cached stats service (efficient single query)
    const stats = getCachedStats();

    // Optionally get top entries
    let topEntries: StatusResult['topEntries'] | undefined;
    if (includeTopEntries) {
      const projectId = detected.project?.id;
      const scopeFilter = projectId ? { scopeType: 'project' as const, scopeId: projectId } : {};

      const [guidelines, knowledge] = await Promise.all([
        ctx.repos.guidelines.list(scopeFilter, { limit: 5 }),
        ctx.repos.knowledge.list(scopeFilter, { limit: 5 }),
      ]);

      topEntries = {
        guidelines: guidelines.map((g) => ({
          id: g.id,
          name: g.name,
          priority: g.priority,
        })),
        knowledge: knowledge.map((k) => ({
          id: k.id,
          title: k.title,
        })),
      };
    }

    return {
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
        guidelines: stats.guidelines,
        knowledge: stats.knowledge,
        tools: stats.tools,
        sessions: stats.sessions,
      },
      topEntries,
    };
  },
};
