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
  getDb,
  closeDb,
  getDbWithHealthCheck,
  startHealthCheckInterval,
} from '../db/connection.js';
import { cleanupExpiredLocks, cleanupStaleLocks } from '../db/repositories/file_locks.js';
import { tagRepo } from '../db/repositories/tags.js';
import { formatError, createInvalidActionError } from './errors.js';
import { formatOutput } from '../utils/compact-formatter.js';
import { logger } from '../utils/logger.js';
import { checkRateLimits } from '../utils/rate-limiter.js';
import { VERSION } from '../version.js';
import '../services/bootstrap.js';

// Import generated tools and handlers from descriptors
import { GENERATED_TOOLS, GENERATED_HANDLERS } from './descriptors/index.js';

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

export async function createServer(): Promise<Server> {
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

  // Initialize database (with more defensive error handling)
  try {
    logger.info('Initializing database...');
    // P2-T1: Use health check aware connection
    await getDbWithHealthCheck();
    startHealthCheckInterval();
    logger.info('Database initialized successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.fatal(
      {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Database initialization failed'
    );
    // Don't throw - let the server start anyway, tools will handle errors gracefully
    // This prevents Antigravity from seeing the server as crashed
    logger.warn('Continuing server startup despite database initialization error');
  }

  // Seed predefined tags
  try {
    logger.debug('Seeding predefined tags...');
    tagRepo.seedPredefined();
    logger.debug('Tags seeded successfully');
  } catch (error) {
    logger.warn({ error }, 'Failed to seed tags');
    // Continue anyway - tags aren't critical
  }

  // Cleanup stale file locks
  try {
    const expired = cleanupExpiredLocks();
    const stale = cleanupStaleLocks();
    if (expired.cleaned > 0 || stale.cleaned > 0) {
      logger.info(
        { expired: expired.cleaned, stale: stale.cleaned },
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

    // Rate limiting check
    // Extract agentId from args if available for per-agent limiting
    const agentId =
      args && typeof args === 'object' && 'agentId' in args ? String(args.agentId) : undefined;

    const rateLimitResult = checkRateLimits(agentId);
    if (!rateLimitResult.allowed) {
      logger.warn({ tool: name, agentId, reason: rateLimitResult.reason }, 'Rate limit exceeded');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: rateLimitResult.reason,
                retryAfterMs: rateLimitResult.retryAfterMs,
                code: 'RATE_LIMIT_EXCEEDED',
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    logger.debug({ tool: name, args }, 'Tool call');

    const handler = GENERATED_HANDLERS[name];
    if (!handler) {
      logger.error(
        { tool: name, availableTools: Object.keys(GENERATED_HANDLERS) },
        'Handler not found for tool'
      );
      const errorResponse = formatError(
        createInvalidActionError('MCP', name, Object.keys(GENERATED_HANDLERS))
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorResponse, null, 2),
          },
        ],
        isError: true,
      };
    }

    try {
      // Ensure database is available before processing tool calls
      try {
        getDb();
      } catch (dbError) {
        logger.error({ error: dbError }, 'Database not available for tool call');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatError(
                  new Error(
                    'Database not available. Please check database initialization or run memory_init.'
                  )
                ),
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      const result = await handler(args ?? {});
      logger.debug({ tool: name }, 'Tool call successful');

      // Format result based on output mode (compact or JSON)
      let formattedResult: string;
      try {
        formattedResult = formatOutput(result);
      } catch (fmtError) {
        logger.error({ tool: name, error: fmtError }, 'Output formatting error');
        // Fallback to safe JSON serialization
        formattedResult = JSON.stringify(
          {
            error: 'Failed to format result',
            message: fmtError instanceof Error ? fmtError.message : String(fmtError),
            resultType: typeof result,
          },
          null,
          2
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: formattedResult,
          },
        ],
      };
    } catch (error) {
      logger.error(
        {
          tool: name,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Tool call error'
      );
      const errorResponse = formatError(error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorResponse, null, 2),
          },
        ],
        isError: true,
      };
    }
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
    server = await createServer();
    logger.info('Server created successfully');
  } catch (error) {
    logger.fatal(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to create server'
    );
    // Don't exit - try to continue with a minimal server
    // This prevents Antigravity from seeing immediate crash
    logger.warn('Attempting to create minimal server despite errors');
    server = new Server(
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
    // Set up minimal handlers
    server.setRequestHandler(ListToolsRequestSchema, () => {
      return { tools: [] };
    });
    server.setRequestHandler(CallToolRequestSchema, () => {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              formatError(new Error('Server initialization incomplete. Please check logs.')),
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    });
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
