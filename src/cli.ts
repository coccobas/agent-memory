#!/usr/bin/env node
// CLI entry point for agent-memory (MCP server)
// This file sets environment variables before any modules are loaded

// CRITICAL: Suppress dotenv output BEFORE loading anything
// Dotenv v17+ outputs to stdout by default, which breaks MCP JSON-RPC protocol
process.env.DOTENV_CONFIG_QUIET = 'true';

import { parseServerMode } from './utils/server-mode.js';
import { createValidationError } from './core/errors.js';

async function importAndRun(modulePath: string, runtime: unknown): Promise<void> {
  // Avoid static imports so we can build MCP-only, REST-only, or both.
  const mod = (await import(modulePath)) as {
    runServer?: (options?: { runtime?: unknown; manageProcess?: boolean }) => Promise<void>;
  };
  if (typeof mod.runServer !== 'function') {
    throw createValidationError('module', `${modulePath} does not export runServer()`);
  }
  await mod.runServer({ runtime, manageProcess: false });
}

// Now dynamically import the selected mode
async function main() {
  const argv = process.argv.slice(2);

  // Check for --help/--version
  const command = (argv[0] || '').toLowerCase();
  if (command === '--help' || command === '-h') {
    console.log('agent-memory — structured memory backend for AI agents');
    console.log('');
    console.log('Usage: agent-memory [--mode mcp|rest|both]');
    console.log('');
    console.log('Options:');
    console.log('  --mode <mode>  Server mode: mcp (default), rest, both');
    console.log('  --help, -h     Show this help');
    console.log('  --version, -V  Show version');
    return;
  }

  if (command === '--version' || command === '-V') {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')) as {
      version: string;
    };
    console.log(pkg.version);
    return;
  }

  // ---------------------------------------------------------------------------
  // Hook command (lightweight, no server startup)
  // ---------------------------------------------------------------------------
  if (command === 'hook') {
    const hookEvent = argv[1] ?? '';
    // Read stdin for hook payload
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const stdinJson = Buffer.concat(chunks).toString('utf-8');

    try {
      const { loadEnv: loadEnvHook } = await import('./config/env.js');
      const pathHook = await import('node:path');
      const { fileURLToPath: fileURLToPathHook } = await import('node:url');
      const __filenameHook = fileURLToPathHook(import.meta.url);
      const __dirnameHook = pathHook.dirname(__filenameHook);
      loadEnvHook(pathHook.resolve(__dirnameHook, '..'));

      const { config: hookConfig } = await import('./config/index.js');
      const { createAppContext } = await import('./core/factory.js');
      const context = await createAppContext(hookConfig);

      if (!context.sqlite) {
        process.stderr.write('[agent-memory hook] No SQLite backend available\n');
        return;
      }

      const { runHookCommand } = await import('./v2/hooks/cli.js');
      const { createSqliteMemoryV2Runtime } = await import('./v2/adapters/sqlite/factory.js');

      const v2Runtime = createSqliteMemoryV2Runtime({ sqlite: context.sqlite });
      await runHookCommand(hookEvent, stdinJson, {
        sqlite: context.sqlite,
        runtime: v2Runtime,
      });
    } catch (error) {
      // Hooks must never crash Claude Code
      process.stderr.write(
        `[agent-memory hook] ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Server mode
  // ---------------------------------------------------------------------------

  // Load environment variables explicitly
  const { loadEnv } = await import('./config/env.js');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, '..');

  loadEnv(projectRoot);

  // Load config
  const { config } = await import('./config/index.js');

  const { createComponentLogger } = await import('./utils/logger.js');
  const { ensureRuntime, shutdownOwnedRuntime } = await import('./core/runtime-owner.js');

  const logger = createComponentLogger('server');
  const mode = parseServerMode(argv, process.env.AGENT_MEMORY_MODE);
  logger.info({ mode }, 'Entry point reached');

  // Create and register the process-scoped Runtime
  const { runtime, ownsRuntime } = ensureRuntime(config);

  // Cleanup on shutdown
  const cleanup = async () => {
    await shutdownOwnedRuntime(ownsRuntime, runtime);
    process.exit(0);
  };

  // Signal handlers
  process.on('SIGTERM', () => void cleanup());
  process.on('SIGINT', () => void cleanup());

  // Process error handlers
  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception in CLI');
    void cleanup().then(() => {
      process.exit(1);
    });
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection in CLI');
    void cleanup().then(() => {
      process.exit(1);
    });
  });

  try {
    const mcpModulePath = './mcp/server.js';

    if (mode === 'mcp') {
      await importAndRun(mcpModulePath, runtime);
      return;
    }

    const restModulePath = './restapi/server.js';

    if (mode === 'rest') {
      await importAndRun(restModulePath, runtime);
      return;
    }

    // mode === 'both'
    await Promise.all([
      importAndRun(mcpModulePath, runtime),
      importAndRun(restModulePath, runtime),
    ]);
  } catch (error) {
    logger.fatal(
      { error: error instanceof Error ? error.message : String(error) },
      'Server startup failed'
    );
    void cleanup();
    process.exit(1);
  }
}

void main();
