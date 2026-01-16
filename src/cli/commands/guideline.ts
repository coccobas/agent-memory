/**
 * Guideline CLI Command
 *
 * Manage guideline entries via CLI.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { readStdinJson } from '../utils/stdin.js';
import { guidelineHandlers } from '../../mcp/handlers/guidelines.handler.js';
import { createValidationError } from '../../core/errors.js';
import { typedAction } from '../utils/typed-action.js';

interface GuidelineAddOptions extends Record<string, unknown> {
  name: string;
  content: string;
  scopeType: string;
  scopeId?: string;
  category?: string;
  priority?: number;
  rationale?: string;
  createdBy?: string;
}

interface GuidelineListOptions extends Record<string, unknown> {
  scopeType?: string;
  scopeId?: string;
  category?: string;
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
}

interface GuidelineGetOptions extends Record<string, unknown> {
  id?: string;
  name?: string;
  scopeType?: string;
  scopeId?: string;
  inherit?: boolean;
}

interface GuidelineUpdateOptions extends Record<string, unknown> {
  id: string;
  content?: string;
  category?: string;
  priority?: number;
  rationale?: string;
  changeReason?: string;
}

interface GuidelineHistoryOptions extends Record<string, unknown> {
  id: string;
}

interface GuidelineDeactivateOptions extends Record<string, unknown> {
  id: string;
}

interface GuidelineDeleteOptions extends Record<string, unknown> {
  id: string;
}

interface GuidelineBulkAddOptions extends Record<string, unknown> {
  scopeType: string;
  scopeId?: string;
}

interface GuidelineBulkUpdateOptions extends Record<string, never> {}

interface GuidelineBulkDeleteOptions extends Record<string, never> {}

export function addGuidelineCommand(program: Command): void {
  const guideline = program.command('guideline').description('Manage guideline entries');

  // guideline add
  guideline
    .command('add')
    .description('Add a new guideline')
    .requiredOption('--name <name>', 'Guideline name')
    .requiredOption('--content <content>', 'Guideline content')
    .requiredOption('--scope-type <type>', 'Scope type: global, org, project, session')
    .option('--scope-id <id>', 'Scope ID (required for non-global)')
    .option('--category <category>', 'Category (e.g., security, code_style)')
    .option('--priority <n>', 'Priority 0-100', parseInt)
    .option('--rationale <text>', 'Rationale for this guideline')
    .option('--created-by <name>', 'Creator name')
    .action(
      typedAction<GuidelineAddOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await guidelineHandlers.add(context, {
            name: options.name,
            content: options.content,
            scopeType: options.scopeType as 'global' | 'org' | 'project' | 'session' | undefined,
            scopeId: options.scopeId,
            category: options.category,
            priority: options.priority,
            rationale: options.rationale,
            createdBy: options.createdBy,
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

  // guideline list
  guideline
    .command('list')
    .description('List guidelines')
    .option('--scope-type <type>', 'Filter by scope type')
    .option('--scope-id <id>', 'Filter by scope ID')
    .option('--category <category>', 'Filter by category')
    .option('--include-inactive', 'Include inactive entries')
    .option('--limit <n>', 'Maximum entries to return', parseInt)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .action(
      typedAction<GuidelineListOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await guidelineHandlers.list(context, {
            scopeType: options.scopeType as 'global' | 'org' | 'project' | 'session' | undefined,
            scopeId: options.scopeId,
            category: options.category,
            includeInactive: options.includeInactive,
            limit: options.limit,
            offset: options.offset,
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

  // guideline get
  guideline
    .command('get')
    .description('Get a guideline by ID or name')
    .option('--id <id>', 'Guideline ID')
    .option('--name <name>', 'Guideline name (requires scope-type)')
    .option('--scope-type <type>', 'Scope type for name lookup')
    .option('--scope-id <id>', 'Scope ID for name lookup')
    .option('--inherit', 'Search parent scopes')
    .action(
      typedAction<GuidelineGetOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await guidelineHandlers.get(context, {
            id: options.id,
            name: options.name,
            scopeType: options.scopeType as 'global' | 'org' | 'project' | 'session' | undefined,
            scopeId: options.scopeId,
            inherit: options.inherit ?? true,
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

  // guideline update
  guideline
    .command('update')
    .description('Update a guideline')
    .requiredOption('--id <id>', 'Guideline ID')
    .option('--content <content>', 'New content')
    .option('--category <category>', 'New category')
    .option('--priority <n>', 'New priority', parseInt)
    .option('--rationale <text>', 'New rationale')
    .option('--change-reason <reason>', 'Reason for update')
    .action(
      typedAction<GuidelineUpdateOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await guidelineHandlers.update(context, {
            id: options.id,
            content: options.content,
            category: options.category,
            priority: options.priority,
            rationale: options.rationale,
            changeReason: options.changeReason,
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

  // guideline history
  guideline
    .command('history')
    .description('Get version history for a guideline')
    .requiredOption('--id <id>', 'Guideline ID')
    .action(
      typedAction<GuidelineHistoryOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await guidelineHandlers.history(context, {
            id: options.id,
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

  // guideline deactivate
  guideline
    .command('deactivate')
    .description('Soft-delete a guideline')
    .requiredOption('--id <id>', 'Guideline ID')
    .action(
      typedAction<GuidelineDeactivateOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await guidelineHandlers.deactivate(context, {
            id: options.id,
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

  // guideline delete
  guideline
    .command('delete')
    .description('Permanently delete a guideline')
    .requiredOption('--id <id>', 'Guideline ID')
    .action(
      typedAction<GuidelineDeleteOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await guidelineHandlers.delete(context, {
            id: options.id,
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

  // guideline bulk-add
  guideline
    .command('bulk-add')
    .description('Add multiple guidelines (reads JSON array from stdin)')
    .requiredOption('--scope-type <type>', 'Default scope type')
    .option('--scope-id <id>', 'Default scope ID')
    .action(
      typedAction<GuidelineBulkAddOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const entries = await readStdinJson<object[]>();
          if (!entries || !Array.isArray(entries)) {
            throw createValidationError('entries', 'is required via stdin as JSON array');
          }

          const result = await guidelineHandlers.bulk_add(context, {
            entries,
            scopeType: options.scopeType as 'global' | 'org' | 'project' | 'session' | undefined,
            scopeId: options.scopeId,
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

  // guideline bulk-update
  guideline
    .command('bulk-update')
    .description('Update multiple guidelines (reads JSON array from stdin)')
    .action(
      typedAction<GuidelineBulkUpdateOptions>(async (_options, globalOpts) => {
        try {
          const context = await getCliContext();

          const updates = await readStdinJson<object[]>();
          if (!updates || !Array.isArray(updates)) {
            throw createValidationError('updates', 'is required via stdin as JSON array');
          }

          const result = await guidelineHandlers.bulk_update(context, {
            updates,
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

  // guideline bulk-delete
  guideline
    .command('bulk-delete')
    .description('Delete multiple guidelines (reads JSON array of IDs from stdin)')
    .action(
      typedAction<GuidelineBulkDeleteOptions>(async (_options, globalOpts) => {
        try {
          const context = await getCliContext();

          const ids = await readStdinJson<string[]>();
          if (!ids || !Array.isArray(ids)) {
            throw createValidationError('ids', 'is required via stdin as JSON array');
          }

          const result = await guidelineHandlers.bulk_delete(context, {
            ids,
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
