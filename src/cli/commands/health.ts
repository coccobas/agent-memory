/**
 * Health CLI Command
 *
 * Check server health via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { memoryHealthDescriptor } from '../../mcp/descriptors/memory_health.js';

export function addHealthCommand(program: Command): void {
  program
    .command('health')
    .description('Check server health and database status')
    .action(async (_, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = memoryHealthDescriptor.contextHandler!(context, {});

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}
