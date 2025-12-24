/**
 * Org CLI Command
 *
 * Manage organizations via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { scopeHandlers } from '../../mcp/handlers/scopes.handler.js';

export function addOrgCommand(program: Command): void {
  const org = program.command('org').description('Manage organizations');

  // org create
  org
    .command('create')
    .description('Create a new organization')
    .requiredOption('--name <name>', 'Organization name')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await scopeHandlers.orgCreate(context, {
          name: options.name,
          adminKey: globalOpts.adminKey,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // org list
  org
    .command('list')
    .description('List organizations')
    .option('--limit <n>', 'Maximum entries to return', parseInt)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await scopeHandlers.orgList(context, {
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
