/**
 * Config Registry
 *
 * Assembles all configuration sections into a complete registry.
 * This is the single source of truth for config metadata.
 */

import { z } from 'zod';
import type { ConfigRegistry, ConfigOptionMeta } from './types.js';

// Import all sections
import { databaseSection } from './sections/database.js';
import { postgresqlSection } from './sections/postgresql.js';
import { vectorDbSection } from './sections/vectorDb.js';
import { embeddingSection } from './sections/embedding.js';
import { extractionSection, extractionConfidenceThresholds } from './sections/extraction.js';
import { loggingSection } from './sections/logging.js';
import { cacheSection } from './sections/cache.js';
import { memorySection } from './sections/memory.js';
import {
  rateLimitSection,
  rateLimitPerAgentOptions,
  rateLimitGlobalOptions,
  rateLimitBurstOptions,
} from './sections/rateLimit.js';
import { semanticSearchSection } from './sections/semanticSearch.js';
import { recencySection, recencyDecayHalfLifeOptions } from './sections/recency.js';
import { scoringSection, scoringWeightOptions, feedbackScoringOptions, entityScoringOptions } from './sections/scoring.js';
import { validationSection } from './sections/validation.js';
import { paginationSection } from './sections/pagination.js';
import { healthSection } from './sections/health.js';
import { retrySection } from './sections/retry.js';
import { transactionSection } from './sections/transaction.js';
import { conflictSection } from './sections/conflict.js';
import { runtimeSection } from './sections/runtime.js';
import { timestampsSection } from './sections/timestamps.js';
import { outputSection } from './sections/output.js';
import { restSection } from './sections/rest.js';
import { securitySection } from './sections/security.js';
import { pathsSection } from './sections/paths.js';
import { backupSection } from './sections/backup.js';
import { redisSection } from './sections/redis.js';
import { captureSection } from './sections/capture.js';
import { rlSection } from './sections/rl.js';
import { queryRewriteSection } from './sections/queryRewrite.js';
import { loraSection } from './sections/lora.js';
import { feedbackSection } from './sections/feedback.js';
import { circuitBreakerSection } from './sections/circuitBreaker.js';
import { rerankSection } from './sections/rerank.js';
import { hierarchicalSection } from './sections/hierarchical.js';
import { searchSection } from './sections/search.js';
import { autoContextSection } from './sections/autoContext.js';
import { classificationSection } from './sections/classification.js';

// =============================================================================
// TOP-LEVEL OPTIONS
// =============================================================================

const dbTypeOption: ConfigOptionMeta = {
  envKey: 'AGENT_MEMORY_DB_TYPE',
  defaultValue: 'sqlite',
  description: 'Database backend: sqlite (default) or postgresql (enterprise).',
  schema: z.enum(['sqlite', 'postgresql']),
  allowedValues: ['sqlite', 'postgresql'] as const,
};

// =============================================================================
// COMPLETE REGISTRY
// =============================================================================

/**
 * The complete config registry with all sections.
 */
export const configRegistry: ConfigRegistry = {
  topLevel: {
    dbType: dbTypeOption,
  },
  sections: {
    database: databaseSection,
    postgresql: postgresqlSection,
    vectorDb: vectorDbSection,
    embedding: embeddingSection,
    extraction: extractionSection,
    logging: loggingSection,
    cache: cacheSection,
    memory: memorySection,
    rateLimit: rateLimitSection,
    semanticSearch: semanticSearchSection,
    recency: recencySection,
    scoring: scoringSection,
    validation: validationSection,
    pagination: paginationSection,
    health: healthSection,
    retry: retrySection,
    transaction: transactionSection,
    conflict: conflictSection,
    runtime: runtimeSection,
    timestamps: timestampsSection,
    output: outputSection,
    rest: restSection,
    security: securitySection,
    paths: pathsSection,
    backup: backupSection,
    redis: redisSection,
    capture: captureSection,
    rl: rlSection,
    queryRewrite: queryRewriteSection,
    lora: loraSection,
    feedback: feedbackSection,
    circuitBreaker: circuitBreakerSection,
    rerank: rerankSection,
    hierarchical: hierarchicalSection,
    search: searchSection,
    autoContext: autoContextSection,
    classification: classificationSection,
  },
};

// =============================================================================
// NESTED OPTIONS EXPORTS
// =============================================================================

// These are exported for use in config builder for deeply nested options
export {
  extractionConfidenceThresholds,
  rateLimitPerAgentOptions,
  rateLimitGlobalOptions,
  rateLimitBurstOptions,
  recencyDecayHalfLifeOptions,
  scoringWeightOptions,
  feedbackScoringOptions,
  entityScoringOptions,
};

// Re-export types and utilities
export type { ConfigRegistry, ConfigSectionMeta, ConfigOptionMeta } from './types.js';
export {
  buildConfigSchema,
  validateConfig,
  getAllEnvVars,
  buildConfigFromRegistry,
} from './schema-builder.js';
