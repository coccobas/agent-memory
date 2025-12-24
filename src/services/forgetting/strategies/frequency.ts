/**
 * Frequency-based Forgetting Strategy
 *
 * Identifies entries with low access counts (LRU/LFU style).
 */

export interface FrequencyConfig {
  minAccessCount: number;
  lookbackDays: number;
}

/**
 * Calculate frequency score based on access count.
 * Higher access count = higher score (more valuable).
 *
 * Uses logarithmic scaling to prevent outliers from dominating.
 *
 * @param accessCount - Number of times entry was accessed
 * @param minAccessCount - Minimum threshold for keeping
 * @returns Score between 0 and 1
 */
export function calculateFrequencyScore(accessCount: number, minAccessCount: number): number {
  if (accessCount <= 0) return 0;
  if (accessCount >= minAccessCount * 10) return 1;

  // Logarithmic scaling: score = log(count + 1) / log(threshold * 10 + 1)
  const score = Math.log(accessCount + 1) / Math.log(minAccessCount * 10 + 1);
  return Math.round(Math.min(1, score) * 1000) / 1000;
}

/**
 * Check if an entry should be forgotten based on frequency.
 *
 * @param accessCount - Number of times entry was accessed
 * @param lastAccessedAt - ISO timestamp of last access
 * @param config - Frequency configuration
 * @returns true if entry should be forgotten
 */
export function shouldForgetByFrequency(
  accessCount: number,
  lastAccessedAt: string | null,
  config: FrequencyConfig
): boolean {
  // Only consider entries that haven't been accessed recently
  if (lastAccessedAt) {
    const daysSinceAccess =
      (Date.now() - new Date(lastAccessedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceAccess < config.lookbackDays) {
      return false; // Recently accessed, don't forget
    }
  }

  return accessCount < config.minAccessCount;
}

/**
 * Get human-readable reason for frequency-based forgetting.
 */
export function getFrequencyReason(accessCount: number, minAccessCount: number): string {
  if (accessCount === 0) {
    return `Never accessed (minimum required: ${minAccessCount})`;
  }
  return `Low access count: ${accessCount} (minimum required: ${minAccessCount})`;
}
