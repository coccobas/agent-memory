/**
 * Conflict CLI Command
 *
 * Manage version conflicts via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { conflictHandlers } from '../../mcp/handlers/conflicts.handler.js';

export function addConflictCommand(program: Command): void {
  const conflict = program.command('conflict').description('Manage version conflicts');

  // conflict list
  conflict
    .command('list')
    .description('List version conflicts')
    .option('--entry-type <type>', 'Filter by entry type: tool, guideline, knowledge')
    .option('--resolved', 'Include resolved conflicts')
    .option('--limit <n>', 'Maximum entries to return', parseInt)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await conflictHandlers.list(context, {
          entryType: options.entryType,
          resolved: options.resolved,
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

  // conflict resolve
  conflict
    .command('resolve')
    .description('Resolve a version conflict')
    .requiredOption('--id <id>', 'Conflict ID')
    .requiredOption('--resolution <text>', 'Resolution description')
    .option('--resolved-by <name>', 'Who resolved it')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await conflictHandlers.resolve(context, {
          id: options.id,
          resolution: options.resolution,
          resolvedBy: options.resolvedBy,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}
