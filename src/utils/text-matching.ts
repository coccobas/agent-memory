/**
 * Text Matching Utilities
 *
 * Optimized text matching functions for the query pipeline.
 * Includes:
 * - ReDoS-safe regex validation
 * - LRU cache for compiled regex patterns
 * - Optimized Levenshtein distance (O(min(m,n)) space, early termination)
 * - Fast path for exact matches in fuzzy matching
 */

import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('text-matching');

// =============================================================================
// SECURITY CONSTANTS
// =============================================================================

/**
 * Maximum length for search strings (security limit to prevent DoS).
 */
export const MAX_SEARCH_STRING_LENGTH = 10000;

/**
 * Maximum length for regex patterns (security limit).
 */
export const MAX_REGEX_PATTERN_LENGTH = 500;

/**
 * Maximum number of compiled regex patterns to cache (LRU eviction).
 */
const REGEX_CACHE_MAX_SIZE = 100;

/**
 * Default fuzzy matching threshold (70% similarity required).
 */
const DEFAULT_FUZZY_THRESHOLD = 0.7;

// =============================================================================
// ReDoS PROTECTION
// =============================================================================

/**
 * Dangerous regex patterns that can cause catastrophic backtracking.
 * These are patterns that exhibit exponential time complexity.
 */
const DANGEROUS_PATTERNS = [
  /\([^)]*[+*?]\)[+*?]/, // Nested quantifiers: (x+)+, (x*)+, (x?)*
  /\([^)]*\)\{[^}]*\}[+*?]/, // Quantified groups with trailing quantifier
  /([+*?])\1{2,}/, // Multiple consecutive quantifiers: +++, ***, ???
  /\[[^\]]*\][+*?]\{/, // Character class with quantifier and brace
];

/**
 * Check if a regex pattern is safe from ReDoS attacks.
 *
 * @param pattern - The regex pattern to validate
 * @returns true if the pattern is safe, false if potentially dangerous
 */
export function isSafeRegexPattern(pattern: string): boolean {
  // Length check
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return false;
  }

  // Check for dangerous patterns
  for (const dangerous of DANGEROUS_PATTERNS) {
    if (dangerous.test(pattern)) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// REGEX CACHE (LRU)
// =============================================================================

interface CachedRegex {
  regex: RegExp;
  lastUsed: number;
}

/**
 * LRU cache for compiled RegExp objects.
 */
const regexCache = new Map<string, CachedRegex>();

/**
 * Get or compile a regex pattern with caching.
 * Returns null if pattern is invalid or unsafe.
 *
 * @param pattern - The regex pattern to compile
 * @returns Compiled RegExp or null if invalid/unsafe
 */
function getCachedRegex(pattern: string): RegExp | null {
  // Check cache first
  const cached = regexCache.get(pattern);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.regex;
  }

  // Validate pattern safety
  if (!isSafeRegexPattern(pattern)) {
    return null;
  }

  // Try to compile
  try {
    const regex = new RegExp(pattern, 'i');

    // Evict oldest if at capacity
    if (regexCache.size >= REGEX_CACHE_MAX_SIZE) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [key, value] of regexCache) {
        if (value.lastUsed < oldestTime) {
          oldestTime = value.lastUsed;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        regexCache.delete(oldestKey);
      }
    }

    // Cache and return
    regexCache.set(pattern, { regex, lastUsed: Date.now() });
    return regex;
  } catch {
    return null;
  }
}

/**
 * Clear the regex cache (for testing).
 */
export function clearRegexCache(): void {
  regexCache.clear();
}

/**
 * Get regex cache statistics (for monitoring).
 */
export function getRegexCacheStats(): { size: number; maxSize: number } {
  return {
    size: regexCache.size,
    maxSize: REGEX_CACHE_MAX_SIZE,
  };
}

// =============================================================================
// LEVENSHTEIN DISTANCE (OPTIMIZED)
// =============================================================================

/**
 * Compute Levenshtein distance between two strings.
 *
 * Optimizations:
 * - O(min(m,n)) space instead of O(m*n) using single-row algorithm
 * - Early termination if distance exceeds maxDistance
 * - Ensures shorter string is used for columns (fewer iterations)
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @param maxDistance - Optional maximum distance (enables early termination)
 * @returns Edit distance, or maxDistance+1 if exceeded
 */
export function levenshteinDistance(str1: string, str2: string, maxDistance?: number): number {
  const len1 = str1.length;
  const len2 = str2.length;

  // Early termination: length difference exceeds maxDistance
  if (maxDistance !== undefined && Math.abs(len1 - len2) > maxDistance) {
    return maxDistance + 1;
  }

  // Optimization: ensure str1 is shorter (reduces row size)
  if (len1 > len2) {
    return levenshteinDistance(str2, str1, maxDistance);
  }

  // Handle empty strings
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  // Single-row algorithm: O(min(m,n)) space
  let prevRow: number[] = new Array(len1 + 1);
  let currRow: number[] = new Array(len1 + 1);

  // Initialize first row
  for (let i = 0; i <= len1; i++) {
    prevRow[i] = i;
  }

  for (let j = 1; j <= len2; j++) {
    currRow[0] = j;
    let rowMin = j;

    for (let i = 1; i <= len1; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      currRow[i] = Math.min(
        (prevRow[i] ?? 0) + 1, // deletion
        (currRow[i - 1] ?? 0) + 1, // insertion
        (prevRow[i - 1] ?? 0) + cost // substitution
      );

      if (currRow[i]! < rowMin) {
        rowMin = currRow[i]!;
      }
    }

    // Early termination: minimum possible distance exceeds threshold
    if (maxDistance !== undefined && rowMin > maxDistance) {
      return maxDistance + 1;
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[len1] ?? 0;
}

// =============================================================================
// TEXT MATCHING FUNCTIONS
// =============================================================================

/**
 * Simple case-insensitive substring match.
 *
 * @param text - The text to search in (haystack)
 * @param search - The string to search for (needle)
 * @returns true if search is found in text (case-insensitive)
 */
export function textMatches(text: string | null | undefined, search: string): boolean {
  if (!text) return false;
  return text.toLowerCase().includes(search.toLowerCase());
}

/**
 * Fuzzy text matching using Levenshtein distance.
 *
 * Features:
 * - Fast path: checks for exact substring match first
 * - Threshold-based: requires 70% similarity by default
 * - Early termination: uses maxDistance for efficiency
 *
 * @param text - The text to search in
 * @param search - The string to search for
 * @returns true if text is similar enough to search
 */
export function fuzzyTextMatches(text: string | null | undefined, search: string): boolean {
  if (!text) return false;

  const textLower = text.toLowerCase();
  const searchLower = search.toLowerCase();

  // Fast path: exact substring match
  if (textLower.includes(searchLower)) {
    return true;
  }

  // Calculate maximum allowed distance for threshold
  const maxLen = Math.max(textLower.length, searchLower.length);
  const maxAllowedDistance = Math.floor(maxLen * (1 - DEFAULT_FUZZY_THRESHOLD));

  // Use early termination for efficiency
  const distance = levenshteinDistance(textLower, searchLower, maxAllowedDistance);

  return distance <= maxAllowedDistance;
}

/**
 * Regex text matching with ReDoS protection and caching.
 *
 * Features:
 * - ReDoS validation to prevent catastrophic backtracking
 * - LRU cache for compiled patterns
 * - Length limits for security
 * - Falls back to simple match for unsafe patterns
 *
 * @param text - The text to search in
 * @param pattern - The regex pattern to match
 * @returns true if pattern matches text
 */
export function regexTextMatches(text: string | null | undefined, pattern: string): boolean {
  if (!text) return false;

  // Security: limit text length to prevent DoS
  const limitedText =
    text.length > MAX_SEARCH_STRING_LENGTH ? text.slice(0, MAX_SEARCH_STRING_LENGTH) : text;

  // Try to get cached regex (validates safety internally)
  const regex = getCachedRegex(pattern);

  if (!regex) {
    // Pattern was unsafe or invalid - fall back to simple match
    logger.warn({ pattern }, 'Rejected potentially dangerous regex pattern (ReDoS risk)');
    return limitedText.toLowerCase().includes(pattern.toLowerCase());
  }

  return regex.test(limitedText);
}
