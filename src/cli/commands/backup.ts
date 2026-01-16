/**
 * Backup CLI Command
 *
 * Manage database backups via CLI.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { backupHandlers } from '../../mcp/handlers/backup.handler.js';
import { typedAction } from '../utils/typed-action.js';

interface BackupCreateOptions extends Record<string, unknown> {
  name?: string;
}

interface BackupListOptions extends Record<string, never> {}

interface BackupCleanupOptions extends Record<string, unknown> {
  keepCount?: number;
}

interface BackupRestoreOptions extends Record<string, unknown> {
  filename: string;
}

export function addBackupCommand(program: Command): void {
  const backup = program.command('backup').description('Manage database backups');

  // backup create
  backup
    .command('create')
    .description('Create a database backup')
    .option('--name <name>', 'Custom backup name')
    .action(
      typedAction<BackupCreateOptions>(async (options, globalOpts) => {
        try {
          await getCliContext(); // Initialize context for proper shutdown

          const result = await backupHandlers.create({
            name: options.name,
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

  // backup list
  backup
    .command('list')
    .description('List available backups')
    .action(
      typedAction<BackupListOptions>(async (_options, globalOpts) => {
        try {
          await getCliContext(); // Initialize context for proper shutdown

          const result = backupHandlers.list({
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

  // backup cleanup
  backup
    .command('cleanup')
    .description('Remove old backups')
    .option('--keep-count <n>', 'Number of backups to keep', parseInt, 5)
    .action(
      typedAction<BackupCleanupOptions>(async (options, globalOpts) => {
        try {
          await getCliContext(); // Initialize context for proper shutdown

          const result = backupHandlers.cleanup({
            keepCount: options.keepCount,
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

  // backup restore
  backup
    .command('restore')
    .description('Restore from a backup')
    .requiredOption('--filename <filename>', 'Backup filename to restore')
    .action(
      typedAction<BackupRestoreOptions>(async (options, globalOpts) => {
        try {
          await getCliContext(); // Initialize context for proper shutdown

          const result = await backupHandlers.restore({
            filename: options.filename,
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
