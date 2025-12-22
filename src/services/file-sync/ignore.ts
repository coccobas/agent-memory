import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * Load ignore patterns from .rulesignore file
 */
export function loadIgnorePatterns(projectRoot: string): string[] {
  const ignoreFiles = [
    join(projectRoot, '.rulesignore'),
    join(projectRoot, 'rules', '.rulesignore'),
  ];

  const patterns: string[] = [];

  for (const ignoreFile of ignoreFiles) {
    if (existsSync(ignoreFile)) {
      const content = readFileSync(ignoreFile, 'utf-8');
      const lines = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

      patterns.push(...lines);
    }
  }

  // Default patterns if no ignore file found
  if (patterns.length === 0) {
    return ['README.md', '*.tmp', '*.bak'];
  }

  return patterns;
}

/**
 * Check if a file matches any ignore pattern
 */
export function shouldIgnore(filePath: string, patterns: string[]): boolean {
  const fileName = basename(filePath);
  const relativePath = filePath.replace(/^.*rules\//, '');

  for (const pattern of patterns) {
    // Simple glob pattern matching
    const regex = new RegExp(
      '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );

    if (regex.test(fileName) || regex.test(relativePath)) {
      return true;
    }
  }

  return false;
}
