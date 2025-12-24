/**
 * Tag CLI Command
 *
 * Manage tags via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { tagHandlers } from '../../mcp/handlers/tags.handler.js';

export function addTagCommand(program: Command): void {
  const tag = program.command('tag').description('Manage tags');

  // tag create
  tag
    .command('create')
    .description('Create a new tag')
    .requiredOption('--name <name>', 'Tag name')
    .option('--category <category>', 'Category: language, domain, category, meta, custom')
    .option('--description <text>', 'Tag description')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await tagHandlers.create(context, {
          name: options.name,
          category: options.category,
          description: options.description,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // tag list
  tag
    .command('list')
    .description('List tags')
    .option('--category <category>', 'Filter by category')
    .option('--limit <n>', 'Maximum entries to return', parseInt)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await tagHandlers.list(context, {
          category: options.category,
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

  // tag attach
  tag
    .command('attach')
    .description('Attach a tag to an entry')
    .requiredOption('--entry-type <type>', 'Entry type: tool, guideline, knowledge')
    .requiredOption('--entry-id <id>', 'Entry ID')
    .option('--tag-id <id>', 'Tag ID')
    .option('--tag-name <name>', 'Tag name (creates if not exists)')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await tagHandlers.attach(context, {
          entryType: options.entryType,
          entryId: options.entryId,
          tagId: options.tagId,
          tagName: options.tagName,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // tag detach
  tag
    .command('detach')
    .description('Detach a tag from an entry')
    .requiredOption('--entry-type <type>', 'Entry type: tool, guideline, knowledge')
    .requiredOption('--entry-id <id>', 'Entry ID')
    .requiredOption('--tag-id <id>', 'Tag ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await tagHandlers.detach(context, {
          entryType: options.entryType,
          entryId: options.entryId,
          tagId: options.tagId,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // tag for-entry
  tag
    .command('for-entry')
    .description('List tags for an entry')
    .requiredOption('--entry-type <type>', 'Entry type: tool, guideline, knowledge')
    .requiredOption('--entry-id <id>', 'Entry ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await tagHandlers.forEntry(context, {
          entryType: options.entryType,
          entryId: options.entryId,
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
