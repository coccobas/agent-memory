/**
 * Auto-Tagging Service
 *
 * Automatically infers and attaches relevant tags to memory entries
 * based on content analysis. Uses keyword matching (no LLM needed).
 *
 * Features:
 * - Keyword-based tag inference
 * - Category-based tag inference
 * - Configurable max tags and confidence threshold
 * - Skip if user provides explicit tags
 */

import type { Config } from '../config/index.js';
import type { IEntryTagRepository, ITagRepository } from '../core/interfaces/repositories.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('auto-tagging');

// =============================================================================
// TYPES
// =============================================================================

export type EntryType = 'guideline' | 'knowledge' | 'tool';

export interface TagSuggestion {
  name: string;
  confidence: number;
  source: 'keyword' | 'category' | 'domain';
}

export interface AutoTagResult {
  tags: string[];
  suggestions: TagSuggestion[];
  skipped: boolean;
  reason?: string;
}

export interface IAutoTaggingService {
  /**
   * Infer tags for content
   */
  inferTags(content: string, category?: string): TagSuggestion[];

  /**
   * Apply tags to an entry
   */
  applyTags(
    entryType: EntryType,
    entryId: string,
    content: string,
    options?: {
      category?: string;
      userProvidedTags?: string[];
    }
  ): Promise<AutoTagResult>;
}

// =============================================================================
// TAG KEYWORD DICTIONARIES
// =============================================================================

/**
 * Maps tag names to keywords that trigger them.
 * Keywords are matched case-insensitively.
 */
const TAG_KEYWORDS: Record<string, string[]> = {
  // Languages & Frameworks
  typescript: ['typescript', 'ts', '.ts', '.tsx', 'tsc', 'tsconfig'],
  javascript: ['javascript', 'js', '.js', '.jsx', 'node', 'npm', 'yarn', 'pnpm'],
  python: ['python', 'py', '.py', 'pip', 'pytest', 'django', 'flask', 'fastapi'],
  rust: ['rust', 'cargo', '.rs', 'rustc', 'tokio', 'async-std'],
  go: ['golang', '.go', 'go mod', 'goroutine'],
  react: ['react', 'jsx', 'tsx', 'usestate', 'useeffect', 'component'],
  vue: ['vue', 'vuex', 'pinia', 'nuxt'],
  angular: ['angular', 'ng', '@angular'],

  // Domains
  security: [
    'security',
    'auth',
    'authentication',
    'authorization',
    'password',
    'token',
    'jwt',
    'oauth',
    'secret',
    'encrypt',
    'hash',
    'csrf',
    'xss',
    'sql injection',
  ],
  api: ['api', 'rest', 'graphql', 'endpoint', 'http', 'request', 'response', 'openapi', 'swagger'],
  database: [
    'database',
    'sql',
    'query',
    'postgres',
    'mysql',
    'sqlite',
    'mongodb',
    'redis',
    'orm',
    'migration',
  ],
  testing: [
    'test',
    'spec',
    'coverage',
    'mock',
    'stub',
    'jest',
    'vitest',
    'mocha',
    'pytest',
    'assert',
    'expect',
  ],
  performance: [
    'performance',
    'optimize',
    'fast',
    'slow',
    'latency',
    'cache',
    'memory',
    'cpu',
    'benchmark',
  ],
  devops: [
    'docker',
    'kubernetes',
    'k8s',
    'ci/cd',
    'pipeline',
    'deploy',
    'container',
    'helm',
    'terraform',
  ],
  documentation: ['documentation', 'docs', 'readme', 'jsdoc', 'docstring', 'comment'],

  // Patterns
  architecture: [
    'architecture',
    'design',
    'pattern',
    'solid',
    'clean',
    'layer',
    'module',
    'service',
  ],
  refactoring: ['refactor', 'rename', 'extract', 'inline', 'move', 'cleanup'],
  debugging: ['debug', 'fix', 'bug', 'issue', 'error', 'exception', 'stack trace', 'breakpoint'],
  configuration: ['config', 'configuration', 'settings', 'env', 'environment', 'options'],

  // Workflow
  git: ['git', 'commit', 'branch', 'merge', 'rebase', 'pull request', 'pr'],
  build: ['build', 'compile', 'bundle', 'webpack', 'vite', 'esbuild', 'rollup'],
  lint: ['lint', 'eslint', 'prettier', 'format', 'style'],
};

/**
 * Maps category names to default tags
 */
const CATEGORY_TAGS: Record<string, string[]> = {
  // Guideline categories
  code_style: ['code-style', 'conventions'],
  security: ['security'],
  testing: ['testing'],
  performance: ['performance'],
  workflow: ['workflow'],

  // Knowledge categories
  decision: ['decision'],
  fact: ['architecture'],
  context: ['context'],
  reference: ['reference'],

  // Tool categories
  cli: ['cli', 'tooling'],
  mcp: ['mcp'],
  function: ['function'],
  api: ['api'],
};

// =============================================================================
// IMPLEMENTATION
// =============================================================================

export class AutoTaggingService implements IAutoTaggingService {
  private readonly enabled: boolean;
  private readonly maxTags: number;
  private readonly minConfidence: number;
  private readonly skipIfUserProvided: boolean;

  constructor(
    config: Config,
    private readonly tagRepo: ITagRepository,
    private readonly entryTagRepo: IEntryTagRepository
  ) {
    this.enabled = config.autoTagging?.enabled ?? true;
    this.maxTags = config.autoTagging?.maxTags ?? 3;
    this.minConfidence = config.autoTagging?.minConfidence ?? 0.6;
    this.skipIfUserProvided = config.autoTagging?.skipIfUserProvided ?? true;
  }

  inferTags(content: string, category?: string): TagSuggestion[] {
    const suggestions: TagSuggestion[] = [];
    const lowerContent = content.toLowerCase();
    const contentWords = new Set(lowerContent.split(/\W+/));

    // Keyword matching
    for (const [tagName, keywords] of Object.entries(TAG_KEYWORDS)) {
      let matchCount = 0;
      const matchedKeywords: string[] = [];

      for (const keyword of keywords) {
        // Check for exact word match or substring match for multi-word keywords
        if (keyword.includes(' ')) {
          if (lowerContent.includes(keyword)) {
            matchCount += 2; // Higher weight for phrase matches
            matchedKeywords.push(keyword);
          }
        } else if (contentWords.has(keyword) || lowerContent.includes(keyword)) {
          matchCount++;
          matchedKeywords.push(keyword);
        }
      }

      if (matchCount > 0) {
        // Confidence based on number of matches vs total keywords
        const confidence = Math.min(1, matchCount / Math.max(3, keywords.length * 0.3));
        if (confidence >= this.minConfidence) {
          suggestions.push({
            name: tagName,
            confidence,
            source: 'keyword',
          });
        }
      }
    }

    // Category-based tags
    if (category) {
      const categoryTags = CATEGORY_TAGS[category];
      if (categoryTags) {
        for (const tagName of categoryTags) {
          // Only add if not already suggested with higher confidence
          const existing = suggestions.find((s) => s.name === tagName);
          if (!existing) {
            suggestions.push({
              name: tagName,
              confidence: 0.8, // Category tags get high confidence
              source: 'category',
            });
          }
        }
      }
    }

    // Sort by confidence descending
    suggestions.sort((a, b) => b.confidence - a.confidence);

    return suggestions;
  }

  async applyTags(
    entryType: EntryType,
    entryId: string,
    content: string,
    options?: {
      category?: string;
      userProvidedTags?: string[];
    }
  ): Promise<AutoTagResult> {
    if (!this.enabled) {
      return {
        tags: [],
        suggestions: [],
        skipped: true,
        reason: 'Auto-tagging disabled',
      };
    }

    // Skip if user provided tags and configured to skip
    if (this.skipIfUserProvided && options?.userProvidedTags?.length) {
      return {
        tags: options.userProvidedTags,
        suggestions: [],
        skipped: true,
        reason: 'User provided tags',
      };
    }

    // Infer tags
    const suggestions = this.inferTags(content, options?.category);

    // Take top N tags
    const topSuggestions = suggestions.slice(0, this.maxTags);
    const tagsToApply = topSuggestions.map((s) => s.name);

    // Apply tags
    const appliedTags: string[] = [];
    for (const tagName of tagsToApply) {
      try {
        // Get or create tag
        const tag = await this.tagRepo.getOrCreate(tagName);

        // Attach to entry
        await this.entryTagRepo.attach({
          entryType,
          entryId,
          tagId: tag.id,
        });

        appliedTags.push(tagName);
      } catch (error) {
        logger.warn(
          {
            tagName,
            entryType,
            entryId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to apply tag'
        );
      }
    }

    logger.debug(
      { entryType, entryId, tags: appliedTags, suggestionCount: suggestions.length },
      'Auto-tagging complete'
    );

    return {
      tags: appliedTags,
      suggestions: topSuggestions,
      skipped: false,
    };
  }
}

/**
 * Create an auto-tagging service instance
 */
export function createAutoTaggingService(
  config: Config,
  tagRepo: ITagRepository,
  entryTagRepo: IEntryTagRepository
): IAutoTaggingService {
  return new AutoTaggingService(config, tagRepo, entryTagRepo);
}
