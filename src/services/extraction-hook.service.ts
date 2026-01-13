/**
 * Extraction Hook Service
 *
 * Proactively extracts storable patterns from write operation content.
 * Scans content for knowledge, guidelines, and tool patterns without LLM.
 * Surfaces suggestions in response metadata for user approval.
 *
 * Features:
 * - Pattern-based extraction (no LLM needed for basic detection)
 * - Cooldown to prevent spam
 * - Configurable confidence threshold
 * - Max suggestions per response
 */

import type { Config } from '../config/index.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('extraction-hook');

// =============================================================================
// TYPES
// =============================================================================

export type SuggestedEntryType = 'guideline' | 'knowledge' | 'tool';
export type SuggestedCategory =
  | 'code_style'
  | 'security'
  | 'testing'
  | 'performance'
  | 'workflow'
  | 'decision'
  | 'fact'
  | 'context'
  | 'cli'
  | 'function'
  | 'api';

export interface ExtractionSuggestion {
  /** Suggested entry type */
  type: SuggestedEntryType;
  /** Suggested category */
  category: SuggestedCategory;
  /** Suggested title/name */
  title: string;
  /** Content to store */
  content: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Pattern that triggered this suggestion */
  trigger: string;
  /** Unique hash for deduplication */
  hash: string;
}

export interface ExtractionResult {
  /** Suggestions for user approval */
  suggestions: ExtractionSuggestion[];
  /** Whether scanning was skipped */
  skipped: boolean;
  /** Reason for skipping */
  reason?: string;
}

export interface IExtractionHookService {
  /**
   * Scan content for storable patterns
   */
  scan(content: string, context?: { category?: string }): ExtractionResult;

  /**
   * Check if cooldown is active
   */
  isCooldownActive(): boolean;

  /**
   * Record that scanning occurred (starts cooldown)
   */
  recordScan(): void;
}

// =============================================================================
// EXTRACTION PATTERNS
// =============================================================================

interface ExtractionPattern {
  type: SuggestedEntryType;
  category: SuggestedCategory;
  pattern: RegExp;
  titleExtractor: (match: RegExpMatchArray) => string;
  contentExtractor: (match: RegExpMatchArray, fullText: string) => string;
  confidence: number;
}

/**
 * Patterns for detecting storable content
 */
const EXTRACTION_PATTERNS: ExtractionPattern[] = [
  // Guidelines - rules and standards
  {
    type: 'guideline',
    category: 'code_style',
    pattern: /(?:we\s+)?(always|never|should|must)\s+(.+?)(?:\.|$)/gi,
    titleExtractor: (m) => (m[2] ?? '').substring(0, 50).trim(),
    contentExtractor: (m) => (m[0] ?? '').trim(),
    confidence: 0.85,
  },
  {
    type: 'guideline',
    category: 'code_style',
    pattern: /(?:our\s+)?(?:standard|convention|rule|policy)\s+(?:is\s+)?(?:to\s+)?(.+?)(?:\.|$)/gi,
    titleExtractor: (m) => (m[1] ?? '').substring(0, 50).trim(),
    contentExtractor: (m) => (m[0] ?? '').trim(),
    confidence: 0.80,
  },
  {
    type: 'guideline',
    category: 'workflow',
    pattern: /(?:before|after)\s+(?:you|we)\s+(.+?),\s+(?:you\s+)?(?:should|must|need\s+to)\s+(.+?)(?:\.|$)/gi,
    titleExtractor: (m) => `${(m[1] ?? '').substring(0, 25)} → ${(m[2] ?? '').substring(0, 25)}`.trim(),
    contentExtractor: (m) => (m[0] ?? '').trim(),
    confidence: 0.75,
  },

  // Knowledge - decisions
  {
    type: 'knowledge',
    category: 'decision',
    pattern: /(?:we\s+)?(?:decided|chose|picked|selected|went\s+with)\s+(.+?)\s+(?:because|since|for|due\s+to)\s+(.+?)(?:\.|$)/gi,
    titleExtractor: (m) => (m[1] ?? '').substring(0, 50).trim(),
    contentExtractor: (m) => (m[0] ?? '').trim(),
    confidence: 0.90,
  },
  {
    type: 'knowledge',
    category: 'decision',
    pattern: /(?:the\s+)?reason\s+(?:we|for)\s+(.+?)\s+is\s+(.+?)(?:\.|$)/gi,
    titleExtractor: (m) => (m[1] ?? '').substring(0, 50).trim(),
    contentExtractor: (m) => (m[0] ?? '').trim(),
    confidence: 0.85,
  },

  // Knowledge - facts
  {
    type: 'knowledge',
    category: 'fact',
    pattern: /(?:the\s+)?(?:project|system|app|application|codebase)\s+(?:uses|runs\s+on|is\s+built\s+with)\s+(.+?)(?:\.|$)/gi,
    titleExtractor: (m) => `Uses ${(m[1] ?? '').substring(0, 40)}`.trim(),
    contentExtractor: (m) => (m[0] ?? '').trim(),
    confidence: 0.85,
  },
  {
    type: 'knowledge',
    category: 'fact',
    pattern: /(?:the\s+)?(.+?)\s+(?:is\s+located|lives|can\s+be\s+found)\s+(?:in|at)\s+(.+?)(?:\.|$)/gi,
    titleExtractor: (m) => `${(m[1] ?? '').substring(0, 30)} location`.trim(),
    contentExtractor: (m) => (m[0] ?? '').trim(),
    confidence: 0.75,
  },

  // Tools - CLI commands
  {
    type: 'tool',
    category: 'cli',
    pattern: /(?:run|use|execute)\s+[`'"]?(npm\s+run\s+\w+|npx\s+\w+|yarn\s+\w+|pnpm\s+\w+)[`'"]?/gi,
    titleExtractor: (m) => (m[1] ?? '').trim(),
    contentExtractor: (m) => (m[0] ?? '').trim(),
    confidence: 0.90,
  },
  {
    type: 'tool',
    category: 'cli',
    pattern: /(?:to\s+)?(?:build|test|lint|deploy|start)\s+(?:the\s+)?(?:project|app)?,?\s+(?:run|use)\s+[`'"]?(.+?)[`'"]?(?:\.|$)/gi,
    titleExtractor: (m) => (m[1] ?? '').substring(0, 50).trim(),
    contentExtractor: (m) => (m[0] ?? '').trim(),
    confidence: 0.80,
  },
];

// =============================================================================
// IMPLEMENTATION
// =============================================================================

// Maximum matches per pattern to prevent runaway regex matching (DoS protection)
const MAX_MATCHES_PER_PATTERN = 100;

export class ExtractionHookService implements IExtractionHookService {
  private readonly enabled: boolean;
  private readonly confidenceThreshold: number;
  private readonly maxSuggestions: number;
  private readonly cooldownMs: number;
  private readonly scanOnWriteOps: boolean;
  // Task 64: Using Date.now() is adequate for cooldowns >= 1 second
  // (1ms precision vs typical 5-30 second cooldowns)
  private lastScanTime: number = 0;

  constructor(config: Config) {
    this.enabled = config.extractionHook?.enabled ?? false;
    this.confidenceThreshold = config.extractionHook?.confidenceThreshold ?? 0.8;
    this.maxSuggestions = config.extractionHook?.maxSuggestionsPerResponse ?? 3;
    this.cooldownMs = config.extractionHook?.cooldownMs ?? 5000;
    this.scanOnWriteOps = config.extractionHook?.scanOnWriteOps ?? true;
  }

  scan(content: string, _context?: { category?: string }): ExtractionResult {
    // Check if enabled
    if (!this.enabled) {
      return {
        suggestions: [],
        skipped: true,
        reason: 'Extraction hook disabled',
      };
    }

    // Check if scan on write ops is disabled
    if (!this.scanOnWriteOps) {
      return {
        suggestions: [],
        skipped: true,
        reason: 'Scan on write operations disabled',
      };
    }

    // Check cooldown
    if (this.isCooldownActive()) {
      return {
        suggestions: [],
        skipped: true,
        reason: 'Cooldown active',
      };
    }

    // Skip if content is too short
    if (content.length < 20) {
      return {
        suggestions: [],
        skipped: true,
        reason: 'Content too short',
      };
    }

    const suggestions: ExtractionSuggestion[] = [];
    const seenHashes = new Set<string>();

    // Apply all patterns
    for (const patternDef of EXTRACTION_PATTERNS) {
      // Skip if base confidence is below threshold
      if (patternDef.confidence < this.confidenceThreshold) {
        continue;
      }

      // Reset lastIndex for global regexes
      patternDef.pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      let patternMatchCount = 0;
      while ((match = patternDef.pattern.exec(content)) !== null) {
        // Task 62: Limit matches per pattern to prevent runaway regex on large inputs
        patternMatchCount++;
        if (patternMatchCount > MAX_MATCHES_PER_PATTERN) {
          logger.debug(
            { pattern: patternDef.pattern.source.substring(0, 50), limit: MAX_MATCHES_PER_PATTERN },
            'Pattern match limit reached, skipping remaining matches'
          );
          break;
        }

        const title = patternDef.titleExtractor(match);
        const extractedContent = patternDef.contentExtractor(match, content);

        // Skip empty extractions
        if (!title || !extractedContent || extractedContent.length < 10) {
          continue;
        }

        // Generate hash for deduplication
        const hash = this.hashContent(extractedContent);
        if (seenHashes.has(hash)) {
          continue;
        }
        seenHashes.add(hash);

        suggestions.push({
          type: patternDef.type,
          category: patternDef.category,
          title,
          content: extractedContent,
          confidence: patternDef.confidence,
          trigger: patternDef.pattern.source.substring(0, 50),
          hash,
        });

        // Stop if we have enough suggestions
        if (suggestions.length >= this.maxSuggestions * 2) {
          break;
        }
      }
    }

    // Sort by confidence and take top N
    suggestions.sort((a, b) => b.confidence - a.confidence);
    const topSuggestions = suggestions.slice(0, this.maxSuggestions);

    logger.debug(
      { totalFound: suggestions.length, returned: topSuggestions.length },
      'Extraction scan complete'
    );

    return {
      suggestions: topSuggestions,
      skipped: false,
    };
  }

  isCooldownActive(): boolean {
    if (this.cooldownMs <= 0) {
      return false;
    }
    return Date.now() - this.lastScanTime < this.cooldownMs;
  }

  recordScan(): void {
    this.lastScanTime = Date.now();
  }

  /**
   * FNV-1a hash for content deduplication.
   * Task 60: Improved from djb2 to FNV-1a for better distribution and collision resistance.
   * Includes content length in hash to further reduce collision probability.
   */
  private hashContent(content: string): string {
    const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
    // FNV-1a 32-bit constants
    const FNV_PRIME = 0x01000193;
    const FNV_OFFSET = 0x811c9dc5;

    let hash = FNV_OFFSET;
    for (let i = 0; i < normalized.length; i++) {
      hash ^= normalized.charCodeAt(i);
      // Multiply by FNV prime (use Math.imul for 32-bit multiplication)
      hash = Math.imul(hash, FNV_PRIME);
    }

    // Include length in hash output for additional collision resistance
    const lengthHash = (normalized.length >>> 0).toString(16).padStart(4, '0');
    return `${(hash >>> 0).toString(16)}-${lengthHash}`;
  }
}

/**
 * Create an extraction hook service instance
 */
export function createExtractionHookService(config: Config): IExtractionHookService {
  return new ExtractionHookService(config);
}
