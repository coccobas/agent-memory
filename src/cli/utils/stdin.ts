/**
 * CLI Stdin Utilities
 *
 * Provides utilities for reading from stdin (for bulk operations and piped content).
 */

import { createValidationError } from '../../core/errors.js';

/**
 * Read from stdin (for bulk operations and piped content)
 */
export async function readStdin(): Promise<string | undefined> {
  // Skip if running in TTY with no piped input
  if (process.stdin.isTTY) return undefined;

  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
      let chunk: string | null;
      while ((chunk = process.stdin.read() as string | null) !== null) {
        data += chunk;
      }
    });

    process.stdin.on('end', () => resolve(data.trim() || undefined));

    // Timeout to prevent hanging if no input
    setTimeout(() => resolve(data.trim() || undefined), 100);
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
