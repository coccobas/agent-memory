/**
 * Decay Functions for Recency Scoring
 *
 * Provides configurable time-based decay functions for scoring
 * memory entries based on their age.
 */

// =============================================================================
// TYPES
// =============================================================================

export type DecayFunction = 'linear' | 'exponential' | 'step';

// =============================================================================
// DECAY FUNCTIONS
// =============================================================================

/**
 * Linear decay: score decreases linearly with age
 * Returns value between 0-1
 */
export function linearDecay(ageDays: number, windowDays: number): number {
  if (ageDays <= 0) return 1;
  if (ageDays >= windowDays) return 0;
  return 1 - ageDays / windowDays;
}

/**
 * Exponential decay with half-life
 * Returns value between 0-1 (approaches but never reaches 0)
 */
export function exponentialDecay(ageDays: number, halfLifeDays: number): number {
  if (ageDays <= 0) return 1;
  // Formula: 0.5^(age/halfLife) = e^(-ln(2) * age / halfLife)
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Step decay: full score within window, zero outside
 * Returns 1 or 0
 */
export function stepDecay(ageDays: number, windowDays: number): number {
  return ageDays <= windowDays ? 1 : 0;
}

// =============================================================================
// AGE CALCULATION
// =============================================================================

/**
 * Calculate age in days from ISO timestamp
 */
export function calculateAgeDays(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  try {
    const ts = new Date(timestamp).getTime();
    if (Number.isNaN(ts)) return null;
    const ageMs = Math.max(Date.now() - ts, 0);
    return ageMs / (1000 * 60 * 60 * 24);
  } catch {
    return null;
  }
}

// =============================================================================
// RECENCY SCORING
// =============================================================================

/**
 * Compute recency score using configurable decay
 */
export function computeRecencyScore(params: {
  createdAt?: string | null;
  updatedAt?: string | null;
  decayFunction: DecayFunction;
  decayHalfLifeDays: number;
  recencyWeight: number;
  maxBoost: number;
  useUpdatedAt: boolean;
}): number {
  // Use the most recent timestamp (updated or created)
  const timestamp = params.useUpdatedAt && params.updatedAt ? params.updatedAt : params.createdAt;

  const ageDays = calculateAgeDays(timestamp);
  if (ageDays === null) return 0;

  let decayScore: number;
  switch (params.decayFunction) {
    case 'exponential':
      decayScore = exponentialDecay(ageDays, params.decayHalfLifeDays);
      break;
    case 'step':
      decayScore = stepDecay(ageDays, params.decayHalfLifeDays);
      break;
    case 'linear':
    default:
      // For linear, use halfLife * 2 as the window (so halfLife is 50% mark)
      decayScore = linearDecay(ageDays, params.decayHalfLifeDays * 2);
      break;
  }

  return params.maxBoost * params.recencyWeight * decayScore;
}

// =============================================================================
// STALENESS SCORING
// =============================================================================

/**
 * Staleness analysis result
 */
export interface StalenessResult {
  /** Whether the entry is considered stale */
  isStale: boolean;
  /** Reason for staleness (if stale) */
  reason?: 'old_age' | 'low_recency' | 'not_accessed';
  /** Age in days (if available) */
  ageDays?: number;
  /** Recency score (0-1) */
  recencyScore?: number;
  /** Days since last access (if available) */
  daysSinceAccess?: number;
}

/**
 * Calculate staleness score for a memory entry.
 *
 * Staleness is determined by multiple factors:
 * - Age: entries older than staleAgeDays are flagged
 * - Recency score: entries with low recency scores are flagged
 * - Access patterns: entries not accessed recently are flagged
 *
 * @param params - Entry timestamps and thresholds
 * @returns Staleness analysis result
 */
export function calculateStalenessScore(params: {
  /** Entry creation timestamp (ISO) */
  createdAt?: string | null;
  /** Entry last update timestamp (ISO) */
  updatedAt?: string | null;
  /** Entry last access timestamp (ISO) */
  accessedAt?: string | null;
  /** Days after which an entry is considered old */
  staleAgeDays: number;
  /** Recency score threshold (below this is stale) */
  recencyThreshold: number;
  /** Days without access to flag as not accessed */
  notAccessedDays: number;
  /** Decay half-life for recency calculation */
  decayHalfLifeDays?: number;
}): StalenessResult {
  const result: StalenessResult = {
    isStale: false,
  };

  // Use most recent of createdAt/updatedAt for age calculation
  const relevantTimestamp = params.updatedAt ?? params.createdAt;
  const ageDays = calculateAgeDays(relevantTimestamp);

  if (ageDays !== null) {
    result.ageDays = ageDays;

    // Check for old age
    if (ageDays > params.staleAgeDays) {
      result.isStale = true;
      result.reason = 'old_age';
    }
  }

  // Calculate and check recency score
  if (relevantTimestamp && params.decayHalfLifeDays !== undefined) {
    const recencyScore = exponentialDecay(ageDays ?? 0, params.decayHalfLifeDays);
    result.recencyScore = recencyScore;

    if (recencyScore < params.recencyThreshold) {
      result.isStale = true;
      result.reason = result.reason ?? 'low_recency';
    }
  }

  // Check for lack of recent access
  const daysSinceAccess = calculateAgeDays(params.accessedAt);
  if (daysSinceAccess !== null) {
    result.daysSinceAccess = daysSinceAccess;

    if (daysSinceAccess > params.notAccessedDays) {
      result.isStale = true;
      result.reason = result.reason ?? 'not_accessed';
    }
  }

  return result;
}
