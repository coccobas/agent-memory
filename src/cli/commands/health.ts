/**
 * Health CLI Command
 *
 * Check server health via CLI.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { memoryHealthDescriptor } from '../../mcp/descriptors/memory_health.js';
import { typedAction } from '../utils/typed-action.js';

// No options for health command
interface HealthOptions extends Record<string, never> {}

export function addHealthCommand(program: Command): void {
  program
    .command('health')
    .description('Check server health and database status')
    .action(
      typedAction<HealthOptions>(async (_options, globalOpts) => {
        try {
          const context = await getCliContext();

          const { contextHandler } = memoryHealthDescriptor;
          if (!contextHandler) {
            throw new Error('Health descriptor contextHandler is not defined');
          }
          const result = contextHandler(context, {});

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );
}
