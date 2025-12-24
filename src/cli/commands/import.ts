/**
 * Import CLI Command
 *
 * Import memory entries via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { readStdin } from '../utils/stdin.js';
import { importHandlers } from '../../mcp/handlers/import.handler.js';

export function addImportCommand(program: Command): void {
  const importCmd = program.command('import').description('Import memory entries');

  // import import
  importCmd
    .command('import')
    .description('Import memory entries from various formats (reads content from stdin)')
    .option('--import-format <format>', 'Import format: json, yaml, markdown, openapi', 'json')
    .option(
      '--conflict-strategy <strategy>',
      'How to handle conflicts: skip, update, replace, error',
      'update'
    )
    .option('--generate-new-ids', 'Generate new IDs instead of preserving originals')
    .option('--imported-by <name>', 'Identifier for audit trail')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        // Read content from stdin
        const content = await readStdin();
        if (!content) {
          throw new Error('No content provided via stdin. Pipe the content to import.');
        }

        const result = await importHandlers.import(context, {
          content,
          format: options.importFormat,
          conflictStrategy: options.conflictStrategy,
          generateNewIds: options.generateNewIds,
          importedBy: options.importedBy,
          admin_key: globalOpts.adminKey,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}
