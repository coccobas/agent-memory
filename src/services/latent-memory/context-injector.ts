/**
 * Context Injector Service for Latent Memory
 *
 * Formats retrieved latent memories into structured context suitable for LLM injection.
 * Supports multiple output formats (JSON, Markdown, natural language) with token budget
 * management and tracking of which memories were included.
 *
 * @module services/latent-memory/context-injector
 */

import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('context-injector');

/**
 * Output format options for context injection
 */
export type ContextFormat = 'json' | 'markdown' | 'natural_language';

/**
 * Options for context injection
 */
export interface ContextInjectionOptions {
  /** Output format for the context */
  format: ContextFormat;
  /** Maximum tokens to use for context (soft limit) */
  maxTokens: number;
  /** Maximum number of memories to include */
  maxMemories: number;
  /** Minimum relevance score to include (0-1) */
  minRelevance?: number;
  /** Whether to include similarity scores in output */
  includeScores?: boolean;
  /** Whether to group memories by source type */
  groupByType?: boolean;
}

/**
 * Latent memory with similarity score
 */
export interface LatentMemoryWithScore {
  /** Unique identifier for the memory */
  id: string;
  /** Source type (knowledge, guideline, tool, experience, etc.) */
  sourceType: string;
  /** Source entry ID */
  sourceId: string;
  /** Text preview of the memory content */
  textPreview: string;
  /** Similarity score (0-1, higher is more relevant) */
  similarityScore: number;
}

/**
 * Result of context injection containing formatted content and metadata
 */
export interface InjectedContext {
  /** Formatted context content ready for LLM injection */
  content: string;
  /** Estimated tokens used */
  tokensUsed: number;
  /** Memories that were included in the context */
  memoriesUsed: Array<{
    id: string;
    sourceType: string;
    score: number;
  }>;
}

/**
 * Grouped memories by source type
 */
interface GroupedMemories {
  [sourceType: string]: LatentMemoryWithScore[];
}

/**
 * Default options for context injection
 */
const DEFAULT_OPTIONS: Partial<ContextInjectionOptions> = {
  minRelevance: 0.0,
  includeScores: false,
  groupByType: false,
};

/**
 * Context Injector Service
 *
 * Formats latent memories for LLM context injection with token budget management.
 */
export class ContextInjectorService {
  /**
   * Build formatted context from latent memories
   *
   * @param memories - Array of latent memories with similarity scores
   * @param options - Context injection options
   * @returns Injected context with formatted content and metadata
   *
   * @example
   * ```typescript
   * const context = injector.buildContext(memories, {
   *   format: 'markdown',
   *   maxTokens: 2000,
   *   maxMemories: 10,
   *   minRelevance: 0.7,
   *   includeScores: true
   * });
   * console.log(context.content);
   * console.log(`Used ${context.tokensUsed} tokens from ${context.memoriesUsed.length} memories`);
   * ```
   */
  buildContext(
    memories: LatentMemoryWithScore[],
    options: ContextInjectionOptions
  ): InjectedContext {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    logger.debug(
      {
        totalMemories: memories.length,
        format: opts.format,
        maxTokens: opts.maxTokens,
        maxMemories: opts.maxMemories,
      },
      'Building context from latent memories'
    );

    // Filter by minimum relevance
    let filteredMemories = memories;
    if (opts.minRelevance !== undefined && opts.minRelevance > 0) {
      filteredMemories = memories.filter((m) => m.similarityScore >= opts.minRelevance!);
      logger.debug(
        { filtered: filteredMemories.length, minRelevance: opts.minRelevance },
        'Filtered memories by relevance'
      );
    }

    // Sort by similarity score (highest first)
    filteredMemories.sort((a, b) => b.similarityScore - a.similarityScore);

    // Limit to max memories
    const limitedMemories = filteredMemories.slice(0, opts.maxMemories);

    // Build context respecting token budget
    const result = this.buildContextWithBudget(limitedMemories, opts);

    logger.info(
      {
        memoriesUsed: result.memoriesUsed.length,
        tokensUsed: result.tokensUsed,
        format: opts.format,
      },
      'Context built successfully'
    );

    return result;
  }

  /**
   * Build context while respecting token budget
   *
   * @param memories - Filtered and sorted memories
   * @param options - Context injection options
   * @returns Injected context
   */
  private buildContextWithBudget(
    memories: LatentMemoryWithScore[],
    options: ContextInjectionOptions
  ): InjectedContext {
    const memoriesUsed: Array<{ id: string; sourceType: string; score: number }> = [];
    let currentTokens = 0;
    const selectedMemories: LatentMemoryWithScore[] = [];

    // Select memories that fit within token budget
    for (const memory of memories) {
      const estimatedTokens = this.estimateTokens(memory.textPreview);

      // Check if adding this memory would exceed budget
      if (currentTokens + estimatedTokens > options.maxTokens && selectedMemories.length > 0) {
        logger.debug(
          { currentTokens, estimatedTokens, maxTokens: options.maxTokens },
          'Token budget reached'
        );
        break;
      }

      selectedMemories.push(memory);
      currentTokens += estimatedTokens;
      memoriesUsed.push({
        id: memory.id,
        sourceType: memory.sourceType,
        score: memory.similarityScore,
      });
    }

    // Format based on selected format
    let content: string;
    switch (options.format) {
      case 'json':
        content = this.formatAsJson(selectedMemories, options.includeScores ?? false);
        break;
      case 'markdown':
        content = this.formatAsMarkdown(
          selectedMemories,
          options.includeScores ?? false,
          options.groupByType ?? false
        );
        break;
      case 'natural_language':
        content = this.formatAsNaturalLanguage(selectedMemories);
        break;
      default:
        const exhaustiveCheck: never = options.format;
        throw new Error(`Unsupported format: ${exhaustiveCheck}`);
    }

    // Re-estimate final token count for the formatted content
    const finalTokens = this.estimateTokens(content);

    return {
      content,
      tokensUsed: finalTokens,
      memoriesUsed,
    };
  }

  /**
   * Format memories as JSON
   *
   * @param memories - Memories to format
   * @param includeScores - Whether to include similarity scores
   * @returns JSON-formatted string
   *
   * @example
   * ```json
   * [
   *   {
   *     "type": "knowledge",
   *     "content": "The system uses PostgreSQL for primary storage",
   *     "relevance": 0.85
   *   }
   * ]
   * ```
   */
  formatAsJson(memories: LatentMemoryWithScore[], includeScores: boolean): string {
    const formatted = memories.map((memory) => {
      const obj: Record<string, unknown> = {
        type: memory.sourceType,
        content: memory.textPreview,
      };

      if (includeScores) {
        obj.relevance = Number(memory.similarityScore.toFixed(2));
      }

      return obj;
    });

    return JSON.stringify(formatted, null, 2);
  }

  /**
   * Format memories as Markdown
   *
   * @param memories - Memories to format
   * @param includeScores - Whether to include similarity scores
   * @param groupByType - Whether to group by source type
   * @returns Markdown-formatted string
   *
   * @example
   * ```markdown
   * ## Relevant Context from Memory
   *
   * ### Knowledge (85% relevant)
   * The system uses PostgreSQL for primary storage
   *
   * ### Guideline (82% relevant)
   * Always use strict TypeScript mode with all compiler flags enabled
   * ```
   */
  formatAsMarkdown(
    memories: LatentMemoryWithScore[],
    includeScores: boolean,
    groupByType: boolean
  ): string {
    const lines: string[] = ['## Relevant Context from Memory', ''];

    if (groupByType) {
      const grouped = this.groupMemoriesByType(memories);

      for (const [sourceType, typeMemories] of Object.entries(grouped)) {
        lines.push(`### ${this.capitalizeSourceType(sourceType)}`, '');

        for (const memory of typeMemories) {
          const scoreText = includeScores
            ? ` (${this.formatPercentage(memory.similarityScore)} relevant)`
            : '';
          lines.push(`**${this.capitalizeSourceType(memory.sourceType)}${scoreText}**`);
          lines.push(memory.textPreview);
          lines.push('');
        }
      }
    } else {
      for (const memory of memories) {
        const scoreText = includeScores
          ? ` (${this.formatPercentage(memory.similarityScore)} relevant)`
          : '';
        lines.push(`### ${this.capitalizeSourceType(memory.sourceType)}${scoreText}`);
        lines.push(memory.textPreview);
        lines.push('');
      }
    }

    return lines.join('\n').trim();
  }

  /**
   * Format memories as natural language
   *
   * @param memories - Memories to format
   * @returns Natural language-formatted string
   *
   * @example
   * ```
   * Based on memory, the following context may be relevant:
   *
   * - The system uses PostgreSQL for primary storage
   * - Always use strict TypeScript mode with all compiler flags enabled
   * - Vector embeddings are stored using pgvector extension
   * ```
   */
  formatAsNaturalLanguage(memories: LatentMemoryWithScore[]): string {
    if (memories.length === 0) {
      return 'No relevant context found in memory.';
    }

    const lines: string[] = ['Based on memory, the following context may be relevant:', ''];

    for (const memory of memories) {
      lines.push(`- ${memory.textPreview}`);
    }

    return lines.join('\n');
  }

  /**
   * Estimate token count for text
   *
   * Uses a simple word-based estimation: ~1.3 tokens per word (typical for English).
   * This is a rough approximation - for production use, consider using a proper
   * tokenizer like tiktoken for more accurate counts.
   *
   * @param text - Text to estimate tokens for
   * @returns Estimated token count
   */
  estimateTokens(text: string): number {
    // Split on whitespace and punctuation
    const words = text.split(/\s+/).filter((w) => w.length > 0);

    // Rough estimate: 1.3 tokens per word on average for English text
    // This accounts for subword tokenization in modern tokenizers
    const estimatedTokens = Math.ceil(words.length * 1.3);

    return estimatedTokens;
  }

  /**
   * Group memories by source type
   *
   * @param memories - Memories to group
   * @returns Grouped memories
   */
  private groupMemoriesByType(memories: LatentMemoryWithScore[]): GroupedMemories {
    const grouped: GroupedMemories = {};

    for (const memory of memories) {
      if (!grouped[memory.sourceType]) {
        grouped[memory.sourceType] = [];
      }
      grouped[memory.sourceType]!.push(memory);
    }

    return grouped;
  }

  /**
   * Capitalize source type for display
   *
   * @param sourceType - Source type to capitalize
   * @returns Capitalized source type
   */
  private capitalizeSourceType(sourceType: string): string {
    return sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
  }

  /**
   * Format similarity score as percentage
   *
   * @param score - Similarity score (0-1)
   * @returns Formatted percentage string
   */
  private formatPercentage(score: number): string {
    return `${Math.round(score * 100)}%`;
  }
}

/**
 * Create a new ContextInjectorService instance
 *
 * @returns New ContextInjectorService instance
 */
export function createContextInjector(): ContextInjectorService {
  return new ContextInjectorService();
}
