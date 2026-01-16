/**
 * Permission CLI Command
 *
 * Manage permissions via CLI.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { permissionHandlers } from '../../mcp/handlers/permissions.handler.js';
import { typedAction } from '../utils/typed-action.js';

interface PermissionGrantOptions extends Record<string, unknown> {
  agentId: string;
  scopeType?: string;
  scopeId?: string;
  entryType?: string;
  permission?: string;
  createdBy?: string;
}

interface PermissionRevokeOptions extends Record<string, unknown> {
  permissionId?: string;
  agentId?: string;
  scopeType?: string;
  scopeId?: string;
  entryType?: string;
}

interface PermissionCheckOptions extends Record<string, unknown> {
  agentId: string;
  scopeType: string;
  scopeId?: string;
  entryType?: string;
  action?: string;
}

interface PermissionListOptions extends Record<string, unknown> {
  agentId?: string;
  scopeType?: string;
  scopeId?: string;
  entryType?: string;
  limit?: number;
  offset?: number;
}

export function addPermissionCommand(program: Command): void {
  const permission = program.command('permission').description('Manage permissions');

  // permission grant
  permission
    .command('grant')
    .description('Grant a permission to an agent')
    .requiredOption('--agent-id <id>', 'Agent ID to grant permission to')
    .option('--scope-type <type>', 'Scope type: global, org, project, session')
    .option('--scope-id <id>', 'Scope ID')
    .option('--entry-type <type>', 'Entry type: tool, guideline, knowledge')
    .option('--permission <level>', 'Permission level: read, write, admin', 'write')
    .option('--created-by <name>', 'Creator name')
    .action(
      typedAction<PermissionGrantOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = permissionHandlers.grant(context, {
            agent_id: options.agentId,
            scope_type: options.scopeType,
            scope_id: options.scopeId,
            entry_type: options.entryType,
            permission: options.permission,
            created_by: options.createdBy,
            admin_key: globalOpts.adminKey,
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

  // permission revoke
  permission
    .command('revoke')
    .description('Revoke a permission')
    .option('--permission-id <id>', 'Permission ID to revoke')
    .option('--agent-id <id>', 'Agent ID (alternative to permission-id)')
    .option('--scope-type <type>', 'Scope type (for agent-id lookup)')
    .option('--scope-id <id>', 'Scope ID (for agent-id lookup)')
    .option('--entry-type <type>', 'Entry type (for agent-id lookup)')
    .action(
      typedAction<PermissionRevokeOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = permissionHandlers.revoke(context, {
            permission_id: options.permissionId,
            agent_id: options.agentId,
            scope_type: options.scopeType,
            scope_id: options.scopeId,
            entry_type: options.entryType,
            admin_key: globalOpts.adminKey,
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

  // permission check
  permission
    .command('check')
    .description('Check if an agent has a permission')
    .requiredOption('--agent-id <id>', 'Agent ID to check')
    .requiredOption('--scope-type <type>', 'Scope type')
    .option('--scope-id <id>', 'Scope ID')
    .option('--entry-type <type>', 'Entry type')
    .option('--action <action>', 'Action to check: read, write', 'read')
    .action(
      typedAction<PermissionCheckOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = permissionHandlers.check(context, {
            agent_id: options.agentId,
            scope_type: options.scopeType,
            scope_id: options.scopeId,
            entry_type: options.entryType,
            checkAction: options.action,
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

  // permission list
  permission
    .command('list')
    .description('List permissions')
    .option('--agent-id <id>', 'Filter by agent ID')
    .option('--scope-type <type>', 'Filter by scope type')
    .option('--scope-id <id>', 'Filter by scope ID')
    .option('--entry-type <type>', 'Filter by entry type')
    .option('--limit <n>', 'Maximum entries to return', parseInt)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .action(
      typedAction<PermissionListOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = permissionHandlers.list(context, {
            agent_id: options.agentId,
            scope_type: options.scopeType,
            scope_id: options.scopeId,
            entry_type: options.entryType,
            limit: options.limit,
            offset: options.offset,
            admin_key: globalOpts.adminKey,
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
