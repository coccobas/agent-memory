/**
 * Init CLI Command
 *
 * Manage database initialization and migrations via CLI.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { initHandlers } from '../../mcp/handlers/init.handler.js';
import { typedAction } from '../utils/typed-action.js';

interface InitInitOptions extends Record<string, unknown> {
  force?: boolean;
  verbose?: boolean;
}

interface InitStatusOptions extends Record<string, never> {}

interface InitResetOptions extends Record<string, unknown> {
  confirm: boolean;
  verbose?: boolean;
}

export function addInitCommand(program: Command): void {
  const init = program.command('init').description('Manage database initialization');

  // init init
  init
    .command('init')
    .description('Initialize or migrate the database')
    .option('--force', 'Force re-initialization even if already initialized')
    .option('--verbose', 'Enable verbose output')
    .action(
      typedAction<InitInitOptions>(async (options, globalOpts) => {
        try {
          await getCliContext(); // Initialize context for proper shutdown

          const result = initHandlers.init({
            force: options.force,
            verbose: options.verbose,
            admin_key: globalOpts.adminKey,
          });

          // eslint-disable-next-line no-console
          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // init status
  init
    .command('status')
    .description('Check migration status')
    .action(
      typedAction<InitStatusOptions>(async (_options, globalOpts) => {
        try {
          await getCliContext(); // Initialize context for proper shutdown

          const result = initHandlers.status({});

          // eslint-disable-next-line no-console
          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // init reset
  init
    .command('reset')
    .description('Reset the database (WARNING: deletes all data)')
    .requiredOption('--confirm', 'Confirm database reset')
    .option('--verbose', 'Enable verbose output')
    .action(
      typedAction<InitResetOptions>(async (options, globalOpts) => {
        try {
          await getCliContext(); // Initialize context for proper shutdown

          const result = initHandlers.reset({
            confirm: options.confirm,
            verbose: options.verbose,
            admin_key: globalOpts.adminKey,
          });

          // eslint-disable-next-line no-console
          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );
}
