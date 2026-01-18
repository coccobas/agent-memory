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
import { runSessionStartCommand } from './hook/session-start-command.js';
import { runPostToolUseCommand } from './hook/posttooluse-command.js';
import { runSubagentStopCommand } from './hook/subagent-stop-command.js';
import { runNotificationCommand } from './hook/notification-command.js';
import { runPermissionRequestCommand } from './hook/permission-request-command.js';

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
  const connection = await createDatabaseConnection(config);

  // Register with container so getDb() works
  const { registerDatabase } = await import('../core/container.js');
  if (connection.type === 'sqlite') {
    registerDatabase(connection.db, connection.sqlite);
  } else {
    // PostgreSQL mode - register db from adapter, no sqlite handle
    // Cast through unknown since PG and SQLite Drizzle types are structurally different
    const db = connection.adapter.getDb() as unknown as Parameters<typeof registerDatabase>[0];
    registerDatabase(db, undefined);
  }

  // Wire HookAnalyticsService repository for analytics recording
  const { getHookAnalyticsService } = await import('../services/analytics/index.js');
  const { createHookMetricsRepository } = await import('../db/repositories/hook-metrics.js');
  const { getDatabase } = await import('../core/container.js');
  const db = getDatabase();
  const analyticsService = getHookAnalyticsService();
  const hookMetricsRepo = createHookMetricsRepository(db);
  analyticsService.setRepository(hookMetricsRepo);

  // Wire HookLearningService dependencies for experience and knowledge capture
  const { getHookLearningService } = await import('../services/learning/index.js');
  const { createExperienceRepository } = await import('../db/repositories/experiences.js');
  const { createKnowledgeRepository } = await import('../db/repositories/knowledge.js');
  const { getSqlite } = await import('../core/container.js');
  const learningService = getHookLearningService();
  const experienceRepo = createExperienceRepository({ db, sqlite: getSqlite() });
  const knowledgeRepo = createKnowledgeRepository({ db, sqlite: getSqlite() });
  learningService.setDependencies({ experienceRepo, knowledgeRepo });
}

/**
 * Initialize full AppContext for hook subcommands that need services.
 * This is a heavier initialization that sets up the full context including
 * services like Librarian, CaptureService, etc.
 */
async function initializeFullContext(): Promise<void> {
  // Load environment variables
  const { loadEnv } = await import('../config/env.js');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const projectRoot = resolve(__dirname, '../..');
  loadEnv(projectRoot);

  // Build config (needs env vars loaded first)
  const { buildConfig } = await import('../config/index.js');
  const config = buildConfig();

  // Create runtime (provides caches, rate limiters, etc.)
  const { createRuntime, extractRuntimeConfig } = await import('../core/runtime.js');
  const runtime = createRuntime(extractRuntimeConfig(config));

  // Create full app context (this initializes all services)
  const { createAppContext } = await import('../core/factory/index.js');
  const ctx = await createAppContext(config, runtime);

  // Register context with container so getContext() works
  const { registerContext } = await import('../core/container.js');
  registerContext(ctx);

  // Wire HookAnalyticsService repository for analytics recording
  const { getHookAnalyticsService } = await import('../services/analytics/index.js');
  const analyticsService = getHookAnalyticsService();
  if (ctx.repos?.hookMetrics) {
    analyticsService.setRepository(ctx.repos.hookMetrics);
  }

  // Wire HookLearningService dependencies for experience and knowledge capture
  const { getHookLearningService } = await import('../services/learning/index.js');
  const learningService = getHookLearningService();
  if (ctx.repos?.experiences) {
    learningService.setDependencies({
      experienceRepo: ctx.repos.experiences,
      knowledgeRepo: ctx.repos.knowledge,
      librarianService: ctx.services?.librarian,
    });
  }
}

/**
 * Initialize a minimal context for hook subcommands.
 * This creates only the services needed for hooks (Librarian, LatentMemory)
 * without initializing ExtractionService (which has SSRF validation that
 * blocks localhost in production mode).
 */
async function initializeHookContext(): Promise<void> {
  // Load environment variables
  const { loadEnv } = await import('../config/env.js');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const projectRoot = resolve(__dirname, '../..');
  loadEnv(projectRoot);

  // Build config (needs env vars loaded first)
  const { buildConfig } = await import('../config/index.js');
  const config = buildConfig();

  // Create runtime (provides caches, rate limiters, etc.)
  const { createRuntime, extractRuntimeConfig } = await import('../core/runtime.js');
  const runtime = createRuntime(extractRuntimeConfig(config));

  // Create app context with skipExtractionService flag for hooks
  const { createAppContext } = await import('../core/factory/index.js');
  const ctx = await createAppContext(config, runtime, { skipExtractionService: true });

  // Register context with container so getContext() works
  const { registerContext } = await import('../core/container.js');
  registerContext(ctx);

  // Wire HookAnalyticsService repository for analytics recording
  const { getHookAnalyticsService } = await import('../services/analytics/index.js');
  const analyticsService = getHookAnalyticsService();
  if (ctx.repos?.hookMetrics) {
    analyticsService.setRepository(ctx.repos.hookMetrics);
  }

  // Wire HookLearningService dependencies for experience and knowledge capture
  const { getHookLearningService } = await import('../services/learning/index.js');
  const learningService = getHookLearningService();
  if (ctx.repos?.experiences) {
    learningService.setDependencies({
      experienceRepo: ctx.repos.experiences,
      knowledgeRepo: ctx.repos.knowledge,
      librarianService: ctx.services?.librarian,
    });
  }
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
  agent-memory hook <subcommand> [--project-id <id>] [--agent-id <id>]

Subcommands (executed by Claude Code hooks, expect JSON on stdin):
  pretooluse         Before tool execution
  posttooluse        After tool execution (with result)
  stop               When execution is stopped
  userpromptsubmit   When user submits a prompt
  session-start      When session starts
  session-end        When session ends
  subagent-stop      When a subagent finishes
  notification       When Claude sends a notification
  permission-request When tool requests permission

Notes:
  - install/status/uninstall write files in the target project directory.
  - Hook subcommands are executed by Claude Code and expect JSON on stdin.
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
      // Install needs database for generating critical guidelines (Cursor)
      // Status and uninstall don't need database
      if (first === 'install') {
        await initializeHookDatabase();
      }

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

    const validSubcommands = [
      'pretooluse',
      'posttooluse',
      'post-tool-use',
      'stop',
      'userpromptsubmit',
      'user-prompt-submit',
      'session-start',
      'sessionstart',
      'session-end',
      'sessionend',
      'subagent-stop',
      'subagentstop',
      'notification',
      'permission-request',
      'permissionrequest',
    ];

    if (!validSubcommands.includes(sub)) {
      logger.warn({ subcommand }, 'Unknown hook subcommand');
      writeStderr(`Unknown hook subcommand: ${subcommand}`);
      process.exit(2);
    }

    // Session hooks need different levels of context:
    // - session-start: minimal context (skip ExtractionService to avoid SSRF validation)
    // - session-end: full context (needs ExtractionService for maintenance/extraction)
    // Other subcommands only need database
    if (sub === 'session-start' || sub === 'sessionstart') {
      await initializeHookContext();
    } else if (sub === 'session-end' || sub === 'sessionend') {
      await initializeFullContext();
    } else {
      await initializeHookDatabase();
    }

    const input = await readHookInputFromStdin();

    if (sub === 'pretooluse') {
      const result = await runPreToolUseCommand({ projectId, agentId, input });
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

    if (sub === 'session-start' || sub === 'sessionstart') {
      const result = await runSessionStartCommand({ projectId, agentId, input });
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

    if (sub === 'posttooluse' || sub === 'post-tool-use') {
      const result = await runPostToolUseCommand({ projectId, agentId, input });
      for (const line of result.stdout) writeStdout(line);
      for (const line of result.stderr) writeStderr(line);
      process.exit(result.exitCode);
    }

    if (sub === 'subagent-stop' || sub === 'subagentstop') {
      const result = await runSubagentStopCommand({ projectId, agentId, input });
      for (const line of result.stdout) writeStdout(line);
      for (const line of result.stderr) writeStderr(line);
      process.exit(result.exitCode);
    }

    if (sub === 'notification') {
      const result = await runNotificationCommand({ projectId, agentId, input });
      for (const line of result.stdout) writeStdout(line);
      for (const line of result.stderr) writeStderr(line);
      process.exit(result.exitCode);
    }

    if (sub === 'permission-request' || sub === 'permissionrequest') {
      const result = await runPermissionRequestCommand({ projectId, agentId, input });
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
