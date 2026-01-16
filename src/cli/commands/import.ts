/**
 * Import CLI Command
 *
 * Import memory entries via CLI.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { readStdin } from '../utils/stdin.js';
import { importHandlers } from '../../mcp/handlers/import.handler.js';
import { createValidationError } from '../../core/errors.js';
import { typedAction } from '../utils/typed-action.js';

interface ImportOptions extends Record<string, unknown> {
  importFormat?: string;
  conflictStrategy?: string;
  generateNewIds?: boolean;
  importedBy?: string;
}

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
    .action(
      typedAction<ImportOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          // Read content from stdin
          const content = await readStdin();
          if (!content) {
            throw createValidationError('content', 'is required via stdin');
          }

          const result = await importHandlers.import(context, {
            content,
            format: options.importFormat,
            conflictStrategy: options.conflictStrategy,
            generateNewIds: options.generateNewIds,
            importedBy: options.importedBy,
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
