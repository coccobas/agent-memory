/**
 * Librarian CLI Command
 *
 * Manage the Librarian Agent for pattern detection and promotion recommendations.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { librarianHandlers } from '../../mcp/handlers/librarian.handler.js';
import { typedAction } from '../utils/typed-action.js';

interface LibrarianAnalyzeOptions extends Record<string, unknown> {
  scopeType?: string;
  scopeId?: string;
  lookbackDays?: number;
  dryRun?: boolean;
}

interface LibrarianStatusOptions extends Record<string, unknown> {
  // No options needed
}

interface LibrarianRecommendationsOptions extends Record<string, unknown> {
  status?: string;
  scopeType?: string;
  scopeId?: string;
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

interface LibrarianShowOptions extends Record<string, unknown> {
  id: string;
}

interface LibrarianApproveOptions extends Record<string, unknown> {
  id: string;
  notes?: string;
}

interface LibrarianRejectOptions extends Record<string, unknown> {
  id: string;
  notes?: string;
}

interface LibrarianSkipOptions extends Record<string, unknown> {
  id: string;
  notes?: string;
}

export function addLibrarianCommand(program: Command): void {
  const librarian = program
    .command('librarian')
    .description('Librarian Agent for pattern detection and recommendations');

  // librarian analyze
  librarian
    .command('analyze')
    .description('Run pattern detection analysis on experiences')
    .option('--scope-type <type>', 'Scope type (global, org, project, session)', 'project')
    .option('--scope-id <id>', 'Scope ID')
    .option('--lookback-days <n>', 'Days to look back for experiences', (v) => parseInt(v, 10))
    .option('--dry-run', 'Analyze without creating recommendations')
    .action(
      typedAction<LibrarianAnalyzeOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await librarianHandlers.analyze(context, {
            scopeType: options.scopeType,
            scopeId: options.scopeId,
            lookbackDays: options.lookbackDays,
            dryRun: options.dryRun,
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

  // librarian status
  librarian
    .command('status')
    .description('Get librarian service and scheduler status')
    .action(
      typedAction<LibrarianStatusOptions>(async (_options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await librarianHandlers.status(context, {});

          // eslint-disable-next-line no-console
          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // librarian recommendations
  librarian
    .command('recommendations')
    .description('List pending promotion recommendations')
    .option(
      '--status <status>',
      'Filter by status (pending, approved, rejected, skipped, expired)',
      'pending'
    )
    .option('--scope-type <type>', 'Scope type')
    .option('--scope-id <id>', 'Scope ID')
    .option('--min-confidence <n>', 'Filter by minimum confidence', (v) => parseFloat(v))
    .option('--limit <n>', 'Maximum results', (v) => parseInt(v, 10))
    .option('--offset <n>', 'Skip N results', (v) => parseInt(v, 10))
    .action(
      typedAction<LibrarianRecommendationsOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await librarianHandlers.list_recommendations(context, {
            status: options.status,
            scopeType: options.scopeType,
            scopeId: options.scopeId,
            minConfidence: options.minConfidence,
            limit: options.limit,
            offset: options.offset,
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

  // librarian show
  librarian
    .command('show')
    .description('Show details of a specific recommendation')
    .requiredOption('--id <id>', 'Recommendation ID')
    .action(
      typedAction<LibrarianShowOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await librarianHandlers.show_recommendation(context, {
            recommendationId: options.id,
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

  // librarian approve
  librarian
    .command('approve')
    .description('Approve a recommendation and create the promotion')
    .requiredOption('--id <id>', 'Recommendation ID')
    .option('--notes <notes>', 'Review notes')
    .action(
      typedAction<LibrarianApproveOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await librarianHandlers.approve(context, {
            recommendationId: options.id,
            reviewedBy: globalOpts.agentId,
            notes: options.notes,
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

  // librarian reject
  librarian
    .command('reject')
    .description('Reject a recommendation')
    .requiredOption('--id <id>', 'Recommendation ID')
    .option('--notes <notes>', 'Review notes')
    .action(
      typedAction<LibrarianRejectOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await librarianHandlers.reject(context, {
            recommendationId: options.id,
            reviewedBy: globalOpts.agentId,
            notes: options.notes,
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

  // librarian skip
  librarian
    .command('skip')
    .description('Skip a recommendation for now')
    .requiredOption('--id <id>', 'Recommendation ID')
    .option('--notes <notes>', 'Review notes')
    .action(
      typedAction<LibrarianSkipOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await librarianHandlers.skip(context, {
            recommendationId: options.id,
            reviewedBy: globalOpts.agentId,
            notes: options.notes,
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
