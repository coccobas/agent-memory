// Main entry point for agent-memory MCP server

export * from './db/index.js';
// Re-export MCP server
export { createServer, runServer } from './mcp/server.js';

// CLI entry point
import { runServer } from './mcp/server.js';
import { createComponentLogger } from './utils/logger.js';

const logger = createComponentLogger('server');

// Run server if this is the main module
const isMainModule =
  process.argv[1]?.endsWith('index.js') ||
  process.argv[1]?.endsWith('index.ts') ||
  process.argv[1]?.includes('agent-memory');

if (isMainModule) {
  runServer().catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to start server'
    );
    process.exit(1);
  });
}
