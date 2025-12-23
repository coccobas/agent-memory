/**
 * hook command
 *
 * Subcommands for running Claude Code hook logic in a deterministic way.
 *
 * Usage:
 *   agent-memory hook install [options]
 *   agent-memory hook status [options]
 *   agent-memory hook uninstall [options]
 *   agent-memory hook pretooluse --project-id <id>
 *   agent-memory hook stop --project-id <id>
 *   agent-memory hook userpromptsubmit --project-id <id>
 *   agent-memory hook session-end --project-id <id>
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createComponentLogger } from '../utils/logger.js';
import { runHookInstallCommand } from './hook/install-command.js';
import { HookCliError } from './hook/cli-error.js';
import { parseHookArgs } from './hook/parse-hook-args.js';
import { readHookInputFromStdin } from './hook/read-stdin-json.js';
import { runPreToolUseCommand } from './hook/pretooluse-command.js';
import { runStopCommand } from './hook/stop-command.js';
import { runUserPromptSubmitCommand } from './hook/userpromptsubmit-command.js';
import { runSessionEndCommand } from './hook/session-end-command.js';

export { writeSessionSummaryFile, formatSessionSummaryStderr } from './hook/session-summary.js';

/**
 * Initialize database for hook subcommands that require DB access.
 * This is a lightweight initialization that only sets up the database connection,
 * without the full runtime/services needed by the MCP/REST servers.
 */
async function initializeHookDatabase(): Promise<void> {
  // Load environment variables
  const { loadEnv } = await import('../config/env.js');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const projectRoot = resolve(__dirname, '../..');
  loadEnv(projectRoot);

  // Build config (needs env vars loaded first)
  const { buildConfig } = await import('../config/index.js');
  const config = buildConfig();

  // Create database connection
  const { createDatabaseConnection } = await import('../db/factory.js');
  const { db, sqlite } = await createDatabaseConnection(config);

  // Register with container so getDb() works
  const { registerDatabase } = await import('../core/container.js');
  registerDatabase(db, sqlite);
}

const logger = createComponentLogger('hook');

function writeStdout(message: string): void {
  process.stdout.write(message.endsWith('\n') ? message : `${message}\n`);
}

function writeStderr(message: string): void {
  process.stderr.write(message.endsWith('\n') ? message : `${message}\n`);
}

function printHookHelp(): void {
  writeStdout(`Usage:
  agent-memory hook install [--ide <claude|cursor|vscode>] [--project-path <path>] [--project-id <id>] [--session-id <id>] [--dry-run] [--quiet]
  agent-memory hook status [--ide <claude|cursor|vscode>] [--project-path <path>] [--quiet]
  agent-memory hook uninstall [--ide <claude|cursor|vscode>] [--project-path <path>] [--dry-run] [--quiet]
  agent-memory hook <pretooluse|stop|userpromptsubmit|session-end> [--project-id <id>] [--agent-id <id>]

Notes:
  - install/status/uninstall write files in the target project directory.
  - pretooluse/stop/userpromptsubmit/session-end are executed by Claude Code hooks and expect JSON on stdin.
`);
}

export async function runHookCommand(argv: string[]): Promise<void> {
  try {
    const first = (argv[0] || '').toLowerCase();
    if (!first || first === '--help' || first === '-h') {
      printHookHelp();
      process.exit(0);
    }

    if (first === 'install' || first === 'status' || first === 'uninstall') {
      const result = runHookInstallCommand(argv, {
        helpText: `Usage:
  agent-memory hook install [--ide <claude|cursor|vscode>] [--project-path <path>] [--project-id <id>] [--session-id <id>] [--dry-run] [--quiet]
  agent-memory hook status [--ide <claude|cursor|vscode>] [--project-path <path>] [--quiet]
  agent-memory hook uninstall [--ide <claude|cursor|vscode>] [--project-path <path>] [--dry-run] [--quiet]
`,
      });

      for (const line of result.stdout) writeStdout(line);
      for (const line of result.stderr) writeStderr(line);
      process.exit(result.exitCode);
    }

    const { subcommand, projectId, agentId } = parseHookArgs(argv);
    const sub = (subcommand || '').toLowerCase();

    if (
      sub !== 'pretooluse' &&
      sub !== 'stop' &&
      sub !== 'userpromptsubmit' &&
      sub !== 'user-prompt-submit' &&
      sub !== 'session-end' &&
      sub !== 'sessionend'
    ) {
      logger.warn({ subcommand }, 'Unknown hook subcommand');
      writeStderr(`Unknown hook subcommand: ${subcommand}`);
      process.exit(2);
    }

    // Initialize database for all DB-requiring subcommands
    await initializeHookDatabase();

    const input = await readHookInputFromStdin();

    if (sub === 'pretooluse') {
      const result = runPreToolUseCommand({ projectId, agentId, input });
      for (const line of result.stdout) writeStdout(line);
      for (const line of result.stderr) writeStderr(line);
      process.exit(result.exitCode);
    }

    if (sub === 'stop') {
      const result = await runStopCommand({ projectId, agentId, input });
      for (const line of result.stdout) writeStdout(line);
      for (const line of result.stderr) writeStderr(line);
      process.exit(result.exitCode);
    }

    if (sub === 'userpromptsubmit' || sub === 'user-prompt-submit') {
      const result = await runUserPromptSubmitCommand({ projectId, input });
      for (const line of result.stdout) writeStdout(line);
      for (const line of result.stderr) writeStderr(line);
      process.exit(result.exitCode);
    }

    if (sub === 'session-end' || sub === 'sessionend') {
      const result = await runSessionEndCommand({ projectId, agentId, input });
      for (const line of result.stdout) writeStdout(line);
      for (const line of result.stderr) writeStderr(line);
      process.exit(result.exitCode);
    }

    process.exit(2);
  } catch (err) {
    if (err instanceof HookCliError) {
      writeStderr(err.message);
      process.exit(err.exitCode);
    }
    throw err;
  }
}
