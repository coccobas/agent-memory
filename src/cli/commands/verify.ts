/**
 * Verify CLI Command
 *
 * Verify actions against guidelines via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { readStdin } from '../utils/stdin.js';
import { verificationHandlers } from '../../mcp/handlers/verification.handler.js';

export function addVerifyCommand(program: Command): void {
  const verify = program.command('verify').description('Verify actions against guidelines');

  // verify pre-check
  verify
    .command('pre-check')
    .description('Check an action before execution')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--action-type <type>', 'Action type: file_write, code_generate, api_call, command, other')
    .option('--description <text>', 'Action description')
    .option('--file-path <path>', 'File path (if applicable)')
    .option('--content <text>', 'Content being created/modified (or provide via stdin)')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        // Get content from option or stdin
        let content = options.content;
        if (!content) {
          content = await readStdin();
        }

        const result = verificationHandlers.preCheck(context, {
          sessionId: options.sessionId,
          projectId: options.projectId,
          proposedAction: {
            type: options.actionType || 'other',
            description: options.description,
            filePath: options.filePath,
            content,
          },
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // verify post-check
  verify
    .command('post-check')
    .description('Log a completed action for compliance tracking')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--content <text>', 'Response content to verify (or provide via stdin)')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        // Get content from option or stdin
        let content = options.content;
        if (!content) {
          content = await readStdin();
        }

        const result = verificationHandlers.postCheck(context, {
          sessionId: options.sessionId,
          projectId: options.projectId,
          content,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // verify acknowledge
  verify
    .command('acknowledge')
    .description('Acknowledge critical guidelines for a session')
    .requiredOption('--session-id <id>', 'Session ID')
    .requiredOption('--guideline-ids <ids>', 'Guideline IDs to acknowledge (comma-separated)')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const guidelineIds = options.guidelineIds.split(',').map((id: string) => id.trim());

        const result = verificationHandlers.acknowledge(context, {
          sessionId: options.sessionId,
          guidelineIds,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // verify status
  verify
    .command('status')
    .description('Get verification status for a session')
    .requiredOption('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = verificationHandlers.status(context, {
          sessionId: options.sessionId,
          projectId: options.projectId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}
