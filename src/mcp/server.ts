/**
 * MCP Server for Agent Memory Database
 *
 * Tool Bundling: 45+ individual tools consolidated into 25 action-based tools:
 * - memory_org (create, list)
 * - memory_project (create, list, get, update)
 * - memory_session (start, end, list)
 * - memory_tool (add, update, get, list, history, deactivate, delete)
 * - memory_guideline (add, update, get, list, history, deactivate, delete)
 * - memory_knowledge (add, update, get, list, history, deactivate, delete)
 * - memory_tag (create, list, attach, detach, for_entry)
 * - memory_relation (create, list, delete)
 * - memory_file_lock (checkout, checkin, status, list, force_unlock)
 * - memory_query (search, context)
 * - memory_conflict (list, resolve)
 * - memory_init (init, status, reset)
 * - memory_export (export)
 * - memory_import (import)
 * - memory_task (add, get, list)
 * - memory_voting (record_vote, get_consensus, list_votes, get_stats)
 * - memory_analytics (get_stats, get_trends)
 * - memory_permission (grant, revoke, check, list)
 * - memory_health (health check)
 * - memory_backup (create, list, cleanup, restore)
 * - memory_consolidate (find_similar, dedupe, merge, abstract, archive_stale)
 * - memory_hook (generate, install, status, uninstall)
 * - memory_observe (extract, draft, commit, status)
 *
 * Tool definitions are now generated from unified descriptors.
 * @see src/mcp/descriptors/ for the unified tool descriptor system
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  RootsListChangedNotificationSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { closeDb, startHealthCheckInterval } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { VERSION } from '../version.js';
import { runTool } from './tool-runner.js';
import { createAppContext, shutdownAppContext } from '../core/factory.js';
import { registerContext } from '../core/container.js';
import { ensureRuntime, shutdownOwnedRuntime } from '../core/runtime-owner.js';
import type { Runtime } from '../core/runtime.js';
import { config } from '../config/index.js';
import { logPermissiveModeStartupWarning } from '../config/auth.js';
import type { AppContext } from '../core/context.js';

// Import generated tools from descriptors
import { getFilteredTools } from './descriptors/index.js';
import { logStartup, logShutdown } from '../utils/action-logger.js';
import { setNotificationServer, clearNotificationServer } from './notification.service.js';
import { initializeRootsService, handleRootsChanged, clearRootsState } from './roots.service.js';
import { clearWorkingDirectoryCache } from '../utils/working-directory.js';
import { createComponentLogger } from '../utils/logger.js';
import { acquirePidFile, releasePidFile } from '../utils/pid-file.js';
import { createSessionEpisodeCleanup } from '../services/episode/session-cleanup.js';

// =============================================================================
// BUNDLED TOOL DEFINITIONS
// Generated from unified descriptors - see src/mcp/descriptors/
// =============================================================================

/**
 * MCP Tool definitions
 * Generated from unified descriptors in src/mcp/descriptors/
 * Filtered by visibility level from config (default: 'standard')
 */
export const TOOLS: Tool[] = getFilteredTools(config.tools.visibility);

// =============================================================================
// SERVER SETUP
// =============================================================================

export async function createServer(context: AppContext): Promise<Server> {
  logger.debug('Creating server...');

  const server = new Server(
    {
      name: 'agent-memory',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  logger.debug('Server instance created');

  // Set up roots notification handler
  server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
    await handleRootsChanged();
    // Clear caches when roots change
    clearWorkingDirectoryCache();
    context.services.contextDetection?.clearCache();
    logger.info('Roots changed, caches cleared');
  });

  // Initialize roots when client connects
  const originalOnInitialized = server.oninitialized;
  server.oninitialized = () => {
    if (originalOnInitialized) {
      originalOnInitialized();
    }

    initializeRootsService(server, {
      onRootsChanged: (roots) => {
        clearWorkingDirectoryCache();
        context.services.contextDetection?.clearCache();
        logger.info({ rootCount: roots.length }, 'Roots updated via callback');
      },
    })
      .then(() => {
        logger.info('Client initialization complete, roots service initialized');
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'Failed to initialize roots service');
      });
  };

  // Database is already initialized by AppContext, but we might want to start specific background tasks
  // like health checks or cleanups that are specific to the server lifecycle
  try {
    startHealthCheckInterval();
  } catch (error) {
    logger.warn({ error }, 'Failed to start health check interval');
  }

  // Seed predefined tags (fire-and-forget with proper error handling)
  if (context.repos?.tags) {
    logger.debug('Seeding predefined tags...');
    void context.repos.tags
      .seedPredefined()
      .then(() => {
        logger.debug('Tags seeded successfully');
      })
      .catch((error: unknown) => {
        logger.warn({ error }, 'Failed to seed predefined tags');
        // Continue anyway - tags aren't critical
      });
  }

  // Seed built-in graph types (if graph repositories are available)
  // Fail fast if seeding fails - indicates database schema issue
  if (context.repos?.typeRegistry) {
    logger.debug('Seeding built-in graph types...');
    await context.repos.typeRegistry.seedBuiltinTypes();

    // Verify seeding succeeded
    const nodeTypes = await context.repos.typeRegistry.listNodeTypes({ includeBuiltin: true });
    const edgeTypes = await context.repos.typeRegistry.listEdgeTypes({ includeBuiltin: true });

    logger.info(
      {
        nodeTypes: nodeTypes.length,
        edgeTypes: edgeTypes.length,
        nodeTypeNames: nodeTypes.map((t) => t.name).slice(0, 10), // First 10
        edgeTypeNames: edgeTypes.map((t) => t.name).slice(0, 10), // First 10
      },
      'Graph types seeded and verified'
    );

    // Fail fast if no types were inserted
    if (nodeTypes.length === 0 || edgeTypes.length === 0) {
      throw new Error(
        `Graph initialization failed: ${nodeTypes.length} node types and ${edgeTypes.length} edge types found. ` +
          `Expected non-zero. Database schema may be missing graph tables.`
      );
    }
  }

  // Cleanup stale file locks
  try {
    const expiredCount = await context.repos.fileLocks.cleanupExpiredLocks();
    const staleCount = await context.repos.fileLocks.cleanupStaleLocks();
    if (expiredCount > 0 || staleCount > 0) {
      logger.info({ expired: expiredCount, stale: staleCount }, 'Cleaned up stale file locks');
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to cleanup file locks');
  }

  logger.debug('Setting up request handlers...');

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return { tools: TOOLS };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return runTool(context, name, args);
  });

  logger.debug('Request handlers configured');

  // Wire notification service to the server instance
  setNotificationServer(server);
  logger.debug('Notification service configured');

  logger.debug('Server creation complete');

  return server;
}

/**
 * Runtime lifecycle:
 * - CLI passes a shared runtime and manages process exit.
 * - Direct invocation creates and owns the runtime, and can exit the process.
 */
export async function runServer(
  options: {
    runtime?: Runtime;
    manageProcess?: boolean;
  } = {}
): Promise<void> {
  logger.info('Starting MCP server...');
  logger.info(
    { nodeVersion: process.version, platform: process.platform, cwd: process.cwd() },
    'Runtime environment'
  );

  // Early security check: warn if permissive mode is enabled
  logPermissiveModeStartupWarning('mcp');

  const pidResult = acquirePidFile({ disabled: !config.runtime.singleInstance });
  if (!pidResult.shouldProceed) {
    logger.error({ existingPid: pidResult.existingPid }, pidResult.message);
    process.exit(1);
  }

  let server: Server;
  let context: AppContext;
  let transport: StdioServerTransport | null = null;
  const { runtime, ownsRuntime } = options.runtime
    ? { runtime: options.runtime, ownsRuntime: false }
    : ensureRuntime(config);
  const shouldExitProcess = options.manageProcess ?? !options.runtime;

  try {
    // Initialize AppContext with runtime
    context = await createAppContext(config, runtime);

    // Register with container for services that use getDb()/getSqlite()
    registerContext(context);

    server = await createServer(context);
    logger.info('Server created successfully');
  } catch (error) {
    logger.fatal(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to create server'
    );
    // Exit immediately on fatal error
    process.exit(1);
  }

  // =============================================================================
  // SESSION/EPISODE CLEANUP ON DISCONNECT
  // =============================================================================

  const cleanupLogger = createComponentLogger('mcp-cleanup');

  const sessionEpisodeCleanup = context.repos.episodes
    ? createSessionEpisodeCleanup({
        episodeRepo: context.repos.episodes,
        episodeService: context.services.episode,
        captureService: context.services.capture,
        unifiedMessageSource: context.services.unifiedMessageSource,
      })
    : null;

  async function cleanupActiveSessions(reason: string): Promise<void> {
    try {
      const activeSessions = await context.repos.sessions.list(
        { status: 'active' },
        { limit: 100 }
      );

      if (activeSessions.length === 0) {
        cleanupLogger.debug('No active sessions to clean up');
        return;
      }

      cleanupLogger.info(
        { count: activeSessions.length, reason },
        'Cleaning up active sessions on disconnect'
      );

      for (const session of activeSessions) {
        try {
          if (sessionEpisodeCleanup) {
            await sessionEpisodeCleanup.completeSessionEpisode(session.id, reason);
          }

          if (context.services.transcript && context.repos.ideTranscripts) {
            const transcripts = await context.repos.ideTranscripts.list(
              { agentMemorySessionId: session.id, isSealed: false },
              { limit: 1 }
            );
            if (transcripts[0]) {
              await context.services.transcript.seal(transcripts[0].id);
              cleanupLogger.debug(
                { transcriptId: transcripts[0].id, sessionId: session.id },
                'Sealed transcript'
              );
            }
          }

          await context.repos.sessions.end(session.id, 'completed');
          cleanupLogger.debug({ sessionId: session.id }, 'Ended session');
        } catch (sessionError) {
          cleanupLogger.warn(
            { sessionId: session.id, error: sessionError },
            'Failed to clean up session (non-fatal)'
          );
        }
      }

      cleanupLogger.info({ count: activeSessions.length, reason }, 'Session cleanup completed');
    } catch (error) {
      cleanupLogger.error({ error, reason }, 'Failed to clean up active sessions');
    }
  }

  // =============================================================================
  // SHUTDOWN HANDLING
  // =============================================================================

  async function shutdown(signal: string, exitCode = 0): Promise<void> {
    logger.info({ signal }, 'Shutdown signal received');

    releasePidFile(pidResult.pidFilePath);

    logShutdown(signal);

    clearNotificationServer();

    // Clear roots state
    clearRootsState();

    try {
      // Clean up active sessions and episodes before shutdown
      await cleanupActiveSessions(signal);

      // Gracefully shutdown AppContext (drains feedback queue on SIGTERM)
      const drainQueue = signal === 'SIGTERM';
      await shutdownAppContext(context, { drainFeedbackQueue: drainQueue });

      // Close database connection
      closeDb();

      if (transport) {
        await transport.close();
        transport = null;
      }

      await shutdownOwnedRuntime(ownsRuntime, runtime);

      logger.info('Shutdown complete');
      if (shouldExitProcess) {
        process.exit(exitCode);
      }
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      if (shouldExitProcess) {
        process.exit(1);
      }
    }
  }

  try {
    transport = new StdioServerTransport();
    logger.debug('Transport created');

    // Safety net: SDK's onclose may miss abrupt parent termination (e.g., IDE force-quit)
    let stdinClosed = false;
    const handleStdinClosure = (reason: string) => {
      if (stdinClosed) return;
      stdinClosed = true;
      logger.info({ reason }, 'stdin closed - parent process likely terminated');
      void shutdown(reason);
    };

    process.stdin.on('end', () => handleStdinClosure('stdin-end'));
    process.stdin.on('close', () => handleStdinClosure('stdin-close'));
    process.stdin.on('error', (err: NodeJS.ErrnoException) => {
      const isPipeError = err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED';
      if (isPipeError) {
        handleStdinClosure(`stdin-error-${err.code}`);
      } else {
        logger.warn({ error: err.message, code: err.code }, 'stdin error (non-fatal)');
      }
    });

    // Detect client disconnection via SDK callbacks
    server.onclose = () => {
      logger.info('Client disconnected (server.onclose)');
      void shutdown('client-disconnect');
    };

    server.onerror = (error: Error) => {
      logger.error({ error }, 'Server error (server.onerror)');
    };

    // Unix/macOS signals
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGHUP', () => void shutdown('SIGHUP'));

    // Windows: handle Ctrl+C via readline
    if (process.platform === 'win32') {
      // Note: On Windows, SIGINT is partially supported but we add readline as backup
      const readline = await import('node:readline');
      if (process.stdin.isTTY) {
        readline
          .createInterface({
            input: process.stdin,
            output: process.stdout,
          })
          .on('SIGINT', () => {
            void shutdown('SIGINT (Windows)');
          });
      }
    }

    // Log unhandled errors
    process.on('uncaughtException', (error) => {
      logger.fatal({ error }, 'Uncaught exception');
      void shutdown('uncaughtException', 1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.fatal({ reason }, 'Unhandled rejection');
      void shutdown('unhandledRejection', 1);
    });

    // Connect to transport
    logger.debug('Connecting to transport...');
    await server.connect(transport);
    logger.info('Connected successfully - server is ready');
    logger.info('Server is now listening for requests');

    // Log startup to action log
    logStartup();
  } catch (error) {
    logger.fatal({ error }, 'Fatal error during startup');
    await shutdown('startup-failure', 1);
    if (!shouldExitProcess) {
      throw error;
    }
  }
}
