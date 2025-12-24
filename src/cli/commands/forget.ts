/**
 * Forget CLI Command
 *
 * Memory forgetting and decay management.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { forgettingHandlers } from '../../mcp/handlers/forgetting.handler.js';

export function addForgetCommand(program: Command): void {
  const forget = program.command('forget').description('Manage memory forgetting and decay');

  // forget analyze
  forget
    .command('analyze')
    .description('Identify candidates for forgetting (dry run)')
    .option('--scope-type <type>', 'Scope type', 'project')
    .option('--scope-id <id>', 'Scope ID')
    .option('--entry-types <types>', 'Entry types (comma-separated)', 'tool,guideline,knowledge,experience')
    .option('--strategy <strategy>', 'Forgetting strategy', 'combined')
    .option('--stale-days <days>', 'Days since last access for recency', '90')
    .option('--min-access <count>', 'Minimum access count for frequency', '2')
    .option('--importance-threshold <value>', 'Importance score threshold', '0.4')
    .option('--limit <n>', 'Maximum entries to process', '100')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await forgettingHandlers.analyze(context, {
          action: 'analyze',
          scopeType: options.scopeType,
          scopeId: options.scopeId,
          entryTypes: options.entryTypes.split(','),
          strategy: options.strategy,
          staleDays: parseInt(options.staleDays, 10),
          minAccessCount: parseInt(options.minAccess, 10),
          importanceThreshold: parseFloat(options.importanceThreshold),
          limit: parseInt(options.limit, 10),
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // forget run
  forget
    .command('run')
    .description('Execute forgetting on candidates')
    .option('--scope-type <type>', 'Scope type', 'project')
    .option('--scope-id <id>', 'Scope ID')
    .option('--entry-types <types>', 'Entry types (comma-separated)', 'tool,guideline,knowledge,experience')
    .option('--strategy <strategy>', 'Forgetting strategy', 'combined')
    .option('--stale-days <days>', 'Days since last access for recency', '90')
    .option('--min-access <count>', 'Minimum access count for frequency', '2')
    .option('--importance-threshold <value>', 'Importance score threshold', '0.4')
    .option('--limit <n>', 'Maximum entries to process', '100')
    .option('--dry-run', 'Preview only, no changes', true)
    .option('--execute', 'Actually execute forgetting (opposite of --dry-run)')
    .option('--agent-id <id>', 'Agent ID for audit trail')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await forgettingHandlers.forget(context, {
          action: 'forget',
          scopeType: options.scopeType,
          scopeId: options.scopeId,
          entryTypes: options.entryTypes.split(','),
          strategy: options.strategy,
          staleDays: parseInt(options.staleDays, 10),
          minAccessCount: parseInt(options.minAccess, 10),
          importanceThreshold: parseFloat(options.importanceThreshold),
          limit: parseInt(options.limit, 10),
          dryRun: options.execute ? false : options.dryRun,
          agentId: options.agentId ?? globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // forget status
  forget
    .command('status')
    .description('Get forgetting service status')
    .action(async (_options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await forgettingHandlers.status(context, { action: 'status' });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}
