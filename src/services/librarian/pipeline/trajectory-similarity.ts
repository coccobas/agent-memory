/**
 * Trajectory Similarity Service
 *
 * Compares experience trajectories (sequences of actions/observations)
 * to identify similar problem-solving patterns.
 */

import type { ExperienceTrajectoryStep } from '../../../db/schema/experiences.js';
import {
  jaccardSimilarityArrays,
  lcsSimilarity,
  editDistanceSimilarity,
  weightedMean,
} from '../utils/math.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Normalized step for comparison
 */
export interface NormalizedStep {
  actionType: string;      // Canonical action type
  toolCategory?: string;   // Category of tool used (if any)
  success: boolean;
  hasObservation: boolean;
  hasReasoning: boolean;
}

/**
 * Trajectory comparison result
 */
export interface TrajectorySimilarityResult {
  /** Overall similarity score (0-1) */
  similarity: number;
  /** Individual component scores */
  components: {
    actionSequence: number;   // LCS-based sequence similarity
    actionSet: number;        // Jaccard similarity of action types
    toolSet: number;          // Jaccard similarity of tools used
    outcomePattern: number;   // Success/failure pattern similarity
    length: number;           // Length similarity
  };
  /** Matching action pairs from LCS */
  matchingActions: Array<{ step1: number; step2: number; action: string }>;
  /** Confidence in the comparison */
  confidence: number;
}

// =============================================================================
// ACTION TYPE NORMALIZATION
// =============================================================================

/**
 * Canonical action categories
 */
const ACTION_CATEGORIES: Record<string, string[]> = {
  read: [
    'read', 'view', 'examine', 'inspect', 'look', 'check', 'review',
    'analyze', 'study', 'observe', 'cat', 'less', 'head', 'tail',
  ],
  search: [
    'search', 'find', 'locate', 'grep', 'query', 'lookup', 'discover',
    'scan', 'explore', 'browse', 'rg', 'ag', 'find',
  ],
  write: [
    'write', 'create', 'add', 'insert', 'append', 'generate', 'produce',
    'compose', 'author', 'draft', 'touch', 'mkdir',
  ],
  edit: [
    'edit', 'modify', 'change', 'update', 'fix', 'patch', 'revise',
    'refactor', 'rewrite', 'adjust', 'sed', 'awk',
  ],
  delete: [
    'delete', 'remove', 'erase', 'drop', 'clear', 'clean', 'purge',
    'rm', 'rmdir', 'unlink',
  ],
  execute: [
    'execute', 'run', 'invoke', 'call', 'trigger', 'launch', 'start',
    'perform', 'process', 'npm', 'node', 'python', 'bash', 'sh',
  ],
  test: [
    'test', 'verify', 'validate', 'check', 'assert', 'confirm', 'ensure',
    'jest', 'vitest', 'mocha', 'pytest',
  ],
  build: [
    'build', 'compile', 'bundle', 'package', 'assemble', 'construct',
    'tsc', 'webpack', 'rollup', 'vite',
  ],
  install: [
    'install', 'setup', 'configure', 'provision', 'deploy', 'initialize',
    'npm install', 'yarn add', 'pip install',
  ],
  debug: [
    'debug', 'trace', 'log', 'print', 'inspect', 'breakpoint', 'step',
    'console.log', 'debugger',
  ],
  navigate: [
    'navigate', 'go', 'move', 'switch', 'open', 'access', 'enter',
    'cd', 'pushd', 'popd',
  ],
  compare: [
    'compare', 'diff', 'contrast', 'distinguish', 'differentiate',
    'git diff', 'vimdiff',
  ],
  commit: [
    'commit', 'save', 'store', 'persist', 'checkpoint',
    'git commit', 'git add',
  ],
  revert: [
    'revert', 'undo', 'rollback', 'restore', 'reset', 'checkout',
    'git checkout', 'git reset',
  ],
};

/**
 * Normalize action text to a canonical action type
 *
 * @param action Raw action text
 * @returns Canonical action type
 */
export function normalizeActionType(action: string): string {
  const lowerAction = action.toLowerCase().trim();

  // Check each category for matches
  for (const [category, keywords] of Object.entries(ACTION_CATEGORIES)) {
    for (const keyword of keywords) {
      if (lowerAction.includes(keyword)) {
        return category;
      }
    }
  }

  // Extract first word as fallback
  const firstWord = lowerAction.split(/\s+/)[0];
  if (firstWord && firstWord.length > 2) {
    return firstWord;
  }

  return 'other';
}

/**
 * Categorize a tool name
 */
export function normalizeToolCategory(tool: string | null | undefined): string | undefined {
  if (!tool) return undefined;

  const lowerTool = tool.toLowerCase();

  if (['grep', 'rg', 'ag', 'find', 'fd'].some(t => lowerTool.includes(t))) {
    return 'search';
  }
  if (['cat', 'less', 'head', 'tail', 'bat'].some(t => lowerTool.includes(t))) {
    return 'read';
  }
  if (['sed', 'awk', 'vi', 'vim', 'nano', 'emacs'].some(t => lowerTool.includes(t))) {
    return 'edit';
  }
  if (['git'].some(t => lowerTool.includes(t))) {
    return 'vcs';
  }
  if (['npm', 'yarn', 'pnpm', 'pip', 'cargo'].some(t => lowerTool.includes(t))) {
    return 'package';
  }
  if (['tsc', 'node', 'python', 'bash', 'sh', 'zsh'].some(t => lowerTool.includes(t))) {
    return 'runtime';
  }
  if (['jest', 'vitest', 'mocha', 'pytest'].some(t => lowerTool.includes(t))) {
    return 'test';
  }
  if (['docker', 'kubectl', 'terraform'].some(t => lowerTool.includes(t))) {
    return 'infra';
  }

  return 'other';
}

// =============================================================================
// STEP NORMALIZATION
// =============================================================================

/**
 * Convert a trajectory step to a normalized form for comparison
 */
export function normalizeStep(step: ExperienceTrajectoryStep): NormalizedStep {
  return {
    actionType: normalizeActionType(step.action),
    toolCategory: normalizeToolCategory(step.toolUsed),
    success: step.success ?? true,
    hasObservation: !!step.observation && step.observation.length > 0,
    hasReasoning: !!step.reasoning && step.reasoning.length > 0,
  };
}

/**
 * Normalize a full trajectory
 */
export function normalizeTrajectory(steps: ExperienceTrajectoryStep[]): NormalizedStep[] {
  return steps.map(normalizeStep);
}

// =============================================================================
// SIMILARITY CALCULATION
// =============================================================================

/**
 * Calculate similarity between two trajectories
 *
 * Uses multiple metrics:
 * - Action sequence similarity (LCS-based)
 * - Action set similarity (Jaccard)
 * - Tool set similarity (Jaccard)
 * - Success pattern similarity
 * - Length similarity
 */
export function calculateTrajectorySimilarity(
  trajectory1: ExperienceTrajectoryStep[],
  trajectory2: ExperienceTrajectoryStep[]
): TrajectorySimilarityResult {
  // Handle empty trajectories
  if (trajectory1.length === 0 && trajectory2.length === 0) {
    return {
      similarity: 1.0,
      components: {
        actionSequence: 1.0,
        actionSet: 1.0,
        toolSet: 1.0,
        outcomePattern: 1.0,
        length: 1.0,
      },
      matchingActions: [],
      confidence: 0.0, // No data to compare
    };
  }

  if (trajectory1.length === 0 || trajectory2.length === 0) {
    return {
      similarity: 0.0,
      components: {
        actionSequence: 0.0,
        actionSet: 0.0,
        toolSet: 0.0,
        outcomePattern: 0.0,
        length: 0.0,
      },
      matchingActions: [],
      confidence: 0.5,
    };
  }

  // Normalize both trajectories
  const norm1 = normalizeTrajectory(trajectory1);
  const norm2 = normalizeTrajectory(trajectory2);

  // Extract action type sequences
  const actions1 = norm1.map(s => s.actionType);
  const actions2 = norm2.map(s => s.actionType);

  // Calculate action sequence similarity (order matters)
  const actionSequenceSimilarity = lcsSimilarity(actions1, actions2);

  // Calculate action set similarity (order doesn't matter)
  const actionSetSimilarity = jaccardSimilarityArrays(actions1, actions2);

  // Extract tool categories
  const tools1 = norm1.map(s => s.toolCategory).filter((t): t is string => t !== undefined);
  const tools2 = norm2.map(s => s.toolCategory).filter((t): t is string => t !== undefined);
  const toolSetSimilarity = tools1.length > 0 || tools2.length > 0
    ? jaccardSimilarityArrays(tools1, tools2)
    : 1.0; // If neither has tools, consider them similar

  // Calculate success pattern similarity
  const outcomes1 = norm1.map(s => s.success);
  const outcomes2 = norm2.map(s => s.success);
  const outcomePatternSimilarity = editDistanceSimilarity(outcomes1, outcomes2);

  // Calculate length similarity (penalize very different lengths)
  const maxLen = Math.max(trajectory1.length, trajectory2.length);
  const minLen = Math.min(trajectory1.length, trajectory2.length);
  const lengthSimilarity = minLen / maxLen;

  // Find matching actions for reference
  const matchingActions = findMatchingActions(actions1, actions2);

  // Calculate weighted overall similarity
  const components = {
    actionSequence: actionSequenceSimilarity,
    actionSet: actionSetSimilarity,
    toolSet: toolSetSimilarity,
    outcomePattern: outcomePatternSimilarity,
    length: lengthSimilarity,
  };

  // Weights for different components
  const weights = {
    actionSequence: 0.35,  // Order matters most
    actionSet: 0.25,       // But the types of actions matter too
    toolSet: 0.15,         // Tools provide context
    outcomePattern: 0.15,  // Similar outcome patterns matter
    length: 0.10,          // Length is less important
  };

  const similarity = weightedMean(
    Object.values(components),
    Object.values(weights)
  );

  // Confidence based on trajectory lengths
  const avgLen = (trajectory1.length + trajectory2.length) / 2;
  const confidence = Math.min(1.0, avgLen / 5); // Higher confidence with more steps

  return {
    similarity,
    components,
    matchingActions,
    confidence,
  };
}

/**
 * Find matching action pairs using LCS
 */
function findMatchingActions(
  actions1: string[],
  actions2: string[]
): Array<{ step1: number; step2: number; action: string }> {
  const matches: Array<{ step1: number; step2: number; action: string }> = [];

  // Simple greedy matching for illustration
  // A full LCS implementation would provide optimal matches
  const used2 = new Set<number>();

  for (let i = 0; i < actions1.length; i++) {
    const action1 = actions1[i]!;
    for (let j = 0; j < actions2.length; j++) {
      const action2 = actions2[j]!;
      if (!used2.has(j) && action1 === action2) {
        matches.push({ step1: i, step2: j, action: action1 });
        used2.add(j);
        break;
      }
    }
  }

  return matches;
}

/**
 * Check if two trajectories are similar enough to be considered patterns
 *
 * @param threshold Minimum similarity score (default 0.7)
 */
export function areTrajectoriessimilar(
  trajectory1: ExperienceTrajectoryStep[],
  trajectory2: ExperienceTrajectoryStep[],
  threshold = 0.7
): boolean {
  const result = calculateTrajectorySimilarity(trajectory1, trajectory2);
  return result.similarity >= threshold && result.confidence >= 0.3;
}
