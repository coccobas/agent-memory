/**
 * Analytics CLI Command
 *
 * Get usage analytics via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { analyticsHandlers } from '../../mcp/handlers/analytics.handler.js';

export function addAnalyticsCommand(program: Command): void {
  const analytics = program.command('analytics').description('Get usage analytics and trends');

  // analytics get-stats
  analytics
    .command('get-stats')
    .description('Get usage statistics')
    .option('--scope-type <type>', 'Scope type')
    .option('--scope-id <id>', 'Scope ID')
    .option('--start-date <date>', 'Start date (ISO format)')
    .option('--end-date <date>', 'End date (ISO format)')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = analyticsHandlers.get_stats(context, {
          scopeType: options.scopeType,
          scopeId: options.scopeId,
          startDate: options.startDate,
          endDate: options.endDate,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // analytics get-trends
  analytics
    .command('get-trends')
    .description('Get usage trends over time')
    .option('--scope-type <type>', 'Scope type')
    .option('--scope-id <id>', 'Scope ID')
    .option('--start-date <date>', 'Start date (ISO format)')
    .option('--end-date <date>', 'End date (ISO format)')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = analyticsHandlers.get_trends(context, {
          scopeType: options.scopeType,
          scopeId: options.scopeId,
          startDate: options.startDate,
          endDate: options.endDate,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // analytics get-subtask-stats
  analytics
    .command('get-subtask-stats')
    .description('Get subtask statistics')
    .option('--project-id <id>', 'Project ID')
    .option('--subtask-type <type>', 'Subtask type filter')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = analyticsHandlers.get_subtask_stats(context, {
          projectId: options.projectId,
          subtaskType: options.subtaskType,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // analytics get-error-correlation
  analytics
    .command('get-error-correlation')
    .description('Get error correlation between agents')
    .requiredOption('--agent-a <id>', 'First agent ID')
    .requiredOption('--agent-b <id>', 'Second agent ID')
    .option('--start-date <date>', 'Start date (ISO format)')
    .option('--end-date <date>', 'End date (ISO format)')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = analyticsHandlers.get_error_correlation(context, {
          agentA: options.agentA,
          agentB: options.agentB,
          timeWindow: options.startDate
            ? { start: options.startDate, end: options.endDate }
            : undefined,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // analytics get-low-diversity
  analytics
    .command('get-low-diversity')
    .description('Get low diversity entries')
    .option('--project-id <id>', 'Project ID')
    .option('--scope-id <id>', 'Scope ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = analyticsHandlers.get_low_diversity(context, {
          projectId: options.projectId,
          scopeId: options.scopeId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}
