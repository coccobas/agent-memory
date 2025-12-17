// Main entry point for agent-memory MCP server (library usage)
// For CLI usage, see cli.ts which handles dotenv stdout suppression

// Load configuration first (imports .env)
import './config/index.js';

// Re-export database utilities
export * from './db/index.js';

// Re-export MCP server
export { createServer, runServer } from './mcp/server.js';
