/**
 * Pattern Detector
 *
 * Identifies patterns across multiple experiences using a two-stage approach:
 * 1. Embedding similarity on scenario + outcome for initial clustering
 * 2. Trajectory validation to confirm behavioral similarity
 *
 * NOTE: Non-null assertions are used for embeddings array access after validation checks.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { ExperienceWithVersion } from '../../../core/interfaces/repositories.js';
import type { ExperienceTrajectoryStep } from '../../../db/schema/experiences.js';
import type { IEmbeddingService } from '../../../core/context.js';
import {
  calculateTrajectorySimilarity,
  type TrajectorySimilarityResult,
} from './trajectory-similarity.js';
import { cosineSimilarity, mean, clamp } from '../utils/math.js';
import { createComponentLogger } from '../../../utils/logger.js';

const logger = createComponentLogger('pattern-detector');

// =============================================================================
// TYPES
// =============================================================================

/**
 * An experience with its trajectory loaded
 */
export interface ExperienceWithTrajectory {
  experience: ExperienceWithVersion;
  trajectory: ExperienceTrajectoryStep[];
  embedding?: number[];
}

/**
 * A detected pattern group
 */
export interface PatternGroup {
  /** Unique pattern identifier */
  id: string;
  /** All experiences in this pattern */
  experiences: ExperienceWithTrajectory[];
  /** The exemplar experience (most representative) */
  exemplar: ExperienceWithTrajectory;
  /** Average embedding similarity within the group */
  embeddingSimilarity: number;
  /** Average trajectory similarity within the group */
  trajectorySimilarity: number;
  /** Combined confidence score */
  confidence: number;
  /** Suggested pattern description */
  suggestedPattern: string;
  /** Common action sequence */
  commonActions: string[];
  /** Success rate across experiences */
  successRate: number;
}

/**
 * Configuration for pattern detection
 */
export interface PatternDetectorConfig {
  /** Minimum embedding similarity to consider (default: 0.7) */
  embeddingThreshold: number;
  /** Minimum trajectory similarity to validate (default: 0.6) */
  trajectoryThreshold: number;
  /** Minimum experiences needed for a pattern (default: 2) */
  minExperiences: number;
  /** Maximum experiences to compare (for performance) (default: 100) */
  maxExperiences: number;
  /** Whether to require trajectory validation (default: true) */
  requireTrajectoryValidation: boolean;
}

/**
 * Pattern detection result
 */
export interface PatternDetectionResult {
  /** Detected pattern groups */
  patterns: PatternGroup[];
  /** Experiences that didn't match any pattern */
  unmatched: ExperienceWithTrajectory[];
  /** Total processing time in ms */
  processingTimeMs: number;
  /** Statistics about the detection */
  stats: {
    totalExperiences: number;
    patternsFound: number;
    experiencesInPatterns: number;
    averagePatternSize: number;
    embeddingsUsed: boolean;
  };
}

// =============================================================================
// PATTERN DETECTOR
// =============================================================================

/**
 * Pattern Detector class
 *
 * Identifies recurring patterns in case-level experiences
 */
export class PatternDetector {
  private config: PatternDetectorConfig;
  private embeddingService?: IEmbeddingService;

  constructor(config: Partial<PatternDetectorConfig> = {}, embeddingService?: IEmbeddingService) {
    this.config = {
      embeddingThreshold: config.embeddingThreshold ?? 0.7,
      trajectoryThreshold: config.trajectoryThreshold ?? 0.6,
      minExperiences: config.minExperiences ?? 2,
      maxExperiences: config.maxExperiences ?? 100,
      requireTrajectoryValidation: config.requireTrajectoryValidation ?? true,
    };
    this.embeddingService = embeddingService;
  }

  /**
   * Detect patterns in a set of experiences
   */
  async detectPatterns(experiences: ExperienceWithTrajectory[]): Promise<PatternDetectionResult> {
    const startTime = Date.now();

    // Limit experiences for performance
    const limitedExperiences = experiences.slice(0, this.config.maxExperiences);

    if (limitedExperiences.length < this.config.minExperiences) {
      return {
        patterns: [],
        unmatched: limitedExperiences,
        processingTimeMs: Date.now() - startTime,
        stats: {
          totalExperiences: limitedExperiences.length,
          patternsFound: 0,
          experiencesInPatterns: 0,
          averagePatternSize: 0,
          embeddingsUsed: false,
        },
      };
    }

    // Stage 1: Compute embeddings if available
    const embeddingsAvailable = await this.computeEmbeddings(limitedExperiences);

    // Stage 2: Find similar pairs
    const similarPairs = embeddingsAvailable
      ? this.findSimilarPairsWithEmbeddings(limitedExperiences)
      : this.findSimilarPairsWithTrajectories(limitedExperiences);

    // Stage 3: Cluster into pattern groups
    const clusters = this.clusterExperiences(limitedExperiences, similarPairs);

    // Stage 4: Validate and finalize patterns
    const patterns = await this.validatePatterns(clusters);

    // Identify unmatched experiences
    const matchedIds = new Set(patterns.flatMap((p) => p.experiences.map((e) => e.experience.id)));
    const unmatched = limitedExperiences.filter((e) => !matchedIds.has(e.experience.id));

    const processingTimeMs = Date.now() - startTime;

    return {
      patterns,
      unmatched,
      processingTimeMs,
      stats: {
        totalExperiences: limitedExperiences.length,
        patternsFound: patterns.length,
        experiencesInPatterns: matchedIds.size,
        averagePatternSize: patterns.length > 0 ? matchedIds.size / patterns.length : 0,
        embeddingsUsed: embeddingsAvailable,
      },
    };
  }

  /**
   * Compute embeddings for experiences if embedding service is available
   */
  private async computeEmbeddings(experiences: ExperienceWithTrajectory[]): Promise<boolean> {
    if (!this.embeddingService?.isAvailable()) {
      return false;
    }

    try {
      const textsToEmbed = experiences.map((exp) => {
        const version = exp.experience.currentVersion;
        return [version?.scenario ?? '', version?.outcome ?? '', version?.content ?? '']
          .filter(Boolean)
          .join(' ');
      });

      const result = await this.embeddingService.embedBatch(textsToEmbed);

      for (let i = 0; i < experiences.length; i++) {
        const exp = experiences[i]!;
        exp.embedding = result.embeddings[i];
      }

      return true;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to compute embeddings, falling back to trajectory-only comparison'
      );
      return false;
    }
  }

  /**
   * Find similar experience pairs using embeddings
   */
  private findSimilarPairsWithEmbeddings(
    experiences: ExperienceWithTrajectory[]
  ): Map<string, Set<string>> {
    const similarPairs = new Map<string, Set<string>>();

    for (let i = 0; i < experiences.length; i++) {
      const exp1 = experiences[i]!;
      if (!exp1.embedding) continue;

      similarPairs.set(exp1.experience.id, new Set());

      for (let j = i + 1; j < experiences.length; j++) {
        const exp2 = experiences[j]!;
        if (!exp2.embedding) continue;

        const similarity = cosineSimilarity(exp1.embedding, exp2.embedding);

        if (similarity >= this.config.embeddingThreshold) {
          // Validate with trajectory if required
          if (this.config.requireTrajectoryValidation) {
            const trajSim = calculateTrajectorySimilarity(exp1.trajectory, exp2.trajectory);
            if (trajSim.similarity < this.config.trajectoryThreshold) {
              continue;
            }
          }

          similarPairs.get(exp1.experience.id)!.add(exp2.experience.id);

          if (!similarPairs.has(exp2.experience.id)) {
            similarPairs.set(exp2.experience.id, new Set());
          }
          similarPairs.get(exp2.experience.id)!.add(exp1.experience.id);
        }
      }
    }

    return similarPairs;
  }

  /**
   * Find similar experience pairs using only trajectories
   */
  private findSimilarPairsWithTrajectories(
    experiences: ExperienceWithTrajectory[]
  ): Map<string, Set<string>> {
    const similarPairs = new Map<string, Set<string>>();

    for (let i = 0; i < experiences.length; i++) {
      const exp1 = experiences[i]!;
      similarPairs.set(exp1.experience.id, new Set());

      for (let j = i + 1; j < experiences.length; j++) {
        const exp2 = experiences[j]!;

        const trajSim = calculateTrajectorySimilarity(exp1.trajectory, exp2.trajectory);

        if (trajSim.similarity >= this.config.trajectoryThreshold) {
          similarPairs.get(exp1.experience.id)!.add(exp2.experience.id);

          if (!similarPairs.has(exp2.experience.id)) {
            similarPairs.set(exp2.experience.id, new Set());
          }
          similarPairs.get(exp2.experience.id)!.add(exp1.experience.id);
        }
      }
    }

    return similarPairs;
  }

  /**
   * Cluster experiences based on similarity pairs
   * Uses a simple union-find approach
   */
  private clusterExperiences(
    experiences: ExperienceWithTrajectory[],
    similarPairs: Map<string, Set<string>>
  ): ExperienceWithTrajectory[][] {
    const expMap = new Map(experiences.map((e) => [e.experience.id, e]));
    const visited = new Set<string>();
    const clusters: ExperienceWithTrajectory[][] = [];

    for (const exp of experiences) {
      if (visited.has(exp.experience.id)) continue;

      // BFS to find all connected experiences
      const cluster: ExperienceWithTrajectory[] = [];
      const queue = [exp.experience.id];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;

        visited.add(current);
        const currentExp = expMap.get(current);
        if (currentExp) {
          cluster.push(currentExp);
        }

        // Add all similar experiences to queue
        const similar = similarPairs.get(current);
        if (similar) {
          for (const id of similar) {
            if (!visited.has(id)) {
              queue.push(id);
            }
          }
        }
      }

      if (cluster.length >= this.config.minExperiences) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Validate and finalize pattern groups
   */
  private async validatePatterns(clusters: ExperienceWithTrajectory[][]): Promise<PatternGroup[]> {
    const patterns: PatternGroup[] = [];

    for (const cluster of clusters) {
      const pattern = this.buildPatternGroup(cluster);
      if (pattern.confidence >= 0.5) {
        patterns.push(pattern);
      }
    }

    // Sort by confidence
    patterns.sort((a, b) => b.confidence - a.confidence);

    return patterns;
  }

  /**
   * Build a pattern group from a cluster of experiences
   */
  private buildPatternGroup(experiences: ExperienceWithTrajectory[]): PatternGroup {
    const firstExp = experiences[0]!;

    // Calculate embedding similarities
    let embeddingSimilarity = 1.0;
    if (firstExp.embedding) {
      const embedSims: number[] = [];
      for (let i = 0; i < experiences.length; i++) {
        for (let j = i + 1; j < experiences.length; j++) {
          const exp1 = experiences[i]!;
          const exp2 = experiences[j]!;
          if (exp1.embedding && exp2.embedding) {
            embedSims.push(cosineSimilarity(exp1.embedding, exp2.embedding));
          }
        }
      }
      embeddingSimilarity = embedSims.length > 0 ? mean(embedSims) : 1.0;
    }

    // Calculate trajectory similarities
    const trajSims: TrajectorySimilarityResult[] = [];
    for (let i = 0; i < experiences.length; i++) {
      for (let j = i + 1; j < experiences.length; j++) {
        const exp1 = experiences[i]!;
        const exp2 = experiences[j]!;
        trajSims.push(calculateTrajectorySimilarity(exp1.trajectory, exp2.trajectory));
      }
    }
    const trajectorySimilarity =
      trajSims.length > 0 ? mean(trajSims.map((t) => t.similarity)) : 1.0;

    // Find exemplar (experience with highest success and most steps)
    const exemplar = experiences.reduce<ExperienceWithTrajectory>((best, exp) => {
      const bestSuccess = best.experience.successCount / Math.max(1, best.experience.useCount);
      const expSuccess = exp.experience.successCount / Math.max(1, exp.experience.useCount);
      const bestScore = bestSuccess * 0.7 + (best.trajectory.length / 10) * 0.3;
      const expScore = expSuccess * 0.7 + (exp.trajectory.length / 10) * 0.3;
      return expScore > bestScore ? exp : best;
    }, firstExp);

    // Extract common actions
    const commonActions = this.extractCommonActions(experiences);

    // Calculate success rate
    const totalUses = experiences.reduce((sum, e) => sum + e.experience.useCount, 0);
    const totalSuccesses = experiences.reduce((sum, e) => sum + e.experience.successCount, 0);
    const successRate = totalUses > 0 ? totalSuccesses / totalUses : 1.0;

    // Generate pattern suggestion
    const suggestedPattern = this.suggestPattern(experiences, commonActions);

    // Calculate confidence
    const confidence = this.calculateConfidence(
      experiences.length,
      embeddingSimilarity,
      trajectorySimilarity,
      successRate
    );

    return {
      id: `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      experiences,
      exemplar,
      embeddingSimilarity,
      trajectorySimilarity,
      confidence,
      suggestedPattern,
      commonActions,
      successRate,
    };
  }

  /**
   * Extract common action sequence from experiences
   */
  private extractCommonActions(experiences: ExperienceWithTrajectory[]): string[] {
    if (experiences.length === 0) return [];

    // Get action sequences
    const actionSequences = experiences.map((exp) => exp.trajectory.map((step) => step.action));

    if (actionSequences.length === 1) {
      return actionSequences[0] ?? [];
    }

    // Find most common sequence using voting
    const actionCounts = new Map<string, number>();
    for (const seq of actionSequences) {
      for (const action of seq) {
        actionCounts.set(action, (actionCounts.get(action) || 0) + 1);
      }
    }

    // Keep actions that appear in at least half the experiences
    const threshold = experiences.length / 2;
    const commonActions = Array.from(actionCounts.entries())
      .filter(([, count]) => count >= threshold)
      .map(([action]) => action);

    // Order by average position
    const avgPosition = new Map<string, number>();
    for (const action of commonActions) {
      const positions = actionSequences.map((seq) => seq.indexOf(action)).filter((p) => p >= 0);
      avgPosition.set(action, mean(positions));
    }

    return commonActions.sort((a, b) => (avgPosition.get(a) ?? 0) - (avgPosition.get(b) ?? 0));
  }

  /**
   * Suggest a pattern description based on experiences
   */
  private suggestPattern(experiences: ExperienceWithTrajectory[], commonActions: string[]): string {
    // Use the exemplar's scenario as base
    const scenarios = experiences
      .map((e) => e.experience.currentVersion?.scenario)
      .filter((s): s is string => !!s);

    if (scenarios.length === 0) {
      return `Pattern with ${commonActions.length} common actions`;
    }

    // Find common words in scenarios
    const wordSets = scenarios.map(
      (s) =>
        new Set(
          s
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 3)
        )
    );

    const commonWords = new Set<string>();
    const firstWordSet = wordSets[0];
    if (firstWordSet) {
      for (const word of firstWordSet) {
        if (wordSets.every((set) => set.has(word))) {
          commonWords.add(word);
        }
      }
    }

    if (commonWords.size > 0) {
      const keywords = Array.from(commonWords).slice(0, 5).join(', ');
      return `When ${keywords}: ${commonActions.slice(0, 3).join(' → ')}`;
    }

    return `Pattern: ${commonActions.slice(0, 3).join(' → ')}`;
  }

  /**
   * Calculate confidence score for a pattern
   */
  private calculateConfidence(
    experienceCount: number,
    embeddingSimilarity: number,
    trajectorySimilarity: number,
    successRate: number
  ): number {
    // More experiences = higher confidence
    const countFactor = clamp(experienceCount / 5, 0, 1);

    // Higher similarities = higher confidence
    const similarityFactor = (embeddingSimilarity + trajectorySimilarity) / 2;

    // Success rate affects confidence
    const successFactor = successRate;

    // Weighted combination
    return countFactor * 0.3 + similarityFactor * 0.5 + successFactor * 0.2;
  }
}

/**
 * Create a pattern detector instance
 */
export function createPatternDetector(
  config?: Partial<PatternDetectorConfig>,
  embeddingService?: IEmbeddingService
): PatternDetector {
  return new PatternDetector(config, embeddingService);
}
