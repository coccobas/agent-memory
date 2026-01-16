/**
 * Extraction State Builder
 *
 * Builds state features for extraction policy from conversation context.
 */

import type { ExtractionState } from '../types.js';
import type { TurnData, TurnMetrics } from '../../capture/types.js';

// =============================================================================
// STATE BUILDER
// =============================================================================

export interface ExtractionStateParams {
  turns: TurnData[];
  metrics: TurnMetrics;
  memoryContext: {
    totalEntries: number;
    recentExtractions: number;
    sessionCaptureCount: number;
  };
  similarityCheck?: {
    hasSimilar: boolean;
    maxSimilarity?: number;
  };
}

/**
 * Build extraction state from conversation context
 */
export function buildExtractionState(params: ExtractionStateParams): ExtractionState {
  const { turns, metrics, memoryContext, similarityCheck } = params;

  // Context features from conversation metrics
  const contextFeatures = {
    turnNumber: metrics.turnCount,
    tokenCount: metrics.totalTokens,
    toolCallCount: metrics.toolCallCount,
    hasError: metrics.errorCount > 0,
    userTurnCount: metrics.userTurnCount,
    assistantTurnCount: metrics.assistantTurnCount,
  };

  // Memory state features
  const memoryState = {
    totalEntries: memoryContext.totalEntries,
    recentExtractions: memoryContext.recentExtractions,
    similarEntryExists: similarityCheck?.hasSimilar ?? false,
    sessionCaptureCount: memoryContext.sessionCaptureCount,
  };

  // Content features from recent turns
  const contentFeatures = extractContentFeatures(turns);

  return {
    contextFeatures,
    memoryState,
    contentFeatures,
  };
}

// =============================================================================
// CONTENT FEATURE EXTRACTION
// =============================================================================

/**
 * Extract content features from conversation turns
 */
function extractContentFeatures(turns: TurnData[]): ExtractionState['contentFeatures'] {
  // Analyze recent turns (last 3)
  const recentTurns = turns.slice(-3);
  const combinedContent = recentTurns.map((t) => t.content.toLowerCase()).join(' ');

  // Pattern matching for content types
  const hasDecision = detectDecision(combinedContent);
  const hasRule = detectRule(combinedContent);
  const hasFact = detectFact(combinedContent);
  const hasCommand = detectCommand(combinedContent);

  // Compute novelty score (placeholder - could use embeddings)
  const noveltyScore = computeNoveltyScore(combinedContent);

  // Compute complexity score
  const complexity = computeComplexity(combinedContent);

  return {
    hasDecision,
    hasRule,
    hasFact,
    hasCommand,
    noveltyScore,
    complexity,
  };
}

/**
 * Detect decision-making content
 */
function detectDecision(content: string): boolean {
  const decisionKeywords = [
    'decided',
    'chose',
    'selected',
    'opted for',
    'went with',
    'because',
    'rationale',
    'tradeoff',
  ];
  return decisionKeywords.some((keyword) => content.includes(keyword));
}

/**
 * Detect rule/guideline content
 */
function detectRule(content: string): boolean {
  const ruleKeywords = [
    'always',
    'never',
    'must',
    'should',
    'policy',
    'standard',
    'convention',
    'best practice',
    'guideline',
  ];
  return ruleKeywords.some((keyword) => content.includes(keyword));
}

/**
 * Detect factual content
 */
function detectFact(content: string): boolean {
  const factKeywords = [
    'uses',
    'implements',
    'based on',
    'configured',
    'running',
    'version',
    'located',
    'stored',
  ];
  return factKeywords.some((keyword) => content.includes(keyword));
}

/**
 * Detect command/tool content
 */
function detectCommand(content: string): boolean {
  const commandPatterns = [
    /`[a-z][\w-]*\s+/i, // Command syntax: `command args`
    /npm\s+(install|run|start)/,
    /git\s+(commit|push|pull)/,
    /docker\s+(build|run|exec)/,
    /function\s+\w+\(/,
    /def\s+\w+\(/,
  ];
  return commandPatterns.some((pattern) => pattern.test(content));
}

/**
 * Compute novelty score (0-1)
 * Higher score = more unique/novel content
 */
function computeNoveltyScore(content: string): number {
  // Simple heuristic based on content characteristics
  let score = 0.5; // Base score

  // Increase for longer, detailed content
  if (content.length > 500) score += 0.2;
  if (content.length > 1000) score += 0.1;

  // Increase for technical terms
  const technicalTerms = content.match(/\b[A-Z][a-z]+[A-Z][a-z]+\b/g) || [];
  score += Math.min(technicalTerms.length * 0.05, 0.3);

  // Increase for code blocks
  const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
  score += Math.min(codeBlocks.length * 0.1, 0.2);

  return Math.min(score, 1.0);
}

/**
 * Compute complexity score (0-1)
 * Higher score = more complex/sophisticated content
 */
function computeComplexity(content: string): number {
  let score = 0.0;

  // Word count
  const words = content.split(/\s+/).length;
  if (words > 50) score += 0.2;
  if (words > 100) score += 0.2;
  if (words > 200) score += 0.1;

  // Sentence count
  const sentences = content.split(/[.!?]+/).length;
  if (sentences > 3) score += 0.1;
  if (sentences > 6) score += 0.1;

  // Technical indicators
  if (content.includes('function') || content.includes('class')) score += 0.1;
  if (content.includes('async') || content.includes('await')) score += 0.1;
  if (content.includes('interface') || content.includes('type')) score += 0.1;

  // Nested structures
  const braceDepth = computeBraceDepth(content);
  score += Math.min(braceDepth * 0.1, 0.2);

  return Math.min(score, 1.0);
}

/**
 * Compute maximum nesting depth of braces/brackets
 */
function computeBraceDepth(content: string): number {
  let depth = 0;
  let maxDepth = 0;

  for (const char of content) {
    if (char === '{' || char === '[' || char === '(') {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    } else if (char === '}' || char === ']' || char === ')') {
      depth--;
    }
  }

  return maxDepth;
}
