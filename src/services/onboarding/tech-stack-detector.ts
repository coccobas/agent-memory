/**
 * Tech Stack Detector Service
 *
 * Detects languages, frameworks, runtimes, and tools from:
 * - package.json (dependencies, devDependencies)
 * - Config files (tsconfig.json, Cargo.toml, etc.)
 * - Language-specific files (requirements.txt, go.mod)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TechStackInfo, TechStackItem, ITechStackDetectorService } from './types.js';

/**
 * Detection signature for a tech stack item
 */
interface DetectionSignature {
  name: string;
  category: TechStackItem['category'];
  signals: Array<{
    type: 'file' | 'dependency' | 'devDependency';
    pattern: string;
    confidence: number;
  }>;
}

/**
 * All detection signatures
 */
const DETECTION_SIGNATURES: DetectionSignature[] = [
  // Languages
  {
    name: 'TypeScript',
    category: 'language',
    signals: [
      { type: 'file', pattern: 'tsconfig.json', confidence: 0.9 },
      { type: 'devDependency', pattern: 'typescript', confidence: 0.85 },
    ],
  },
  {
    name: 'JavaScript',
    category: 'language',
    signals: [
      { type: 'file', pattern: 'package.json', confidence: 0.6 },
      { type: 'file', pattern: 'jsconfig.json', confidence: 0.8 },
    ],
  },
  {
    name: 'Python',
    category: 'language',
    signals: [
      { type: 'file', pattern: 'requirements.txt', confidence: 0.9 },
      { type: 'file', pattern: 'pyproject.toml', confidence: 0.9 },
      { type: 'file', pattern: 'setup.py', confidence: 0.8 },
      { type: 'file', pattern: 'Pipfile', confidence: 0.85 },
    ],
  },
  {
    name: 'Rust',
    category: 'language',
    signals: [{ type: 'file', pattern: 'Cargo.toml', confidence: 0.95 }],
  },
  {
    name: 'Go',
    category: 'language',
    signals: [{ type: 'file', pattern: 'go.mod', confidence: 0.95 }],
  },
  {
    name: 'Ruby',
    category: 'language',
    signals: [
      { type: 'file', pattern: 'Gemfile', confidence: 0.9 },
      { type: 'file', pattern: '.ruby-version', confidence: 0.8 },
    ],
  },
  {
    name: 'Java',
    category: 'language',
    signals: [
      { type: 'file', pattern: 'pom.xml', confidence: 0.9 },
      { type: 'file', pattern: 'build.gradle', confidence: 0.9 },
    ],
  },

  // Frameworks
  {
    name: 'React',
    category: 'framework',
    signals: [
      { type: 'dependency', pattern: 'react', confidence: 0.95 },
      { type: 'dependency', pattern: 'react-dom', confidence: 0.85 },
    ],
  },
  {
    name: 'Vue',
    category: 'framework',
    signals: [{ type: 'dependency', pattern: 'vue', confidence: 0.95 }],
  },
  {
    name: 'Angular',
    category: 'framework',
    signals: [{ type: 'dependency', pattern: '@angular/core', confidence: 0.95 }],
  },
  {
    name: 'Next.js',
    category: 'framework',
    signals: [{ type: 'dependency', pattern: 'next', confidence: 0.95 }],
  },
  {
    name: 'Svelte',
    category: 'framework',
    signals: [{ type: 'dependency', pattern: 'svelte', confidence: 0.95 }],
  },
  {
    name: 'Express',
    category: 'framework',
    signals: [{ type: 'dependency', pattern: 'express', confidence: 0.9 }],
  },
  {
    name: 'Fastify',
    category: 'framework',
    signals: [{ type: 'dependency', pattern: 'fastify', confidence: 0.9 }],
  },
  {
    name: 'NestJS',
    category: 'framework',
    signals: [{ type: 'dependency', pattern: '@nestjs/core', confidence: 0.95 }],
  },

  // Runtimes
  {
    name: 'Node.js',
    category: 'runtime',
    signals: [
      { type: 'file', pattern: 'package.json', confidence: 0.7 },
      { type: 'file', pattern: '.nvmrc', confidence: 0.85 },
      { type: 'file', pattern: '.node-version', confidence: 0.85 },
    ],
  },
  {
    name: 'Deno',
    category: 'runtime',
    signals: [
      { type: 'file', pattern: 'deno.json', confidence: 0.95 },
      { type: 'file', pattern: 'deno.jsonc', confidence: 0.95 },
    ],
  },
  {
    name: 'Bun',
    category: 'runtime',
    signals: [{ type: 'file', pattern: 'bun.lockb', confidence: 0.95 }],
  },

  // Tools
  {
    name: 'Jest',
    category: 'tool',
    signals: [
      { type: 'devDependency', pattern: 'jest', confidence: 0.9 },
      { type: 'file', pattern: 'jest.config.js', confidence: 0.85 },
      { type: 'file', pattern: 'jest.config.ts', confidence: 0.85 },
    ],
  },
  {
    name: 'Vitest',
    category: 'tool',
    signals: [
      { type: 'devDependency', pattern: 'vitest', confidence: 0.9 },
      { type: 'file', pattern: 'vitest.config.ts', confidence: 0.85 },
    ],
  },
  {
    name: 'ESLint',
    category: 'tool',
    signals: [
      { type: 'devDependency', pattern: 'eslint', confidence: 0.9 },
      { type: 'file', pattern: '.eslintrc', confidence: 0.8 },
      { type: 'file', pattern: '.eslintrc.js', confidence: 0.8 },
      { type: 'file', pattern: '.eslintrc.json', confidence: 0.8 },
      { type: 'file', pattern: 'eslint.config.js', confidence: 0.85 },
    ],
  },
  {
    name: 'Prettier',
    category: 'tool',
    signals: [
      { type: 'devDependency', pattern: 'prettier', confidence: 0.9 },
      { type: 'file', pattern: '.prettierrc', confidence: 0.85 },
      { type: 'file', pattern: 'prettier.config.js', confidence: 0.85 },
    ],
  },
  {
    name: 'Docker',
    category: 'tool',
    signals: [
      { type: 'file', pattern: 'Dockerfile', confidence: 0.9 },
      { type: 'file', pattern: 'docker-compose.yml', confidence: 0.85 },
      { type: 'file', pattern: 'docker-compose.yaml', confidence: 0.85 },
    ],
  },
  {
    name: 'Playwright',
    category: 'tool',
    signals: [
      { type: 'devDependency', pattern: '@playwright/test', confidence: 0.95 },
      { type: 'devDependency', pattern: 'playwright', confidence: 0.85 },
    ],
  },
  {
    name: 'Cypress',
    category: 'tool',
    signals: [{ type: 'devDependency', pattern: 'cypress', confidence: 0.9 }],
  },
];

/**
 * Tech Stack Detector Service implementation
 */
export class TechStackDetectorService implements ITechStackDetectorService {
  /**
   * Detect tech stack from the given working directory
   */
  async detectTechStack(cwd: string): Promise<TechStackInfo> {
    const result: TechStackInfo = {
      languages: [],
      frameworks: [],
      runtimes: [],
      tools: [],
    };

    // Parse package.json if exists
    let packageJson: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      engines?: Record<string, string>;
    } | null = null;

    const packageJsonPath = join(cwd, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const content = readFileSync(packageJsonPath, 'utf-8');
        packageJson = JSON.parse(content) as typeof packageJson;
      } catch {
        // JSON parse error - continue without package.json data
      }
    }

    // Check each signature
    for (const signature of DETECTION_SIGNATURES) {
      const detectedSignals: Array<{ source: string; confidence: number }> = [];

      for (const signal of signature.signals) {
        if (signal.type === 'file') {
          const filePath = join(cwd, signal.pattern);
          if (existsSync(filePath)) {
            detectedSignals.push({
              source: signal.pattern,
              confidence: signal.confidence,
            });
          }
        } else if (signal.type === 'dependency' && packageJson?.dependencies) {
          if (signal.pattern in packageJson.dependencies) {
            detectedSignals.push({
              source: `package.json dependencies (${signal.pattern})`,
              confidence: signal.confidence,
            });
          }
        } else if (signal.type === 'devDependency' && packageJson?.devDependencies) {
          if (signal.pattern in packageJson.devDependencies) {
            detectedSignals.push({
              source: `package.json devDependencies (${signal.pattern})`,
              confidence: signal.confidence,
            });
          }
        }
      }

      // If we found any signals, add the item
      if (detectedSignals.length > 0) {
        // Take the highest confidence signal
        const bestSignal = detectedSignals.reduce((best, current) =>
          current.confidence > best.confidence ? current : best
        );

        const item: TechStackItem = {
          name: signature.name,
          category: signature.category,
          confidence: Math.min(1, bestSignal.confidence),
          source: bestSignal.source,
        };

        // Add to appropriate category array
        switch (signature.category) {
          case 'language':
            result.languages.push(item);
            break;
          case 'framework':
            result.frameworks.push(item);
            break;
          case 'runtime':
            result.runtimes.push(item);
            break;
          case 'tool':
            result.tools.push(item);
            break;
        }
      }
    }

    // Sort each category by confidence (highest first)
    result.languages.sort((a, b) => b.confidence - a.confidence);
    result.frameworks.sort((a, b) => b.confidence - a.confidence);
    result.runtimes.sort((a, b) => b.confidence - a.confidence);
    result.tools.sort((a, b) => b.confidence - a.confidence);

    return result;
  }
}

/**
 * Create a tech stack detector service instance
 */
export function createTechStackDetectorService(): ITechStackDetectorService {
  return new TechStackDetectorService();
}
