/**
 * Recency Configuration Builders
 *
 * Builds recency decay nested configuration from environment variables.
 */

import { recencyDecayHalfLifeOptions } from '../registry/index.js';
import { getEnvInt } from './helpers.js';

/**
 * Decay half-life configuration per entry type.
 */
export interface RecencyDecayHalfLifeDays {
  guideline: number;
  knowledge: number;
  tool: number;
}

/**
 * Build recency decay half-life config with proper typing.
 * Each entry type can have its own decay rate.
 *
 * @returns Decay half-life days for each entry type
 */
export function buildRecencyDecayHalfLife(): RecencyDecayHalfLifeDays {
  return {
    guideline: getEnvInt(
      recencyDecayHalfLifeOptions.guideline.envKey,
      recencyDecayHalfLifeOptions.guideline.defaultValue
    ),
    knowledge: getEnvInt(
      recencyDecayHalfLifeOptions.knowledge.envKey,
      recencyDecayHalfLifeOptions.knowledge.defaultValue
    ),
    tool: getEnvInt(
      recencyDecayHalfLifeOptions.tool.envKey,
      recencyDecayHalfLifeOptions.tool.defaultValue
    ),
  };
}
