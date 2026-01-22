/**
 * memory_context tool descriptor
 *
 * Unified context management tool that provides:
 * - Diagnostic actions: show, refresh (debug auto-detected context)
 * - Context retrieval: get (unified context for any purpose)
 * - Information: budget-info, stats (budget and statistics)
 */

import type { ToolDescriptor } from './types.js';
import {
  createUnifiedContextService,
  type ContextPurpose,
  type IncludableEntryType,
  PURPOSE_BUDGETS,
} from '../../services/context/unified-context.service.js';
import type { ScopeType } from '../../db/schema.js';

/**
 * Map purpose string to ContextPurpose object
 */
function toPurpose(
  purposeStr?: string,
  toolName?: string,
  query?: string,
  complexity?: string
): ContextPurpose {
  switch (purposeStr) {
    case 'session_start':
      return { type: 'session_start' };
    case 'tool_injection':
      return { type: 'tool_injection', toolName: toolName ?? 'unknown' };
    case 'query':
      return { type: 'query', query };
    case 'custom':
      return {
        type: 'custom',
        complexity: (complexity as 'simple' | 'moderate' | 'complex' | 'critical') ?? 'moderate',
      };
    default:
      return { type: 'session_start' };
  }
}

/**
 * Map include array to IncludableEntryType array
 */
function toInclude(include?: string[]): IncludableEntryType[] | undefined {
  if (!include || include.length === 0) return undefined;
  const validTypes = ['guidelines', 'knowledge', 'tools', 'experiences'] as const;
  return include.filter((t): t is IncludableEntryType =>
    validTypes.includes(t as IncludableEntryType)
  );
}

export const memoryContextDescriptor: ToolDescriptor = {
  name: 'memory_context',
  visibility: 'core',
  description: `Unified context management for memory retrieval.

Actions:
- get: Retrieve context for a specific purpose (session_start, tool_injection, query, custom)
- budget-info: Get budget configuration for all purposes
- stats: Get statistics about stored context
- show: Show auto-detected context (diagnostic)
- refresh: Clear cache and re-detect context (diagnostic)

Example (get context for session start):
{"action":"get","purpose":"session_start","scopeType":"project","scopeId":"proj-123"}

Example (get context for tool injection):
{"action":"get","purpose":"tool_injection","toolName":"Edit","scopeType":"project","scopeId":"proj-123"}

Example (get budget info):
{"action":"budget-info"}`,

  commonParams: {
    scopeType: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
      description: 'Scope type for context retrieval',
    },
    scopeId: {
      type: 'string',
      description: 'Scope ID (required for non-global scopes)',
    },
  },

  actions: {
    // =========================================================================
    // CONTEXT RETRIEVAL ACTIONS
    // =========================================================================
    get: {
      params: {
        purpose: {
          type: 'string',
          enum: ['session_start', 'tool_injection', 'query', 'custom'],
          description: 'Purpose determines budget and behavior',
        },
        toolName: {
          type: 'string',
          description: 'Tool name (required for tool_injection purpose)',
        },
        query: {
          type: 'string',
          description: 'Query text (optional for query purpose)',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'json', 'natural_language'],
          description: 'Output format (default: markdown)',
        },
        budget: {
          type: 'number',
          description: 'Token budget override (or "auto" for purpose-based)',
        },
        include: {
          type: 'array',
          items: { type: 'string', enum: ['guidelines', 'knowledge', 'tools', 'experiences'] },
          description: 'Entry types to include (default: all for purpose)',
        },
        excludeStale: {
          type: 'boolean',
          description: 'Exclude stale entries from output',
        },
        maxEntries: {
          type: 'number',
          description: 'Maximum entries to return (soft limit)',
        },
        sessionId: {
          type: 'string',
          description: 'Session ID for session-scoped queries',
        },
        projectId: {
          type: 'string',
          description: 'Project ID (can differ from scopeId for session scope)',
        },
        complexity: {
          type: 'string',
          enum: ['simple', 'moderate', 'complex', 'critical'],
          description: 'Task complexity (for custom purpose)',
        },
      },
      contextHandler: async (ctx, params) => {
        const {
          purpose: purposeStr,
          toolName,
          query,
          format,
          budget,
          include,
          excludeStale,
          maxEntries,
          sessionId,
          projectId,
          complexity,
          scopeType,
          scopeId,
        } = params as {
          purpose?: string;
          toolName?: string;
          query?: string;
          format?: 'markdown' | 'json' | 'natural_language';
          budget?: number | 'auto';
          include?: string[];
          excludeStale?: boolean;
          maxEntries?: number;
          sessionId?: string;
          projectId?: string;
          complexity?: string;
          scopeType?: string;
          scopeId?: string;
        };

        // Validate purpose
        const validPurposes = ['session_start', 'tool_injection', 'query', 'custom'];
        if (purposeStr && !validPurposes.includes(purposeStr)) {
          return {
            success: false,
            error: `Invalid purpose: ${purposeStr}. Valid: ${validPurposes.join(', ')}`,
          };
        }

        // Validate scopeId for non-global
        const scope = (scopeType as ScopeType) ?? 'project';
        if (scope !== 'global' && !scopeId) {
          return {
            success: false,
            error: `scopeId required for ${scope} scope`,
          };
        }

        // Create service
        const service = createUnifiedContextService(ctx.db);

        // Build request
        const purpose = toPurpose(purposeStr, toolName, query, complexity);
        const result = await service.getContext({
          purpose,
          scopeType: scope,
          scopeId,
          sessionId,
          projectId,
          format,
          budget,
          include: toInclude(include),
          excludeStale,
          maxEntries,
        });

        return result;
      },
    },

    'budget-info': {
      contextHandler: async () => {
        return {
          success: true,
          content: JSON.stringify({ budgets: PURPOSE_BUDGETS }),
          budgets: PURPOSE_BUDGETS,
        };
      },
    },

    stats: {
      contextHandler: async (ctx, params) => {
        const { scopeType, scopeId } = params as {
          scopeType?: string;
          scopeId?: string;
        };

        const scope = (scopeType as ScopeType) ?? 'project';
        if (scope !== 'global' && !scopeId) {
          return {
            success: false,
            error: `scopeId required for ${scope} scope`,
          };
        }

        // Get counts from database
        const db = ctx.db;

        // Count entries by type (simplified - just count all active)
        const guidelineCount = db
          .select()
          .from(await import('../../db/schema.js').then((m) => m.guidelines))
          .all().length;

        const knowledgeCount = db
          .select()
          .from(await import('../../db/schema.js').then((m) => m.knowledge))
          .all().length;

        const toolCount = db
          .select()
          .from(await import('../../db/schema.js').then((m) => m.tools))
          .all().length;

        const experienceCount = db
          .select()
          .from(await import('../../db/schema.js').then((m) => m.experiences))
          .all().length;

        const totalEntries = guidelineCount + knowledgeCount + toolCount + experienceCount;

        return {
          success: true,
          content: JSON.stringify({
            totalEntries,
            byType: {
              guidelines: guidelineCount,
              knowledge: knowledgeCount,
              tools: toolCount,
              experiences: experienceCount,
            },
            staleCount: 0, // TODO: Calculate based on staleness detector
            totalTokensEstimate: totalEntries * 50, // Rough estimate
          }),
        };
      },
    },

    // =========================================================================
    // DIAGNOSTIC ACTIONS (existing)
    // =========================================================================
    show: {
      contextHandler: async (ctx) => {
        const contextDetection = ctx.services.contextDetection;
        if (!contextDetection) {
          return {
            error: 'Context detection service not available',
            message:
              'The context detection service is not initialized. This may indicate a startup issue.',
          };
        }

        const detected = await contextDetection.detect();

        return {
          detected: {
            project: detected.project
              ? {
                  id: detected.project.id,
                  name: detected.project.name,
                  rootPath: detected.project.rootPath,
                  source: detected.project.source,
                }
              : null,
            session: detected.session
              ? {
                  id: detected.session.id,
                  name: detected.session.name,
                  status: detected.session.status,
                  source: detected.session.source,
                }
              : null,
            agentId: {
              value: detected.agentId.value,
              source: detected.agentId.source,
            },
          },
          workingDirectory: detected.workingDirectory,
          config: {
            autoContextEnabled: ctx.config.autoContext.enabled,
            defaultAgentId: ctx.config.autoContext.defaultAgentId,
            cacheTTLMs: ctx.config.autoContext.cacheTTLMs,
          },
          action: 'show',
          message: 'Showing currently detected context (use action:"refresh" to re-detect)',
        };
      },
    },

    refresh: {
      contextHandler: async (ctx) => {
        const contextDetection = ctx.services.contextDetection;
        if (!contextDetection) {
          return {
            error: 'Context detection service not available',
            message:
              'The context detection service is not initialized. This may indicate a startup issue.',
          };
        }

        contextDetection.clearCache();
        const detected = await contextDetection.detect();

        return {
          detected: {
            project: detected.project
              ? {
                  id: detected.project.id,
                  name: detected.project.name,
                  rootPath: detected.project.rootPath,
                  source: detected.project.source,
                }
              : null,
            session: detected.session
              ? {
                  id: detected.session.id,
                  name: detected.session.name,
                  status: detected.session.status,
                  source: detected.session.source,
                }
              : null,
            agentId: {
              value: detected.agentId.value,
              source: detected.agentId.source,
            },
          },
          workingDirectory: detected.workingDirectory,
          config: {
            autoContextEnabled: ctx.config.autoContext.enabled,
            defaultAgentId: ctx.config.autoContext.defaultAgentId,
            cacheTTLMs: ctx.config.autoContext.cacheTTLMs,
          },
          action: 'refresh',
          message: 'Cache cleared and context re-detected',
        };
      },
    },
  },
};
