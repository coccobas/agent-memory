/**
 * Unit tests for Quality Gate
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QualityGate,
  DEFAULT_QUALITY_THRESHOLDS,
  type QualityDisposition,
  type QualityThresholds,
} from '../../src/services/librarian/pipeline/quality-gate.js';
import type { PatternGroup } from '../../src/services/librarian/pipeline/pattern-detector.js';
import type { ExperienceWithVersion } from '../../src/db/repositories/experiences.js';
import type { ExperienceTrajectoryStep } from '../../src/db/schema/experiences.js';

// Helper to create mock experience
function createMockExperience(options: {
  id?: string;
  content?: string;
  scenario?: string;
  outcome?: string | null;  // null = explicitly no outcome
  confidence?: number;
}): ExperienceWithVersion {
  return {
    id: options.id ?? 'exp-1',
    title: 'Test Experience',
    level: 'case',
    scopeType: 'project',
    scopeId: 'proj-1',
    isActive: true,
    currentVersionId: 'v-1',
    useCount: 1,
    successCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentVersion: {
      id: 'v-1',
      experienceId: options.id ?? 'exp-1',
      version: 1,
      content: options.content ?? 'This is test content that should be long enough to pass quality checks.',
      scenario: options.scenario ?? 'A typical scenario description.',
      // Use null to explicitly indicate no outcome; undefined uses default
      outcome: options.outcome === null ? undefined : (options.outcome ?? 'Successful resolution'),
      confidence: options.confidence ?? 0.8,
      createdAt: new Date().toISOString(),
    },
  };
}

// Helper to create mock trajectory
function createMockTrajectory(length: number): ExperienceTrajectoryStep[] {
  return Array.from({ length }, (_, i) => ({
    id: `step-${i}`,
    experienceId: 'exp-1',
    stepOrder: i,
    action: `Action ${i + 1}`,
    observation: `Observation ${i + 1}`,
    success: true,
    createdAt: new Date().toISOString(),
  }));
}

// Helper to create mock pattern group
function createMockPattern(options: {
  confidence?: number;
  memberCount?: number;
  outcomeType?: 'success' | 'failure' | 'mixed' | 'none';
  contentQuality?: 'high' | 'low';
  trajectoryLength?: number;
}): PatternGroup {
  const {
    confidence = 0.85,
    memberCount = 3,
    outcomeType = 'success',
    contentQuality = 'high',
    trajectoryLength = 3,
  } = options;

  const outcome = outcomeType === 'success' ? 'Successfully resolved the issue'
    : outcomeType === 'failure' ? 'Failed to resolve'
    : outcomeType === 'mixed' ? 'Partial success'
    : null;  // Use null to signal no outcome

  const content = contentQuality === 'high'
    ? 'This is a detailed content description that explains the experience fully and thoroughly.'
    : 'Short';

  const scenario = contentQuality === 'high'
    ? 'A well-documented scenario with full context.'
    : 'Short';

  const trajectory = createMockTrajectory(trajectoryLength);

  const exemplar = {
    experience: createMockExperience({ id: 'exp-0', content, scenario, outcome }),
    trajectory,
  };

  const experiences = Array.from({ length: memberCount }, (_, i) => ({
    experience: createMockExperience({
      id: `exp-${i}`,
      outcome: outcomeType === 'mixed' && i % 2 === 0 ? 'Failed attempt' : outcome,
    }),
    trajectory: createMockTrajectory(trajectoryLength),
  }));

  return {
    id: 'pattern-1',
    experiences,
    exemplar,
    confidence,
    embeddingSimilarity: confidence,
    trajectorySimilarity: confidence,
    createdAt: new Date().toISOString(),
  };
}

describe('Quality Gate', () => {
  let qualityGate: QualityGate;

  beforeEach(() => {
    qualityGate = new QualityGate();
  });

  describe('constructor', () => {
    it('should use default thresholds when none provided', () => {
      const gate = new QualityGate();
      const thresholds = gate.getThresholds();

      expect(thresholds.autoPromoteThreshold).toBe(DEFAULT_QUALITY_THRESHOLDS.autoPromoteThreshold);
      expect(thresholds.reviewThreshold).toBe(DEFAULT_QUALITY_THRESHOLDS.reviewThreshold);
      expect(thresholds.minPatternSize).toBe(DEFAULT_QUALITY_THRESHOLDS.minPatternSize);
    });

    it('should merge custom thresholds with defaults', () => {
      const gate = new QualityGate({ autoPromoteThreshold: 0.95 });
      const thresholds = gate.getThresholds();

      expect(thresholds.autoPromoteThreshold).toBe(0.95);
      expect(thresholds.reviewThreshold).toBe(DEFAULT_QUALITY_THRESHOLDS.reviewThreshold);
    });
  });

  describe('evaluate', () => {
    it('should auto-promote high confidence patterns', () => {
      const pattern = createMockPattern({
        confidence: 0.95,
        memberCount: 5,
        outcomeType: 'success',
        contentQuality: 'high',
      });

      const result = qualityGate.evaluate(pattern);

      expect(result.disposition).toBe('auto_promote');
      expect(result.adjustedConfidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should queue for review mid-confidence patterns', () => {
      const pattern = createMockPattern({
        confidence: 0.75,
        memberCount: 3,
        outcomeType: 'success',
        contentQuality: 'high',
      });

      const result = qualityGate.evaluate(pattern);

      expect(result.disposition).toBe('review');
      expect(result.adjustedConfidence).toBeGreaterThanOrEqual(0.7);
      expect(result.adjustedConfidence).toBeLessThan(0.9);
    });

    it('should reject low confidence patterns', () => {
      const pattern = createMockPattern({
        confidence: 0.5,
        memberCount: 3,
        outcomeType: 'failure',
        contentQuality: 'low',
      });

      const result = qualityGate.evaluate(pattern);

      expect(result.disposition).toBe('reject');
    });

    it('should reject patterns with insufficient size', () => {
      const pattern = createMockPattern({
        confidence: 0.9,
        memberCount: 1, // Too small
        outcomeType: 'success',
        contentQuality: 'high',
      });

      const result = qualityGate.evaluate(pattern);

      expect(result.disposition).toBe('reject');
      expect(result.reason).toContain('pattern_size');
    });

    it('should include all quality checks in result', () => {
      const pattern = createMockPattern({
        confidence: 0.8,
        memberCount: 3,
      });

      const result = qualityGate.evaluate(pattern);

      expect(result.checks).toHaveLength(4);
      expect(result.checks.map(c => c.name)).toContain('similarity');
      expect(result.checks.map(c => c.name)).toContain('pattern_size');
      expect(result.checks.map(c => c.name)).toContain('outcome_consistency');
      expect(result.checks.map(c => c.name)).toContain('content_quality');
    });

    it('should provide meaningful reasons', () => {
      const pattern = createMockPattern({ confidence: 0.95, memberCount: 5 });
      const result = qualityGate.evaluate(pattern);

      expect(result.reason).toBeTruthy();
      expect(result.reason.length).toBeGreaterThan(10);
    });
  });

  describe('similarity check', () => {
    it('should pass for high similarity', () => {
      const pattern = createMockPattern({ confidence: 0.85 });
      const result = qualityGate.evaluate(pattern);
      const check = result.checks.find(c => c.name === 'similarity');

      expect(check?.passed).toBe(true);
      expect(check?.score).toBe(0.85);
    });

    it('should fail for low similarity', () => {
      const pattern = createMockPattern({ confidence: 0.5 });
      const result = qualityGate.evaluate(pattern);
      const check = result.checks.find(c => c.name === 'similarity');

      expect(check?.passed).toBe(false);
    });
  });

  describe('pattern size check', () => {
    it('should score higher for larger patterns', () => {
      const smallPattern = createMockPattern({ memberCount: 2 });
      const largePattern = createMockPattern({ memberCount: 5 });

      const smallResult = qualityGate.evaluate(smallPattern);
      const largeResult = qualityGate.evaluate(largePattern);

      const smallCheck = smallResult.checks.find(c => c.name === 'pattern_size');
      const largeCheck = largeResult.checks.find(c => c.name === 'pattern_size');

      expect(largeCheck?.score).toBeGreaterThan(smallCheck?.score ?? 0);
    });

    it('should fail for single-member patterns', () => {
      const pattern = createMockPattern({ memberCount: 1 });
      const result = qualityGate.evaluate(pattern);
      const check = result.checks.find(c => c.name === 'pattern_size');

      expect(check?.passed).toBe(false);
    });
  });

  describe('outcome consistency check', () => {
    it('should pass for consistent success outcomes', () => {
      const pattern = createMockPattern({ outcomeType: 'success' });
      const result = qualityGate.evaluate(pattern);
      const check = result.checks.find(c => c.name === 'outcome_consistency');

      expect(check?.passed).toBe(true);
    });

    it('should handle patterns without outcome data', () => {
      const pattern = createMockPattern({ outcomeType: 'none' });
      const result = qualityGate.evaluate(pattern);
      const check = result.checks.find(c => c.name === 'outcome_consistency');

      expect(check?.passed).toBe(true);
      expect(check?.score).toBe(0.7); // Neutral
    });
  });

  describe('content quality check', () => {
    it('should pass for high quality content', () => {
      const pattern = createMockPattern({
        contentQuality: 'high',
        trajectoryLength: 3,
      });
      const result = qualityGate.evaluate(pattern);
      const check = result.checks.find(c => c.name === 'content_quality');

      expect(check?.passed).toBe(true);
    });

    it('should fail for low quality content', () => {
      const pattern = createMockPattern({
        contentQuality: 'low',
        trajectoryLength: 0,
      });
      const result = qualityGate.evaluate(pattern);
      const check = result.checks.find(c => c.name === 'content_quality');

      expect(check?.passed).toBe(false);
    });
  });

  describe('evaluateBatch', () => {
    it('should evaluate multiple patterns', () => {
      const patterns = [
        createMockPattern({ confidence: 0.95, memberCount: 5 }),
        createMockPattern({ confidence: 0.75, memberCount: 3 }),
        createMockPattern({ confidence: 0.5, memberCount: 2 }),
      ];

      const results = qualityGate.evaluateBatch(patterns);

      expect(results.size).toBe(3);
    });
  });

  describe('filterByDisposition', () => {
    it('should filter patterns by disposition', () => {
      const patterns = [
        createMockPattern({ confidence: 0.95, memberCount: 5 }),
        createMockPattern({ confidence: 0.75, memberCount: 3 }),
        createMockPattern({ confidence: 0.5, memberCount: 1 }),
      ];

      const autoPromote = qualityGate.filterByDisposition(patterns, 'auto_promote');
      const review = qualityGate.filterByDisposition(patterns, 'review');
      const reject = qualityGate.filterByDisposition(patterns, 'reject');

      expect(autoPromote.length).toBeGreaterThanOrEqual(0);
      expect(review.length + autoPromote.length + reject.length).toBe(3);
    });
  });

  describe('setThresholds', () => {
    it('should update thresholds', () => {
      qualityGate.setThresholds({ autoPromoteThreshold: 0.95 });
      const thresholds = qualityGate.getThresholds();

      expect(thresholds.autoPromoteThreshold).toBe(0.95);
    });

    it('should only update specified thresholds', () => {
      const originalReview = qualityGate.getThresholds().reviewThreshold;
      qualityGate.setThresholds({ autoPromoteThreshold: 0.95 });

      expect(qualityGate.getThresholds().reviewThreshold).toBe(originalReview);
    });
  });

  describe('getThresholds', () => {
    it('should return a copy of thresholds', () => {
      const thresholds1 = qualityGate.getThresholds();
      const thresholds2 = qualityGate.getThresholds();

      expect(thresholds1).not.toBe(thresholds2);
      expect(thresholds1).toEqual(thresholds2);
    });
  });
});
