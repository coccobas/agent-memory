/**
 * Scoring Configuration Builders
 *
 * Builds scoring-related nested configuration from environment variables.
 */

import {
  scoringWeightOptions,
  feedbackScoringOptions,
  entityScoringOptions,
} from '../registry/index.js';
import { getEnvInt, getEnvNumber, getEnvBoolean } from './helpers.js';

/**
 * Scoring weights configuration.
 */
export interface ScoringWeights {
  explicitRelation: number;
  tagMatch: number;
  scopeProximity: number;
  textMatch: number;
  priorityMax: number;
  semanticMax: number;
  recencyMax: number;
}

/**
 * Feedback scoring configuration.
 */
export interface FeedbackScoringConfig {
  enabled: boolean;
  boostPerPositive: number;
  boostMax: number;
  penaltyPerNegative: number;
  penaltyMax: number;
  cacheTTLMs: number;
  cacheMaxSize: number;
}

/**
 * Entity scoring configuration.
 */
export interface EntityScoringConfig {
  enabled: boolean;
  exactMatchBoost: number;
  partialMatchBoost: number;
}

/**
 * Build scoring weights config with proper typing.
 * Controls the weight of different scoring factors.
 *
 * @returns Scoring weights configuration
 */
export function buildScoringWeights(): ScoringWeights {
  return {
    explicitRelation: getEnvInt(
      scoringWeightOptions.explicitRelation.envKey,
      scoringWeightOptions.explicitRelation.defaultValue
    ),
    tagMatch: getEnvInt(
      scoringWeightOptions.tagMatch.envKey,
      scoringWeightOptions.tagMatch.defaultValue
    ),
    scopeProximity: getEnvInt(
      scoringWeightOptions.scopeProximity.envKey,
      scoringWeightOptions.scopeProximity.defaultValue
    ),
    textMatch: getEnvInt(
      scoringWeightOptions.textMatch.envKey,
      scoringWeightOptions.textMatch.defaultValue
    ),
    priorityMax: getEnvInt(
      scoringWeightOptions.priorityMax.envKey,
      scoringWeightOptions.priorityMax.defaultValue
    ),
    semanticMax: getEnvInt(
      scoringWeightOptions.semanticMax.envKey,
      scoringWeightOptions.semanticMax.defaultValue
    ),
    recencyMax: getEnvInt(
      scoringWeightOptions.recencyMax.envKey,
      scoringWeightOptions.recencyMax.defaultValue
    ),
  };
}

/**
 * Build feedback scoring config with proper typing.
 * Controls how user feedback affects entry scoring.
 *
 * @returns Feedback scoring configuration
 */
export function buildFeedbackScoring(): FeedbackScoringConfig {
  return {
    enabled: getEnvBoolean(
      feedbackScoringOptions.enabled.envKey,
      feedbackScoringOptions.enabled.defaultValue
    ),
    boostPerPositive: getEnvNumber(
      feedbackScoringOptions.boostPerPositive.envKey,
      feedbackScoringOptions.boostPerPositive.defaultValue
    ),
    boostMax: getEnvNumber(
      feedbackScoringOptions.boostMax.envKey,
      feedbackScoringOptions.boostMax.defaultValue
    ),
    penaltyPerNegative: getEnvNumber(
      feedbackScoringOptions.penaltyPerNegative.envKey,
      feedbackScoringOptions.penaltyPerNegative.defaultValue
    ),
    penaltyMax: getEnvNumber(
      feedbackScoringOptions.penaltyMax.envKey,
      feedbackScoringOptions.penaltyMax.defaultValue
    ),
    cacheTTLMs: getEnvInt(
      feedbackScoringOptions.cacheTTLMs.envKey,
      feedbackScoringOptions.cacheTTLMs.defaultValue
    ),
    cacheMaxSize: getEnvInt(
      feedbackScoringOptions.cacheMaxSize.envKey,
      feedbackScoringOptions.cacheMaxSize.defaultValue
    ),
  };
}

/**
 * Build entity scoring config with proper typing.
 * Controls how entity matches affect scoring.
 *
 * @returns Entity scoring configuration
 */
export function buildEntityScoring(): EntityScoringConfig {
  return {
    enabled: getEnvBoolean(
      entityScoringOptions.enabled.envKey,
      entityScoringOptions.enabled.defaultValue
    ),
    exactMatchBoost: getEnvInt(
      entityScoringOptions.exactMatchBoost.envKey,
      entityScoringOptions.exactMatchBoost.defaultValue
    ),
    partialMatchBoost: getEnvInt(
      entityScoringOptions.partialMatchBoost.envKey,
      entityScoringOptions.partialMatchBoost.defaultValue
    ),
  };
}
