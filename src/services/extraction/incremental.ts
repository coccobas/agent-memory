/**
 * Incremental Memory Extractor
 *
 * Extracts memory entries from conversation windows as they progress,
 * rather than waiting for session end or processing entire context.
 *
 * Features:
 * - Sliding window: Process last N turns with overlap for context
 * - Deduplication: Hash-based detection of already-extracted content
 * - Token budgeting: Respect max token limits for extraction calls
 * - Summary injection: Include previous extraction summaries for continuity
 *
 * @module extraction/incremental
 */

import { createHash } from 'crypto';
import { createComponentLogger } from '../../utils/logger.js';
import type { CaptureStateManager } from '../capture/state.js';
import type { TurnData, ExtractionWindow } from '../capture/types.js';
import type { IExtractionService } from '../../core/context.js';
import type { ExtractedEntry } from '../extraction.service.js';

const logger = createComponentLogger('incremental-extractor');

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for incremental extraction
 */
export interface IncrementalExtractorConfig {
  /** Maximum turns to include in a window (default: 10) */
  windowSize: number;
  /** Number of turns to overlap for context continuity (default: 3) */
  windowOverlap: number;
  /** Minimum tokens to trigger extraction (default: 500) */
  minWindowTokens: number;
  /** Maximum tokens per extraction window (default: 4000) */
  maxWindowTokens: number;
  /** Minimum new turns required to trigger extraction (default: 2) */
  minNewTurns: number;
  /** Whether incremental extraction is enabled (default: true) */
  enabled: boolean;
}

/**
 * Default configuration for incremental extraction
 */
export const DEFAULT_INCREMENTAL_CONFIG: IncrementalExtractorConfig = {
  windowSize: 10,
  windowOverlap: 3,
  minWindowTokens: 500,
  maxWindowTokens: 4000,
  minNewTurns: 2,
  enabled: true,
};

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Result of an incremental extraction
 */
export interface IncrementalExtractionResult {
  /** Extracted entries (deduplicated) */
  entries: ExtractedEntry[];
  /** Number of entries filtered as duplicates */
  duplicatesFiltered: number;
  /** Window that was processed */
  window: ExtractionWindow;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Summary of what was extracted (for next window context) */
  summary: string;
  /** Whether extraction actually ran (vs. skipped due to thresholds) */
  extractionRan: boolean;
}

// =============================================================================
// INCREMENTAL EXTRACTOR
// =============================================================================

/**
 * Incremental memory extractor with sliding window support
 */
export class IncrementalExtractor {
  private config: IncrementalExtractorConfig;
  private stateManager: CaptureStateManager;
  private extractionService: IExtractionService | null;

  constructor(
    stateManager: CaptureStateManager,
    extractionService: IExtractionService | null,
    config?: Partial<IncrementalExtractorConfig>
  ) {
    this.stateManager = stateManager;
    this.extractionService = extractionService;
    this.config = { ...DEFAULT_INCREMENTAL_CONFIG, ...config };
  }

  /**
   * Check if incremental extraction is available
   */
  isAvailable(): boolean {
    return this.config.enabled && this.extractionService?.isAvailable() === true;
  }

  /**
   * Build an extraction window for a session
   *
   * @param sessionId - Session to build window for
   * @returns Extraction window or null if no extraction should run
   */
  buildWindow(sessionId: string): ExtractionWindow | null {
    const state = this.stateManager.getSession(sessionId);
    if (!state) {
      logger.debug({ sessionId }, 'No session state found');
      return null;
    }

    const { transcript, lastExtractionTurnIndex } = state;

    // Calculate window boundaries
    // Start from overlap before last extraction (for context)
    const overlapStart = Math.max(0, lastExtractionTurnIndex - this.config.windowOverlap);

    // Check if we have enough new turns
    const newTurnCount = transcript.length - lastExtractionTurnIndex;
    if (newTurnCount < this.config.minNewTurns) {
      logger.debug(
        { sessionId, newTurnCount, minRequired: this.config.minNewTurns },
        'Not enough new turns for extraction'
      );
      return null;
    }

    // Build window with token budget
    const turns: TurnData[] = [];
    let tokenCount = 0;
    let endIndex = overlapStart;

    for (
      let i = overlapStart;
      i < transcript.length && i < overlapStart + this.config.windowSize;
      i++
    ) {
      const turn = transcript[i];
      if (!turn) {
        continue;
      }
      const turnTokens = turn.tokenCount || this.estimateTokens(turn.content);

      // Stop if we'd exceed token budget
      if (tokenCount + turnTokens > this.config.maxWindowTokens && turns.length > 0) {
        break;
      }

      turns.push(turn);
      tokenCount += turnTokens;
      endIndex = i + 1;
    }

    // Check minimum token threshold
    if (tokenCount < this.config.minWindowTokens) {
      logger.debug(
        { sessionId, tokenCount, minRequired: this.config.minWindowTokens },
        'Not enough tokens for extraction'
      );
      return null;
    }

    return {
      sessionId,
      turns,
      startIndex: overlapStart,
      endIndex,
      tokenCount,
      newTurnCount: Math.max(0, endIndex - lastExtractionTurnIndex),
    };
  }

  /**
   * Run extraction on a window
   *
   * @param window - Extraction window to process
   * @param options - Additional options
   * @returns Extraction result
   */
  async extract(
    window: ExtractionWindow,
    options?: {
      projectId?: string;
      focusAreas?: ('decisions' | 'facts' | 'rules' | 'tools')[];
    }
  ): Promise<IncrementalExtractionResult> {
    const startTime = Date.now();

    // Check if extraction service is available
    if (!this.extractionService?.isAvailable()) {
      logger.debug('Extraction service not available');
      return {
        entries: [],
        duplicatesFiltered: 0,
        window,
        processingTimeMs: Date.now() - startTime,
        summary: '',
        extractionRan: false,
      };
    }

    // Get previous summaries for continuity
    const previousSummaries = this.stateManager.getExtractionSummaries(window.sessionId);
    const summaryPrefix =
      previousSummaries.length > 0
        ? `[Context from previous extraction]\n${previousSummaries.join('\n')}\n\n[Current conversation]\n`
        : '';

    // Build context from window turns (with optional summary prefix)
    const context = summaryPrefix + this.buildContextFromWindow(window);

    // Run extraction
    logger.debug(
      {
        sessionId: window.sessionId,
        turns: window.turns.length,
        tokens: window.tokenCount,
        newTurns: window.newTurnCount,
        hasPreviousSummary: previousSummaries.length > 0,
      },
      'Running incremental extraction'
    );

    const result = await this.extractionService.extract({
      context,
      contextType: 'conversation',
      focusAreas: options?.focusAreas,
    });

    // Deduplicate entries
    const { entries, duplicatesFiltered } = this.deduplicateEntries(
      result.entries,
      window.sessionId
    );

    // Generate summary for next extraction
    const summary = this.generateSummary(entries);

    // Register extracted hashes
    for (const entry of entries) {
      const hash = this.generateContentHash(entry.content);
      this.stateManager.registerExtractedHash(window.sessionId, hash);
    }

    const processingTimeMs = Date.now() - startTime;

    logger.info(
      {
        sessionId: window.sessionId,
        entriesExtracted: entries.length,
        duplicatesFiltered,
        processingTimeMs,
      },
      'Incremental extraction completed'
    );

    return {
      entries,
      duplicatesFiltered,
      window,
      processingTimeMs,
      summary,
      extractionRan: true,
    };
  }

  /**
   * Advance the window after successful extraction
   *
   * @param sessionId - Session ID
   * @param result - Extraction result
   */
  advanceWindow(sessionId: string, result: IncrementalExtractionResult): void {
    if (!result.extractionRan || result.entries.length === 0) {
      // Don't advance if nothing was extracted
      return;
    }

    // Advance to end of processed window
    this.stateManager.advanceExtractionWindow(sessionId, result.window.endIndex);

    // Store summary for context continuity
    if (result.summary) {
      this.stateManager.addExtractionSummary(sessionId, result.summary);
    }

    logger.debug(
      {
        sessionId,
        newIndex: result.window.endIndex,
      },
      'Advanced extraction window'
    );
  }

  /**
   * Run full extraction cycle: build window, extract, advance
   *
   * @param sessionId - Session to process
   * @param options - Extraction options
   * @returns Extraction result or null if no extraction needed
   */
  async extractFromSession(
    sessionId: string,
    options?: {
      projectId?: string;
      focusAreas?: ('decisions' | 'facts' | 'rules' | 'tools')[];
    }
  ): Promise<IncrementalExtractionResult | null> {
    // Build window
    const window = this.buildWindow(sessionId);
    if (!window) {
      return null;
    }

    // Run extraction
    const result = await this.extract(window, options);

    // Advance window on success
    this.advanceWindow(sessionId, result);

    return result;
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Build context string from window turns
   */
  private buildContextFromWindow(window: ExtractionWindow): string {
    const lines: string[] = [];

    for (const turn of window.turns) {
      const role = turn.role.charAt(0).toUpperCase() + turn.role.slice(1);
      lines.push(`${role}: ${turn.content}`);

      if (turn.toolCalls && turn.toolCalls.length > 0) {
        for (const call of turn.toolCalls) {
          lines.push(`  [Tool: ${call.name}] ${call.success ? '✓' : '✗'}`);
        }
      }
    }

    return lines.join('\n\n');
  }

  /**
   * Deduplicate entries against session history
   */
  private deduplicateEntries(
    entries: ExtractedEntry[],
    sessionId: string
  ): { entries: ExtractedEntry[]; duplicatesFiltered: number } {
    const deduplicated: ExtractedEntry[] = [];
    let duplicatesFiltered = 0;

    for (const entry of entries) {
      const hash = this.generateContentHash(entry.content);

      if (this.stateManager.isAlreadyExtracted(sessionId, hash)) {
        duplicatesFiltered++;
        logger.debug({ hash: hash.slice(0, 8), type: entry.type }, 'Filtered duplicate entry');
        continue;
      }

      deduplicated.push(entry);
    }

    return { entries: deduplicated, duplicatesFiltered };
  }

  /**
   * Generate content hash for deduplication
   */
  private generateContentHash(content: string): string {
    // Normalize content before hashing
    const normalized = content
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '');

    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Generate summary of extracted entries for context continuity
   */
  private generateSummary(entries: ExtractedEntry[]): string {
    if (entries.length === 0) {
      return '';
    }

    const summaryParts: string[] = [];

    const byType = new Map<string, string[]>();
    for (const entry of entries) {
      const list = byType.get(entry.type) || [];
      list.push(entry.name || entry.title || entry.content.slice(0, 50));
      byType.set(entry.type, list);
    }

    for (const [type, names] of byType) {
      summaryParts.push(`${type}: ${names.join(', ')}`);
    }

    return `Previously extracted: ${summaryParts.join('; ')}`;
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create an incremental extractor instance
 */
export function createIncrementalExtractor(
  stateManager: CaptureStateManager,
  extractionService: IExtractionService | null,
  config?: Partial<IncrementalExtractorConfig>
): IncrementalExtractor {
  return new IncrementalExtractor(stateManager, extractionService, config);
}
