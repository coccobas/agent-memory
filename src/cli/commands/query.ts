/**
 * Query CLI Command
 *
 * Query memory entries via CLI.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { queryHandlers } from '../../mcp/handlers/query.handler.js';
import { typedAction } from '../utils/typed-action.js';

interface QueryContextOptions extends Record<string, unknown> {
  scopeType: string;
  scopeId?: string;
  inherit?: boolean;
  compact?: boolean;
  limitPerType?: number;
  search?: string;
  semanticSearch?: boolean;
}

interface QuerySearchOptions extends Record<string, unknown> {
  search?: string;
  types?: string;
  scopeType?: string;
  scopeId?: string;
  inherit?: boolean;
  semanticSearch?: boolean;
  semanticThreshold?: number;
  limit?: number;
  offset?: number;
  compact?: boolean;
  followRelations?: boolean;
}

export function addQueryCommand(program: Command): void {
  const query = program.command('query').description('Query memory entries');

  // query context
  query
    .command('context')
    .description('Get aggregated context for a scope')
    .requiredOption('--scope-type <type>', 'Scope type: global, org, project, session')
    .option('--scope-id <id>', 'Scope ID (required for non-global)')
    .option('--inherit', 'Include parent scopes', true)
    .option('--compact', 'Return compact results')
    .option('--limit-per-type <n>', 'Max entries per type', parseInt)
    .option('--search <query>', 'Free-text search query')
    .option('--semantic-search', 'Enable semantic/vector search')
    .action(
      typedAction<QueryContextOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await queryHandlers.context(context, {
            scopeType: options.scopeType as 'global' | 'org' | 'project' | 'session' | undefined,
            scopeId: options.scopeId,
            inherit: options.inherit,
            compact: options.compact,
            limitPerType: options.limitPerType,
            search: options.search,
            semanticSearch: options.semanticSearch,
            agentId: globalOpts.agentId,
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

  // query search
  query
    .command('search')
    .description('Search memory entries with filters')
    .option('--search <query>', 'Free-text search query')
    .option(
      '--types <types>',
      'Entry types to search (comma-separated: tools,guidelines,knowledge)'
    )
    .option('--scope-type <type>', 'Scope type filter')
    .option('--scope-id <id>', 'Scope ID filter')
    .option('--inherit', 'Include parent scopes', true)
    .option('--semantic-search', 'Enable semantic/vector search')
    .option('--semantic-threshold <n>', 'Similarity threshold 0-1', parseFloat)
    .option('--limit <n>', 'Maximum results', parseInt)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .option('--compact', 'Return compact results')
    .option('--follow-relations', 'Expand search results to include related entries')
    .action(
      typedAction<QuerySearchOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          // Parse types from comma-separated string
          const types = options.types
            ? options.types.split(',').map((t: string) => t.trim())
            : undefined;

          const result = await queryHandlers.query(context, {
            search: options.search,
            types,
            scope: options.scopeType
              ? {
                  type: options.scopeType,
                  id: options.scopeId,
                  inherit: options.inherit,
                }
              : undefined,
            semanticSearch: options.semanticSearch,
            semanticThreshold: options.semanticThreshold,
            limit: options.limit,
            offset: options.offset,
            compact: options.compact,
            followRelations: options.followRelations,
            agentId: globalOpts.agentId,
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
