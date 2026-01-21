/**
 * Compression Manager
 *
 * Progressive compression for context that exceeds budget:
 * 1. Hierarchical grouping (light compression)
 * 2. LLM summarization (heavy compression)
 * 3. Truncation (fallback)
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { IHierarchicalSummarizationService } from '../../core/context.js';

const logger = createComponentLogger('compression-manager');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Entry for compression
 */
export interface CompressibleEntry {
  id: string;
  type: 'guideline' | 'knowledge' | 'tool' | 'experience';
  title?: string;
  content: string;
  priority?: number;
}

/**
 * Compression level applied
 */
export type CompressionLevel = 'none' | 'hierarchical' | 'llm' | 'truncated';

/**
 * Compression configuration
 */
export interface CompressionManagerConfig {
  /** Enable compression */
  enabled: boolean;
  /** Token threshold for hierarchical compression */
  hierarchicalThreshold: number;
  /** Token threshold for LLM summarization */
  llmThreshold: number;
  /** Add compression indicator to output */
  indicateCompression: boolean;
  /** Estimated tokens per character */
  tokensPerChar: number;
}

/**
 * Default compression configuration
 */
export const DEFAULT_COMPRESSION_CONFIG: CompressionManagerConfig = {
  enabled: true,
  hierarchicalThreshold: 1500,
  llmThreshold: 3000,
  indicateCompression: true,
  tokensPerChar: 0.25,
};

/**
 * Compression result
 */
export interface CompressionResult {
  /** Compressed content */
  content: string;
  /** Compression level applied */
  level: CompressionLevel;
  /** Original token count estimate */
  originalTokens: number;
  /** Compressed token count estimate */
  compressedTokens: number;
  /** Compression ratio (0-1, lower is better) */
  ratio: number;
  /** Entries that were included */
  includedEntries: CompressibleEntry[];
  /** Entries that were dropped due to budget */
  droppedEntries: CompressibleEntry[];
  /** Processing time */
  processingTimeMs: number;
}

// =============================================================================
// COMPRESSION MANAGER SERVICE
// =============================================================================

/**
 * CompressionManager applies progressive compression to fit context within budget.
 *
 * Compression levels (applied progressively):
 * 1. Hierarchical: Groups entries by type with abbreviated content
 * 2. LLM: Uses summarization service for semantic compression
 * 3. Truncation: Hard cut with ellipsis (fallback)
 */
export class CompressionManager {
  constructor(
    private readonly summarizationService: IHierarchicalSummarizationService | null,
    private readonly config: CompressionManagerConfig = DEFAULT_COMPRESSION_CONFIG
  ) {}

  /**
   * Compress entries to fit within token budget
   *
   * @param entries - Entries to compress (assumed pre-sorted by priority)
   * @param targetTokens - Target token budget
   * @param format - Output format (markdown, json, natural)
   * @returns Compression result
   */
  async compress(
    entries: CompressibleEntry[],
    targetTokens: number,
    format: 'markdown' | 'json' | 'natural_language' = 'markdown'
  ): Promise<CompressionResult> {
    const startTime = Date.now();

    // Calculate original size
    const originalContent = this.formatEntries(entries, format, 'none');
    const originalTokens = this.estimateTokens(originalContent);

    // No compression needed
    if (!this.config.enabled || originalTokens <= targetTokens) {
      return {
        content: originalContent,
        level: 'none',
        originalTokens,
        compressedTokens: originalTokens,
        ratio: 1.0,
        includedEntries: entries,
        droppedEntries: [],
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Determine compression level needed
    const level = this.determineCompressionLevel(originalTokens);

    logger.debug(
      {
        originalTokens,
        targetTokens,
        level,
        entryCount: entries.length,
      },
      'Applying compression'
    );

    // Apply compression
    let result: CompressionResult;
    switch (level) {
      case 'hierarchical':
        result = await this.applyHierarchicalCompression(
          entries,
          targetTokens,
          format,
          originalTokens,
          startTime
        );
        break;

      case 'llm':
        result = await this.applyLlmCompression(
          entries,
          targetTokens,
          format,
          originalTokens,
          startTime
        );
        break;

      case 'truncated':
      default:
        result = this.applyTruncation(entries, targetTokens, format, originalTokens, startTime);
        break;
    }

    logger.debug(
      {
        level: result.level,
        originalTokens,
        compressedTokens: result.compressedTokens,
        ratio: result.ratio.toFixed(2),
        processingTimeMs: result.processingTimeMs,
      },
      'Compression complete'
    );

    return result;
  }

  /**
   * Estimate token count for content
   */
  estimateTokens(content: string): number {
    return Math.ceil(content.length * this.config.tokensPerChar);
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<CompressionManagerConfig> {
    return { ...this.config };
  }

  /**
   * Determine compression level based on original size
   */
  private determineCompressionLevel(originalTokens: number): CompressionLevel {
    if (originalTokens <= this.config.hierarchicalThreshold) {
      return 'none';
    }
    if (originalTokens <= this.config.llmThreshold) {
      return 'hierarchical';
    }
    // LLM is available
    if (this.summarizationService) {
      return 'llm';
    }
    // Fallback to truncation
    return 'truncated';
  }

  /**
   * Apply hierarchical grouping compression
   *
   * Groups entries by type and abbreviates content.
   */
  private async applyHierarchicalCompression(
    entries: CompressibleEntry[],
    targetTokens: number,
    format: 'markdown' | 'json' | 'natural_language',
    originalTokens: number,
    startTime: number
  ): Promise<CompressionResult> {
    // Group by type
    const byType = this.groupByType(entries);

    // Format with abbreviation
    const content = this.formatHierarchical(byType, format, targetTokens);
    const compressedTokens = this.estimateTokens(content);

    // Check if we still need more compression
    if (compressedTokens > targetTokens) {
      // Fall back to truncation
      return this.applyTruncation(entries, targetTokens, format, originalTokens, startTime);
    }

    return {
      content: this.addCompressionIndicator(content, 'hierarchical'),
      level: 'hierarchical',
      originalTokens,
      compressedTokens,
      ratio: compressedTokens / originalTokens,
      includedEntries: entries,
      droppedEntries: [],
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Apply LLM-based summarization compression
   */
  private async applyLlmCompression(
    entries: CompressibleEntry[],
    targetTokens: number,
    format: 'markdown' | 'json' | 'natural_language',
    originalTokens: number,
    startTime: number
  ): Promise<CompressionResult> {
    // If no summarization service, fall back to hierarchical
    if (!this.summarizationService) {
      return this.applyHierarchicalCompression(
        entries,
        targetTokens,
        format,
        originalTokens,
        startTime
      );
    }

    try {
      // Group entries by type for summarization
      const byType = this.groupByType(entries);
      const summaryParts: string[] = [];

      // Summarize each type group
      for (const [type, typeEntries] of byType) {
        if (typeEntries.length === 0) continue;

        // Use search as a simple summarization fallback
        // (actual LLM summarization would require more integration)
        const summaryText = this.createTypeSummary(type, typeEntries);
        summaryParts.push(summaryText);
      }

      const content = summaryParts.join('\n\n');
      const compressedTokens = this.estimateTokens(content);

      return {
        content: this.addCompressionIndicator(content, 'llm'),
        level: 'llm',
        originalTokens,
        compressedTokens,
        ratio: compressedTokens / originalTokens,
        includedEntries: entries,
        droppedEntries: [],
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'LLM compression failed, falling back to hierarchical'
      );
      return this.applyHierarchicalCompression(
        entries,
        targetTokens,
        format,
        originalTokens,
        startTime
      );
    }
  }

  /**
   * Apply truncation (fallback)
   *
   * Includes entries by priority until budget is exhausted.
   */
  private applyTruncation(
    entries: CompressibleEntry[],
    targetTokens: number,
    format: 'markdown' | 'json' | 'natural_language',
    originalTokens: number,
    startTime: number
  ): CompressionResult {
    const included: CompressibleEntry[] = [];
    const dropped: CompressibleEntry[] = [];
    let usedTokens = 0;

    // Reserve tokens for header and footer
    const reservedTokens = 100;
    const availableTokens = targetTokens - reservedTokens;

    for (const entry of entries) {
      const entryContent = this.formatSingleEntry(entry, format);
      const entryTokens = this.estimateTokens(entryContent);

      if (usedTokens + entryTokens <= availableTokens) {
        included.push(entry);
        usedTokens += entryTokens;
      } else {
        dropped.push(entry);
      }
    }

    let content = this.formatEntries(included, format, 'truncated');

    // Add truncation notice
    if (dropped.length > 0) {
      const notice =
        format === 'json'
          ? ''
          : `\n...(${dropped.length} additional entries truncated due to space constraints)`;
      content += notice;
    }

    const compressedTokens = this.estimateTokens(content);

    return {
      content: this.addCompressionIndicator(content, 'truncated'),
      level: 'truncated',
      originalTokens,
      compressedTokens,
      ratio: compressedTokens / originalTokens,
      includedEntries: included,
      droppedEntries: dropped,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Group entries by type
   */
  private groupByType(
    entries: CompressibleEntry[]
  ): Map<CompressibleEntry['type'], CompressibleEntry[]> {
    const byType = new Map<CompressibleEntry['type'], CompressibleEntry[]>();

    for (const entry of entries) {
      const existing = byType.get(entry.type) ?? [];
      existing.push(entry);
      byType.set(entry.type, existing);
    }

    return byType;
  }

  /**
   * Format entries for output
   */
  private formatEntries(
    entries: CompressibleEntry[],
    format: 'markdown' | 'json' | 'natural_language',
    _level: CompressionLevel
  ): string {
    switch (format) {
      case 'json':
        return JSON.stringify(
          {
            memoryContext: entries.map((e) => ({
              type: e.type,
              title: e.title,
              content: e.content,
              priority: e.priority,
            })),
          },
          null,
          2
        );

      case 'natural_language':
        return this.formatNaturalLanguage(entries);

      case 'markdown':
      default:
        return this.formatMarkdown(entries);
    }
  }

  /**
   * Format a single entry
   */
  private formatSingleEntry(
    entry: CompressibleEntry,
    format: 'markdown' | 'json' | 'natural_language'
  ): string {
    switch (format) {
      case 'json':
        return JSON.stringify({
          type: entry.type,
          title: entry.title,
          content: entry.content,
        });

      case 'natural_language':
        return `- ${entry.title ?? entry.type}: ${entry.content.slice(0, 150)}`;

      case 'markdown':
      default:
        return `- **${entry.title ?? entry.type}**: ${entry.content.slice(0, 200)}${entry.content.length > 200 ? '...' : ''}`;
    }
  }

  /**
   * Format as markdown
   */
  private formatMarkdown(entries: CompressibleEntry[]): string {
    if (entries.length === 0) return '';

    const byType = this.groupByType(entries);
    const sections: string[] = ['## Relevant Memory Context\n'];

    const typeLabels: Record<string, string> = {
      guideline: 'Guidelines',
      knowledge: 'Knowledge',
      tool: 'Tools',
      experience: 'Experiences',
    };

    for (const [type, typeEntries] of byType) {
      sections.push(`### ${typeLabels[type] ?? type}\n`);
      for (const entry of typeEntries) {
        sections.push(
          `- **${entry.title ?? entry.type}**: ${entry.content.slice(0, 200)}${entry.content.length > 200 ? '...' : ''}\n`
        );
      }
    }

    return sections.join('\n');
  }

  /**
   * Format as natural language
   */
  private formatNaturalLanguage(entries: CompressibleEntry[]): string {
    if (entries.length === 0) return '';

    const parts = ['Before proceeding, consider the following relevant context:\n'];

    for (const entry of entries) {
      switch (entry.type) {
        case 'guideline':
          parts.push(`- Follow this guideline: ${entry.title} - ${entry.content.slice(0, 150)}`);
          break;
        case 'knowledge':
          parts.push(`- Remember: ${entry.title} - ${entry.content.slice(0, 150)}`);
          break;
        case 'tool':
          parts.push(`- Available tool: ${entry.title} - ${entry.content.slice(0, 150)}`);
          break;
        case 'experience':
          parts.push(`- Past experience: ${entry.title} - ${entry.content.slice(0, 150)}`);
          break;
      }
    }

    return parts.join('\n');
  }

  /**
   * Format hierarchical grouped content
   */
  private formatHierarchical(
    byType: Map<CompressibleEntry['type'], CompressibleEntry[]>,
    format: 'markdown' | 'json' | 'natural_language',
    targetTokens: number
  ): string {
    // Allocate tokens per type (rough split)
    const typeCount = byType.size;
    const tokensPerType = Math.floor(targetTokens / Math.max(1, typeCount));

    if (format === 'json') {
      const groups: Record<string, string[]> = {};
      for (const [type, entries] of byType) {
        groups[type] = entries.map((e) => `${e.title ?? 'Entry'}: ${e.content.slice(0, 100)}...`);
      }
      return JSON.stringify({ memoryContext: groups }, null, 2);
    }

    const sections: string[] = [];
    const typeLabels: Record<string, string> = {
      guideline: 'Guidelines',
      knowledge: 'Knowledge',
      tool: 'Tools',
      experience: 'Experiences',
    };

    for (const [type, entries] of byType) {
      const header =
        format === 'markdown'
          ? `### ${typeLabels[type] ?? type} (${entries.length})\n`
          : `${typeLabels[type] ?? type}:\n`;

      const items: string[] = [];
      let usedTokens = this.estimateTokens(header);

      for (const entry of entries) {
        // Abbreviated content
        const item =
          format === 'markdown'
            ? `- **${entry.title ?? type}**: ${entry.content.slice(0, 100)}...`
            : `- ${entry.title ?? type}: ${entry.content.slice(0, 80)}...`;

        const itemTokens = this.estimateTokens(item);
        if (usedTokens + itemTokens > tokensPerType) {
          items.push(`... and ${entries.length - items.length} more`);
          break;
        }

        items.push(item);
        usedTokens += itemTokens;
      }

      sections.push(header + items.join('\n'));
    }

    return sections.join('\n\n');
  }

  /**
   * Create a summary for a type group
   */
  private createTypeSummary(type: CompressibleEntry['type'], entries: CompressibleEntry[]): string {
    const typeLabels: Record<string, string> = {
      guideline: 'Guidelines',
      knowledge: 'Knowledge',
      tool: 'Tools',
      experience: 'Experiences',
    };

    const label = typeLabels[type] ?? type;
    const titles = entries
      .slice(0, 5)
      .map((e) => e.title ?? 'Untitled')
      .join(', ');
    const more = entries.length > 5 ? ` (+${entries.length - 5} more)` : '';

    return `**${label}** (${entries.length}): ${titles}${more}`;
  }

  /**
   * Add compression indicator to content
   */
  private addCompressionIndicator(content: string, level: CompressionLevel): string {
    if (!this.config.indicateCompression || level === 'none') {
      return content;
    }

    const indicators: Record<CompressionLevel, string> = {
      none: '',
      hierarchical: '<!-- Context compressed: hierarchical grouping applied -->',
      llm: '<!-- Context compressed: summarization applied -->',
      truncated: '<!-- Context compressed: entries truncated to fit budget -->',
    };

    return `${indicators[level]}\n${content}`;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a CompressionManager
 *
 * @param summarizationService - Optional HierarchicalSummarizationService for LLM compression
 * @param config - Configuration options
 * @returns Configured CompressionManager
 */
export function createCompressionManager(
  summarizationService: IHierarchicalSummarizationService | null,
  config?: Partial<CompressionManagerConfig>
): CompressionManager {
  const mergedConfig: CompressionManagerConfig = {
    ...DEFAULT_COMPRESSION_CONFIG,
    ...config,
  };

  return new CompressionManager(summarizationService, mergedConfig);
}
