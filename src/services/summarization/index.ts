/**
 * Hierarchical Summarization Module
 *
 * Public exports for the hierarchical summarization service.
 * This module provides multi-level summarization of memory entries using
 * community detection and LLM-based summarization.
 */

// Export main service
export { HierarchicalSummarizationService } from './hierarchical-summarization.service.js';

// Export hierarchical retriever (for query pipeline integration)
export {
  HierarchicalRetriever,
  createHierarchicalRetriever,
  createPipelineRetriever,
} from './hierarchical-retriever.js';
export type {
  RetrieveOptions,
  RetrievedEntry,
  RetrievalStep,
  RetrieveResult,
  HierarchicalRetrieverConfig,
} from './hierarchical-retriever.js';

// Export types
export type {
  HierarchicalSummarizationConfig,
  SummarizerProvider,
  HierarchyLevel,
  SummaryEntry,
  BuildSummariesOptions,
  BuildSummariesResult,
  SearchSummariesOptions,
  SummaryBuildStatus,
  SummarizableEntry,
  SummarizationRequest,
  SummarizationResult,
} from './types.js';

export { DEFAULT_HIERARCHICAL_SUMMARIZATION_CONFIG } from './types.js';

// Export community detection types (re-export for convenience)
export type {
  CommunityNode,
  Community,
  CommunityDetectionResult,
  CommunityDetectionConfig,
  CommunityDetectionAlgorithm,
  SimilarityGraph,
} from './community-detection/types.js';

export { DEFAULT_COMMUNITY_DETECTION_CONFIG } from './community-detection/types.js';
