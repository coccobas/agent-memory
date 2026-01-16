/**
 * Tag CLI Command
 *
 * Manage tags via CLI.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { tagHandlers } from '../../mcp/handlers/tags.handler.js';
import { typedAction } from '../utils/typed-action.js';

interface TagCreateOptions extends Record<string, unknown> {
  name: string;
  category?: string;
  description?: string;
}

interface TagListOptions extends Record<string, unknown> {
  category?: string;
  limit?: number;
  offset?: number;
}

interface TagAttachOptions extends Record<string, unknown> {
  entryType: string;
  entryId: string;
  tagId?: string;
  tagName?: string;
}

interface TagDetachOptions extends Record<string, unknown> {
  entryType: string;
  entryId: string;
  tagId: string;
}

interface TagForEntryOptions extends Record<string, unknown> {
  entryType: string;
  entryId: string;
}

export function addTagCommand(program: Command): void {
  const tag = program.command('tag').description('Manage tags');

  // tag create
  tag
    .command('create')
    .description('Create a new tag')
    .requiredOption('--name <name>', 'Tag name')
    .option('--category <category>', 'Category: language, domain, category, meta, custom')
    .option('--description <text>', 'Tag description')
    .action(
      typedAction<TagCreateOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await tagHandlers.create(context, {
            name: options.name,
            category: options.category as
              | 'custom'
              | 'category'
              | 'language'
              | 'domain'
              | 'meta'
              | undefined,
            description: options.description,
            agentId: globalOpts.agentId ?? 'cli',
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

  // tag list
  tag
    .command('list')
    .description('List tags')
    .option('--category <category>', 'Filter by category')
    .option('--limit <n>', 'Maximum entries to return', parseInt)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .action(
      typedAction<TagListOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await tagHandlers.list(context, {
            category: options.category as
              | 'custom'
              | 'category'
              | 'language'
              | 'domain'
              | 'meta'
              | undefined,
            limit: options.limit,
            offset: options.offset,
            agentId: globalOpts.agentId ?? 'cli',
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

  // tag attach
  tag
    .command('attach')
    .description('Attach a tag to an entry')
    .requiredOption('--entry-type <type>', 'Entry type: tool, guideline, knowledge')
    .requiredOption('--entry-id <id>', 'Entry ID')
    .option('--tag-id <id>', 'Tag ID')
    .option('--tag-name <name>', 'Tag name (creates if not exists)')
    .action(
      typedAction<TagAttachOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await tagHandlers.attach(context, {
            entryType: options.entryType as 'tool' | 'guideline' | 'knowledge',
            entryId: options.entryId,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            tagId: options.tagId!,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            tagName: options.tagName!,
            agentId: globalOpts.agentId ?? 'cli',
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

  // tag detach
  tag
    .command('detach')
    .description('Detach a tag from an entry')
    .requiredOption('--entry-type <type>', 'Entry type: tool, guideline, knowledge')
    .requiredOption('--entry-id <id>', 'Entry ID')
    .requiredOption('--tag-id <id>', 'Tag ID')
    .action(
      typedAction<TagDetachOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await tagHandlers.detach(context, {
            entryType: options.entryType as 'tool' | 'guideline' | 'knowledge',
            entryId: options.entryId,
            tagId: options.tagId,
            agentId: globalOpts.agentId ?? 'cli',
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

  // tag for-entry
  tag
    .command('for-entry')
    .description('List tags for an entry')
    .requiredOption('--entry-type <type>', 'Entry type: tool, guideline, knowledge')
    .requiredOption('--entry-id <id>', 'Entry ID')
    .action(
      typedAction<TagForEntryOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await tagHandlers.forEntry(context, {
            entryType: options.entryType as 'tool' | 'guideline' | 'knowledge',
            entryId: options.entryId,
            agentId: globalOpts.agentId ?? 'cli',
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
