/**
 * File Lock CLI Command
 *
 * Manage file locks for multi-agent coordination via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { fileLockHandlers } from '../../mcp/handlers/file_locks.handler.js';

export function addFileLockCommand(program: Command): void {
  const fileLock = program.command('file-lock').description('Manage file locks for multi-agent coordination');

  // file-lock checkout
  fileLock
    .command('checkout')
    .description('Acquire a lock on a file')
    .requiredOption('--file-path <path>', 'Absolute path to the file')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--expires-in <seconds>', 'Lock timeout in seconds', parseInt)
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await fileLockHandlers.checkout(context, {
          file_path: options.filePath,
          agent_id: globalOpts.agentId,
          session_id: options.sessionId,
          project_id: options.projectId,
          expires_in: options.expiresIn,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // file-lock checkin
  fileLock
    .command('checkin')
    .description('Release a lock on a file')
    .requiredOption('--file-path <path>', 'Absolute path to the file')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await fileLockHandlers.checkin(context, {
          file_path: options.filePath,
          agent_id: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // file-lock status
  fileLock
    .command('status')
    .description('Check lock status of a file')
    .requiredOption('--file-path <path>', 'Absolute path to the file')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await fileLockHandlers.status(context, {
          file_path: options.filePath,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // file-lock list
  fileLock
    .command('list')
    .description('List file locks')
    .option('--project-id <id>', 'Filter by project ID')
    .option('--session-id <id>', 'Filter by session ID')
    .option('--agent-id <id>', 'Filter by agent ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await fileLockHandlers.list(context, {
          project_id: options.projectId,
          session_id: options.sessionId,
          agent_id: options.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // file-lock force-unlock
  fileLock
    .command('force-unlock')
    .description('Force release a lock on a file')
    .requiredOption('--file-path <path>', 'Absolute path to the file')
    .option('--reason <reason>', 'Reason for force unlock')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await fileLockHandlers.forceUnlock(context, {
          file_path: options.filePath,
          agent_id: globalOpts.agentId,
          reason: options.reason,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}
