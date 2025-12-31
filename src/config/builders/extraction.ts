/**
 * Extraction Configuration Builders
 *
 * Builds extraction-related nested configuration from environment variables.
 */

import { extractionConfidenceThresholds } from '../registry/index.js';
import { getEnvNumber } from './helpers.js';

/**
 * Confidence thresholds for each entry type during extraction.
 */
export interface ExtractionConfidenceThresholds {
  guideline: number;
  knowledge: number;
  tool: number;
  entity: number;
  relationship: number;
}

/**
 * Build extraction confidence thresholds with proper typing.
 * Each entry type can have its own confidence threshold.
 *
 * @returns Confidence thresholds for each entry type
 */
export function buildExtractionThresholds(): ExtractionConfidenceThresholds {
  return {
    guideline: getEnvNumber(
      extractionConfidenceThresholds.guideline.envKey,
      extractionConfidenceThresholds.guideline.defaultValue
    ),
    knowledge: getEnvNumber(
      extractionConfidenceThresholds.knowledge.envKey,
      extractionConfidenceThresholds.knowledge.defaultValue
    ),
    tool: getEnvNumber(
      extractionConfidenceThresholds.tool.envKey,
      extractionConfidenceThresholds.tool.defaultValue
    ),
    entity: getEnvNumber(
      extractionConfidenceThresholds.entity.envKey,
      extractionConfidenceThresholds.entity.defaultValue
    ),
    relationship: getEnvNumber(
      extractionConfidenceThresholds.relationship.envKey,
      extractionConfidenceThresholds.relationship.defaultValue
    ),
  };
}
