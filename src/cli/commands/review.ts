/**
 * Review CLI Command
 *
 * Review candidate memory entries via CLI.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { reviewHandlers } from '../../mcp/handlers/review.handler.js';
import { typedAction } from '../utils/typed-action.js';

interface ReviewListOptions extends Record<string, unknown> {
  sessionId: string;
}

interface ReviewShowOptions extends Record<string, unknown> {
  sessionId: string;
  entryId: string;
}

interface ReviewApproveOptions extends Record<string, unknown> {
  sessionId: string;
  entryId: string;
  projectId?: string;
}

interface ReviewRejectOptions extends Record<string, unknown> {
  sessionId: string;
  entryId: string;
}

interface ReviewSkipOptions extends Record<string, unknown> {
  sessionId: string;
  entryId: string;
}

export function addReviewCommand(program: Command): void {
  const review = program.command('review').description('Review candidate memory entries');

  // review list
  review
    .command('list')
    .description('List candidates pending review')
    .requiredOption('--session-id <id>', 'Session ID')
    .action(
      typedAction<ReviewListOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await reviewHandlers.list(context, {
            sessionId: options.sessionId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // review show
  review
    .command('show')
    .description('Show full details of a candidate')
    .requiredOption('--session-id <id>', 'Session ID')
    .requiredOption('--entry-id <id>', 'Entry ID or short ID')
    .action(
      typedAction<ReviewShowOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await reviewHandlers.show(context, {
            sessionId: options.sessionId,
            entryId: options.entryId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // review approve
  review
    .command('approve')
    .description('Promote candidate to project scope')
    .requiredOption('--session-id <id>', 'Session ID')
    .requiredOption('--entry-id <id>', 'Entry ID')
    .option('--project-id <id>', 'Target project ID (optional, derived from session)')
    .action(
      typedAction<ReviewApproveOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await reviewHandlers.approve(context, {
            sessionId: options.sessionId,
            entryId: options.entryId,
            projectId: options.projectId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // review reject
  review
    .command('reject')
    .description('Deactivate/reject a candidate')
    .requiredOption('--session-id <id>', 'Session ID')
    .requiredOption('--entry-id <id>', 'Entry ID')
    .action(
      typedAction<ReviewRejectOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await reviewHandlers.reject(context, {
            sessionId: options.sessionId,
            entryId: options.entryId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // review skip
  review
    .command('skip')
    .description('Remove from review queue without action')
    .requiredOption('--session-id <id>', 'Session ID')
    .requiredOption('--entry-id <id>', 'Entry ID')
    .action(
      typedAction<ReviewSkipOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await reviewHandlers.skip(context, {
            sessionId: options.sessionId,
            entryId: options.entryId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );
}
