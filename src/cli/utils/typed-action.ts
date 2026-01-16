/**
 * Type-safe action wrapper for Commander.js
 *
 * Commander.js action handlers have implicit 'any' types which cause ESLint errors.
 * This utility provides type-safe wrappers to eliminate unsafe member access errors.
 */

import type { Command } from 'commander';

/**
 * Global CLI options available to all commands via --option flags
 */
export interface GlobalOptions {
  /** Output format: json, table, or compact */
  format?: 'json' | 'table' | 'compact';
  /** Agent identifier for access control */
  agentId?: string;
  /** Admin key for privileged operations */
  adminKey?: string;
  /** Suppress non-essential output */
  quiet?: boolean;
}

/**
 * Type-safe action wrapper for Commander.js handlers
 *
 * @example
 * ```typescript
 * interface MyCommandOptions {
 *   scopeType?: string;
 *   scopeId?: string;
 * }
 *
 * program
 *   .command('my-command')
 *   .option('--scope-type <type>')
 *   .option('--scope-id <id>')
 *   .action(typedAction<MyCommandOptions>(async (options, globalOpts) => {
 *     // options and globalOpts are now properly typed
 *     console.log(options.scopeType);
 *   }));
 * ```
 *
 * @param handler - The typed action handler function
 * @returns A Commander.js-compatible action handler
 */
export function typedAction<TOptions extends Record<string, unknown>>(
  handler: (options: TOptions, globalOpts: GlobalOptions) => Promise<void>
): (options: unknown, cmd: Command) => Promise<void> {
  return async (options: unknown, cmd: Command) => {
    // Type assertion is necessary: Commander.js returns loose types from optsWithGlobals()
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
    await handler(options as TOptions, globalOpts);
  };
}
