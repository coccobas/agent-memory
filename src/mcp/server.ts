/**
 * MCP Server — V2 Simplified
 *
 * Simplified from 464 lines to ~170 lines.
 * Removed: Runtime, tag seeding, graph types, file locks,
 * session/episode cleanup, context detection, health checks.
 *
 * V2 tools: memory_quickstart, memory, memory_remember,
 * memory_write, memory_query, memory_session, memory_projector
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  RootsListChangedNotificationSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from '../utils/logger.js';
import { VERSION } from '../version.js';
import { runTool } from './tool-runner.js';
import { createAppContext, shutdownAppContext } from '../core/factory.js';
import { registerContext } from '../core/container.js';
import { config } from '../config/index.js';
import { logPermissiveModeStartupWarning } from '../config/auth.js';
import type { AppContext } from '../core/context.js';

import { getFilteredTools } from './descriptors/index.js';
import { logStartup, logShutdown } from '../utils/action-logger.js';
import { setNotificationServer, clearNotificationServer } from './notification.service.js';
import { initializeRootsService, handleRootsChanged, clearRootsState } from './roots.service.js';
import { clearWorkingDirectoryCache } from '../utils/working-directory.js';
import { acquirePidFile, releasePidFile } from '../utils/pid-file.js';

/**
 * MCP Tool definitions — filtered by configured visibility level
 */
export const TOOLS: Tool[] = getFilteredTools(config.tools.visibility);

/**
 * Create and configure the MCP server
 */
export async function createServer(context: AppContext): Promise<Server> {
  const server = new Server(
    { name: 'agent-memory', version: VERSION },
    { capabilities: { tools: {} } }
  );

  // Roots notification handler
  server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
    await handleRootsChanged();
    clearWorkingDirectoryCache();
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
        logger.info({ rootCount: roots.length }, 'Roots updated via callback');
      },
    })
      .then(() => logger.info('Client initialization complete'))
      .catch((err: unknown) => logger.error({ err }, 'Failed to initialize roots service'));
  };

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return runTool(context, name, args);
  });

  setNotificationServer(server);
  logger.debug('Server creation complete');

  return server;
}

/**
 * Start the MCP server
 *
 * @param options.runtime - Ignored (kept for CLI compatibility)
 * @param options.manageProcess - If false, server won't call process.exit (CLI mode)
 */
export async function runServer(
  options: { runtime?: unknown; manageProcess?: boolean } = {}
): Promise<void> {
  logger.info('Starting MCP server...');
  logger.info(
    { nodeVersion: process.version, platform: process.platform, cwd: process.cwd() },
    'Runtime environment'
  );

  logPermissiveModeStartupWarning('mcp');

  const pidResult = acquirePidFile({ disabled: !config.runtime.singleInstance });
  if (!pidResult.shouldProceed) {
    logger.error({ existingPid: pidResult.existingPid }, pidResult.message);
    process.exit(1);
  }

  const shouldExitProcess = options.manageProcess ?? true;
  let server: Server;
  let context: AppContext;
  let transport: StdioServerTransport | null = null;

  try {
    context = await createAppContext(config);
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
    process.exit(1);
  }

  async function shutdown(signal: string, exitCode = 0): Promise<void> {
    logger.info({ signal }, 'Shutdown signal received');

    releasePidFile(pidResult.pidFilePath);
    logShutdown(signal);
    clearNotificationServer();
    clearRootsState();

    try {
      await shutdownAppContext(context);

      // Close SQLite connection
      if (context.sqlite) {
        try {
          context.sqlite.close();
        } catch {
          // Ignore close errors
        }
      }

      if (transport) {
        await transport.close();
        transport = null;
      }

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

    // Safety net: SDK's onclose may miss abrupt parent termination
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
      const readline = await import('node:readline');
      if (process.stdin.isTTY) {
        readline
          .createInterface({ input: process.stdin, output: process.stdout })
          .on('SIGINT', () => void shutdown('SIGINT (Windows)'));
      }
    }

    process.on('uncaughtException', (error) => {
      logger.fatal({ error }, 'Uncaught exception');
      void shutdown('uncaughtException', 1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.fatal({ reason }, 'Unhandled rejection');
      void shutdown('unhandledRejection', 1);
    });

    await server.connect(transport);
    logger.info('Connected successfully - server is ready');
    logStartup();
  } catch (error) {
    logger.fatal({ error }, 'Fatal error during startup');
    await shutdown('startup-failure', 1);
    if (!shouldExitProcess) {
      throw error;
    }
  }
}
