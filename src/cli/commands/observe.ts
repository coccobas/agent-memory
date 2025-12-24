/**
 * Observe CLI Command
 *
 * Extract memory entries from context via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { readStdin, readStdinJson } from '../utils/stdin.js';
import { observeHandlers } from '../../mcp/handlers/observe/index.js';

export function addObserveCommand(program: Command): void {
  const observe = program.command('observe').description('Extract memory entries from context');

  // observe extract
  observe
    .command('extract')
    .description('Analyze context and extract guidelines, knowledge, and tool patterns')
    .option('--context <text>', 'Context to analyze (or provide via stdin)')
    .option('--context-type <type>', 'Context type: conversation, code, mixed', 'mixed')
    .option('--scope-type <type>', 'Scope for extracted entries', 'project')
    .option('--scope-id <id>', 'Scope ID')
    .option('--auto-store', 'Automatically store entries above confidence threshold')
    .option('--confidence-threshold <n>', 'Minimum confidence to auto-store', parseFloat, 0.7)
    .option('--focus-areas <areas>', 'Focus on specific types (comma-separated: decisions,facts,rules,tools)')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        // Get context from option or stdin
        let inputContext = options.context;
        if (!inputContext) {
          inputContext = await readStdin();
        }

        if (!inputContext) {
          throw new Error('No context provided. Use --context or pipe content via stdin.');
        }

        const focusAreas = options.focusAreas
          ? options.focusAreas.split(',').map((a: string) => a.trim())
          : undefined;

        const result = await observeHandlers.extract(context, {
          context: inputContext,
          contextType: options.contextType,
          scopeType: options.scopeType,
          scopeId: options.scopeId,
          autoStore: options.autoStore,
          confidenceThreshold: options.confidenceThreshold,
          focusAreas,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // observe draft
  observe
    .command('draft')
    .description('Get schema and prompt template for client-assisted extraction')
    .requiredOption('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--auto-promote', 'Enable auto-promotion of high-confidence entries')
    .option('--auto-promote-threshold <n>', 'Threshold for auto-promotion', parseFloat, 0.85)
    .option('--focus-areas <areas>', 'Focus areas (comma-separated)')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        await getCliContext(); // Initialize context for proper shutdown

        const focusAreas = options.focusAreas
          ? options.focusAreas.split(',').map((a: string) => a.trim())
          : undefined;

        const result = observeHandlers.draft({
          sessionId: options.sessionId,
          projectId: options.projectId,
          autoPromote: options.autoPromote,
          autoPromoteThreshold: options.autoPromoteThreshold,
          focusAreas,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // observe commit
  observe
    .command('commit')
    .description('Store client-extracted entries (reads entries JSON from stdin)')
    .requiredOption('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--auto-promote', 'Enable auto-promotion')
    .option('--auto-promote-threshold <n>', 'Threshold for auto-promotion', parseFloat, 0.85)
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const entries = await readStdinJson<object[]>();
        if (!entries || !Array.isArray(entries)) {
          throw new Error('No entries provided via stdin. Pipe JSON array of entries.');
        }

        const result = await observeHandlers.commit(context, {
          sessionId: options.sessionId,
          projectId: options.projectId,
          entries,
          autoPromote: options.autoPromote,
          autoPromoteThreshold: options.autoPromoteThreshold,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // observe status
  observe
    .command('status')
    .description('Check extraction service availability')
    .action(async (_, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = observeHandlers.status(context);

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}
