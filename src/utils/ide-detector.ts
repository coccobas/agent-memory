/**
 * IDE Detection Utility
 *
 * Detects IDE from workspace by checking for IDE-specific directories and files
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

export interface IDEDetectionResult {
  ide: string | null;
  confidence: number; // 0-1, higher is more confident
  configPath: string | null;
  detectedPaths: string[];
}

const IDE_SIGNATURES: Array<{
  ide: string;
  paths: string[];
  confidence: number;
}> = [
  {
    ide: 'cursor',
    paths: ['.cursor', '.cursor/rules'],
    confidence: 0.9,
  },
  {
    ide: 'vscode',
    paths: ['.vscode', '.vscode/settings.json', '.vscode/launch.json'],
    confidence: 0.9,
  },
  {
    ide: 'intellij',
    paths: ['.idea', '.idea/workspace.xml', '.idea/modules.xml'],
    confidence: 0.9,
  },
  {
    ide: 'sublime',
    paths: ['.sublime-project', '.sublime-workspace'],
    confidence: 0.8,
  },
  {
    ide: 'neovim',
    paths: ['.nvim', '.config/nvim', 'init.lua', '.config/nvim/init.lua'],
    confidence: 0.8,
  },
  {
    ide: 'emacs',
    paths: ['.emacs.d', '.emacs', '.dir-locals.el'],
    confidence: 0.8,
  },
  {
    ide: 'antigravity',
    paths: ['.antigravity', '.antigravity/rules', '.antigravity/config.json'],
    confidence: 0.9,
  },
];

/**
 * Detect IDE from workspace path
 */
export function detectIDE(workspacePath: string): IDEDetectionResult {
  const resolvedPath = resolve(workspacePath);
  const results: Array<{ ide: string; confidence: number; paths: string[] }> = [];

  // Check for IDE-specific paths
  for (const signature of IDE_SIGNATURES) {
    const foundPaths: string[] = [];
    let foundCount = 0;

    for (const path of signature.paths) {
      const fullPath = join(resolvedPath, path);
      if (existsSync(fullPath)) {
        foundPaths.push(path);
        foundCount++;
      }
    }

    if (foundCount > 0) {
      // Higher confidence if more paths match
      const matchRatio = foundCount / signature.paths.length;
      const confidence = signature.confidence * matchRatio;
      results.push({
        ide: signature.ide,
        confidence,
        paths: foundPaths,
      });
    }
  }

  // Check package.json for IDE hints
  const packageJsonPath = join(resolvedPath, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
        keywords?: string[];
        devDependencies?: Record<string, string>;
      };
      const ideHints: Record<string, string> = {
        cursor: 'cursor',
        vscode: 'vscode',
        'visual-studio-code': 'vscode',
        intellij: 'intellij',
        webstorm: 'intellij',
        pycharm: 'intellij',
        sublime: 'sublime',
        neovim: 'neovim',
        nvim: 'neovim',
        emacs: 'emacs',
        antigravity: 'antigravity',
      };

      // Check keywords
      if (packageJson.keywords && Array.isArray(packageJson.keywords)) {
        for (const keyword of packageJson.keywords) {
          if (typeof keyword === 'string') {
            const lowerKeyword = keyword.toLowerCase();
            const matchedIde = ideHints[lowerKeyword];
            if (matchedIde) {
              results.push({
                ide: matchedIde,
                confidence: 0.5,
                paths: [`package.json keyword: ${keyword}`],
              });
            }
          }
        }
      }

      // Check devDependencies for IDE-specific packages
      if (packageJson.devDependencies && typeof packageJson.devDependencies === 'object') {
        for (const dep of Object.keys(packageJson.devDependencies)) {
          const lowerDep = dep.toLowerCase();
          const matchedIde = ideHints[lowerDep];
          if (matchedIde) {
            results.push({
              ide: matchedIde,
              confidence: 0.6,
              paths: [`package.json devDependency: ${dep}`],
            });
          }
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Check environment variables
  const envHints: Record<string, string> = {
    CURSOR: 'cursor',
    VSCODE: 'vscode',
    INTELLIJ_IDEA: 'intellij',
    WEBSTORM: 'intellij',
    PYCHARM: 'intellij',
    SUBLIME: 'sublime',
    NVIM: 'neovim',
    EMACS: 'emacs',
    ANTIGRAVITY: 'antigravity',
  };

  for (const [envVar, ide] of Object.entries(envHints)) {
    if (process.env[envVar]) {
      results.push({
        ide,
        confidence: 0.4,
        paths: [`Environment variable: ${envVar}`],
      });
    }
  }

  // Find the IDE with highest confidence
  if (results.length === 0) {
    return {
      ide: null,
      confidence: 0,
      configPath: null,
      detectedPaths: [],
    };
  }

  // Sort by confidence (descending)
  results.sort((a, b) => b.confidence - a.confidence);

  // Group by IDE and sum confidences
  const ideGroups = new Map<string, { confidence: number; paths: string[] }>();
  for (const result of results) {
    const existing = ideGroups.get(result.ide);
    if (existing) {
      existing.confidence = Math.min(1.0, existing.confidence + result.confidence * 0.3); // Diminishing returns
      existing.paths.push(...result.paths);
    } else {
      ideGroups.set(result.ide, {
        confidence: result.confidence,
        paths: result.paths,
      });
    }
  }

  // Find best match
  let bestMatch: { ide: string; confidence: number; paths: string[] } | null = null;
  for (const [ide, data] of ideGroups.entries()) {
    if (!bestMatch || data.confidence > bestMatch.confidence) {
      bestMatch = { ide, ...data };
    }
  }

  if (!bestMatch) {
    return {
      ide: null,
      confidence: 0,
      configPath: null,
      detectedPaths: [],
    };
  }

  // Determine config path based on IDE
  let configPath: string | null = null;
  switch (bestMatch.ide) {
    case 'cursor':
      configPath = join(resolvedPath, '.cursor', 'rules');
      break;
    case 'vscode':
      configPath = join(resolvedPath, '.vscode');
      break;
    case 'intellij':
      configPath = join(resolvedPath, '.idea');
      break;
    case 'sublime':
      configPath = join(resolvedPath, '.sublime-project');
      break;
    case 'neovim':
      configPath = join(resolvedPath, '.nvim');
      break;
    case 'emacs':
      configPath = join(resolvedPath, '.emacs.d');
      break;
    case 'antigravity':
      configPath = join(resolvedPath, '.antigravity', 'rules');
      break;
  }

  return {
    ide: bestMatch.ide,
    confidence: Math.min(1.0, bestMatch.confidence),
    configPath: configPath && existsSync(configPath) ? configPath : null,
    detectedPaths: [...new Set(bestMatch.paths)],
  };
}

/**
 * Get list of supported IDEs
 */
export function getSupportedIDEs(): string[] {
  return IDE_SIGNATURES.map((s) => s.ide);
}
