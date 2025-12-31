/**
 * memory_context tool descriptor
 *
 * Diagnostic tool for showing auto-detected context.
 * Helps debug what project, session, and agentId are auto-detected
 * from the working directory.
 */

import type { SimpleToolDescriptor } from './types.js';

export const memoryContextDescriptor: SimpleToolDescriptor = {
  name: 'memory_context',
  description: `Show auto-detected context for debugging.

Actions: show, refresh

Use this to see what project, session, and agentId were auto-detected from your working directory.
Example: {"action":"show"} → returns detected context`,
  params: {
    action: {
      type: 'string',
      description: 'Action to perform: "show" (display detected context) or "refresh" (clear cache and re-detect)',
      enum: ['show', 'refresh'],
    },
  },
  contextHandler: async (ctx, args) => {
    const action = (args?.action as string) ?? 'show';

    const contextDetection = ctx.services.contextDetection;
    if (!contextDetection) {
      return {
        error: 'Context detection service not available',
        message: 'The context detection service is not initialized. This may indicate a startup issue.',
      };
    }

    // Handle refresh action
    if (action === 'refresh') {
      contextDetection.clearCache();
    }

    // Detect context
    const detected = await contextDetection.detect();

    // Build response
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
      action,
      message:
        action === 'refresh'
          ? 'Cache cleared and context re-detected'
          : 'Showing currently detected context (use action:"refresh" to re-detect)',
    };
  },
};
