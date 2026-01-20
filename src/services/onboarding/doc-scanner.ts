/**
 * Doc Scanner Service
 *
 * Scans for documentation files in a project:
 * - README.md
 * - CLAUDE.md (root or .claude/)
 * - .cursorrules
 * - CONTRIBUTING.md
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { ScannedDoc, IDocScannerService } from './types.js';

/**
 * Documentation file signature
 */
interface DocSignature {
  paths: string[]; // Relative paths to check
  type: ScannedDoc['type'];
}

/**
 * All documentation signatures to check
 */
const DOC_SIGNATURES: DocSignature[] = [
  {
    paths: ['README.md', 'readme.md', 'Readme.md'],
    type: 'readme',
  },
  {
    paths: ['CLAUDE.md', '.claude/CLAUDE.md'],
    type: 'claude',
  },
  {
    paths: ['.cursorrules'],
    type: 'cursorrules',
  },
  {
    paths: ['CONTRIBUTING.md', 'contributing.md', 'docs/CONTRIBUTING.md'],
    type: 'contributing',
  },
  {
    paths: ['CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'ARCHITECTURE.md', 'docs/README.md'],
    type: 'other',
  },
];

/**
 * Default max file size to read (100KB)
 */
const DEFAULT_MAX_SIZE_BYTES = 100 * 1024;

/**
 * Doc Scanner Service implementation
 */
export class DocScannerService implements IDocScannerService {
  /**
   * Scan for documentation files in the given directory
   */
  async scanForDocs(cwd: string): Promise<ScannedDoc[]> {
    const docs: ScannedDoc[] = [];

    for (const signature of DOC_SIGNATURES) {
      for (const relativePath of signature.paths) {
        const fullPath = join(cwd, relativePath);

        if (existsSync(fullPath)) {
          try {
            const stats = statSync(fullPath);

            if (stats.isFile()) {
              docs.push({
                path: fullPath,
                filename: basename(fullPath),
                type: signature.type,
                size: stats.size,
              });
              // Only add the first match for each type (except 'other')
              if (signature.type !== 'other') {
                break;
              }
            }
          } catch {
            // Skip files we can't stat (permission issues, etc.)
            continue;
          }
        }
      }
    }

    return docs;
  }

  /**
   * Read the contents of a documentation file
   *
   * @param path Full path to the file
   * @param maxSizeBytes Maximum bytes to read (default 100KB)
   * @returns File content or null if unreadable
   */
  async readDoc(
    path: string,
    maxSizeBytes: number = DEFAULT_MAX_SIZE_BYTES
  ): Promise<string | null> {
    if (!existsSync(path)) {
      return null;
    }

    try {
      const stats = statSync(path);

      if (!stats.isFile()) {
        return null;
      }

      const content = readFileSync(path, 'utf-8');

      // Truncate if too large
      if (content.length > maxSizeBytes) {
        return content.slice(0, maxSizeBytes) + '\n\n[truncated - file exceeds size limit]';
      }

      return content;
    } catch {
      // Read errors
      return null;
    }
  }
}

/**
 * Create a doc scanner service instance
 */
export function createDocScannerService(): IDocScannerService {
  return new DocScannerService();
}
