/**
 * Project Detector Service
 *
 * Detects project information from:
 * 1. package.json (name, description, version)
 * 2. .git/config (repository name)
 * 3. Directory name (fallback)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { DetectedProjectInfo, IProjectDetectorService } from './types.js';

/**
 * Extract repository name from git remote URL
 */
function extractRepoName(url: string): string | null {
  // Handle SSH URLs: git@github.com:user/repo.git
  const sshMatch = url.match(/git@[^:]+:[\w-]+\/([\w.-]+?)(?:\.git)?$/);
  if (sshMatch?.[1]) {
    return sshMatch[1];
  }

  // Handle HTTPS URLs: https://github.com/user/repo.git
  const httpsMatch = url.match(/https?:\/\/[^/]+\/[\w-]+\/([\w.-]+?)(?:\.git)?$/);
  if (httpsMatch?.[1]) {
    return httpsMatch[1];
  }

  // Handle generic URL ending with repo name
  const genericMatch = url.match(/\/([\w.-]+?)(?:\.git)?$/);
  if (genericMatch?.[1]) {
    return genericMatch[1];
  }

  return null;
}

/**
 * Parse git config file to extract remote origin URL
 */
function parseGitConfig(content: string): string | null {
  const lines = content.split('\n');
  let inOriginSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for [remote "origin"] section
    if (trimmed === '[remote "origin"]') {
      inOriginSection = true;
      continue;
    }

    // Check for another section start
    if (trimmed.startsWith('[') && inOriginSection) {
      break;
    }

    // Extract URL from origin section
    if (inOriginSection && trimmed.startsWith('url =')) {
      const url = trimmed.replace('url =', '').trim();
      return url;
    }
  }

  return null;
}

/**
 * Project Detector Service implementation
 */
export class ProjectDetectorService implements IProjectDetectorService {
  /**
   * Detect project information from the given working directory
   */
  async detectProjectInfo(cwd: string): Promise<DetectedProjectInfo | null> {
    const effectiveCwd = cwd || process.cwd();

    // Try 1: package.json
    const packageJsonPath = join(effectiveCwd, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const content = readFileSync(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(content) as {
          name?: string;
          description?: string;
          version?: string;
        };

        if (pkg.name) {
          return {
            name: pkg.name,
            description: pkg.description,
            version: pkg.version,
            source: 'package.json',
          };
        }
      } catch {
        // JSON parse error or read error - continue to next method
      }
    }

    // Try 2: .git/config
    const gitConfigPath = join(effectiveCwd, '.git', 'config');
    if (existsSync(gitConfigPath)) {
      try {
        const content = readFileSync(gitConfigPath, 'utf-8');
        const url = parseGitConfig(content);

        if (url) {
          const repoName = extractRepoName(url);
          if (repoName) {
            return {
              name: repoName,
              source: 'git',
            };
          }
        }
      } catch {
        // Read error - continue to fallback
      }
    }

    // Fallback: Directory name
    const dirName = basename(effectiveCwd) || 'unnamed-project';
    return {
      name: dirName,
      source: 'directory',
    };
  }
}

/**
 * Create a project detector service instance
 */
export function createProjectDetectorService(): IProjectDetectorService {
  return new ProjectDetectorService();
}
