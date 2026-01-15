/**
 * Base Policy Interface and Implementation
 *
 * Abstract base class for all RL policies with:
 * - Learned decision making via trained models
 * - Automatic fallback to rule-based decisions
 * - Enable/disable controls
 */

import type { PolicyDecision } from '../types.js';
import { createComponentLogger } from '../../../utils/logger.js';

const logger = createComponentLogger('policy');

// Re-export PolicyDecision for convenience
export type { PolicyDecision };

// =============================================================================
// POLICY INTERFACE
// =============================================================================

/**
 * Interface for RL policies
 */
export interface IPolicy<TState, TAction> {
  /**
   * Make a decision using learned policy (or fallback)
   */
  decide(state: TState): Promise<PolicyDecision<TAction>>;

  /**
   * Make a decision with automatic fallback
   */
  decideWithFallback(state: TState): Promise<PolicyDecision<TAction>>;

  /**
   * Check if learned policy is enabled and available
   */
  isEnabled(): boolean;

  /**
   * Get fallback decision function (synchronous rule-based)
   */
  getFallback(): (state: TState) => PolicyDecision<TAction>;
}

// =============================================================================
// BASE POLICY IMPLEMENTATION
// =============================================================================

/**
 * Abstract base policy with fallback support
 *
 * All policies extend this to get:
 * - Automatic fallback when model unavailable
 * - Enable/disable controls
 * - Error recovery
 */
export abstract class BasePolicy<TState, TAction> implements IPolicy<TState, TAction> {
  protected enabled: boolean;
  protected modelPath?: string;

  constructor(config: { enabled: boolean; modelPath?: string }) {
    this.enabled = config.enabled;
    this.modelPath = config.modelPath;
  }

  /**
   * Make a decision using learned model
   * Override this to implement model inference
   */
  abstract decide(state: TState): Promise<PolicyDecision<TAction>>;

  /**
   * Get fallback rule-based decision function
   * Override this to implement fallback logic
   */
  abstract getFallback(): (state: TState) => PolicyDecision<TAction>;

  /**
   * Check if learned policy is enabled
   * Policy is enabled if:
   * - enabled flag is true
   * - modelPath is provided
   */
  isEnabled(): boolean {
    return this.enabled && !!this.modelPath;
  }

  /**
   * Make a decision with automatic fallback
   * Uses learned policy if enabled, otherwise falls back to rules
   */
  async decideWithFallback(state: TState): Promise<PolicyDecision<TAction>> {
    if (!this.isEnabled()) {
      return this.getFallback()(state);
    }

    try {
      return await this.decide(state);
    } catch (error) {
      // Log error and fall back to rules
      logger.warn({ error }, 'Policy decision failed, using fallback');
      return this.getFallback()(state);
    }
  }

  /**
   * Update policy configuration
   */
  updateConfig(config: { enabled?: boolean; modelPath?: string }): void {
    if (config.enabled !== undefined) {
      this.enabled = config.enabled;
    }
    if (config.modelPath !== undefined) {
      this.modelPath = config.modelPath;
    }
  }

  /**
   * Load model (placeholder for future implementation)
   * Override this when adding model inference
   */
  protected async loadModel(): Promise<void> {
    // Placeholder: actual model loading will be implemented later
    // For now, policies just use fallback rules
  }

  /**
   * Unload model to free memory
   */
  protected async unloadModel(): Promise<void> {
    // Placeholder: actual model cleanup will be implemented later
  }
}
