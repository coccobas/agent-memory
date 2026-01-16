/**
 * Atomicity validation and splitting for extracted entries
 *
 * Ensures extracted entries are atomic (one concept per entry) by:
 * 1. Detecting compound entries using heuristics
 * 2. Automatically splitting compound entries into multiple atomic entries
 *
 * @module extraction/atomicity
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { createComponentLogger } from '../../utils/logger.js';
import type { ExtractedEntry } from '../extraction.service.js';

const logger = createComponentLogger('atomicity');

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface AtomicityConfig {
  enabled: boolean;
  splitMode: 'silent' | 'log' | 'disabled';
  maxSplits: number;
  contentThreshold: number;
}

export interface DetectionResult {
  isCompound: boolean;
  reason?: string;
  splitPoints?: number[]; // Character indices where splits could occur
}

export interface AtomicityResult {
  original: ExtractedEntry;
  isCompound: boolean;
  atomicEntries: ExtractedEntry[];
  splitReason?: string;
}

// =============================================================================
// DETECTION HEURISTICS
// =============================================================================

/**
 * Patterns that indicate compound entries (multiple concepts bundled together)
 */
const COMPOUND_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    // Multiple imperative conjunctions linking distinct rules
    // e.g., "Always use X and never use Y"
    pattern: /\b(always|never|must|should)\b[^.]*\band\b[^.]*\b(always|never|must|should)\b/i,
    reason: 'Multiple imperative rules joined by "and"',
  },
  {
    // Semicolon-separated rules (3+ clauses)
    // e.g., "Use X; avoid Y; prefer Z"
    pattern: /[^;]+;[^;]+;/,
    reason: 'Multiple semicolon-separated statements',
  },
  {
    // "Also"/"Additionally" markers indicating separate concerns
    // e.g., "Do X. Also, do Y"
    pattern: /\.\s*(Also|Additionally|Furthermore)\b/i,
    reason: 'Contains "Also"/"Additionally" indicating separate concern',
  },
  {
    // Multiple imperative sentences
    // e.g., "Always use X. Never do Y."
    pattern: /\b(always|never|must|should)\b[^.]*\.\s*\b(always|never|must|should)\b/i,
    reason: 'Multiple sentences with imperative verbs',
  },
  {
    // "We also decided/chose" patterns in knowledge
    // e.g., "We chose X. We also decided Y."
    pattern: /\.\s*We\s+(also\s+)?(decided|chose|selected|opted|picked)\b/i,
    reason: 'Multiple decisions indicated by "We also decided/chose"',
  },
  {
    // Enumerated list patterns
    // e.g., "1) Do X 2) Do Y" or "a) First thing b) Second thing"
    pattern:
      /(^|\s)(1\)|2\)|a\)|b\)|first[,:]|second[,:]).+(2\)|3\)|b\)|c\)|second[,:]|third[,:])/i,
    reason: 'Enumerated list of items',
  },
];

/**
 * Words that indicate imperative statements (rules/guidelines)
 */
const IMPERATIVE_VERBS = [
  'use',
  'avoid',
  'prefer',
  'always',
  'never',
  'must',
  'should',
  'ensure',
  'do',
  "don't",
  'dont',
];

/**
 * Count the number of distinct imperative verbs in content
 */
function countImperativeVerbs(content: string): number {
  const lowerContent = content.toLowerCase();
  let count = 0;

  for (const verb of IMPERATIVE_VERBS) {
    const regex = new RegExp(`\\b${verb}\\b`, 'gi');
    const matches = lowerContent.match(regex);
    if (matches) {
      count += matches.length;
    }
  }

  return count;
}

/**
 * Count sentence-ending punctuation marks
 */
function countSentences(content: string): number {
  const matches = content.match(/[.!?]+/g);
  return matches ? matches.length : 0;
}

/**
 * Detect if an entry is compound (contains multiple concepts)
 *
 * Uses multiple heuristics:
 * 1. Pattern matching for common compound structures
 * 2. Imperative verb counting (>2 suggests multiple rules)
 * 3. Content length + sentence count (long entries with many sentences)
 */
export function detectCompoundEntry(
  entry: ExtractedEntry,
  contentThreshold: number = 300
): DetectionResult {
  const content = entry.content;

  // Check against compound patterns
  for (const { pattern, reason } of COMPOUND_PATTERNS) {
    if (pattern.test(content)) {
      return { isCompound: true, reason };
    }
  }

  // Check imperative verb count for guidelines
  if (entry.type === 'guideline') {
    const imperativeCount = countImperativeVerbs(content);
    if (imperativeCount > 2) {
      return {
        isCompound: true,
        reason: `Contains ${imperativeCount} imperative verbs (>2 suggests multiple rules)`,
      };
    }
  }

  // For long content, apply stricter checks
  if (content.length > contentThreshold) {
    const sentenceCount = countSentences(content);
    const imperativeCount = countImperativeVerbs(content);

    // Long content with multiple sentences and imperatives is likely compound
    if (sentenceCount >= 3 && imperativeCount >= 2) {
      return {
        isCompound: true,
        reason: `Long content (${content.length} chars) with ${sentenceCount} sentences and ${imperativeCount} imperatives`,
      };
    }
  }

  return { isCompound: false };
}

// =============================================================================
// SPLITTING LOGIC
// =============================================================================

/**
 * Split on semicolons if each part is self-contained
 */
function splitOnSemicolons(content: string): string[] | null {
  if (!content.includes(';')) {
    return null;
  }

  const parts = content
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);

  // Only split if we have 2+ meaningful parts
  if (parts.length >= 2) {
    return parts;
  }

  return null;
}

/**
 * Split on "Also"/"Additionally" markers
 */
function splitOnAlsoMarkers(content: string): string[] | null {
  // Match period followed by Also/Additionally/Furthermore, possibly with comma after
  const alsoPattern = /\.\s*(Also|Additionally|Furthermore)[,]?\s+/i;

  if (!alsoPattern.test(content)) {
    return null;
  }

  const parts = content.split(alsoPattern).filter((p) => {
    // Filter out the marker words themselves and empty strings
    const trimmed = p.trim();
    return trimmed && !/^(Also|Additionally|Furthermore)$/i.test(trimmed);
  });

  if (parts.length >= 2) {
    return parts.map((p) => p.trim());
  }

  return null;
}

/**
 * Split on distinct imperative sentences
 */
function splitOnImperativeSentences(content: string): string[] | null {
  // Split on sentence boundaries
  const sentences = content.split(/(?<=[.!?])\s+/).filter((s) => s.trim());

  if (sentences.length < 2) {
    return null;
  }

  // Check if multiple sentences contain imperative verbs
  const imperativeSentences = sentences.filter((s) => {
    const lowerS = s.toLowerCase();
    return IMPERATIVE_VERBS.some((verb) => new RegExp(`\\b${verb}\\b`, 'i').test(lowerS));
  });

  if (imperativeSentences.length >= 2) {
    return imperativeSentences.map((s) => s.trim());
  }

  return null;
}

/**
 * Split on "We also decided/chose" patterns for knowledge entries
 */
function splitOnDecisionPatterns(content: string): string[] | null {
  const decisionPattern = /\.\s*(We\s+(?:also\s+)?(?:decided|chose|selected|opted|picked)\b)/i;

  if (!decisionPattern.test(content)) {
    return null;
  }

  const parts = content.split(decisionPattern).filter((p) => {
    const trimmed = p.trim();
    // Keep non-empty parts that aren't just the "We decided" phrase
    return trimmed && trimmed.length > 20;
  });

  if (parts.length >= 2) {
    return parts.map((p) => p.trim());
  }

  return null;
}

/**
 * Generate a unique name for a split entry
 */
function generateSplitName(baseName: string, index: number, total: number): string {
  // If total is small, use descriptive suffixes
  if (total <= 3) {
    const suffixes = ['a', 'b', 'c'];
    return `${baseName}-${suffixes[index]}`;
  }
  // Otherwise use numbers
  return `${baseName}-part-${index + 1}`;
}

/**
 * Split a compound guideline into atomic entries
 */
function splitGuideline(entry: ExtractedEntry, maxSplits: number): ExtractedEntry[] {
  const content = entry.content;
  const baseName = entry.name || 'guideline';

  // Try different splitting strategies in order of preference

  // Strategy 1: Split on semicolons
  let parts = splitOnSemicolons(content);
  if (parts && parts.length >= 2 && parts.length <= maxSplits) {
    return parts.map((part, i) => ({
      ...entry,
      name: generateSplitName(baseName, i, parts!.length),
      content: part.endsWith('.') ? part : `${part}.`,
      confidence: entry.confidence * 0.95, // Slight reduction for split entries
    }));
  }

  // Strategy 2: Split on "Also"/"Additionally" markers
  parts = splitOnAlsoMarkers(content);
  if (parts && parts.length >= 2 && parts.length <= maxSplits) {
    return parts.map((part, i) => ({
      ...entry,
      name: generateSplitName(baseName, i, parts!.length),
      content: part.endsWith('.') ? part : `${part}.`,
      confidence: entry.confidence * 0.95,
    }));
  }

  // Strategy 3: Split on imperative sentences
  parts = splitOnImperativeSentences(content);
  if (parts && parts.length >= 2 && parts.length <= maxSplits) {
    return parts.map((part, i) => ({
      ...entry,
      name: generateSplitName(baseName, i, parts.length),
      content: part.endsWith('.') ? part : `${part}.`,
      confidence: entry.confidence * 0.95,
    }));
  }

  // No split possible, return original
  return [entry];
}

/**
 * Split a compound knowledge entry into atomic entries
 */
function splitKnowledge(entry: ExtractedEntry, maxSplits: number): ExtractedEntry[] {
  const content = entry.content;
  const baseTitle = entry.title || 'knowledge';

  // Strategy 1: Split on "We also decided/chose" patterns
  let parts = splitOnDecisionPatterns(content);
  if (parts && parts.length >= 2 && parts.length <= maxSplits) {
    return parts.map((part, i) => ({
      ...entry,
      title: `${baseTitle} (${i + 1})`,
      content: part.endsWith('.') ? part : `${part}.`,
      confidence: entry.confidence * 0.95,
    }));
  }

  // Strategy 2: Split on "Also"/"Additionally" markers
  parts = splitOnAlsoMarkers(content);
  if (parts && parts.length >= 2 && parts.length <= maxSplits) {
    return parts.map((part, i) => ({
      ...entry,
      title: `${baseTitle} (${i + 1})`,
      content: part.endsWith('.') ? part : `${part}.`,
      confidence: entry.confidence * 0.95,
    }));
  }

  // Strategy 3: Split on semicolons (less common for knowledge, but possible)
  parts = splitOnSemicolons(content);
  if (parts && parts.length >= 2 && parts.length <= maxSplits) {
    return parts.map((part, i) => ({
      ...entry,
      title: `${baseTitle} (${i + 1})`,
      content: part.endsWith('.') ? part : `${part}.`,
      confidence: entry.confidence * 0.95,
    }));
  }

  // No split possible, return original
  return [entry];
}

/**
 * Split a compound tool entry into atomic entries
 *
 * Tools are more conservative - we generally keep related subcommands together.
 * Only split if clearly different tools are mentioned.
 */
function splitTool(entry: ExtractedEntry, maxSplits: number): ExtractedEntry[] {
  const content = entry.content;
  const baseName = entry.name || 'tool';

  // Only split on semicolons for tools (most conservative)
  const parts = splitOnSemicolons(content);
  if (parts && parts.length >= 2 && parts.length <= maxSplits) {
    // Additional check: only split if each part looks like a distinct tool/command
    const looksLikeDistinctTools = parts.every((part) => {
      // Check if part starts with a command-like pattern
      return /^(npm|yarn|pnpm|docker|git|make|cargo|pip|go|kubectl|terraform)/i.test(part.trim());
    });

    if (looksLikeDistinctTools) {
      return parts.map((part, i) => ({
        ...entry,
        name: generateSplitName(baseName, i, parts.length),
        content: part,
        confidence: entry.confidence * 0.95,
      }));
    }
  }

  // No split - tools are kept together by default
  return [entry];
}

/**
 * Split a compound entry based on its type
 */
export function splitCompoundEntry(entry: ExtractedEntry, maxSplits: number): ExtractedEntry[] {
  switch (entry.type) {
    case 'guideline':
      return splitGuideline(entry, maxSplits);
    case 'knowledge':
      return splitKnowledge(entry, maxSplits);
    case 'tool':
      return splitTool(entry, maxSplits);
    default:
      return [entry];
  }
}

// =============================================================================
// MAIN ORCHESTRATOR
// =============================================================================

/**
 * Ensure all entries in an array are atomic (one concept per entry)
 *
 * @param entries - Array of extracted entries to validate/split
 * @param atomicityConfig - Configuration for atomicity behavior
 * @returns Array of atomic entries (may be larger than input if splits occurred)
 */
export function ensureAtomicity(
  entries: ExtractedEntry[],
  atomicityConfig: AtomicityConfig
): ExtractedEntry[] {
  if (!atomicityConfig.enabled) {
    return entries;
  }

  const results: ExtractedEntry[] = [];

  for (const entry of entries) {
    const detection = detectCompoundEntry(entry, atomicityConfig.contentThreshold);

    if (!detection.isCompound) {
      // Entry is already atomic
      results.push(entry);
      continue;
    }

    // Entry is compound - handle based on split mode
    if (atomicityConfig.splitMode === 'disabled') {
      // Detection only, no splitting
      logger.debug(
        {
          entry: entry.name || entry.title,
          type: entry.type,
          reason: detection.reason,
        },
        'Compound entry detected (splitting disabled)'
      );
      results.push(entry);
      continue;
    }

    // Split the compound entry
    const atomicEntries = splitCompoundEntry(entry, atomicityConfig.maxSplits);

    if (atomicEntries.length > 1) {
      // Successfully split
      if (atomicityConfig.splitMode === 'log') {
        logger.info(
          {
            originalEntry: entry.name || entry.title,
            type: entry.type,
            splitCount: atomicEntries.length,
            reason: detection.reason,
          },
          'Compound entry split into atomic entries'
        );
      }
      results.push(...atomicEntries);
    } else {
      // Could not split (no valid split points found)
      if (atomicityConfig.splitMode === 'log') {
        logger.debug(
          {
            entry: entry.name || entry.title,
            type: entry.type,
            reason: detection.reason,
          },
          'Compound entry detected but could not be split'
        );
      }
      results.push(entry);
    }
  }

  return results;
}

/**
 * Create atomicity config from the global config
 */
export function createAtomicityConfig(extractionConfig: {
  atomicityEnabled: boolean;
  atomicitySplitMode: 'silent' | 'log' | 'disabled';
  atomicityMaxSplits: number;
  atomicityContentThreshold: number;
}): AtomicityConfig {
  return {
    enabled: extractionConfig.atomicityEnabled,
    splitMode: extractionConfig.atomicitySplitMode,
    maxSplits: extractionConfig.atomicityMaxSplits,
    contentThreshold: extractionConfig.atomicityContentThreshold,
  };
}
