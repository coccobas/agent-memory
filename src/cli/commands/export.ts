/**
 * Export CLI Command
 *
 * Export memory entries via CLI.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { exportHandlers } from '../../mcp/handlers/export.handler.js';
import { typedAction } from '../utils/typed-action.js';

interface ExportExportOptions extends Record<string, unknown> {
  types?: string;
  scopeType?: string;
  scopeId?: string;
  tags?: string;
  exportFormat?: string;
  includeVersions?: boolean;
  includeInactive?: boolean;
  filename?: string;
}

export function addExportCommand(program: Command): void {
  const exportCmd = program.command('export').description('Export memory entries');

  // export export
  exportCmd
    .command('export')
    .description('Export memory entries to various formats')
    .option(
      '--types <types>',
      'Entry types to export (comma-separated: tools,guidelines,knowledge)'
    )
    .option('--scope-type <type>', 'Scope type to export from')
    .option('--scope-id <id>', 'Scope ID')
    .option('--tags <tags>', 'Filter by tags (comma-separated)')
    .option('--export-format <format>', 'Export format: json, markdown, yaml, openapi', 'json')
    .option('--include-versions', 'Include version history')
    .option('--include-inactive', 'Include inactive entries')
    .option('--filename <name>', 'Save to file (requires admin-key)')
    .action(
      typedAction<ExportExportOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          // Parse types and tags from comma-separated strings
          const types = options.types
            ? options.types.split(',').map((t: string) => t.trim())
            : undefined;
          const tags = options.tags
            ? options.tags.split(',').map((t: string) => t.trim())
            : undefined;

          const result = exportHandlers.export(context, {
            types,
            scopeType: options.scopeType,
            scopeId: options.scopeId,
            tags,
            format: options.exportFormat,
            includeVersions: options.includeVersions,
            includeInactive: options.includeInactive,
            filename: options.filename,
            agentId: globalOpts.agentId,
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
