import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { shouldIgnore } from './ignore.js';

/**
 * Recursively find all .md files in a directory.
 */
export async function findMarkdownFiles(
  dir: string,
  ignorePatterns: string[],
  baseDir: string = dir
): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively process subdirectories
        const subFiles = await findMarkdownFiles(fullPath, ignorePatterns, baseDir);
        files.push(...subFiles);
      } else if (entry.isFile() && extname(entry.name) === '.md') {
        // Check if file should be ignored
        if (!shouldIgnore(fullPath, ignorePatterns)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    // Directory might not exist or be inaccessible
    if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
      throw error;
    }
  }

  return files;
}

