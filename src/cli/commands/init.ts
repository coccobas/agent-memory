/**
 * Init CLI Command
 *
 * Manage database initialization and migrations via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { initHandlers } from '../../mcp/handlers/init.handler.js';

export function addInitCommand(program: Command): void {
  const init = program.command('init').description('Manage database initialization');

  // init init
  init
    .command('init')
    .description('Initialize or migrate the database')
    .option('--force', 'Force re-initialization even if already initialized')
    .option('--verbose', 'Enable verbose output')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        await getCliContext(); // Initialize context for proper shutdown

        const result = initHandlers.init({
          force: options.force,
          verbose: options.verbose,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // init status
  init
    .command('status')
    .description('Check migration status')
    .action(async (_, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        await getCliContext(); // Initialize context for proper shutdown

        const result = initHandlers.status({});

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // init reset
  init
    .command('reset')
    .description('Reset the database (WARNING: deletes all data)')
    .requiredOption('--confirm', 'Confirm database reset')
    .option('--verbose', 'Enable verbose output')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        await getCliContext(); // Initialize context for proper shutdown

        const result = initHandlers.reset({
          confirm: options.confirm,
          verbose: options.verbose,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}
