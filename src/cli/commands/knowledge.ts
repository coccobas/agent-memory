/**
 * Knowledge CLI Command
 *
 * Manage knowledge entries via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { readStdinJson } from '../utils/stdin.js';
import { knowledgeHandlers } from '../../mcp/handlers/knowledge.handler.js';
import { createValidationError } from '../../core/errors.js';

export function addKnowledgeCommand(program: Command): void {
  const knowledge = program.command('knowledge').description('Manage knowledge entries');

  // knowledge add
  knowledge
    .command('add')
    .description('Add a new knowledge entry')
    .requiredOption('--title <title>', 'Knowledge title')
    .requiredOption('--content <content>', 'Knowledge content')
    .requiredOption('--scope-type <type>', 'Scope type: global, org, project, session')
    .option('--scope-id <id>', 'Scope ID (required for non-global)')
    .option('--category <category>', 'Category: decision, fact, context, reference')
    .option('--source <source>', 'Source of the knowledge')
    .option('--confidence <n>', 'Confidence level 0-1', parseFloat)
    .option('--valid-until <date>', 'Expiration date (ISO format)')
    .option('--created-by <name>', 'Creator name')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await knowledgeHandlers.add(context, {
          title: options.title,
          content: options.content,
          scopeType: options.scopeType,
          scopeId: options.scopeId,
          category: options.category,
          source: options.source,
          confidence: options.confidence,
          validUntil: options.validUntil,
          createdBy: options.createdBy,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // knowledge list
  knowledge
    .command('list')
    .description('List knowledge entries')
    .option('--scope-type <type>', 'Filter by scope type')
    .option('--scope-id <id>', 'Filter by scope ID')
    .option('--category <category>', 'Filter by category')
    .option('--include-inactive', 'Include inactive entries')
    .option('--limit <n>', 'Maximum entries to return', parseInt)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await knowledgeHandlers.list(context, {
          scopeType: options.scopeType,
          scopeId: options.scopeId,
          category: options.category,
          includeInactive: options.includeInactive,
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
    });

  // knowledge get
  knowledge
    .command('get')
    .description('Get a knowledge entry by ID or title')
    .option('--id <id>', 'Knowledge ID')
    .option('--title <title>', 'Knowledge title (requires scope-type)')
    .option('--scope-type <type>', 'Scope type for title lookup')
    .option('--scope-id <id>', 'Scope ID for title lookup')
    .option('--inherit', 'Search parent scopes')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await knowledgeHandlers.get(context, {
          id: options.id,
          title: options.title,
          scopeType: options.scopeType,
          scopeId: options.scopeId,
          inherit: options.inherit ?? true,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // knowledge update
  knowledge
    .command('update')
    .description('Update a knowledge entry')
    .requiredOption('--id <id>', 'Knowledge ID')
    .option('--content <content>', 'New content')
    .option('--category <category>', 'New category')
    .option('--source <source>', 'New source')
    .option('--confidence <n>', 'New confidence level', parseFloat)
    .option('--valid-until <date>', 'New expiration date')
    .option('--change-reason <reason>', 'Reason for update')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await knowledgeHandlers.update(context, {
          id: options.id,
          content: options.content,
          category: options.category,
          source: options.source,
          confidence: options.confidence,
          validUntil: options.validUntil,
          changeReason: options.changeReason,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // knowledge history
  knowledge
    .command('history')
    .description('Get version history for a knowledge entry')
    .requiredOption('--id <id>', 'Knowledge ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await knowledgeHandlers.history(context, {
          id: options.id,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // knowledge deactivate
  knowledge
    .command('deactivate')
    .description('Soft-delete a knowledge entry')
    .requiredOption('--id <id>', 'Knowledge ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await knowledgeHandlers.deactivate(context, {
          id: options.id,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // knowledge delete
  knowledge
    .command('delete')
    .description('Permanently delete a knowledge entry')
    .requiredOption('--id <id>', 'Knowledge ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await knowledgeHandlers.delete(context, {
          id: options.id,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // knowledge bulk-add
  knowledge
    .command('bulk-add')
    .description('Add multiple knowledge entries (reads JSON array from stdin)')
    .requiredOption('--scope-type <type>', 'Default scope type')
    .option('--scope-id <id>', 'Default scope ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const entries = await readStdinJson<object[]>();
        if (!entries || !Array.isArray(entries)) {
          throw createValidationError('entries', 'is required via stdin as JSON array');
        }

        const result = await knowledgeHandlers.bulk_add(context, {
          entries,
          scopeType: options.scopeType,
          scopeId: options.scopeId,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // knowledge bulk-update
  knowledge
    .command('bulk-update')
    .description('Update multiple knowledge entries (reads JSON array from stdin)')
    .action(async (_, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const updates = await readStdinJson<object[]>();
        if (!updates || !Array.isArray(updates)) {
          throw createValidationError('updates', 'is required via stdin as JSON array');
        }

        const result = await knowledgeHandlers.bulk_update(context, {
          updates,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // knowledge bulk-delete
  knowledge
    .command('bulk-delete')
    .description('Delete multiple knowledge entries (reads JSON array of IDs from stdin)')
    .action(async (_, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const ids = await readStdinJson<string[]>();
        if (!ids || !Array.isArray(ids)) {
          throw createValidationError('ids', 'is required via stdin as JSON array');
        }

        const result = await knowledgeHandlers.bulk_delete(context, {
          ids,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}
