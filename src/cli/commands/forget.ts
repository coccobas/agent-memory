/**
 * Forget CLI Command
 *
 * Memory forgetting and decay management.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { forgettingHandlers } from '../../mcp/handlers/forgetting.handler.js';
import { typedAction } from '../utils/typed-action.js';

interface ForgetAnalyzeOptions extends Record<string, unknown> {
  scopeType?: string;
  scopeId?: string;
  entryTypes?: string;
  strategy?: string;
  staleDays?: string;
  minAccess?: string;
  importanceThreshold?: string;
  limit?: string;
}

interface ForgetRunOptions extends Record<string, unknown> {
  scopeType?: string;
  scopeId?: string;
  entryTypes?: string;
  strategy?: string;
  staleDays?: string;
  minAccess?: string;
  importanceThreshold?: string;
  limit?: string;
  dryRun?: boolean;
  execute?: boolean;
  agentId?: string;
}

interface ForgetStatusOptions extends Record<string, unknown> {
  // No options needed
}

export function addForgetCommand(program: Command): void {
  const forget = program.command('forget').description('Manage memory forgetting and decay');

  // forget analyze
  forget
    .command('analyze')
    .description('Identify candidates for forgetting (dry run)')
    .option('--scope-type <type>', 'Scope type', 'project')
    .option('--scope-id <id>', 'Scope ID')
    .option(
      '--entry-types <types>',
      'Entry types (comma-separated)',
      'tool,guideline,knowledge,experience'
    )
    .option('--strategy <strategy>', 'Forgetting strategy', 'combined')
    .option('--stale-days <days>', 'Days since last access for recency', '90')
    .option('--min-access <count>', 'Minimum access count for frequency', '2')
    .option('--importance-threshold <value>', 'Importance score threshold', '0.4')
    .option('--limit <n>', 'Maximum entries to process', '100')
    .action(
      typedAction<ForgetAnalyzeOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await forgettingHandlers.analyze(context, {
            action: 'analyze',
            scopeType: (options.scopeType ?? 'project') as 'global' | 'org' | 'project' | 'session',
            scopeId: options.scopeId,
            entryTypes: options.entryTypes?.split(','),
            strategy: options.strategy,
            staleDays: parseInt(options.staleDays ?? '90', 10),
            minAccessCount: parseInt(options.minAccess ?? '2', 10),
            importanceThreshold: parseFloat(options.importanceThreshold ?? '0.4'),
            limit: parseInt(options.limit ?? '100', 10),
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

  // forget run
  forget
    .command('run')
    .description('Execute forgetting on candidates')
    .option('--scope-type <type>', 'Scope type', 'project')
    .option('--scope-id <id>', 'Scope ID')
    .option(
      '--entry-types <types>',
      'Entry types (comma-separated)',
      'tool,guideline,knowledge,experience'
    )
    .option('--strategy <strategy>', 'Forgetting strategy', 'combined')
    .option('--stale-days <days>', 'Days since last access for recency', '90')
    .option('--min-access <count>', 'Minimum access count for frequency', '2')
    .option('--importance-threshold <value>', 'Importance score threshold', '0.4')
    .option('--limit <n>', 'Maximum entries to process', '100')
    .option('--dry-run', 'Preview only, no changes', true)
    .option('--execute', 'Actually execute forgetting (opposite of --dry-run)')
    .option('--agent-id <id>', 'Agent ID for audit trail')
    .action(
      typedAction<ForgetRunOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await forgettingHandlers.forget(context, {
            action: 'forget',
            scopeType: (options.scopeType ?? 'project') as 'global' | 'org' | 'project' | 'session',
            scopeId: options.scopeId,
            entryTypes: options.entryTypes?.split(','),
            strategy: options.strategy,
            staleDays: parseInt(options.staleDays ?? '90', 10),
            minAccessCount: parseInt(options.minAccess ?? '2', 10),
            importanceThreshold: parseFloat(options.importanceThreshold ?? '0.4'),
            limit: parseInt(options.limit ?? '100', 10),
            dryRun: options.execute ? false : options.dryRun,
            agentId: options.agentId ?? globalOpts.agentId,
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

  // forget status
  forget
    .command('status')
    .description('Get forgetting service status')
    .action(
      typedAction<ForgetStatusOptions>(async (_options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await forgettingHandlers.status(context, { action: 'status' });

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
