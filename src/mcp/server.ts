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
 * - memory_conversation (start, add_message, get, list, update, link_context, get_context, search, end, archive)
 * - memory_hook (generate, install, status, uninstall)
 * - memory_verify (pre_check, post_check, acknowledge, status)
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
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import {
  closeDb,
  startHealthCheckInterval,
} from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { VERSION } from '../version.js';
import { runTool } from './tool-runner.js';
import { createAppContext } from '../core/factory.js';
import { registerContext } from '../core/container.js';
import { config } from '../config/index.js';
import type { AppContext } from '../core/context.js';

// Import generated tools from descriptors
import { GENERATED_TOOLS } from './descriptors/index.js';

// =============================================================================
// BUNDLED TOOL DEFINITIONS
// Generated from unified descriptors - see src/mcp/descriptors/
// =============================================================================

/**
 * MCP Tool definitions
 * Generated from unified descriptors in src/mcp/descriptors/
 */
export const TOOLS: Tool[] = GENERATED_TOOLS;

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

  // Database is already initialized by AppContext, but we might want to start specific background tasks
  // like health checks or cleanups that are specific to the server lifecycle
  try {
    startHealthCheckInterval();
  } catch (error) {
     logger.warn({ error }, 'Failed to start health check interval');
  }

  // Seed predefined tags
  try {
    logger.debug('Seeding predefined tags...');
    context.repos.tags.seedPredefined();
    logger.debug('Tags seeded successfully');
  } catch (error) {
    logger.warn({ error }, 'Failed to seed tags');
    // Continue anyway - tags aren't critical
  }

  // Cleanup stale file locks
  try {
    const expiredCount = await context.repos.fileLocks.cleanupExpiredLocks();
    const staleCount = await context.repos.fileLocks.cleanupStaleLocks();
    if (expiredCount > 0 || staleCount > 0) {
      logger.info(
        { expired: expiredCount, stale: staleCount },
        'Cleaned up stale file locks'
      );
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
    return runTool(context, name, args as Record<string, unknown> | undefined);
  });

  logger.debug('Request handlers configured');
  logger.debug('Server creation complete');

  return server;
}

export async function runServer(): Promise<void> {
  logger.info('Starting MCP server...');
  logger.info(
    { nodeVersion: process.version, platform: process.platform, cwd: process.cwd() },
    'Runtime environment'
  );

  let server: Server;
  try {
    // Initialize AppContext
    const context = await createAppContext(config);
    
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
  // SHUTDOWN HANDLING
  // =============================================================================

  function shutdown(signal: string): void {
    logger.info({ signal }, 'Shutdown signal received');

    try {
      // Close database connection
      closeDb();

      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  }

  try {
    const transport = new StdioServerTransport();
    logger.debug('Transport created');

    // Unix/macOS signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

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
            shutdown('SIGINT (Windows)');
          });
      }
    }

    // Log unhandled errors
    process.on('uncaughtException', (error) => {
      logger.fatal({ error }, 'Uncaught exception');
      try {
        closeDb();
      } catch (dbError) {
        logger.error({ dbError }, 'Error closing database');
      }
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.fatal({ reason }, 'Unhandled rejection');
      try {
        closeDb();
      } catch (dbError) {
        logger.error({ dbError }, 'Error closing database');
      }
      process.exit(1);
    });

    // Connect to transport
    logger.debug('Connecting to transport...');
    await server.connect(transport);
    logger.info('Connected successfully - server is ready');
    logger.info('Server is now listening for requests');
  } catch (error) {
    logger.fatal({ error }, 'Fatal error during startup');
    try {
      closeDb();
    } catch (dbError) {
      logger.error({ dbError }, 'Error closing database');
    }
    process.exit(1);
  }
}
