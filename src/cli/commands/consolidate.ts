/**
 * Consolidate CLI Command
 *
 * Consolidate similar memory entries via CLI.
 */

import type { Command } from 'commander';
import type { ScopeType, EntryType } from '../../db/schema/types.js';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { handleConsolidation } from '../../mcp/handlers/consolidation.handler.js';
import { typedAction } from '../utils/typed-action.js';

interface ConsolidateFindSimilarOptions extends Record<string, unknown> {
  scopeType: string;
  scopeId?: string;
  entryTypes?: string;
  threshold?: number;
  limit?: number;
  dryRun?: boolean;
}

interface ConsolidateDedupeOptions extends Record<string, unknown> {
  scopeType: string;
  scopeId?: string;
  entryTypes?: string;
  threshold?: number;
  dryRun?: boolean;
}

interface ConsolidateMergeOptions extends Record<string, unknown> {
  scopeType: string;
  scopeId?: string;
  entryTypes?: string;
  threshold?: number;
  dryRun?: boolean;
}

interface ConsolidateAbstractOptions extends Record<string, unknown> {
  scopeType: string;
  scopeId?: string;
  entryTypes?: string;
  threshold?: number;
  dryRun?: boolean;
}

interface ConsolidateArchiveStaleOptions extends Record<string, unknown> {
  scopeType: string;
  staleDays: number;
  scopeId?: string;
  entryTypes?: string;
  minRecencyScore?: number;
  dryRun?: boolean;
}

export function addConsolidateCommand(program: Command): void {
  const consolidate = program
    .command('consolidate')
    .description('Consolidate similar memory entries');

  // consolidate find-similar
  consolidate
    .command('find-similar')
    .description('Find groups of semantically similar entries')
    .requiredOption('--scope-type <type>', 'Scope type')
    .option('--scope-id <id>', 'Scope ID')
    .option('--entry-types <types>', 'Entry types (comma-separated: tool,guideline,knowledge)')
    .option('--threshold <n>', 'Similarity threshold 0-1', parseFloat, 0.85)
    .option('--limit <n>', 'Maximum groups to return', parseInt, 20)
    .option('--dry-run', 'Only report what would be consolidated')
    .action(
      typedAction<ConsolidateFindSimilarOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const entryTypes = options.entryTypes
            ? (options.entryTypes.split(',').map((t: string) => t.trim()) as EntryType[])
            : undefined;

          const result = await handleConsolidation(context, {
            action: 'find_similar',
            scopeType: (options.scopeType ?? 'project') as ScopeType,
            scopeId: options.scopeId,
            entryTypes,
            threshold: options.threshold,
            limit: options.limit,
            dryRun: options.dryRun,
            consolidatedBy: globalOpts.agentId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // consolidate dedupe
  consolidate
    .command('dedupe')
    .description('Remove near-duplicates, keeping the primary entry')
    .requiredOption('--scope-type <type>', 'Scope type')
    .option('--scope-id <id>', 'Scope ID')
    .option('--entry-types <types>', 'Entry types (comma-separated)')
    .option('--threshold <n>', 'Similarity threshold 0-1', parseFloat, 0.85)
    .option('--dry-run', 'Only report what would be consolidated')
    .action(
      typedAction<ConsolidateDedupeOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const entryTypes = options.entryTypes
            ? (options.entryTypes.split(',').map((t: string) => t.trim()) as EntryType[])
            : undefined;

          const result = await handleConsolidation(context, {
            action: 'dedupe',
            scopeType: (options.scopeType ?? 'project') as ScopeType,
            scopeId: options.scopeId,
            entryTypes,
            threshold: options.threshold,
            dryRun: options.dryRun,
            consolidatedBy: globalOpts.agentId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // consolidate merge
  consolidate
    .command('merge')
    .description('Combine content from similar entries into one')
    .requiredOption('--scope-type <type>', 'Scope type')
    .option('--scope-id <id>', 'Scope ID')
    .option('--entry-types <types>', 'Entry types (comma-separated)')
    .option('--threshold <n>', 'Similarity threshold 0-1', parseFloat, 0.85)
    .option('--dry-run', 'Only report what would be merged')
    .action(
      typedAction<ConsolidateMergeOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const entryTypes = options.entryTypes
            ? (options.entryTypes.split(',').map((t: string) => t.trim()) as EntryType[])
            : undefined;

          const result = await handleConsolidation(context, {
            action: 'merge',
            scopeType: (options.scopeType ?? 'project') as ScopeType,
            scopeId: options.scopeId,
            entryTypes,
            threshold: options.threshold,
            dryRun: options.dryRun,
            consolidatedBy: globalOpts.agentId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // consolidate abstract
  consolidate
    .command('abstract')
    .description('Create relations between similar entries without modifying them')
    .requiredOption('--scope-type <type>', 'Scope type')
    .option('--scope-id <id>', 'Scope ID')
    .option('--entry-types <types>', 'Entry types (comma-separated)')
    .option('--threshold <n>', 'Similarity threshold 0-1', parseFloat, 0.85)
    .option('--dry-run', 'Only report what would be abstracted')
    .action(
      typedAction<ConsolidateAbstractOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const entryTypes = options.entryTypes
            ? (options.entryTypes.split(',').map((t: string) => t.trim()) as EntryType[])
            : undefined;

          const result = await handleConsolidation(context, {
            action: 'abstract',
            scopeType: (options.scopeType ?? 'project') as ScopeType,
            scopeId: options.scopeId,
            entryTypes,
            threshold: options.threshold,
            dryRun: options.dryRun,
            consolidatedBy: globalOpts.agentId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // consolidate archive-stale
  consolidate
    .command('archive-stale')
    .description('Archive entries older than staleDays')
    .requiredOption('--scope-type <type>', 'Scope type')
    .requiredOption('--stale-days <n>', 'Days after which entries are considered stale', parseInt)
    .option('--scope-id <id>', 'Scope ID')
    .option('--entry-types <types>', 'Entry types (comma-separated)')
    .option('--min-recency-score <n>', 'Only archive if recencyScore below this', parseFloat)
    .option('--dry-run', 'Only report what would be archived')
    .action(
      typedAction<ConsolidateArchiveStaleOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const entryTypes = options.entryTypes
            ? (options.entryTypes.split(',').map((t: string) => t.trim()) as EntryType[])
            : undefined;

          const result = await handleConsolidation(context, {
            action: 'archive_stale',
            scopeType: (options.scopeType ?? 'project') as ScopeType,
            scopeId: options.scopeId,
            entryTypes,
            staleDays: options.staleDays,
            minRecencyScore: options.minRecencyScore,
            dryRun: options.dryRun,
            consolidatedBy: globalOpts.agentId,
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
