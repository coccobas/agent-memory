/**
 * Query Rewrite Service
 *
 * Provides query rewriting capabilities including:
 * - HyDE (Hypothetical Document Embedding)
 * - Query expansion (synonyms, relations, LLM-based)
 * - Intent classification
 * - Multi-hop query decomposition
 */

export * from './types.js';
export { IntentClassifier } from './classifier.js';
export { QueryExpander } from './expander.js';
export { HyDEGenerator } from './hyde.js';
export { QueryRewriteService, type ExtendedRewriteResult, type QueryRewriteServiceConfig, type QueryRewriteServiceDeps } from './query-rewrite.service.js';
export { QueryDecomposer, type QueryDecomposerConfig, type ComplexityAnalysis } from './decomposer.js';
export { SubQueryExecutor, type SubQueryExecutorConfig, type SubQueryResult, type MergedResults, type ResultEntry, type QueryFn } from './executor.js';
