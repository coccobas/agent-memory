/**
 * Centralized confidence thresholds for intent detection.
 *
 * These thresholds determine how the system responds to detected intents:
 * - Below `low`: Intent is flagged as low confidence, user prompted for clarification
 * - Between `low` and `default`: Intent is processed but may need verification
 * - Above `high`: High confidence, used for specific patterns like learn_experience
 */
export const INTENT_CONFIDENCE_THRESHOLDS = {
  /** Below this = low confidence warning (user prompted for clarification) */
  low: 0.5,
  /** Default threshold for intent detection */
  default: 0.7,
  /** High confidence (used for specific patterns) */
  high: 0.85,
} as const;

export type IntentConfidenceLevel = keyof typeof INTENT_CONFIDENCE_THRESHOLDS;
