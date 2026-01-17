/**
 * Relation CLI Command
 *
 * Manage entry relations via CLI.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { relationHandlers } from '../../mcp/handlers/relations.handler.js';
import { typedAction } from '../utils/typed-action.js';

interface RelationCreateOptions extends Record<string, unknown> {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  createdBy?: string;
}

interface RelationListOptions extends Record<string, unknown> {
  sourceType?: string;
  sourceId?: string;
  targetType?: string;
  targetId?: string;
  relationType?: string;
  limit?: number;
  offset?: number;
}

interface RelationDeleteOptions extends Record<string, unknown> {
  id?: string;
  sourceType?: string;
  sourceId?: string;
  targetType?: string;
  targetId?: string;
  relationType?: string;
}

export function addRelationCommand(program: Command): void {
  const relation = program.command('relation').description('Manage entry relations');

  // relation create
  relation
    .command('create')
    .description('Create a relation between entries')
    .requiredOption(
      '--source-type <type>',
      'Source entry type: tool, guideline, knowledge, project'
    )
    .requiredOption('--source-id <id>', 'Source entry ID')
    .requiredOption(
      '--target-type <type>',
      'Target entry type: tool, guideline, knowledge, project'
    )
    .requiredOption('--target-id <id>', 'Target entry ID')
    .requiredOption(
      '--relation-type <type>',
      'Relation type: applies_to, depends_on, conflicts_with, related_to, parent_task, subtask_of'
    )
    .option('--created-by <name>', 'Creator name')
    .action(
      typedAction<RelationCreateOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await relationHandlers.create(context, {
            sourceType: options.sourceType,
            sourceId: options.sourceId,
            targetType: options.targetType,
            targetId: options.targetId,
            relationType: options.relationType,
            createdBy: options.createdBy,
            agentId: globalOpts.agentId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // relation list
  relation
    .command('list')
    .description('List relations')
    .option('--source-type <type>', 'Filter by source type')
    .option('--source-id <id>', 'Filter by source ID')
    .option('--target-type <type>', 'Filter by target type')
    .option('--target-id <id>', 'Filter by target ID')
    .option('--relation-type <type>', 'Filter by relation type')
    .option('--limit <n>', 'Maximum entries to return', parseInt)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .action(
      typedAction<RelationListOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await relationHandlers.list(context, {
            sourceType: options.sourceType,
            sourceId: options.sourceId,
            targetType: options.targetType,
            targetId: options.targetId,
            relationType: options.relationType,
            limit: options.limit,
            offset: options.offset,
            agentId: globalOpts.agentId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // relation delete
  relation
    .command('delete')
    .description('Delete a relation')
    .option('--id <id>', 'Relation ID')
    .option('--source-type <type>', 'Source type (alternative to id)')
    .option('--source-id <id>', 'Source ID (alternative to id)')
    .option('--target-type <type>', 'Target type (alternative to id)')
    .option('--target-id <id>', 'Target ID (alternative to id)')
    .option('--relation-type <type>', 'Relation type (alternative to id)')
    .action(
      typedAction<RelationDeleteOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await relationHandlers.delete(context, {
            id: options.id,
            sourceType: options.sourceType,
            sourceId: options.sourceId,
            targetType: options.targetType,
            targetId: options.targetId,
            relationType: options.relationType,
            agentId: globalOpts.agentId,
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
