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
  visibility: 'core',
  description: 'One-call setup for memory context and session. Auto-detects project from cwd.',
  params: {
    sessionName: { type: 'string', description: 'Start session with this name' },
    sessionPurpose: { type: 'string' },
    projectId: { type: 'string' },
    agentId: { type: 'string' },
    inherit: { type: 'boolean' },
    limitPerType: { type: 'number' },
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

    // Step 2: Optionally start session (or resume existing active session)
    let sessionResult: Record<string, unknown> | null = null;
    let sessionAction: 'created' | 'resumed' | 'none' | 'error' = 'none';
    let existingSessionName: string | null = null;

    if (sessionName && detectedProjectId) {
      try {
        // Check for existing active session in this project
        const activeSessions = await ctx.repos.sessions.list(
          { projectId: detectedProjectId, status: 'active' },
          { limit: 1 }
        );

        const existingSession = activeSessions[0];
        if (existingSession) {
          // Resume existing session instead of creating new one
          existingSessionName = existingSession.name ?? null;
          sessionResult = {
            success: true,
            session: existingSession,
            resumed: true,
          };
          sessionAction = 'resumed';
        } else {
          // Create new session
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
          sessionAction = 'created';
        }
      } catch (error) {
        // Session start failed, include error in response but don't fail the whole call
        sessionResult = {
          error: 'Failed to start session',
          message: error instanceof Error ? error.message : String(error),
        };
        sessionAction = 'error';
      }
    }

    // Build combined response with clear action indicator
    return {
      context: contextResult,
      session: sessionResult,
      quickstart: {
        contextLoaded: true,
        sessionAction,
        sessionStarted: sessionAction === 'created',
        sessionResumed: sessionAction === 'resumed',
        resumedSessionName: existingSessionName,
        requestedSessionName: sessionName,
        projectId: detectedProjectId,
      },
    };
  },
};
