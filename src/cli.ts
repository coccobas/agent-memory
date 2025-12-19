#!/usr/bin/env node
// CLI entry point for agent-memory (MCP/REST)
// This file sets environment variables before any modules are loaded

// CRITICAL: Suppress dotenv output BEFORE loading anything
// Dotenv v17+ outputs to stdout by default, which breaks MCP JSON-RPC protocol
process.env.DOTENV_CONFIG_QUIET = 'true';

import { parseServerMode } from './utils/server-mode.js';

async function importAndRun(modulePath: string): Promise<void> {
  // Avoid static imports so we can build MCP-only, REST-only, or both.
  const mod = (await import(modulePath)) as { runServer?: () => Promise<void> };
  if (typeof mod.runServer !== 'function') {
    throw new Error(`Module ${modulePath} does not export runServer()`);
  }
  await mod.runServer();
}

// Now dynamically import the selected mode
async function main() {
  const argv = process.argv.slice(2);

  // ---------------------------------------------------------------------------
  // Command mode (non-server)
  // ---------------------------------------------------------------------------
  const command = (argv[0] || '').toLowerCase();
  if (command === 'verify-response') {
    const { runVerifyResponseCommand } = await import('./commands/verify-response.js');
    await runVerifyResponseCommand(argv.slice(1));
    return;
  }

  if (command === 'hook') {
    const { runHookCommand } = await import('./commands/hook.js');
    await runHookCommand(argv.slice(1));
    return;
  }

  // Load config first (which loads dotenv)
  await import('./config/index.js');

  const { createComponentLogger } = await import('./utils/logger.js');

  const logger = createComponentLogger('server');
  const mode = parseServerMode(argv, process.env.AGENT_MEMORY_MODE);
  logger.info({ mode }, 'Entry point reached');

  try {
    const mcpModulePath = './mcp/server.js';
    const restModulePath = './restapi/server.js';

    if (mode === 'mcp') {
      await importAndRun(mcpModulePath);
      return;
    }

    if (mode === 'rest') {
      await importAndRun(restModulePath);
      return;
    }

    // both
    await importAndRun(restModulePath);
    await importAndRun(mcpModulePath);
  } catch (error) {
    logger.fatal(
      { error: error instanceof Error ? error.message : String(error) },
      'Server startup failed'
    );
    process.exit(1);
  }
}

void main();
