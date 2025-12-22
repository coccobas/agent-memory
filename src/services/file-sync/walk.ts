import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

export async function findAllRuleFiles(dir: string, baseDir: string = dir): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await findAllRuleFiles(fullPath, baseDir);
        files.push(...subFiles);
      } else if (
        entry.isFile() &&
        (extname(entry.name) === '.md' || extname(entry.name) === '.mdc')
      ) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore errors
  }

  return files;
}
