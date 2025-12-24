/**
 * Retrieval State Builder
 *
 * Builds state features for retrieval policy from query context.
 */

import type { RetrievalState } from '../types.js';

// =============================================================================
// STATE BUILDER
// =============================================================================

export interface RetrievalStateParams {
  queryText: string;
  conversationContext: {
    turnNumber: number;
    conversationDepth: number;
    recentToolCalls: number;
    hasErrors: boolean;
  };
  memoryStats: {
    totalEntries: number;
    recentRetrievals: number;
    avgRetrievalSuccess: number;
    lastRetrievalTime?: number;
  };
}

/**
 * Build retrieval state from query context
 */
export function buildRetrievalState(params: RetrievalStateParams): RetrievalState {
  const { queryText, conversationContext, memoryStats } = params;

  // Query features
  const queryFeatures = extractQueryFeatures(queryText);

  // Context features (already provided)
  const contextFeatures = {
    turnNumber: conversationContext.turnNumber,
    conversationDepth: conversationContext.conversationDepth,
    recentToolCalls: conversationContext.recentToolCalls,
    hasErrors: conversationContext.hasErrors,
  };

  // Memory stats (already provided)
  const memoryStatsFeatures = {
    totalEntries: memoryStats.totalEntries,
    recentRetrievals: memoryStats.recentRetrievals,
    avgRetrievalSuccess: memoryStats.avgRetrievalSuccess,
    lastRetrievalTime: memoryStats.lastRetrievalTime,
  };

  return {
    queryFeatures,
    contextFeatures,
    memoryStats: memoryStatsFeatures,
  };
}

// =============================================================================
// QUERY FEATURE EXTRACTION
// =============================================================================

/**
 * Extract features from query text
 */
function extractQueryFeatures(queryText: string): RetrievalState['queryFeatures'] {
  const queryLength = queryText.length;
  const hasKeywords = detectKeywords(queryText);
  const queryComplexity = computeQueryComplexity(queryText);
  const semanticCategory = categorizeQuery(queryText);

  return {
    queryLength,
    hasKeywords,
    queryComplexity,
    semanticCategory,
  };
}

/**
 * Detect if query has important keywords
 */
function detectKeywords(query: string): boolean {
  const keywords = [
    // Technical
    'how',
    'what',
    'why',
    'explain',
    'show',
    'find',
    'search',
    'list',

    // Memory-related
    'remember',
    'recall',
    'previous',
    'last time',
    'before',
    'earlier',

    // Tool/code-related
    'command',
    'function',
    'code',
    'implement',
    'build',
    'create',

    // Question indicators
    '?',
    'can you',
    'could you',
    'would you',
  ];

  const lowerQuery = query.toLowerCase();
  return keywords.some(keyword => lowerQuery.includes(keyword));
}

/**
 * Compute query complexity (0-1)
 */
function computeQueryComplexity(query: string): number {
  let score = 0.0;

  // Length-based complexity
  if (query.length > 50) score += 0.2;
  if (query.length > 100) score += 0.2;
  if (query.length > 200) score += 0.1;

  // Word count
  const words = query.split(/\s+/).length;
  if (words > 5) score += 0.1;
  if (words > 10) score += 0.1;
  if (words > 20) score += 0.1;

  // Multiple sentences
  const sentences = query.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  if (sentences > 1) score += 0.1;
  if (sentences > 2) score += 0.1;

  // Technical terms
  const technicalTerms = query.match(/\b[A-Z][a-z]+[A-Z][a-z]+\b/g) || [];
  score += Math.min(technicalTerms.length * 0.05, 0.2);

  // Code syntax
  if (query.includes('```') || query.match(/`[^`]+`/)) {
    score += 0.2;
  }

  return Math.min(score, 1.0);
}

/**
 * Categorize query semantically
 */
function categorizeQuery(query: string): string {
  const lowerQuery = query.toLowerCase();

  // Greeting/social
  if (
    lowerQuery.match(/^(hi|hello|hey|thanks|thank you|bye|goodbye)\b/) ||
    lowerQuery.length < 15
  ) {
    return 'social';
  }

  // Question
  if (lowerQuery.includes('?') || lowerQuery.match(/^(what|how|why|when|where|who)\b/)) {
    return 'question';
  }

  // Command/request
  if (
    lowerQuery.match(
      /^(show|list|find|search|get|fetch|retrieve|display|explain|tell|describe)\b/
    )
  ) {
    return 'command';
  }

  // Information seeking
  if (lowerQuery.match(/\b(how to|how do|can you|could you|would you|please)\b/)) {
    return 'information_seeking';
  }

  // Technical/code
  if (
    lowerQuery.match(/\b(function|class|interface|type|implement|build|create|code)\b/)
  ) {
    return 'technical';
  }

  // Memory recall
  if (lowerQuery.match(/\b(remember|recall|previous|before|earlier|last time)\b/)) {
    return 'memory_recall';
  }

  // Default
  return 'general';
}
