// Main entry point for agent-memory MCP server

export * from './db/index.js';
// Re-export MCP server
export { createServer, runServer } from './mcp/server.js';

// CLI entry point
import { runServer } from './mcp/server.js';
import { createComponentLogger } from './utils/logger.js';
import { isMainModule } from './utils/runtime.js';

const logger = createComponentLogger('server');

if (isMainModule()) {
  logger.info('Entry point reached');
  logger.debug({ script: process.argv[1], args: process.argv.slice(2) }, 'Runtime arguments');

  runServer().catch((error) => {
    logger.fatal(
      { error: error instanceof Error ? error.message : String(error) },
      'Server startup failed'
    );
    process.exit(1);
  });
}
