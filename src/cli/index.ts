/**
 * CLI Main Program
 *
 * Commander.js program setup for agent-memory CLI.
 */

import { Command, Option } from 'commander';

// Import command registration functions
import { addKnowledgeCommand } from './commands/knowledge.js';
import { addGuidelineCommand } from './commands/guideline.js';
import { addToolCommand } from './commands/tool.js';
import { addQueryCommand } from './commands/query.js';
import { addOrgCommand } from './commands/org.js';
import { addProjectCommand } from './commands/project.js';
import { addSessionCommand } from './commands/session.js';
import { addTagCommand } from './commands/tag.js';
import { addRelationCommand } from './commands/relation.js';
import { addPermissionCommand } from './commands/permission.js';
import { addFileLockCommand } from './commands/file-lock.js';
import { addInitCommand } from './commands/init.js';
import { addBackupCommand } from './commands/backup.js';
import { addExportCommand } from './commands/export.js';
import { addImportCommand } from './commands/import.js';
import { addHealthCommand } from './commands/health.js';
import { addConflictCommand } from './commands/conflict.js';
import { addAnalyticsCommand } from './commands/analytics.js';
import { addConsolidateCommand } from './commands/consolidate.js';
import { addVerifyCommand } from './commands/verify.js';
import { addConversationCommand } from './commands/conversation.js';
import { addObserveCommand } from './commands/observe.js';
import { addTaskCommand } from './commands/task.js';
import { addVotingCommand } from './commands/voting.js';
import { addReviewCommand } from './commands/review.js';
import { addHookCommand } from './commands/hook.js';
import { addExperienceCommand } from './commands/experience.js';
import { addLibrarianCommand } from './commands/librarian.js';
import { addForgetCommand } from './commands/forget.js';
import { addRlCommand } from './commands/rl.js';

// Version from package.json
const VERSION = '0.9.15';

/**
 * Create the Commander.js program
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('agent-memory')
    .description('CLI for Agent Memory - structured memory backend for AI agents')
    .version(VERSION)
    .addOption(
      new Option('--format <format>', 'Output format').choices(['json', 'table']).default('json')
    )
    .option('--quiet', 'Suppress non-essential output', false)
    .option('--admin-key <key>', 'Admin key for privileged operations')
    .option('--agent-id <id>', 'Agent ID for operations', 'cli');

  // Register all subcommands
  registerCommands(program);

  return program;
}

/**
 * Register all subcommands
 */
function registerCommands(program: Command): void {
  // Core CRUD commands
  addKnowledgeCommand(program);
  addGuidelineCommand(program);
  addToolCommand(program);
  addQueryCommand(program);

  // Scope management
  addOrgCommand(program);
  addProjectCommand(program);
  addSessionCommand(program);

  // Relationships & metadata
  addTagCommand(program);
  addRelationCommand(program);
  addPermissionCommand(program);
  addFileLockCommand(program);

  // System commands
  addInitCommand(program);
  addBackupCommand(program);
  addExportCommand(program);
  addImportCommand(program);
  addHealthCommand(program);

  // Intelligent features
  addConflictCommand(program);
  addAnalyticsCommand(program);
  addConsolidateCommand(program);
  addVerifyCommand(program);

  // Conversation & extraction
  addConversationCommand(program);
  addObserveCommand(program);
  addTaskCommand(program);
  addVotingCommand(program);
  addReviewCommand(program);
  addHookCommand(program);

  // Experiential Memory
  addExperienceCommand(program);
  addLibrarianCommand(program);

  // Reinforcement Learning
  addRlCommand(program);

  // Memory Lifecycle
  addForgetCommand(program);
}

/**
 * Run the CLI program
 */
export async function runCli(argv: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv, { from: 'user' });
}
