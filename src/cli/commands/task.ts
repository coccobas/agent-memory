/**
 * Task CLI Command
 *
 * Manage task decomposition via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { readStdinJson } from '../utils/stdin.js';
import { taskHandlers } from '../../mcp/handlers/tasks.handler.js';

export function addTaskCommand(program: Command): void {
  const task = program.command('task').description('Manage task decomposition');

  // task add
  task
    .command('add')
    .description('Add a task with subtasks (reads subtasks from stdin as JSON array)')
    .option('--parent-task <id>', 'Parent task ID')
    .option('--decomposition-strategy <strategy>', 'Strategy: maximal, balanced, minimal', 'balanced')
    .requiredOption('--scope-type <type>', 'Scope type')
    .option('--scope-id <id>', 'Scope ID')
    .option('--project-id <id>', 'Project ID')
    .option('--created-by <name>', 'Creator name')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const subtasks = await readStdinJson<string[]>();
        if (!subtasks || !Array.isArray(subtasks)) {
          throw new Error('No subtasks provided via stdin. Pipe JSON array of subtask descriptions.');
        }

        const result = await taskHandlers.add(context, {
          parentTask: options.parentTask,
          subtasks,
          decompositionStrategy: options.decompositionStrategy,
          scopeType: options.scopeType,
          scopeId: options.scopeId,
          projectId: options.projectId,
          createdBy: options.createdBy,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // task get
  task
    .command('get')
    .description('Get a task by ID')
    .requiredOption('--id <id>', 'Task ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await taskHandlers.get(context, {
          taskId: options.id,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // task list
  task
    .command('list')
    .description('List tasks')
    .option('--parent-task-id <id>', 'Filter by parent task ID')
    .option('--scope-type <type>', 'Filter by scope type')
    .option('--scope-id <id>', 'Filter by scope ID')
    .option('--limit <n>', 'Maximum entries to return', parseInt)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await taskHandlers.list(context, {
          parentTaskId: options.parentTaskId,
          scopeType: options.scopeType,
          scopeId: options.scopeId,
          limit: options.limit,
          offset: options.offset,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}
