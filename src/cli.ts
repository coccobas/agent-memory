#!/usr/bin/env node
// CLI entry point for agent-memory (MCP/REST)
// This file sets environment variables before any modules are loaded

// CRITICAL: Suppress dotenv output BEFORE loading anything
// Dotenv v17+ outputs to stdout by default, which breaks MCP JSON-RPC protocol
process.env.DOTENV_CONFIG_QUIET = 'true';

import { parseServerMode } from './utils/server-mode.js';
import { createValidationError } from './core/errors.js';

async function importAndRun(modulePath: string): Promise<void> {
  // Avoid static imports so we can build MCP-only, REST-only, or both.
  const mod = (await import(modulePath)) as { runServer?: () => Promise<void> };
  if (typeof mod.runServer !== 'function') {
    throw createValidationError('module', `${modulePath} does not export runServer()`);
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

  if (command === 'review') {
    const { runReviewCommand } = await import('./commands/review.js');
    await runReviewCommand(argv.slice(1));
    return;
  }

  if (command === 'reindex') {
    const { runReindexCommand } = await import('./commands/reindex.js');
    await runReindexCommand(argv.slice(1));
    return;
  }

  // Check for Commander.js CLI commands (new unified CLI)
  // These are all subcommand-style commands like: knowledge, guideline, tool, query, etc.
  const cliCommands = [
    'knowledge',
    'guideline',
    'tool',
    'query',
    'org',
    'project',
    'session',
    'tag',
    'relation',
    'permission',
    'file-lock',
    'init',
    'backup',
    'export',
    'import',
    'health',
    'conflict',
    'analytics',
    'consolidate',
    'verify',
    'conversation',
    'observe',
    'task',
    'voting',
    'experience',
    'librarian',
    'key',
    // Note: 'review' and 'hook' are handled by existing legacy commands above
  ];

  if (
    cliCommands.includes(command) ||
    command === '--help' ||
    command === '-h' ||
    command === '--version' ||
    command === '-V'
  ) {
    const { runCli } = await import('./cli/index.js');
    await runCli(argv);
    return;
  }

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
  const { createRuntime, extractRuntimeConfig, shutdownRuntime } =
    await import('./core/runtime.js');
  const { registerRuntime } = await import('./core/container.js');
  const { startBackupScheduler, stopBackupScheduler } =
    await import('./services/backup-scheduler.service.js');

  const logger = createComponentLogger('server');
  const mode = parseServerMode(argv, process.env.AGENT_MEMORY_MODE);
  logger.info({ mode }, 'Entry point reached');

  // Create and register the process-scoped Runtime
  // This is shared across MCP and REST servers in "both" mode
  const runtime = createRuntime(extractRuntimeConfig(config));
  registerRuntime(runtime);

  // Start backup scheduler if configured
  if (config.backup.schedule) {
    startBackupScheduler({
      schedule: config.backup.schedule,
      retentionCount: config.backup.retentionCount,
      enabled: config.backup.enabled,
    });
  }

  // Cleanup on shutdown
  const cleanup = async () => {
    stopBackupScheduler();
    await shutdownRuntime(runtime);
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
    void cleanup();
    process.exit(1);
  }
}

void main();
