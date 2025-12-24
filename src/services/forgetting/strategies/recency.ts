/**
 * Recency-based Forgetting Strategy
 *
 * Calculates decay score based on time since last access.
 * Score starts at 1.0 at last access and decays to 0 over staleDays.
 */

export interface RecencyConfig {
  staleDays: number;
  threshold: number;
}

/**
 * Calculate recency score for an entry.
 * Score = 1.0 at lastAccess, decays linearly to 0 over staleDays.
 *
 * @param lastAccessedAt - ISO timestamp of last access, or null if never accessed
 * @param createdAt - ISO timestamp of creation (fallback if never accessed)
 * @param staleDays - Number of days until score reaches 0
 * @returns Score between 0 and 1
 */
export function calculateRecencyScore(
  lastAccessedAt: string | null,
  createdAt: string,
  staleDays: number
): number {
  const referenceDate = lastAccessedAt ?? createdAt;
  const daysSince = (Date.now() - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24);

  // Linear decay from 1 to 0 over staleDays
  const score = Math.max(0, 1 - daysSince / staleDays);
  return Math.round(score * 1000) / 1000; // Round to 3 decimal places
}

/**
 * Check if an entry should be forgotten based on recency.
 *
 * @param lastAccessedAt - ISO timestamp of last access
 * @param createdAt - ISO timestamp of creation
 * @param config - Recency configuration
 * @returns true if entry should be forgotten
 */
export function shouldForgetByRecency(
  lastAccessedAt: string | null,
  createdAt: string,
  config: RecencyConfig
): boolean {
  const score = calculateRecencyScore(lastAccessedAt, createdAt, config.staleDays);
  return score < config.threshold;
}

/**
 * Get human-readable reason for recency-based forgetting.
 */
export function getRecencyReason(
  lastAccessedAt: string | null,
  createdAt: string,
  staleDays: number
): string {
  const referenceDate = lastAccessedAt ?? createdAt;
  const daysSince = Math.floor(
    (Date.now() - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  if (lastAccessedAt) {
    return `Not accessed in ${daysSince} days (stale threshold: ${staleDays} days)`;
  }
  return `Never accessed, created ${daysSince} days ago (stale threshold: ${staleDays} days)`;
}
