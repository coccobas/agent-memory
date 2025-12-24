/**
 * Hook CLI Command
 *
 * Generate and manage IDE verification hooks via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { hooksHandlers } from '../../mcp/handlers/hooks.handler.js';

export function addHookCommand(program: Command): void {
  const hook = program.command('hook').description('Manage IDE verification hooks');

  // hook generate
  hook
    .command('generate')
    .description('Generate hook files without installing')
    .requiredOption('--ide <ide>', 'Target IDE: claude, cursor, vscode')
    .requiredOption('--project-path <path>', 'Absolute path to the project directory')
    .option('--project-id <id>', 'Project ID for loading guidelines')
    .option('--session-id <id>', 'Session ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = hooksHandlers.generate(context, {
          ide: options.ide,
          projectPath: options.projectPath,
          projectId: options.projectId,
          sessionId: options.sessionId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // hook install
  hook
    .command('install')
    .description('Generate and install hooks to the filesystem')
    .requiredOption('--ide <ide>', 'Target IDE: claude, cursor, vscode')
    .requiredOption('--project-path <path>', 'Absolute path to the project directory')
    .option('--project-id <id>', 'Project ID for loading guidelines')
    .option('--session-id <id>', 'Session ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = hooksHandlers.install(context, {
          ide: options.ide,
          projectPath: options.projectPath,
          projectId: options.projectId,
          sessionId: options.sessionId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // hook status
  hook
    .command('status')
    .description('Check if hooks are installed for a project')
    .requiredOption('--ide <ide>', 'Target IDE: claude, cursor, vscode')
    .requiredOption('--project-path <path>', 'Absolute path to the project directory')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        await getCliContext(); // Initialize context for proper shutdown

        const result = hooksHandlers.status({
          ide: options.ide,
          projectPath: options.projectPath,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // hook uninstall
  hook
    .command('uninstall')
    .description('Remove installed hooks')
    .requiredOption('--ide <ide>', 'Target IDE: claude, cursor, vscode')
    .requiredOption('--project-path <path>', 'Absolute path to the project directory')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        await getCliContext(); // Initialize context for proper shutdown

        const result = hooksHandlers.uninstall({
          ide: options.ide,
          projectPath: options.projectPath,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}
