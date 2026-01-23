/**
 * Recommender
 *
 * Generates promotion recommendations from detected patterns.
 * Creates structured recommendations with suggested titles,
 * patterns, and applicability criteria.
 */

import type { PatternGroup, ExperienceWithTrajectory } from './pattern-detector.js';
import type { QualityGateResult } from './quality-gate.js';
import type { ScopeType } from '../../../db/schema.js';
import type {
  CreateRecommendationInput,
  IRecommendationStore,
} from '../recommendations/recommendation-store.js';
import type { IExtractionService } from '../../../core/context.js';
import { createComponentLogger } from '../../../utils/logger.js';

const logger = createComponentLogger('librarian:recommender');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Recommendation generation options
 */
export interface RecommenderOptions {
  /** Default expiration days for recommendations */
  expirationDays: number;
  /** Analysis run ID for tracking */
  analysisRunId?: string;
  /** Analysis version for tracking */
  analysisVersion?: string;
  /** Creator ID */
  createdBy?: string;
  /** Extraction service for LLM-based synthesis (optional) */
  extractionService?: IExtractionService;
}

/**
 * Generated recommendation (before storage)
 */
export interface GeneratedRecommendation {
  /** Input for creating the recommendation */
  input: CreateRecommendationInput;
  /** The source pattern */
  pattern: PatternGroup;
  /** Quality gate evaluation */
  quality: QualityGateResult;
}

/**
 * Recommendation generation result
 */
export interface RecommendationGenerationResult {
  /** Generated recommendations */
  recommendations: GeneratedRecommendation[];
  /** Patterns that were auto-promoted */
  autoPromoted: PatternGroup[];
  /** Patterns that were rejected */
  rejected: PatternGroup[];
  /** Summary statistics */
  stats: {
    totalPatterns: number;
    reviewQueued: number;
    autoPromoted: number;
    rejected: number;
  };
}

// =============================================================================
// DEFAULT OPTIONS
// =============================================================================

export const DEFAULT_RECOMMENDER_OPTIONS: RecommenderOptions = {
  expirationDays: 30,
  analysisVersion: '1.0.0',
};

// =============================================================================
// RECOMMENDER IMPLEMENTATION
// =============================================================================

export class Recommender {
  private options: RecommenderOptions;
  private extractionService?: IExtractionService;

  constructor(options: Partial<RecommenderOptions> = {}) {
    this.options = { ...DEFAULT_RECOMMENDER_OPTIONS, ...options };
    this.extractionService = options.extractionService;
  }

  async generateRecommendations(
    patterns: PatternGroup[],
    evaluations: Map<PatternGroup, QualityGateResult>,
    targetScope: { scopeType: ScopeType; scopeId?: string }
  ): Promise<RecommendationGenerationResult> {
    const recommendations: GeneratedRecommendation[] = [];
    const autoPromoted: PatternGroup[] = [];
    const rejected: PatternGroup[] = [];

    for (const pattern of patterns) {
      const quality = evaluations.get(pattern);
      if (!quality) continue;

      switch (quality.disposition) {
        case 'auto_promote':
          autoPromoted.push(pattern);
          break;
        case 'review':
          recommendations.push(await this.createRecommendation(pattern, quality, targetScope));
          break;
        case 'reject':
          rejected.push(pattern);
          break;
      }
    }

    return {
      recommendations,
      autoPromoted,
      rejected,
      stats: {
        totalPatterns: patterns.length,
        reviewQueued: recommendations.length,
        autoPromoted: autoPromoted.length,
        rejected: rejected.length,
      },
    };
  }

  private async createRecommendation(
    pattern: PatternGroup,
    quality: QualityGateResult,
    targetScope: { scopeType: ScopeType; scopeId?: string }
  ): Promise<GeneratedRecommendation> {
    const exemplar = pattern.exemplar;

    // Try LLM synthesis first, fall back to heuristics
    const llmSynthesis = await this.synthesizePatternWithLLM(pattern);

    const title = llmSynthesis?.title ?? this.generateTitle(pattern);
    const patternDescription =
      llmSynthesis?.patternDescription ?? this.generatePatternDescription(pattern);
    const applicability = llmSynthesis?.applicability ?? this.generateApplicability(pattern);
    const contraindications =
      llmSynthesis?.contraindications ?? this.generateContraindications(pattern);
    const rationale = this.generateRationale(pattern, quality);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.options.expirationDays);

    const sourceExperienceIds = pattern.experiences.map(
      (m: ExperienceWithTrajectory) => m.experience.id
    );

    const input: CreateRecommendationInput = {
      scopeType: targetScope.scopeType,
      scopeId: targetScope.scopeId,
      type: 'strategy',
      title,
      pattern: patternDescription,
      applicability,
      contraindications,
      rationale,
      confidence: quality.adjustedConfidence,
      patternCount: pattern.experiences.length,
      exemplarExperienceId: exemplar.experience.id,
      sourceExperienceIds,
      analysisRunId: this.options.analysisRunId,
      analysisVersion: this.options.analysisVersion,
      expiresAt: expiresAt.toISOString(),
      createdBy: this.options.createdBy,
    };

    return { input, pattern, quality };
  }

  private async synthesizePatternWithLLM(pattern: PatternGroup): Promise<{
    title: string;
    patternDescription: string;
    applicability: string;
    contraindications: string;
  } | null> {
    if (!this.extractionService?.isAvailable()) {
      return null;
    }

    try {
      const caseSummaries = pattern.experiences
        .map((exp, i) => {
          const v = exp.experience.currentVersion;
          const steps = exp.trajectory
            .slice(0, 3)
            .map((s) => `  - ${s.action}: ${s.observation?.slice(0, 100) ?? 'no observation'}`)
            .join('\n');
          return `Case ${i + 1}: ${exp.experience.title}
Scenario: ${v?.scenario ?? 'unknown'}
Outcome: ${v?.outcome ?? 'unknown'}
Steps:
${steps}`;
        })
        .join('\n\n');

      const prompt = `Analyze these ${pattern.experiences.length} similar cases and extract the underlying pattern.

${caseSummaries}

Respond in this exact JSON format:
{
  "title": "Brief, actionable title (e.g., 'Handle API timeouts with exponential backoff')",
  "pattern": "The underlying principle or approach that made these cases successful",
  "when_to_apply": "Specific conditions or triggers when this pattern should be used",
  "when_not_to_apply": "Situations where this pattern would be inappropriate or harmful"
}`;

      const result = await this.extractionService.extract({
        context: prompt,
        contextType: 'mixed',
        focusAreas: ['decisions', 'rules'],
      });

      // The LLM might return JSON in the content field of an extracted entry
      // or we parse from model response. Try to extract JSON from any entry content.
      for (const entry of result.entries) {
        try {
          const jsonMatch = entry.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as {
              title?: string;
              pattern?: string;
              when_to_apply?: string;
              when_not_to_apply?: string;
            };
            if (parsed.title && parsed.pattern) {
              return {
                title: parsed.title,
                patternDescription: parsed.pattern,
                applicability: parsed.when_to_apply ?? 'Apply when facing similar scenarios.',
                contraindications:
                  parsed.when_not_to_apply ?? 'No specific contraindications identified.',
              };
            }
          }
        } catch {
          // Continue to next entry
        }
      }

      logger.debug(
        { patternSize: pattern.experiences.length },
        'LLM synthesis did not return valid JSON, falling back to heuristics'
      );
      return null;
    } catch (error) {
      logger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'LLM synthesis failed, falling back to heuristics'
      );
      return null;
    }
  }

  private generateTitle(pattern: PatternGroup): string {
    const exemplar = pattern.exemplar.experience;
    const baseTitle = exemplar.title;

    // If the exemplar title is generic, try to enhance it
    if (baseTitle.length < 20 || baseTitle.toLowerCase().includes('untitled')) {
      const category = exemplar.category ?? 'general';
      return `${capitalize(category)} Pattern: ${pattern.experiences.length} Similar Cases`;
    }

    return `Pattern: ${baseTitle}`;
  }

  /**
   * Generate pattern description from common elements
   */
  private generatePatternDescription(pattern: PatternGroup): string {
    const descriptions: string[] = [];

    // Get common action types across trajectories
    const actionCounts = new Map<string, number>();
    for (const member of pattern.experiences) {
      const seen = new Set<string>();
      for (const step of member.trajectory) {
        const action = step.action;
        if (!seen.has(action)) {
          seen.add(action);
          actionCounts.set(action, (actionCounts.get(action) ?? 0) + 1);
        }
      }
    }

    // Find actions common to most members
    const commonActions: string[] = [];
    const threshold = pattern.experiences.length * 0.6;
    for (const [action, count] of actionCounts) {
      if (count >= threshold) {
        commonActions.push(action);
      }
    }

    if (commonActions.length > 0) {
      descriptions.push(`Common actions: ${commonActions.slice(0, 5).join(', ')}`);
    }

    // Get common scenario themes
    const scenarios = pattern.experiences
      .map((m) => m.experience.currentVersion?.scenario)
      .filter((s): s is string => !!s);

    if (scenarios.length > 0) {
      // Extract common words
      const wordCounts = new Map<string, number>();
      for (const scenario of scenarios) {
        const words = scenario
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 4);
        const seen = new Set<string>();
        for (const word of words) {
          if (!seen.has(word)) {
            seen.add(word);
            wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
          }
        }
      }

      const commonWords: string[] = [];
      for (const [word, count] of wordCounts) {
        if (count >= threshold) {
          commonWords.push(word);
        }
      }

      if (commonWords.length > 0) {
        descriptions.push(`Common themes: ${commonWords.slice(0, 5).join(', ')}`);
      }
    }

    // Include exemplar content summary
    const exemplarContent = pattern.exemplar.experience.currentVersion?.content;
    if (exemplarContent) {
      const summary = exemplarContent.slice(0, 200);
      descriptions.push(
        `Exemplar approach: ${summary}${exemplarContent.length > 200 ? '...' : ''}`
      );
    }

    return descriptions.join('\n\n') || 'Pattern detected from similar experiences.';
  }

  /**
   * Generate applicability criteria
   */
  private generateApplicability(pattern: PatternGroup): string {
    const criteria: string[] = [];

    // Extract from exemplar scenario
    const exemplarScenario = pattern.exemplar.experience.currentVersion?.scenario;
    if (exemplarScenario) {
      criteria.push(`When facing a similar situation: ${exemplarScenario.slice(0, 200)}`);
    }

    // Add category-based criteria
    const category = pattern.exemplar.experience.category;
    if (category) {
      criteria.push(`Applicable to ${category} tasks`);
    }

    // Add pattern-based criteria
    const memberCount = pattern.experiences.length;
    criteria.push(`Based on ${memberCount} successful similar experiences`);

    return criteria.join('\n') || 'Apply when facing similar scenarios.';
  }

  /**
   * Generate contraindications
   */
  private generateContraindications(pattern: PatternGroup): string {
    const contraindications: string[] = [];

    // Check for failed outcomes in the pattern
    const failedMembers = pattern.experiences.filter((m) => {
      const outcome = m.experience.currentVersion?.outcome?.toLowerCase() ?? '';
      return outcome.includes('fail') || outcome.includes('error') || outcome.includes('issue');
    });

    if (failedMembers.length > 0) {
      contraindications.push(
        `Note: ${failedMembers.length} of ${pattern.experiences.length} cases had issues - review carefully`
      );
    }

    // Add general contraindications based on pattern variance
    if (pattern.confidence < 0.8) {
      contraindications.push(
        'Pattern has moderate variance - may not apply to all similar situations'
      );
    }

    return contraindications.join('\n') || 'No specific contraindications identified.';
  }

  /**
   * Generate rationale for the recommendation
   */
  private generateRationale(pattern: PatternGroup, quality: QualityGateResult): string {
    const parts: string[] = [];

    parts.push(`Similarity score: ${(pattern.confidence * 100).toFixed(1)}%`);
    parts.push(`Pattern size: ${pattern.experiences.length} experiences`);
    parts.push(`Quality confidence: ${(quality.adjustedConfidence * 100).toFixed(1)}%`);

    // Add quality check summary
    const passedChecks = quality.checks.filter((c) => c.passed);
    const failedChecks = quality.checks.filter((c) => !c.passed);

    if (passedChecks.length > 0) {
      parts.push(`Passed checks: ${passedChecks.map((c) => c.name).join(', ')}`);
    }
    if (failedChecks.length > 0) {
      parts.push(`Needs attention: ${failedChecks.map((c) => c.name).join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Store generated recommendations
   */
  async storeRecommendations(
    recommendations: GeneratedRecommendation[],
    store: IRecommendationStore
  ): Promise<void> {
    for (const rec of recommendations) {
      await store.create(rec.input);
    }
  }

  setOptions(options: Partial<RecommenderOptions>): void {
    this.options = { ...this.options, ...options };
  }

  setExtractionService(extractionService: IExtractionService): void {
    this.extractionService = extractionService;
  }
}

/**
 * Helper to capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Create a recommender instance
 */
export function createRecommender(options?: Partial<RecommenderOptions>): Recommender {
  return new Recommender(options);
}
