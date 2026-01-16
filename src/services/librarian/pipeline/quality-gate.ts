/**
 * Quality Gate
 *
 * Evaluates pattern detection results and determines disposition:
 * - Auto-promote if confidence >= 0.9
 * - Queue for review if 0.7 <= confidence < 0.9
 * - Reject if confidence < 0.7
 */

import type { PatternGroup } from './pattern-detector.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Quality gate disposition
 */
export type QualityDisposition = 'auto_promote' | 'review' | 'reject';

/**
 * Quality gate thresholds configuration
 */
export interface QualityThresholds {
  /** Minimum confidence for auto-promotion (default: 0.9) */
  autoPromoteThreshold: number;
  /** Minimum confidence for review queue (default: 0.7) */
  reviewThreshold: number;
  /** Minimum pattern size for promotion (default: 2) */
  minPatternSize: number;
  /** Minimum exemplar success rate (default: 0.6) */
  minSuccessRate: number;
}

/**
 * Quality gate evaluation result
 */
export interface QualityGateResult {
  /** Disposition decision */
  disposition: QualityDisposition;
  /** Confidence score (0-1) */
  confidence: number;
  /** Why this disposition was chosen */
  reason: string;
  /** Individual check results */
  checks: QualityCheck[];
  /** Adjusted confidence after all checks */
  adjustedConfidence: number;
}

/**
 * Individual quality check result
 */
export interface QualityCheck {
  name: string;
  passed: boolean;
  score: number;
  weight: number;
  message?: string;
}

// =============================================================================
// DEFAULT THRESHOLDS
// =============================================================================

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  autoPromoteThreshold: 0.9,
  reviewThreshold: 0.7,
  minPatternSize: 2,
  minSuccessRate: 0.6,
};

// =============================================================================
// QUALITY GATE IMPLEMENTATION
// =============================================================================

/**
 * Quality Gate evaluator
 */
export class QualityGate {
  private thresholds: QualityThresholds;

  constructor(thresholds: Partial<QualityThresholds> = {}) {
    this.thresholds = { ...DEFAULT_QUALITY_THRESHOLDS, ...thresholds };
  }

  /**
   * Evaluate a pattern group for promotion eligibility
   */
  evaluate(pattern: PatternGroup): QualityGateResult {
    const checks: QualityCheck[] = [];
    let totalWeight = 0;
    let weightedScore = 0;

    // Check 1: Pattern similarity score (weight: 0.4)
    const similarityCheck = this.checkSimilarity(pattern);
    checks.push(similarityCheck);
    totalWeight += similarityCheck.weight;
    weightedScore += similarityCheck.score * similarityCheck.weight;

    // Check 2: Pattern size (weight: 0.2)
    const sizeCheck = this.checkPatternSize(pattern);
    checks.push(sizeCheck);
    totalWeight += sizeCheck.weight;
    weightedScore += sizeCheck.score * sizeCheck.weight;

    // Check 3: Outcome consistency (weight: 0.25)
    const outcomeCheck = this.checkOutcomeConsistency(pattern);
    checks.push(outcomeCheck);
    totalWeight += outcomeCheck.weight;
    weightedScore += outcomeCheck.score * outcomeCheck.weight;

    // Check 4: Content quality (weight: 0.15)
    const contentCheck = this.checkContentQuality(pattern);
    checks.push(contentCheck);
    totalWeight += contentCheck.weight;
    weightedScore += contentCheck.score * contentCheck.weight;

    // Calculate adjusted confidence
    const adjustedConfidence = totalWeight > 0 ? weightedScore / totalWeight : 0;

    // Determine disposition
    const { disposition, reason } = this.determineDisposition(adjustedConfidence, checks);

    return {
      disposition,
      confidence: pattern.confidence,
      adjustedConfidence,
      reason,
      checks,
    };
  }

  /**
   * Check similarity score
   */
  private checkSimilarity(pattern: PatternGroup): QualityCheck {
    const score = pattern.confidence;
    const passed = score >= this.thresholds.reviewThreshold;

    return {
      name: 'similarity',
      passed,
      score,
      weight: 0.4,
      message: passed
        ? `Similarity score ${score.toFixed(2)} meets threshold`
        : `Similarity score ${score.toFixed(2)} below threshold ${this.thresholds.reviewThreshold}`,
    };
  }

  /**
   * Check pattern size
   */
  private checkPatternSize(pattern: PatternGroup): QualityCheck {
    const size = pattern.experiences.length;
    const minSize = this.thresholds.minPatternSize;

    // Score based on size: 2=0.5, 3=0.75, 4+=1.0
    const score = Math.min(1.0, (size - 1) / 3);
    const passed = size >= minSize;

    return {
      name: 'pattern_size',
      passed,
      score,
      weight: 0.2,
      message: passed
        ? `Pattern has ${size} members (min: ${minSize})`
        : `Pattern has only ${size} member(s) (min: ${minSize})`,
    };
  }

  /**
   * Check outcome consistency across pattern members
   */
  private checkOutcomeConsistency(pattern: PatternGroup): QualityCheck {
    // Count successful vs failed experiences
    let successCount = 0;
    let totalCount = 0;

    for (const member of pattern.experiences) {
      if (member.experience.currentVersion?.outcome) {
        const outcome = member.experience.currentVersion.outcome.toLowerCase();
        if (
          outcome.includes('success') ||
          outcome.includes('resolved') ||
          outcome.includes('fixed')
        ) {
          successCount++;
        }
        totalCount++;
      }
    }

    // If no outcomes recorded, assume neutral
    if (totalCount === 0) {
      return {
        name: 'outcome_consistency',
        passed: true,
        score: 0.7, // Neutral score
        weight: 0.25,
        message: 'No outcome data available',
      };
    }

    const successRate = successCount / totalCount;
    const passed = successRate >= this.thresholds.minSuccessRate;

    return {
      name: 'outcome_consistency',
      passed,
      score: successRate,
      weight: 0.25,
      message: passed
        ? `Success rate ${(successRate * 100).toFixed(0)}% meets threshold`
        : `Success rate ${(successRate * 100).toFixed(0)}% below threshold ${(this.thresholds.minSuccessRate * 100).toFixed(0)}%`,
    };
  }

  /**
   * Check content quality of exemplar
   */
  private checkContentQuality(pattern: PatternGroup): QualityCheck {
    const exemplar = pattern.exemplar;
    const version = exemplar.experience.currentVersion;

    if (!version) {
      return {
        name: 'content_quality',
        passed: false,
        score: 0,
        weight: 0.15,
        message: 'No version data available',
      };
    }

    let qualityScore = 0;
    const checks: string[] = [];

    // Has content?
    if (version.content && version.content.length >= 50) {
      qualityScore += 0.3;
      checks.push('has content');
    }

    // Has scenario?
    if (version.scenario && version.scenario.length >= 20) {
      qualityScore += 0.25;
      checks.push('has scenario');
    }

    // Has outcome?
    if (version.outcome && version.outcome.length >= 10) {
      qualityScore += 0.25;
      checks.push('has outcome');
    }

    // Has trajectory?
    if (exemplar.trajectory && exemplar.trajectory.length >= 2) {
      qualityScore += 0.2;
      checks.push(`has ${exemplar.trajectory.length} trajectory steps`);
    }

    const passed = qualityScore >= 0.5;

    return {
      name: 'content_quality',
      passed,
      score: qualityScore,
      weight: 0.15,
      message: passed
        ? `Content quality checks: ${checks.join(', ')}`
        : `Missing content quality checks (score: ${qualityScore.toFixed(2)})`,
    };
  }

  /**
   * Determine final disposition based on adjusted confidence and checks
   */
  private determineDisposition(
    adjustedConfidence: number,
    checks: QualityCheck[]
  ): { disposition: QualityDisposition; reason: string } {
    const failedCritical = checks.some(
      (c) => !c.passed && (c.name === 'pattern_size' || c.name === 'similarity')
    );

    if (failedCritical) {
      const failedNames = checks.filter((c) => !c.passed).map((c) => c.name);
      return {
        disposition: 'reject',
        reason: `Failed critical checks: ${failedNames.join(', ')}`,
      };
    }

    if (adjustedConfidence >= this.thresholds.autoPromoteThreshold) {
      return {
        disposition: 'auto_promote',
        reason: `Adjusted confidence ${adjustedConfidence.toFixed(2)} >= ${this.thresholds.autoPromoteThreshold} auto-promote threshold`,
      };
    }

    if (adjustedConfidence >= this.thresholds.reviewThreshold) {
      return {
        disposition: 'review',
        reason: `Adjusted confidence ${adjustedConfidence.toFixed(2)} requires human review`,
      };
    }

    return {
      disposition: 'reject',
      reason: `Adjusted confidence ${adjustedConfidence.toFixed(2)} < ${this.thresholds.reviewThreshold} review threshold`,
    };
  }

  /**
   * Batch evaluate multiple patterns
   */
  evaluateBatch(patterns: PatternGroup[]): Map<PatternGroup, QualityGateResult> {
    const results = new Map<PatternGroup, QualityGateResult>();

    for (const pattern of patterns) {
      results.set(pattern, this.evaluate(pattern));
    }

    return results;
  }

  /**
   * Get patterns by disposition
   */
  filterByDisposition(patterns: PatternGroup[], disposition: QualityDisposition): PatternGroup[] {
    return patterns.filter((p) => this.evaluate(p).disposition === disposition);
  }

  /**
   * Update thresholds
   */
  setThresholds(thresholds: Partial<QualityThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Get current thresholds
   */
  getThresholds(): QualityThresholds {
    return { ...this.thresholds };
  }
}
