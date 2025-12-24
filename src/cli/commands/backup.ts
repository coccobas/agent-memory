/**
 * Backup CLI Command
 *
 * Manage database backups via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { backupHandlers } from '../../mcp/handlers/backup.handler.js';

export function addBackupCommand(program: Command): void {
  const backup = program.command('backup').description('Manage database backups');

  // backup create
  backup
    .command('create')
    .description('Create a database backup')
    .option('--name <name>', 'Custom backup name')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        await getCliContext(); // Initialize context for proper shutdown

        const result = await backupHandlers.create({
          name: options.name,
          admin_key: globalOpts.adminKey,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // backup list
  backup
    .command('list')
    .description('List available backups')
    .action(async (_, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        await getCliContext(); // Initialize context for proper shutdown

        const result = backupHandlers.list({
          admin_key: globalOpts.adminKey,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // backup cleanup
  backup
    .command('cleanup')
    .description('Remove old backups')
    .option('--keep-count <n>', 'Number of backups to keep', parseInt, 5)
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        await getCliContext(); // Initialize context for proper shutdown

        const result = backupHandlers.cleanup({
          keepCount: options.keepCount,
          admin_key: globalOpts.adminKey,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // backup restore
  backup
    .command('restore')
    .description('Restore from a backup')
    .requiredOption('--filename <filename>', 'Backup filename to restore')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        await getCliContext(); // Initialize context for proper shutdown

        const result = await backupHandlers.restore({
          filename: options.filename,
          admin_key: globalOpts.adminKey,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}
