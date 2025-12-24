/**
 * Summarizer Module
 *
 * Exports for LLM-based hierarchical summarization
 */

export { LLMSummarizer } from './llm-summarizer.js';
export type {
  SummarizationRequest,
  SummarizationResult,
  BatchSummarizationResult,
  SummarizerConfig,
  LLMProvider,
  HierarchyLevel,
  SummarizationItem,
  LevelPromptConfig,
  PromptVariables,
} from './types.js';
export { DEFAULT_SUMMARIZER_CONFIG, HIERARCHY_LEVEL_NAMES } from './types.js';
export { buildPrompts, getFallbackSummary, LEVEL_PROMPTS } from './prompts.js';
