/**
 * memory_quickstart tool descriptor
 *
 * Composite tool that streamlines UX by combining:
 * 1. Context loading (memory_query action:context)
 * 2. Session start (optional, if sessionName provided)
 *
 * This reduces the typical 2+ tool calls at conversation start to just 1.
 */

import type { SimpleToolDescriptor } from './types.js';
import { queryHandlers } from '../handlers/query.handler.js';
import { scopeHandlers } from '../handlers/scopes.handler.js';
import type { SessionStartParams } from '../types.js';

export const memoryQuickstartDescriptor: SimpleToolDescriptor = {
  name: 'memory_quickstart',
  description: `One-call setup for memory context and session.

Combines context loading + optional session start into a single call.
Auto-detects project from working directory if not specified.

Example: {"sessionName":"Fix auth bug"}
Example: {"sessionName":"Add feature","sessionPurpose":"Implement dark mode"}
Example: {} (just load context, no session)

Returns: context (guidelines, knowledge, tools) + session info if started.`,
  params: {
    sessionName: {
      type: 'string',
      description: 'Optional: Start a session with this name. If omitted, only loads context.',
    },
    sessionPurpose: {
      type: 'string',
      description: 'Optional: Purpose/description for the session',
    },
    projectId: {
      type: 'string',
      description: 'Optional: Project ID (auto-detected from cwd if not provided)',
    },
    agentId: {
      type: 'string',
      description: 'Optional: Agent identifier (auto-detected if not provided)',
    },
    inherit: {
      type: 'boolean',
      description: 'Include parent scopes in context (default: true)',
    },
    limitPerType: {
      type: 'number',
      description: 'Max entries per type in context (default: 10)',
    },
  },
  contextHandler: async (ctx, args) => {
    const sessionName = args?.sessionName as string | undefined;
    const sessionPurpose = args?.sessionPurpose as string | undefined;
    const projectId = args?.projectId as string | undefined;
    const agentId = args?.agentId as string | undefined;
    const inherit = (args?.inherit as boolean) ?? true;
    const limitPerType = (args?.limitPerType as number) ?? 10;

    // Step 1: Load context
    const contextResult = await queryHandlers.context(ctx, {
      scopeType: 'project',
      scopeId: projectId, // Will be auto-enriched if not provided
      inherit,
      limitPerType,
    });

    // Extract detected project from context result
    const contextWithMeta = contextResult as {
      _context?: { project?: { id: string } };
    };
    const detectedProjectId = projectId ?? contextWithMeta?._context?.project?.id;

    // Step 2: Optionally start session
    let sessionResult: Record<string, unknown> | null = null;
    if (sessionName && detectedProjectId) {
      try {
        const sessionParams: SessionStartParams = {
          projectId: detectedProjectId as string,
          name: sessionName,
          purpose: sessionPurpose,
          agentId,
        };
        sessionResult = (await scopeHandlers.sessionStart(ctx, sessionParams)) as Record<
          string,
          unknown
        >;
      } catch (error) {
        // Session start failed, include error in response but don't fail the whole call
        sessionResult = {
          error: 'Failed to start session',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // Build combined response
    return {
      context: contextResult,
      session: sessionResult,
      quickstart: {
        contextLoaded: true,
        sessionStarted: sessionResult !== null && !('error' in (sessionResult || {})),
        projectId: detectedProjectId,
      },
    };
  },
};
