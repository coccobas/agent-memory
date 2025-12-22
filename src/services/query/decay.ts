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
