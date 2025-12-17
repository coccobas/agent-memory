#!/usr/bin/env node
// CLI entry point for agent-memory MCP server
// This file sets environment variables before any modules are loaded

// CRITICAL: Suppress dotenv output BEFORE loading anything
// Dotenv v17+ outputs to stdout by default, which breaks MCP JSON-RPC protocol
process.env.DOTENV_CONFIG_QUIET = 'true';

// Now dynamically import the main module
async function main() {
  // Load config first (which loads dotenv)
  await import('./config/index.js');

  // Load and run the server
  const { runServer } = await import('./mcp/server.js');
  const { createComponentLogger } = await import('./utils/logger.js');

  const logger = createComponentLogger('server');
  logger.info('Entry point reached');

  try {
    await runServer();
  } catch (error) {
    logger.fatal(
      { error: error instanceof Error ? error.message : String(error) },
      'Server startup failed'
    );
    process.exit(1);
  }
}

void main();
