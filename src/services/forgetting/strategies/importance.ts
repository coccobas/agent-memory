/**
 * Importance-based Forgetting Strategy
 *
 * Calculates importance score based on priority, confidence, and critical flags.
 * Critical guidelines and high-priority entries are protected from forgetting.
 */

export interface ImportanceConfig {
  threshold: number;
  excludeCritical: boolean;
  excludeHighPriority: number;
}

export interface ImportanceInput {
  priority?: number | null;
  confidence?: number | null;
  isCritical?: boolean | null;
  accessCount?: number | null;
  successCount?: number | null;
}

/**
 * Calculate importance score for an entry.
 *
 * Combines multiple signals:
 * - Priority (guidelines): 0-100, normalized to 0-1
 * - Confidence (knowledge/experiences): 0-1
 * - Success rate (experiences): successCount / accessCount
 * - Critical flag (guidelines): +0.3 bonus
 *
 * @param input - Entry metadata
 * @returns Score between 0 and 1
 */
export function calculateImportanceScore(input: ImportanceInput): number {
  let score = 0;
  let factors = 0;

  // Priority (normalized from 0-100 to 0-1)
  if (input.priority != null) {
    score += input.priority / 100;
    factors++;
  }

  // Confidence
  if (input.confidence != null) {
    score += input.confidence;
    factors++;
  }

  // Success rate for experiences
  if (input.accessCount != null && input.accessCount > 0 && input.successCount != null) {
    score += input.successCount / input.accessCount;
    factors++;
  }

  // Base score (average of factors)
  const baseScore = factors > 0 ? score / factors : 0.5;

  // Critical bonus
  const criticalBonus = input.isCritical ? 0.3 : 0;

  return Math.round(Math.min(1, baseScore + criticalBonus) * 1000) / 1000;
}

/**
 * Check if an entry should be protected from forgetting.
 */
export function isProtected(input: ImportanceInput, config: ImportanceConfig): boolean {
  // Critical entries are always protected
  if (config.excludeCritical && input.isCritical) {
    return true;
  }

  // High-priority entries are protected
  if (input.priority != null && input.priority >= config.excludeHighPriority) {
    return true;
  }

  return false;
}

/**
 * Check if an entry should be forgotten based on importance.
 *
 * @param input - Entry metadata
 * @param config - Importance configuration
 * @returns true if entry should be forgotten
 */
export function shouldForgetByImportance(
  input: ImportanceInput,
  config: ImportanceConfig
): boolean {
  if (isProtected(input, config)) {
    return false;
  }

  const score = calculateImportanceScore(input);
  return score < config.threshold;
}

/**
 * Get human-readable reason for importance-based forgetting.
 */
export function getImportanceReason(input: ImportanceInput, threshold: number): string {
  const score = calculateImportanceScore(input);
  const parts: string[] = [];

  if (input.priority != null) {
    parts.push(`priority=${input.priority}`);
  }
  if (input.confidence != null) {
    parts.push(`confidence=${input.confidence}`);
  }
  if (input.accessCount != null && input.successCount != null) {
    const rate = input.accessCount > 0 ? (input.successCount / input.accessCount).toFixed(2) : '0';
    parts.push(`successRate=${rate}`);
  }

  return `Low importance score: ${score.toFixed(3)} (${parts.join(', ')}) < threshold ${threshold}`;
}
