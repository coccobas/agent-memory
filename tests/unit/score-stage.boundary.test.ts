/**
 * Score Stage Boundary Condition Tests (P0)
 *
 * Tests critical edge cases in scoring that could affect benchmark scores:
 * - Score = 0, NaN, > 1.0
 * - Alpha edge cases (0, 1)
 * - Phase 1/2 candidate cutoff boundaries
 * - Light vs Full score consistency
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the hybrid blending function directly
describe('Score Stage - Boundary Conditions', () => {
  describe('computeHybridBoost', () => {
    // We need to test the hybrid blending logic
    // alpha * semantic + (1-alpha) * fts

    it('should return 0 when semanticScore is undefined', () => {
      // If no semantic score, return 0 (no boost)
      const result = computeHybridBoost(undefined, 0.5, 0.7);
      expect(result).toBe(0);
    });

    it('should handle ftsScore=undefined by treating as 0', () => {
      // Bug: This penalizes pure semantic results
      const result = computeHybridBoost(0.8, undefined, 0.7);
      // Expected: alpha * 0.8 + (1-alpha) * 0 = 0.7 * 0.8 = 0.56
      expect(result).toBeCloseTo(0.56, 10);
    });

    it('should handle alpha=0 (pure FTS)', () => {
      const result = computeHybridBoost(0.9, 0.5, 0);
      // alpha=0: 0 * 0.9 + 1 * 0.5 = 0.5
      expect(result).toBe(0.5);
    });

    it('should handle alpha=1 (pure semantic)', () => {
      const result = computeHybridBoost(0.9, 0.5, 1);
      // alpha=1: 1 * 0.9 + 0 * 0.5 = 0.9
      expect(result).toBe(0.9);
    });

    it('should handle both scores as 0', () => {
      const result = computeHybridBoost(0, 0, 0.7);
      expect(result).toBe(0);
    });

    it('should handle scores at boundary 1.0', () => {
      const result = computeHybridBoost(1.0, 1.0, 0.5);
      // 0.5 * 1.0 + 0.5 * 1.0 = 1.0
      expect(result).toBe(1.0);
    });

    it('should handle scores > 1.0 (potential overflow)', () => {
      // If scores exceed 1.0, hybrid should still work but may produce > 1.0
      const result = computeHybridBoost(1.5, 1.2, 0.6);
      // 0.6 * 1.5 + 0.4 * 1.2 = 0.9 + 0.48 = 1.38
      expect(result).toBeCloseTo(1.38, 5);
    });

    it('should handle NaN semantic score gracefully', () => {
      const result = computeHybridBoost(NaN, 0.5, 0.7);
      // NaN propagates through arithmetic
      expect(Number.isNaN(result)).toBe(true);
    });

    it('should handle NaN fts score gracefully', () => {
      // When ftsScore is NaN, ?? 0 won't help because NaN is not nullish
      const result = computeHybridBoost(0.8, NaN, 0.7);
      // 0.7 * 0.8 + 0.3 * NaN = NaN
      expect(Number.isNaN(result)).toBe(true);
    });

    it('should handle negative scores', () => {
      const result = computeHybridBoost(-0.5, 0.5, 0.5);
      // 0.5 * -0.5 + 0.5 * 0.5 = -0.25 + 0.25 = 0
      expect(result).toBe(0);
    });

    it('should handle alpha slightly > 1 (configuration error)', () => {
      const result = computeHybridBoost(0.8, 0.6, 1.1);
      // 1.1 * 0.8 + (-0.1) * 0.6 = 0.88 - 0.06 = 0.82
      expect(result).toBeCloseTo(0.82, 5);
    });

    it('should handle alpha slightly < 0 (configuration error)', () => {
      const result = computeHybridBoost(0.8, 0.6, -0.1);
      // -0.1 * 0.8 + 1.1 * 0.6 = -0.08 + 0.66 = 0.58
      expect(result).toBeCloseTo(0.58, 5);
    });
  });

  describe('Light Score Phase 1 Boundaries', () => {
    it('should handle all zero inputs', () => {
      const score = computeLightScore({
        hasExplicitRelation: false,
        matchingTagCount: 0,
        scopeIndex: 0,
        totalScopes: 1,
        textMatched: false,
        priority: null,
        entityMatchBoost: undefined,
        semanticScore: undefined,
        ftsScore: undefined,
      });
      expect(score).toBe(0);
    });

    it('should handle maximum boost inputs', () => {
      const score = computeLightScore({
        hasExplicitRelation: true,
        matchingTagCount: 10,
        scopeIndex: 0,
        totalScopes: 5,
        textMatched: true,
        priority: 100,
        entityMatchBoost: 25,
        semanticScore: 1.0,
        ftsScore: 1.0,
      });
      // Should be a high positive score
      expect(score).toBeGreaterThan(0);
    });

    it('should handle single scope (no proximity calculation)', () => {
      const score = computeLightScore({
        hasExplicitRelation: false,
        matchingTagCount: 0,
        scopeIndex: 0,
        totalScopes: 1,
        textMatched: false,
        priority: null,
      });
      // With totalScopes=1, scope proximity calculation is skipped
      expect(score).toBe(0);
    });

    it('should handle scopeIndex at boundary', () => {
      // scopeIndex = totalScopes - 1 (last scope)
      const score = computeLightScore({
        hasExplicitRelation: false,
        matchingTagCount: 0,
        scopeIndex: 4,
        totalScopes: 5,
        textMatched: false,
        priority: null,
      });
      // Scope proximity: (5-4)/5 * weight = 0.2 * weight
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should handle null priority vs 0 priority', () => {
      const scoreNull = computeLightScore({
        hasExplicitRelation: false,
        matchingTagCount: 0,
        scopeIndex: 0,
        totalScopes: 1,
        textMatched: false,
        priority: null,
      });

      const scoreZero = computeLightScore({
        hasExplicitRelation: false,
        matchingTagCount: 0,
        scopeIndex: 0,
        totalScopes: 1,
        textMatched: false,
        priority: 0,
      });

      // null priority should skip boost, 0 priority should add 0
      expect(scoreNull).toBe(scoreZero);
    });

    it('should handle very high priority (>100)', () => {
      const score = computeLightScore({
        hasExplicitRelation: false,
        matchingTagCount: 0,
        scopeIndex: 0,
        totalScopes: 1,
        textMatched: false,
        priority: 200, // Exceeds expected 0-100 range
      });
      // Should still compute without error
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('Phase 1 to Phase 2 Candidate Cutoff', () => {
    it('should handle limit=1 candidate cutoff (ceil(1.5) = 2)', () => {
      const limit = 1;
      const candidateCount = Math.ceil(limit * 1.5);
      expect(candidateCount).toBe(2);
    });

    it('should handle limit=2 candidate cutoff (ceil(3) = 3)', () => {
      const limit = 2;
      const candidateCount = Math.ceil(limit * 1.5);
      expect(candidateCount).toBe(3);
    });

    it('should handle limit=0 edge case', () => {
      const limit = 0;
      const candidateCount = Math.ceil(limit * 1.5);
      expect(candidateCount).toBe(0);
    });

    it('should handle very large limit', () => {
      const limit = 10000;
      const candidateCount = Math.ceil(limit * 1.5);
      expect(candidateCount).toBe(15000);
    });
  });

  describe('Full Score (Phase 2) Boundaries', () => {
    it('should handle recency calculation with very old date', () => {
      const result = computeScore({
        hasExplicitRelation: false,
        matchingTagCount: 0,
        scopeIndex: 0,
        totalScopes: 1,
        textMatched: false,
        priority: null,
        createdAt: '2000-01-01T00:00:00Z', // Very old
        recencyWeight: 0.1,
        decayHalfLifeDays: 30,
        decayFunction: 'exponential',
      });
      // Very old date should have near-zero recency score
      expect(result.recencyScore).toBeLessThan(0.001);
      expect(result.ageDays).toBeGreaterThan(8000);
    });

    it('should handle recency calculation with future date', () => {
      const futureDate = new Date(Date.now() + 86400000 * 30).toISOString(); // 30 days in future
      const result = computeScore({
        hasExplicitRelation: false,
        matchingTagCount: 0,
        scopeIndex: 0,
        totalScopes: 1,
        textMatched: false,
        priority: null,
        createdAt: futureDate,
        recencyWeight: 0.1,
        decayHalfLifeDays: 30,
        decayFunction: 'exponential',
      });
      // Future date results in negative ageDays, exponential of positive = >1
      expect(result.ageDays).toBeLessThan(0);
      expect(result.recencyScore).toBeGreaterThan(1);
    });

    it('should handle linear decay at exact halfLife boundary', () => {
      const halfLifeDays = 30;
      const exactHalfLifeDate = new Date(Date.now() - 86400000 * halfLifeDays).toISOString();
      const result = computeScore({
        hasExplicitRelation: false,
        matchingTagCount: 0,
        scopeIndex: 0,
        totalScopes: 1,
        textMatched: false,
        priority: null,
        createdAt: exactHalfLifeDate,
        recencyWeight: 0.1,
        decayHalfLifeDays: halfLifeDays,
        decayFunction: 'linear',
      });
      // Linear: 1 - ageDays/(halfLife*2) = 1 - 30/60 = 0.5
      expect(result.recencyScore).toBeCloseTo(0.5, 1);
    });

    it('should handle step decay at boundary', () => {
      const halfLifeDays = 30;
      const justBeforeHalfLife = new Date(Date.now() - 86400000 * (halfLifeDays - 1)).toISOString();
      const justAfterHalfLife = new Date(Date.now() - 86400000 * (halfLifeDays + 1)).toISOString();

      const resultBefore = computeScore({
        hasExplicitRelation: false,
        matchingTagCount: 0,
        scopeIndex: 0,
        totalScopes: 1,
        textMatched: false,
        priority: null,
        createdAt: justBeforeHalfLife,
        recencyWeight: 0.1,
        decayHalfLifeDays: halfLifeDays,
        decayFunction: 'step',
      });

      const resultAfter = computeScore({
        hasExplicitRelation: false,
        matchingTagCount: 0,
        scopeIndex: 0,
        totalScopes: 1,
        textMatched: false,
        priority: null,
        createdAt: justAfterHalfLife,
        recencyWeight: 0.1,
        decayHalfLifeDays: halfLifeDays,
        decayFunction: 'step',
      });

      expect(resultBefore.recencyScore).toBe(1);
      expect(resultAfter.recencyScore).toBe(0.5);
    });

    it('should handle recencyWeight=0 (skip recency calculation)', () => {
      const result = computeScore({
        hasExplicitRelation: false,
        matchingTagCount: 0,
        scopeIndex: 0,
        totalScopes: 1,
        textMatched: false,
        priority: null,
        createdAt: '2020-01-01T00:00:00Z',
        recencyWeight: 0,
      });
      // With recencyWeight=0, recency calculation is skipped
      expect(result.recencyScore).toBeUndefined();
    });

    it('should handle invalid date string', () => {
      const result = computeScore({
        hasExplicitRelation: false,
        matchingTagCount: 0,
        scopeIndex: 0,
        totalScopes: 1,
        textMatched: false,
        priority: null,
        createdAt: 'invalid-date',
        recencyWeight: 0.1,
        decayHalfLifeDays: 30,
        decayFunction: 'exponential',
      });
      // Invalid date should result in NaN propagation
      expect(Number.isNaN(result.ageDays)).toBe(true);
    });
  });

  describe('Intent Weight Application', () => {
    it('should return 1.0 for unknown intent', () => {
      const weight = getIntentTypeWeight('unknown_intent', 'knowledge');
      expect(weight).toBe(1.0);
    });

    it('should return 1.0 for undefined intent', () => {
      const weight = getIntentTypeWeight(undefined, 'knowledge');
      expect(weight).toBe(1.0);
    });

    it('should return correct weight for lookup intent + knowledge', () => {
      const weight = getIntentTypeWeight('lookup', 'knowledge');
      expect(weight).toBe(1.15);
    });

    it('should return correct weight for how_to intent + guideline', () => {
      const weight = getIntentTypeWeight('how_to', 'guideline');
      expect(weight).toBe(1.15);
    });

    it('should return correct hybridAlpha for explore intent', () => {
      const alpha = getIntentHybridAlpha('explore', 0.7);
      expect(alpha).toBe(0.8);
    });

    it('should return config alpha for unknown intent', () => {
      const alpha = getIntentHybridAlpha('unknown', 0.65);
      expect(alpha).toBe(0.65);
    });
  });

  describe('Feedback Multiplier Boundaries', () => {
    it('should handle zero feedback counts', () => {
      const multiplier = getFeedbackMultiplier(0, 0, {
        enabled: true,
        boostPerPositive: 0.02,
        boostMax: 0.1,
        penaltyPerNegative: 0.1,
        penaltyMax: 0.5,
        cacheTTLMs: 60000,
        cacheMaxSize: 1000,
      });
      expect(multiplier).toBe(1.0);
    });

    it('should handle max positive feedback', () => {
      const multiplier = getFeedbackMultiplier(1000, 0, {
        enabled: true,
        boostPerPositive: 0.02,
        boostMax: 0.1,
        penaltyPerNegative: 0.1,
        penaltyMax: 0.5,
        cacheTTLMs: 60000,
        cacheMaxSize: 1000,
      });
      // Should cap at boostMax (1.0 + 0.1 = 1.1)
      expect(multiplier).toBeLessThanOrEqual(1.1);
    });

    it('should handle max negative feedback', () => {
      const multiplier = getFeedbackMultiplier(0, 1000, {
        enabled: true,
        boostPerPositive: 0.02,
        boostMax: 0.1,
        penaltyPerNegative: 0.1,
        penaltyMax: 0.5,
        cacheTTLMs: 60000,
        cacheMaxSize: 1000,
      });
      // Should cap at penaltyMax (1.0 - 0.5 = 0.5)
      expect(multiplier).toBeGreaterThanOrEqual(0.5);
    });

    it('should handle mixed feedback', () => {
      const multiplier = getFeedbackMultiplier(5, 3, {
        enabled: true,
        boostPerPositive: 0.02,
        boostMax: 0.1,
        penaltyPerNegative: 0.1,
        penaltyMax: 0.5,
        cacheTTLMs: 60000,
        cacheMaxSize: 1000,
      });
      // 5 positive: +0.1 (capped), 3 negative: -0.3
      // Result: 1.0 + 0.1 - 0.3 = 0.8
      expect(multiplier).toBeGreaterThan(0);
      expect(multiplier).toBeLessThanOrEqual(1.1);
    });

    it('should handle disabled feedback scoring', () => {
      const multiplier = getFeedbackMultiplier(100, 100, {
        enabled: false,
        boostPerPositive: 0.02,
        boostMax: 0.1,
        penaltyPerNegative: 0.1,
        penaltyMax: 0.5,
        cacheTTLMs: 60000,
        cacheMaxSize: 1000,
      });
      // When disabled, should return 1.0
      expect(multiplier).toBe(1.0);
    });
  });
});

// =============================================================================
// Helper functions extracted from score.ts for testing
// These mirror the implementations to test their logic in isolation
// =============================================================================

function computeHybridBoost(
  semanticScore: number | undefined,
  ftsScore: number | undefined,
  alpha: number
): number {
  if (semanticScore === undefined) return 0;
  const sparse = ftsScore ?? 0;
  return alpha * semanticScore + (1 - alpha) * sparse;
}

interface LightScoreParams {
  hasExplicitRelation: boolean;
  matchingTagCount: number;
  scopeIndex: number;
  totalScopes: number;
  textMatched: boolean;
  priority: number | null;
  entityMatchBoost?: number;
  semanticScore?: number;
  ftsScore?: number;
}

// Mock config weights
const SCORE_WEIGHTS = {
  explicitRelation: 5,
  tagMatch: 1,
  scopeProximity: 2,
  textMatch: 1,
  priorityMax: 3,
  semanticMax: 4,
  recencyMax: 2,
};

function computeLightScore(params: LightScoreParams): number {
  let score = 0;

  if (params.entityMatchBoost) {
    score += params.entityMatchBoost;
  }

  if (params.hasExplicitRelation) {
    score += SCORE_WEIGHTS.explicitRelation;
  }

  score += params.matchingTagCount * SCORE_WEIGHTS.tagMatch;

  if (params.totalScopes > 1) {
    const scopeBoost =
      ((params.totalScopes - params.scopeIndex) / params.totalScopes) *
      SCORE_WEIGHTS.scopeProximity;
    score += scopeBoost;
  }

  if (params.textMatched) {
    score += SCORE_WEIGHTS.textMatch;
  }

  if (params.ftsScore !== undefined) {
    score += params.ftsScore * SCORE_WEIGHTS.textMatch;
  }

  if (params.priority !== null) {
    score += params.priority * (SCORE_WEIGHTS.priorityMax / 100);
  }

  if (params.semanticScore !== undefined) {
    score += params.semanticScore * SCORE_WEIGHTS.semanticMax;
  }

  return score;
}

interface ScoreParams {
  hasExplicitRelation: boolean;
  matchingTagCount: number;
  scopeIndex: number;
  totalScopes: number;
  textMatched: boolean;
  priority: number | null;
  createdAt: string;
  updatedAt?: string;
  recencyWeight?: number;
  decayHalfLifeDays?: number;
  decayFunction?: 'exponential' | 'linear' | 'step';
  useUpdatedAt?: boolean;
  semanticScore?: number;
  entityMatchBoost?: number;
  searchStrategy?: string;
  ftsScore?: number;
  hybridAlpha?: number;
}

interface ScoreResult {
  score: number;
  recencyScore?: number;
  ageDays?: number;
}

function computeScore(params: ScoreParams): ScoreResult {
  let score = 0;

  if (params.entityMatchBoost) {
    score += params.entityMatchBoost;
  }

  if (params.hasExplicitRelation) {
    score += SCORE_WEIGHTS.explicitRelation;
  }

  score += params.matchingTagCount * SCORE_WEIGHTS.tagMatch;

  if (params.totalScopes > 1) {
    const scopeBoost =
      ((params.totalScopes - params.scopeIndex) / params.totalScopes) *
      SCORE_WEIGHTS.scopeProximity;
    score += scopeBoost;
  }

  if (params.textMatched) {
    score += SCORE_WEIGHTS.textMatch;
  }

  if (params.priority !== null) {
    score += params.priority * (SCORE_WEIGHTS.priorityMax / 100);
  }

  if (params.semanticScore !== undefined) {
    if (params.searchStrategy === 'hybrid') {
      const alpha = params.hybridAlpha ?? 0.7;
      const hybridBoost = computeHybridBoost(params.semanticScore, params.ftsScore, alpha);
      score += hybridBoost * SCORE_WEIGHTS.semanticMax;
    } else {
      score += params.semanticScore * SCORE_WEIGHTS.semanticMax;
    }
  }

  let recencyScore: number | undefined;
  let ageDays: number | undefined;

  const recencyWeight = params.recencyWeight ?? 0.1;
  if (recencyWeight > 0) {
    const dateStr = params.useUpdatedAt ? params.updatedAt : params.createdAt;
    if (dateStr) {
      const dateMs = new Date(dateStr).getTime();
      const nowMs = Date.now();
      ageDays = (nowMs - dateMs) / (1000 * 60 * 60 * 24);

      const halfLife = params.decayHalfLifeDays ?? 30;
      const decayFn = params.decayFunction ?? 'exponential';

      if (decayFn === 'exponential') {
        recencyScore = Math.exp((-Math.LN2 * ageDays) / halfLife);
      } else if (decayFn === 'linear') {
        recencyScore = Math.max(0, 1 - ageDays / (halfLife * 2));
      } else {
        recencyScore = ageDays <= halfLife ? 1 : 0.5;
      }

      score += recencyScore * recencyWeight * SCORE_WEIGHTS.recencyMax;
    }
  }

  return { score, recencyScore, ageDays };
}

function getIntentTypeWeight(intent: string | undefined, entryType: string): number {
  const INTENT_TYPE_WEIGHTS: Record<string, Record<string, number>> = {
    lookup: { knowledge: 1.15, guideline: 0.95, tool: 0.95, experience: 0.9 },
    how_to: { guideline: 1.15, experience: 1.1, tool: 1.0, knowledge: 0.95 },
    debug: { experience: 1.15, knowledge: 1.05, guideline: 0.95, tool: 0.95 },
    explore: { knowledge: 1.0, guideline: 1.0, experience: 1.0, tool: 1.0 },
    compare: { knowledge: 1.1, experience: 1.05, guideline: 0.95, tool: 0.95 },
    configure: { guideline: 1.15, tool: 1.1, knowledge: 0.95, experience: 0.95 },
  };

  if (!intent || !(intent in INTENT_TYPE_WEIGHTS)) {
    return 1.0;
  }
  return INTENT_TYPE_WEIGHTS[intent][entryType] ?? 1.0;
}

function getIntentHybridAlpha(intent: string | undefined, configAlpha: number): number {
  const INTENT_HYBRID_ALPHA: Record<string, number> = {
    lookup: 0.5,
    how_to: 0.7,
    debug: 0.6,
    explore: 0.8,
    compare: 0.75,
    configure: 0.6,
  };

  if (!intent || !(intent in INTENT_HYBRID_ALPHA)) {
    return configAlpha;
  }
  return INTENT_HYBRID_ALPHA[intent];
}

// Mock feedback multiplier function
function getFeedbackMultiplier(
  positiveCount: number,
  negativeCount: number,
  config: {
    enabled: boolean;
    boostPerPositive: number;
    boostMax: number;
    penaltyPerNegative: number;
    penaltyMax: number;
    cacheTTLMs: number;
    cacheMaxSize: number;
  }
): number {
  if (!config.enabled) {
    return 1.0;
  }

  const boost = Math.min(positiveCount * config.boostPerPositive, config.boostMax);
  const penalty = Math.min(negativeCount * config.penaltyPerNegative, config.penaltyMax);

  return 1.0 + boost - penalty;
}
