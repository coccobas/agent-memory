/**
 * CLI Stdin Utilities
 *
 * Provides utilities for reading from stdin (for bulk operations and piped content).
 */

import { createValidationError } from '../../core/errors.js';

/**
 * Maximum stdin buffer size (10MB) to prevent memory exhaustion attacks.
 * Bug #348 fix: Added size limit to prevent DoS via large stdin input.
 */
const MAX_STDIN_SIZE = 10 * 1024 * 1024;

/**
 * Read from stdin (for bulk operations and piped content)
 */
export async function readStdin(): Promise<string | undefined> {
  // Skip if running in TTY with no piped input
  if (process.stdin.isTTY) return undefined;

  return new Promise((resolve, reject) => {
    let data = '';
    let totalBytes = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      process.stdin.removeAllListeners('readable');
      process.stdin.removeAllListeners('end');
      process.stdin.removeAllListeners('error');
    };

    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
      let chunk: string | null;
      while ((chunk = process.stdin.read() as string | null) !== null) {
        totalBytes += Buffer.byteLength(chunk, 'utf8');

        // Bug #348 fix: Enforce size limit to prevent memory exhaustion
        if (totalBytes > MAX_STDIN_SIZE) {
          cleanup();
          reject(
            createValidationError(
              'stdin',
              `Input exceeds maximum size of ${MAX_STDIN_SIZE / 1024 / 1024}MB`
            )
          );
          return;
        }

        data += chunk;
      }
    });

    process.stdin.on('end', () => {
      cleanup();
      resolve(data.trim() || undefined);
    });

    process.stdin.on('error', (err) => {
      cleanup();
      reject(err);
    });

    // Bug #354 fix: Store timeout ID and clear on completion
    timeoutId = setTimeout(() => {
      cleanup();
      resolve(data.trim() || undefined);
    }, 100);
  });
}

/**
 * Read JSON from stdin
 */
export async function readStdinJson<T>(): Promise<T | undefined> {
  const data = await readStdin();
  if (!data) return undefined;

  try {
    return JSON.parse(data) as T;
  } catch {
    throw createValidationError('stdin', `invalid JSON format: ${data.slice(0, 100)}...`);
  }
}
