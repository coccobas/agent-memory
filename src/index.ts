// Main entry point for agent-memory core (library usage)
// Transports (MCP/REST) are exposed via subpath exports.
//
// NOTE: Some MCP clients are configured to run `dist/index.js` directly. When this
// module is executed as a script, we forward to the CLI entrypoint so the MCP
// server actually starts.

// CRITICAL: Suppress dotenv output (stdout breaks MCP JSON-RPC protocol)
process.env.DOTENV_CONFIG_QUIET = 'true';

// Load configuration first (imports .env)
import './config/index.js';

// Re-export core/shared types (avoid name collisions with db exports)
export type { MemoryContextParams, MemoryQueryParams } from './core/types.js';

// Re-export database utilities
export * from './db/index.js';

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const isExecutedDirectly = (() => {
  const argvPath = process.argv[1];
  if (!argvPath) return false;
  try {
    return resolve(argvPath) === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isExecutedDirectly) {
  void import('./cli.js');
}
