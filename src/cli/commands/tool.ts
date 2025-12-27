/**
 * Tool CLI Command
 *
 * Manage tool entries via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { readStdinJson } from '../utils/stdin.js';
import { toolHandlers } from '../../mcp/handlers/tools.handler.js';
import { createValidationError } from '../../core/errors.js';

export function addToolCommand(program: Command): void {
  const tool = program.command('tool').description('Manage tool entries');

  // tool add
  tool
    .command('add')
    .description('Add a new tool')
    .requiredOption('--name <name>', 'Tool name')
    .requiredOption('--scope-type <type>', 'Scope type: global, org, project, session')
    .option('--scope-id <id>', 'Scope ID (required for non-global)')
    .option('--description <text>', 'Tool description')
    .option('--category <category>', 'Category: mcp, cli, function, api')
    .option('--constraints <text>', 'Usage constraints')
    .option('--created-by <name>', 'Creator name')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await toolHandlers.add(context, {
          name: options.name,
          scopeType: options.scopeType,
          scopeId: options.scopeId,
          description: options.description,
          category: options.category,
          constraints: options.constraints,
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

  // tool list
  tool
    .command('list')
    .description('List tools')
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

        const result = await toolHandlers.list(context, {
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

  // tool get
  tool
    .command('get')
    .description('Get a tool by ID or name')
    .option('--id <id>', 'Tool ID')
    .option('--name <name>', 'Tool name (requires scope-type)')
    .option('--scope-type <type>', 'Scope type for name lookup')
    .option('--scope-id <id>', 'Scope ID for name lookup')
    .option('--inherit', 'Search parent scopes')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await toolHandlers.get(context, {
          id: options.id,
          name: options.name,
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

  // tool update
  tool
    .command('update')
    .description('Update a tool')
    .requiredOption('--id <id>', 'Tool ID')
    .option('--description <text>', 'New description')
    .option('--category <category>', 'New category')
    .option('--constraints <text>', 'New constraints')
    .option('--change-reason <reason>', 'Reason for update')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await toolHandlers.update(context, {
          id: options.id,
          description: options.description,
          category: options.category,
          constraints: options.constraints,
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

  // tool history
  tool
    .command('history')
    .description('Get version history for a tool')
    .requiredOption('--id <id>', 'Tool ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await toolHandlers.history(context, {
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

  // tool deactivate
  tool
    .command('deactivate')
    .description('Soft-delete a tool')
    .requiredOption('--id <id>', 'Tool ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await toolHandlers.deactivate(context, {
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

  // tool delete
  tool
    .command('delete')
    .description('Permanently delete a tool')
    .requiredOption('--id <id>', 'Tool ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await toolHandlers.delete(context, {
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

  // tool bulk-add
  tool
    .command('bulk-add')
    .description('Add multiple tools (reads JSON array from stdin)')
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

        const result = await toolHandlers.bulk_add(context, {
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

  // tool bulk-update
  tool
    .command('bulk-update')
    .description('Update multiple tools (reads JSON array from stdin)')
    .action(async (_, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const updates = await readStdinJson<object[]>();
        if (!updates || !Array.isArray(updates)) {
          throw createValidationError('updates', 'is required via stdin as JSON array');
        }

        const result = await toolHandlers.bulk_update(context, {
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

  // tool bulk-delete
  tool
    .command('bulk-delete')
    .description('Delete multiple tools (reads JSON array of IDs from stdin)')
    .action(async (_, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const ids = await readStdinJson<string[]>();
        if (!ids || !Array.isArray(ids)) {
          throw createValidationError('ids', 'is required via stdin as JSON array');
        }

        const result = await toolHandlers.bulk_delete(context, {
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
