/**
 * Unit tests for recency/decay scoring functions
 */

import { describe, it, expect } from 'vitest';
import {
  linearDecay,
  exponentialDecay,
  stepDecay,
  computeRecencyScore,
  type DecayFunction,
} from '../../src/services/query.service.js';

describe('Decay Functions', () => {
  describe('linearDecay', () => {
    it('returns 1 for age 0', () => {
      expect(linearDecay(0, 30)).toBe(1);
    });

    it('returns 0.5 at half the window', () => {
      expect(linearDecay(15, 30)).toBe(0.5);
    });

    it('returns 0 at window boundary', () => {
      expect(linearDecay(30, 30)).toBe(0);
    });

    it('returns 0 for age beyond window', () => {
      expect(linearDecay(60, 30)).toBe(0);
    });

    it('handles negative age as 1', () => {
      expect(linearDecay(-5, 30)).toBe(1);
    });

    it('decreases linearly with age', () => {
      const score10 = linearDecay(10, 30);
      const score20 = linearDecay(20, 30);
      // Difference should be consistent (linear)
      expect(score10 - score20).toBeCloseTo(10 / 30, 5);
    });
  });

  describe('exponentialDecay', () => {
    it('returns 1 for age 0', () => {
      expect(exponentialDecay(0, 14)).toBe(1);
    });

    it('returns ~0.5 for age equal to half-life', () => {
      expect(exponentialDecay(14, 14)).toBeCloseTo(0.5, 5);
    });

    it('returns ~0.25 for age equal to 2x half-life', () => {
      expect(exponentialDecay(28, 14)).toBeCloseTo(0.25, 5);
    });

    it('returns ~0.125 for age equal to 3x half-life', () => {
      expect(exponentialDecay(42, 14)).toBeCloseTo(0.125, 5);
    });

    it('approaches but never reaches 0', () => {
      // Even at 10x half-life, should still be positive
      const score = exponentialDecay(140, 14);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(0.001);
    });

    it('handles negative age as 1', () => {
      expect(exponentialDecay(-5, 14)).toBe(1);
    });

    it('different half-lives produce different decay rates', () => {
      const shortHalfLife = exponentialDecay(7, 7);
      const longHalfLife = exponentialDecay(7, 14);
      expect(shortHalfLife).toBeLessThan(longHalfLife);
    });
  });

  describe('stepDecay', () => {
    it('returns 1 for age 0', () => {
      expect(stepDecay(0, 30)).toBe(1);
    });

    it('returns 1 for age within window', () => {
      expect(stepDecay(15, 30)).toBe(1);
      expect(stepDecay(29, 30)).toBe(1);
    });

    it('returns 1 at window boundary', () => {
      expect(stepDecay(30, 30)).toBe(1);
    });

    it('returns 0 for age beyond window', () => {
      expect(stepDecay(31, 30)).toBe(0);
      expect(stepDecay(100, 30)).toBe(0);
    });
  });
});

describe('computeRecencyScore', () => {
  const baseParams = {
    decayFunction: 'exponential' as DecayFunction,
    decayHalfLifeDays: 14,
    recencyWeight: 0.5,
    maxBoost: 2.0,
    useUpdatedAt: true,
  };

  it('returns 0 when no timestamps provided', () => {
    const score = computeRecencyScore({
      ...baseParams,
      createdAt: null,
      updatedAt: null,
    });
    expect(score).toBe(0);
  });

  it('returns 0 when timestamps are undefined', () => {
    const score = computeRecencyScore({
      ...baseParams,
      createdAt: undefined,
      updatedAt: undefined,
    });
    expect(score).toBe(0);
  });

  it('uses createdAt when updatedAt not available', () => {
    const now = new Date();
    const score = computeRecencyScore({
      ...baseParams,
      createdAt: now.toISOString(),
      updatedAt: null,
    });
    // Should be max (recencyWeight * maxBoost * 1.0) = 0.5 * 2.0 * 1.0 = 1.0
    expect(score).toBeCloseTo(1.0, 2);
  });

  it('prefers updatedAt over createdAt when useUpdatedAt is true', () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    const score = computeRecencyScore({
      ...baseParams,
      useUpdatedAt: true,
      createdAt: oldDate.toISOString(),
      updatedAt: now.toISOString(),
    });
    // Should use now (updatedAt), not oldDate
    expect(score).toBeCloseTo(1.0, 2);
  });

  it('uses createdAt when useUpdatedAt is false', () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 days ago (half-life)

    const score = computeRecencyScore({
      ...baseParams,
      useUpdatedAt: false,
      createdAt: oldDate.toISOString(),
      updatedAt: now.toISOString(),
    });
    // Should use oldDate (createdAt), which is at half-life
    // Score = 0.5 * 2.0 * 0.5 = 0.5
    expect(score).toBeCloseTo(0.5, 2);
  });

  it('respects recencyWeight parameter', () => {
    const now = new Date();

    const lowWeight = computeRecencyScore({
      ...baseParams,
      recencyWeight: 0.2,
      createdAt: now.toISOString(),
    });

    const highWeight = computeRecencyScore({
      ...baseParams,
      recencyWeight: 0.8,
      createdAt: now.toISOString(),
    });

    expect(highWeight).toBeGreaterThan(lowWeight);
    expect(lowWeight).toBeCloseTo(0.4, 2); // 0.2 * 2.0 * 1.0
    expect(highWeight).toBeCloseTo(1.6, 2); // 0.8 * 2.0 * 1.0
  });

  it('respects maxBoost parameter', () => {
    const now = new Date();

    const lowBoost = computeRecencyScore({
      ...baseParams,
      maxBoost: 1.0,
      createdAt: now.toISOString(),
    });

    const highBoost = computeRecencyScore({
      ...baseParams,
      maxBoost: 3.0,
      createdAt: now.toISOString(),
    });

    expect(highBoost).toBeGreaterThan(lowBoost);
    expect(lowBoost).toBeCloseTo(0.5, 2); // 0.5 * 1.0 * 1.0
    expect(highBoost).toBeCloseTo(1.5, 2); // 0.5 * 3.0 * 1.0
  });

  it('uses linear decay function when specified', () => {
    const now = new Date();
    // 14 days ago (half of 28-day window for linear)
    const halfWindow = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const score = computeRecencyScore({
      ...baseParams,
      decayFunction: 'linear',
      decayHalfLifeDays: 14, // Linear uses halfLife * 2 as window
      createdAt: halfWindow.toISOString(),
    });

    // At 14 days with 28-day window, linear decay = 0.5
    // Score = 0.5 * 2.0 * 0.5 = 0.5
    expect(score).toBeCloseTo(0.5, 2);
  });

  it('uses step decay function when specified', () => {
    const now = new Date();

    // Within window
    const withinWindow = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const withinScore = computeRecencyScore({
      ...baseParams,
      decayFunction: 'step',
      decayHalfLifeDays: 14,
      createdAt: withinWindow.toISOString(),
    });
    expect(withinScore).toBeCloseTo(1.0, 2); // Full score

    // Beyond window
    const beyondWindow = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
    const beyondScore = computeRecencyScore({
      ...baseParams,
      decayFunction: 'step',
      decayHalfLifeDays: 14,
      createdAt: beyondWindow.toISOString(),
    });
    expect(beyondScore).toBe(0); // No score
  });

  it('handles invalid date strings gracefully', () => {
    const score = computeRecencyScore({
      ...baseParams,
      createdAt: 'not-a-date',
      updatedAt: null,
    });
    expect(score).toBe(0);
  });
});
