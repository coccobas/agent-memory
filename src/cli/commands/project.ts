/**
 * Project CLI Command
 *
 * Manage projects via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { scopeHandlers } from '../../mcp/handlers/scopes.handler.js';

export function addProjectCommand(program: Command): void {
  const project = program.command('project').description('Manage projects');

  // project create
  project
    .command('create')
    .description('Create a new project')
    .requiredOption('--name <name>', 'Project name')
    .option('--org-id <id>', 'Parent organization ID')
    .option('--description <text>', 'Project description')
    .option('--root-path <path>', 'Filesystem root path')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await scopeHandlers.projectCreate(context, {
          name: options.name,
          orgId: options.orgId,
          description: options.description,
          rootPath: options.rootPath,
          adminKey: globalOpts.adminKey,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // project list
  project
    .command('list')
    .description('List projects')
    .option('--org-id <id>', 'Filter by organization ID')
    .option('--limit <n>', 'Maximum entries to return', parseInt)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await scopeHandlers.projectList(context, {
          orgId: options.orgId,
          limit: options.limit,
          offset: options.offset,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // project get
  project
    .command('get')
    .description('Get a project by ID or name')
    .option('--id <id>', 'Project ID')
    .option('--name <name>', 'Project name')
    .option('--org-id <id>', 'Organization ID (for name lookup)')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await scopeHandlers.projectGet(context, {
          id: options.id,
          name: options.name,
          orgId: options.orgId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // project update
  project
    .command('update')
    .description('Update a project')
    .requiredOption('--id <id>', 'Project ID')
    .option('--name <name>', 'New name')
    .option('--description <text>', 'New description')
    .option('--root-path <path>', 'New root path')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await scopeHandlers.projectUpdate(context, {
          id: options.id,
          name: options.name,
          description: options.description,
          rootPath: options.rootPath,
          adminKey: globalOpts.adminKey,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // project delete
  project
    .command('delete')
    .description('Delete a project')
    .requiredOption('--id <id>', 'Project ID')
    .requiredOption('--confirm', 'Confirm deletion')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await scopeHandlers.projectDelete(context, {
          id: options.id,
          confirm: options.confirm,
          adminKey: globalOpts.adminKey,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}
