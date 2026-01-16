/**
 * Hook CLI Command
 *
 * Generate and manage IDE verification hooks via CLI.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { hooksHandlers } from '../../mcp/handlers/hooks.handler.js';
import { typedAction } from '../utils/typed-action.js';

interface HookGenerateOptions extends Record<string, unknown> {
  ide: string;
  projectPath: string;
  projectId?: string;
  sessionId?: string;
}

interface HookInstallOptions extends Record<string, unknown> {
  ide: string;
  projectPath: string;
  projectId?: string;
  sessionId?: string;
}

interface HookStatusOptions extends Record<string, unknown> {
  ide: string;
  projectPath: string;
}

interface HookUninstallOptions extends Record<string, unknown> {
  ide: string;
  projectPath: string;
}

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
    .action(
      typedAction<HookGenerateOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = hooksHandlers.generate(context, {
            ide: options.ide,
            projectPath: options.projectPath,
            projectId: options.projectId,
            sessionId: options.sessionId,
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

  // hook install
  hook
    .command('install')
    .description('Generate and install hooks to the filesystem')
    .requiredOption('--ide <ide>', 'Target IDE: claude, cursor, vscode')
    .requiredOption('--project-path <path>', 'Absolute path to the project directory')
    .option('--project-id <id>', 'Project ID for loading guidelines')
    .option('--session-id <id>', 'Session ID')
    .action(
      typedAction<HookInstallOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = hooksHandlers.install(context, {
            ide: options.ide,
            projectPath: options.projectPath,
            projectId: options.projectId,
            sessionId: options.sessionId,
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

  // hook status
  hook
    .command('status')
    .description('Check if hooks are installed for a project')
    .requiredOption('--ide <ide>', 'Target IDE: claude, cursor, vscode')
    .requiredOption('--project-path <path>', 'Absolute path to the project directory')
    .action(
      typedAction<HookStatusOptions>(async (options, globalOpts) => {
        try {
          await getCliContext(); // Initialize context for proper shutdown

          const result = hooksHandlers.status({
            ide: options.ide,
            projectPath: options.projectPath,
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

  // hook uninstall
  hook
    .command('uninstall')
    .description('Remove installed hooks')
    .requiredOption('--ide <ide>', 'Target IDE: claude, cursor, vscode')
    .requiredOption('--project-path <path>', 'Absolute path to the project directory')
    .action(
      typedAction<HookUninstallOptions>(async (options, globalOpts) => {
        try {
          await getCliContext(); // Initialize context for proper shutdown

          const result = hooksHandlers.uninstall({
            ide: options.ide,
            projectPath: options.projectPath,
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
