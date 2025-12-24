/**
 * Session CLI Command
 *
 * Manage sessions via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { scopeHandlers } from '../../mcp/handlers/scopes.handler.js';

export function addSessionCommand(program: Command): void {
  const session = program.command('session').description('Manage working sessions');

  // session start
  session
    .command('start')
    .description('Start a new session')
    .option('--project-id <id>', 'Parent project ID')
    .option('--name <name>', 'Session name')
    .option('--purpose <text>', 'Session purpose')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await scopeHandlers.sessionStart(context, {
          projectId: options.projectId,
          name: options.name,
          purpose: options.purpose,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // session list
  session
    .command('list')
    .description('List sessions')
    .option('--project-id <id>', 'Filter by project ID')
    .option('--status <status>', 'Filter by status: active, paused, completed, discarded')
    .option('--limit <n>', 'Maximum entries to return', parseInt)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await scopeHandlers.sessionList(context, {
          projectId: options.projectId,
          status: options.status,
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

  // session end
  session
    .command('end')
    .description('End a session')
    .requiredOption('--id <id>', 'Session ID')
    .option('--status <status>', 'End status: completed, discarded', 'completed')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await scopeHandlers.sessionEnd(context, {
          id: options.id,
          status: options.status,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}
