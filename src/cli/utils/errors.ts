/**
 * CLI Error Handling
 *
 * Provides consistent error handling for CLI commands.
 */

import { mapError } from '../../utils/error-mapper.js';

/**
 * Handle CLI errors consistently
 */
export function handleCliError(error: unknown): never {
  const mapped = mapError(error);

  // Write error to stderr as JSON
  const output = {
    error: mapped.message,
    code: mapped.code,
    ...(mapped.details ? { details: mapped.details } : {}),
  };

  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
}

/**
 * Wrap an async action with error handling
 */
export function withErrorHandling<T>(
  action: () => Promise<T>,
  cleanup?: () => Promise<void>
): Promise<void> {
  return action()
    .then(() => cleanup?.())
    .catch(async (error) => {
      await cleanup?.();
      handleCliError(error);
    });
}
