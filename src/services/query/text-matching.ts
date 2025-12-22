import { DEFAULT_SEMANTIC_THRESHOLD } from '../../utils/constants.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('query');

// Security: Maximum lengths for search inputs to prevent DoS
const MAX_SEARCH_STRING_LENGTH = 10000; // 10KB limit for search strings
const MAX_REGEX_PATTERN_LENGTH = 500; // Limit regex pattern length

/**
 * Check if a regex pattern is safe (no ReDoS potential).
 * Rejects patterns with nested quantifiers that could cause exponential backtracking.
 *
 * Security: Prevents Regular Expression Denial of Service attacks.
 */
export function isSafeRegexPattern(pattern: string): boolean {
  // Check length first
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return false;
  }

  // Detect dangerous patterns: nested quantifiers that cause catastrophic backtracking
  const dangerousPatterns = [
    /\([^)]*[+*?]\)[+*?]/, // Nested quantifiers: (x+)+, (x*)+, (x?)*, etc.
    /\([^)]*\)\{[^}]*\}[+*?]/, // Quantified groups with trailing quantifier
    /([+*?])\1{2,}/, // Multiple consecutive quantifiers: +++, ***, ???
    /\[[^\]]*\][+*?]\{/, // Character class with quantifier and brace
  ];

  for (const dangerous of dangerousPatterns) {
    if (dangerous.test(pattern)) {
      return false;
    }
  }

  return true;
}

export function levenshteinDistance(str1: string, str2: string, maxDistance?: number): number {
  const len1 = str1.length;
  const len2 = str2.length;

  // Early termination: if length difference exceeds maxDistance, no need to compute
  if (maxDistance !== undefined && Math.abs(len1 - len2) > maxDistance) {
    return maxDistance + 1;
  }

  // Optimize by ensuring str1 is the shorter string (reduces matrix columns)
  if (len1 > len2) {
    return levenshteinDistance(str2, str1, maxDistance);
  }

  // Use single row optimization (O(min(m,n)) space instead of O(m×n))
  let prevRow: number[] = Array(len1 + 1)
    .fill(0)
    .map((_, i) => i);
  let currRow: number[] = Array(len1 + 1).fill(0);

  for (let j = 1; j <= len2; j++) {
    currRow[0] = j;
    let rowMin = j; // Track minimum value in current row for early termination

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

    // Early termination: if minimum possible distance exceeds threshold, abort
    if (maxDistance !== undefined && rowMin > maxDistance) {
      return maxDistance + 1;
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[len1] ?? 0;
}

export function fuzzyTextMatches(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;

  const haystackLower = haystack.toLowerCase();
  const needleLower = needle.toLowerCase();

  // First try exact substring match (fast path)
  if (haystackLower.includes(needleLower)) return true;

  // Calculate similarity threshold-based max distance for early termination
  // If similarity >= 0.7 is required, then distance <= 0.3 * maxLen
  const maxLen = Math.max(haystackLower.length, needleLower.length);
  if (maxLen === 0) return true;

  // Calculate max allowed distance for early termination
  const maxAllowedDistance = Math.floor(maxLen * (1 - DEFAULT_SEMANTIC_THRESHOLD));

  // Use early termination optimization
  const distance = levenshteinDistance(haystackLower, needleLower, maxAllowedDistance);

  // If distance exceeds threshold, it returns maxAllowedDistance + 1
  return distance <= maxAllowedDistance;
}

export function regexTextMatches(haystack: string | null | undefined, pattern: string): boolean {
  if (!haystack) return false;

  // Security: Limit haystack length to prevent DoS with very long strings
  const limitedHaystack =
    haystack.length > MAX_SEARCH_STRING_LENGTH
      ? haystack.slice(0, MAX_SEARCH_STRING_LENGTH)
      : haystack;

  // Security: Validate pattern before creating RegExp to prevent ReDoS
  if (!isSafeRegexPattern(pattern)) {
    logger.warn({ pattern }, 'Rejected potentially dangerous regex pattern (ReDoS risk)');
    // Fall back to simple string match for unsafe patterns
    return limitedHaystack.toLowerCase().includes(pattern.toLowerCase());
  }

  try {
    const regex = new RegExp(pattern, 'i'); // Case-insensitive
    return regex.test(limitedHaystack);
  } catch {
    // Invalid regex, fall back to simple match
    return limitedHaystack.toLowerCase().includes(pattern.toLowerCase());
  }
}

export function textMatches(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
