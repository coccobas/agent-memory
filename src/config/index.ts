/**
 * Centralized configuration module for Agent Memory
 *
 * Configuration is built from the registry at src/config/registry/.
 * Each option declares envKey, default, description, schema, and parser.
 *
 * To add a new config option:
 *   1. Find or create the section in src/config/registry/sections/
 *   2. Add the option with envKey, defaultValue, description, schema
 *   3. Optionally add parse: 'int' | 'boolean' | 'path' | custom function
 *   4. Run `npm run docs:generate:env` to update documentation
 *
 * Usage:
 *   import { config } from './config/index.js';
 *   console.log(config.database.path);
 */

import {
  configRegistry,
  buildConfigSchema,
  buildConfigFromRegistry,
  extractionConfidenceThresholds,
  rateLimitPerAgentOptions,
  rateLimitGlobalOptions,
  rateLimitBurstOptions,
  recencyDecayHalfLifeOptions,
  scoringWeightOptions,
  feedbackScoringOptions,
  entityScoringOptions,
} from './registry/index.js';
import { parseInt_, parseNumber, parseBoolean, projectRoot } from './registry/parsers.js';

// =============================================================================
// CONFIGURATION INTERFACE
// =============================================================================

/** Database type: SQLite (default) or PostgreSQL (enterprise) */
export type DatabaseType = 'sqlite' | 'postgresql';

export interface Config {
  dbType: DatabaseType;
  database: {
    path: string;
    skipInit: boolean;
    verbose: boolean;
    devMode: boolean;
    autoFixChecksums: boolean;
    busyTimeoutMs: number;
  };
  postgresql: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: boolean;
    sslRejectUnauthorized: boolean;
    poolMin: number;
    poolMax: number;
    idleTimeoutMs: number;
    connectionTimeoutMs: number;
    statementTimeoutMs: number;
  };
  vectorDb: {
    backend: 'auto' | 'pgvector' | 'lancedb';
    path: string;
    distanceMetric: 'cosine' | 'l2' | 'dot';
  };
  embedding: {
    provider: 'openai' | 'local' | 'disabled';
    openaiApiKey: string | undefined;
    openaiModel: string;
    maxConcurrency: number;
    maxRetries: number;
    retryDelayMs: number;
  };
  extraction: {
    provider: 'openai' | 'anthropic' | 'ollama' | 'disabled';
    openaiApiKey: string | undefined;
    openaiBaseUrl: string | undefined;
    strictBaseUrlAllowlist: boolean;
    openaiModel: string;
    anthropicApiKey: string | undefined;
    anthropicModel: string;
    ollamaBaseUrl: string;
    ollamaModel: string;
    maxTokens: number;
    temperature: number;
    confidenceThreshold: number;
    confidenceThresholds: {
      guideline: number;
      knowledge: number;
      tool: number;
      entity: number;
      relationship: number;
    };
    // Incremental extraction
    incrementalEnabled: boolean;
    incrementalWindowSize: number;
    incrementalWindowOverlap: number;
    incrementalMinTokens: number;
    incrementalMaxTokens: number;
    // Trigger detection
    triggerDetectionEnabled: boolean;
    triggerCooldownMs: number;
    // Atomicity - ensure entries contain one concept each
    atomicityEnabled: boolean;
    atomicitySplitMode: 'silent' | 'log' | 'disabled';
    atomicityMaxSplits: number;
    atomicityContentThreshold: number;
  };
  logging: {
    level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
    debug: boolean;
    performance: boolean;
  };
  cache: {
    totalLimitMB: number;
    queryCacheTTLMs: number;
    scopeCacheTTLMs: number;
    maxPreparedStatements: number;
    queryCacheSize: number;
    queryCacheMemoryMB: number;
    pressureThreshold: number;
    evictionTarget: number;
  };
  memory: {
    heapPressureThreshold: number;
    checkIntervalMs: number;
  };
  rateLimit: {
    enabled: boolean;
    perAgent: { maxRequests: number; windowMs: number };
    global: { maxRequests: number; windowMs: number };
    burst: { maxRequests: number; windowMs: number };
  };
  semanticSearch: {
    defaultThreshold: number;
    scoreWeight: number;
    duplicateThreshold: number;
  };
  recency: {
    defaultDecayHalfLifeDays: number;
    defaultRecencyWeight: number;
    maxRecencyBoost: number;
    useUpdatedAt: boolean;
    decayHalfLifeDays: {
      guideline: number;
      knowledge: number;
      tool: number;
    };
  };
  scoring: {
    weights: {
      explicitRelation: number;
      tagMatch: number;
      scopeProximity: number;
      textMatch: number;
      priorityMax: number;
      semanticMax: number;
      recencyMax: number;
    };
    feedbackScoring: {
      enabled: boolean;
      boostPerPositive: number;
      boostMax: number;
      penaltyPerNegative: number;
      penaltyMax: number;
      cacheTTLMs: number;
      cacheMaxSize: number;
    };
    entityScoring: {
      enabled: boolean;
      exactMatchBoost: number;
      partialMatchBoost: number;
    };
  };
  validation: {
    nameMaxLength: number;
    titleMaxLength: number;
    descriptionMaxLength: number;
    contentMaxLength: number;
    rationaleMaxLength: number;
    metadataMaxBytes: number;
    parametersMaxBytes: number;
    examplesMaxBytes: number;
    tagsMaxCount: number;
    examplesMaxCount: number;
    bulkOperationMax: number;
    regexPatternMaxLength: number;
    validationRulesQueryLimit: number;
    maxImportEntries: number;
  };
  pagination: {
    defaultLimit: number;
    maxLimit: number;
  };
  health: {
    checkIntervalMs: number;
    maxReconnectAttempts: number;
    reconnectBaseDelayMs: number;
    reconnectMaxDelayMs: number;
  };
  retry: {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
  };
  transaction: {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
  };
  conflict: {
    windowMs: number;
    highErrorCorrelationThreshold: number;
  };
  runtime: {
    nodeEnv: string;
    projectRoot: string;
  };
  timestamps: {
    displayTimezone: string;
  };
  output: {
    format: 'json' | 'compact';
  };
  rest: {
    enabled: boolean;
    host: string;
    port: number;
  };
  security: {
    restAuthDisabled: boolean;
    restApiKey: string | undefined;
    restApiKeys: string | undefined;
    restAgentId: string;
  };
  paths: {
    dataDir: string;
    backup: string;
    export: string;
    log: string;
  };
  backup: {
    schedule: string;
    retentionCount: number;
    enabled: boolean;
  };
  redis: {
    enabled: boolean;
    url: string | undefined;
    host: string;
    port: number;
    password: string | undefined;
    db: number;
    tls: boolean;
    keyPrefix: string;
    cacheTTLMs: number;
    lockTTLMs: number;
    lockRetryCount: number;
    lockRetryDelayMs: number;
    eventChannel: string;
    connectTimeoutMs: number;
    maxRetriesPerRequest: number;
  };
  feedback: {
    queueSize: number;
    workerConcurrency: number;
    batchTimeoutMs: number;
  };
  circuitBreaker: {
    failureThreshold: number;
    resetTimeoutMs: number;
    successThreshold: number;
  };
  queryRewrite: {
    enabled: boolean;
    hydeEnabled: boolean;
    hydeDocumentCount: number;
    hydeTemperature: number;
    hydeMaxTokens: number;
    expansionEnabled: boolean;
    expansionUseDictionary: boolean;
    expansionUseRelations: boolean;
    expansionUseLLM: boolean;
    maxExpansions: number;
    expansionWeight: number;
    decompositionEnabled: boolean;
    intentClassificationMode: 'pattern' | 'llm' | 'hybrid';
    provider: 'openai' | 'anthropic' | 'ollama' | 'disabled';
    model: string | undefined;
  };
  rerank: {
    enabled: boolean;
    topK: number;
    alpha: number;
    minScoreThreshold: number;
    semanticQueriesOnly: boolean;
  };
  hierarchical: {
    enabled: boolean;
    minEntriesThreshold: number;
    maxCandidates: number;
    expansionFactor: number;
    minSimilarity: number;
    semanticQueriesOnly: boolean;
  };
}

// =============================================================================
// CONFIG SCHEMA (built from registry)
// =============================================================================

const configSchema = buildConfigSchema(configRegistry);

// =============================================================================
// NESTED CONFIG BUILDERS (Type-safe versions)
// =============================================================================

/**
 * Helper to get a number from env with fallback to default
 */
function getEnvNumber(envKey: string, defaultValue: number): number {
  const envValue = process.env[envKey];
  if (envValue === undefined || envValue === '') {
    return defaultValue;
  }
  return parseNumber(envValue, defaultValue);
}

/**
 * Helper to get an integer from env with fallback to default
 */
function getEnvInt(envKey: string, defaultValue: number): number {
  const envValue = process.env[envKey];
  if (envValue === undefined || envValue === '') {
    return defaultValue;
  }
  return parseInt_(envValue, defaultValue);
}

/**
 * Helper to get a boolean from env with fallback to default
 */
function getEnvBoolean(envKey: string, defaultValue: boolean): boolean {
  const envValue = process.env[envKey];
  if (envValue === undefined || envValue === '') {
    return defaultValue;
  }
  return parseBoolean(envValue, defaultValue);
}

/**
 * Build extraction confidence thresholds with proper typing
 */
function buildExtractionThresholds(): Config['extraction']['confidenceThresholds'] {
  return {
    guideline: getEnvNumber(extractionConfidenceThresholds.guideline.envKey, extractionConfidenceThresholds.guideline.defaultValue),
    knowledge: getEnvNumber(extractionConfidenceThresholds.knowledge.envKey, extractionConfidenceThresholds.knowledge.defaultValue),
    tool: getEnvNumber(extractionConfidenceThresholds.tool.envKey, extractionConfidenceThresholds.tool.defaultValue),
    entity: getEnvNumber(extractionConfidenceThresholds.entity.envKey, extractionConfidenceThresholds.entity.defaultValue),
    relationship: getEnvNumber(extractionConfidenceThresholds.relationship.envKey, extractionConfidenceThresholds.relationship.defaultValue),
  };
}

/**
 * Build rate limit per-agent config with proper typing
 */
function buildRateLimitPerAgent(): Config['rateLimit']['perAgent'] {
  return {
    maxRequests: getEnvInt(rateLimitPerAgentOptions.maxRequests.envKey, rateLimitPerAgentOptions.maxRequests.defaultValue),
    windowMs: getEnvInt(rateLimitPerAgentOptions.windowMs.envKey, rateLimitPerAgentOptions.windowMs.defaultValue),
  };
}

/**
 * Build rate limit global config with proper typing
 */
function buildRateLimitGlobal(): Config['rateLimit']['global'] {
  return {
    maxRequests: getEnvInt(rateLimitGlobalOptions.maxRequests.envKey, rateLimitGlobalOptions.maxRequests.defaultValue),
    windowMs: getEnvInt(rateLimitGlobalOptions.windowMs.envKey, rateLimitGlobalOptions.windowMs.defaultValue),
  };
}

/**
 * Build rate limit burst config with proper typing
 */
function buildRateLimitBurst(): Config['rateLimit']['burst'] {
  return {
    maxRequests: getEnvInt(rateLimitBurstOptions.maxRequests.envKey, rateLimitBurstOptions.maxRequests.defaultValue),
    windowMs: getEnvInt(rateLimitBurstOptions.windowMs.envKey, rateLimitBurstOptions.windowMs.defaultValue),
  };
}

/**
 * Build recency decay half-life config with proper typing
 */
function buildRecencyDecayHalfLife(): Config['recency']['decayHalfLifeDays'] {
  return {
    guideline: getEnvInt(recencyDecayHalfLifeOptions.guideline.envKey, recencyDecayHalfLifeOptions.guideline.defaultValue),
    knowledge: getEnvInt(recencyDecayHalfLifeOptions.knowledge.envKey, recencyDecayHalfLifeOptions.knowledge.defaultValue),
    tool: getEnvInt(recencyDecayHalfLifeOptions.tool.envKey, recencyDecayHalfLifeOptions.tool.defaultValue),
  };
}

/**
 * Build scoring weights config with proper typing
 */
function buildScoringWeights(): Config['scoring']['weights'] {
  return {
    explicitRelation: getEnvInt(scoringWeightOptions.explicitRelation.envKey, scoringWeightOptions.explicitRelation.defaultValue),
    tagMatch: getEnvInt(scoringWeightOptions.tagMatch.envKey, scoringWeightOptions.tagMatch.defaultValue),
    scopeProximity: getEnvInt(scoringWeightOptions.scopeProximity.envKey, scoringWeightOptions.scopeProximity.defaultValue),
    textMatch: getEnvInt(scoringWeightOptions.textMatch.envKey, scoringWeightOptions.textMatch.defaultValue),
    priorityMax: getEnvInt(scoringWeightOptions.priorityMax.envKey, scoringWeightOptions.priorityMax.defaultValue),
    semanticMax: getEnvInt(scoringWeightOptions.semanticMax.envKey, scoringWeightOptions.semanticMax.defaultValue),
    recencyMax: getEnvInt(scoringWeightOptions.recencyMax.envKey, scoringWeightOptions.recencyMax.defaultValue),
  };
}

/**
 * Build feedback scoring config with proper typing
 */
function buildFeedbackScoring(): Config['scoring']['feedbackScoring'] {
  return {
    enabled: getEnvBoolean(feedbackScoringOptions.enabled.envKey, feedbackScoringOptions.enabled.defaultValue),
    boostPerPositive: getEnvNumber(feedbackScoringOptions.boostPerPositive.envKey, feedbackScoringOptions.boostPerPositive.defaultValue),
    boostMax: getEnvNumber(feedbackScoringOptions.boostMax.envKey, feedbackScoringOptions.boostMax.defaultValue),
    penaltyPerNegative: getEnvNumber(feedbackScoringOptions.penaltyPerNegative.envKey, feedbackScoringOptions.penaltyPerNegative.defaultValue),
    penaltyMax: getEnvNumber(feedbackScoringOptions.penaltyMax.envKey, feedbackScoringOptions.penaltyMax.defaultValue),
    cacheTTLMs: getEnvInt(feedbackScoringOptions.cacheTTLMs.envKey, feedbackScoringOptions.cacheTTLMs.defaultValue),
    cacheMaxSize: getEnvInt(feedbackScoringOptions.cacheMaxSize.envKey, feedbackScoringOptions.cacheMaxSize.defaultValue),
  };
}

/**
 * Build entity scoring config with proper typing
 */
function buildEntityScoring(): Config['scoring']['entityScoring'] {
  return {
    enabled: getEnvBoolean(entityScoringOptions.enabled.envKey, entityScoringOptions.enabled.defaultValue),
    exactMatchBoost: getEnvInt(entityScoringOptions.exactMatchBoost.envKey, entityScoringOptions.exactMatchBoost.defaultValue),
    partialMatchBoost: getEnvInt(entityScoringOptions.partialMatchBoost.envKey, entityScoringOptions.partialMatchBoost.defaultValue),
  };
}

// =============================================================================
// BUILD CONFIGURATION
// =============================================================================

/**
 * Build configuration from registry metadata.
 * This is the single source of truth - all env var definitions live in the registry.
 */
export function buildConfig(): Config {
  // Build base config from registry (double-cast needed as registry returns Record<string, unknown>)
  const baseConfig = buildConfigFromRegistry(configRegistry) as unknown as Config;

  // Add nested structures using type-safe builders (no casts needed)
  const config: Config = {
    ...baseConfig,

    // Add runtime values
    runtime: {
      ...baseConfig.runtime,
      projectRoot,
    },

    // Add nested extraction thresholds
    extraction: {
      ...baseConfig.extraction,
      confidenceThresholds: buildExtractionThresholds(),
    },

    // Add nested rate limit options
    rateLimit: {
      enabled: baseConfig.rateLimit.enabled,
      perAgent: buildRateLimitPerAgent(),
      global: buildRateLimitGlobal(),
      burst: buildRateLimitBurst(),
    },

    // Add nested recency decay options
    recency: {
      ...baseConfig.recency,
      decayHalfLifeDays: buildRecencyDecayHalfLife(),
    },

    // Add nested scoring weights, feedback scoring, and entity scoring
    scoring: {
      weights: buildScoringWeights(),
      feedbackScoring: buildFeedbackScoring(),
      entityScoring: buildEntityScoring(),
    },
  };

  // Validate config in development
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const result = configSchema.safeParse(config);
    if (!result.success) {
      const errors = result.error.issues.map(
        (e) => `  - ${e.path.map(String).join('.')}: ${e.message}`
      );
      console.warn(`Config validation warnings:\n${errors.join('\n')}`);
    }
  }

  return config;
}

// Create the singleton config instance
export const config: Config = buildConfig();

/**
 * Reload configuration from environment variables.
 * WARNING: This mutates the config object. Only use in tests.
 * Prefer using snapshotConfig/restoreConfig for test isolation.
 */
export function reloadConfig(): void {
  const newConfig = buildConfig();
  for (const key of Object.keys(newConfig) as Array<keyof Config>) {
    const section = newConfig[key];
    if (typeof section === 'object' && section !== null) {
      Object.assign(config[key], section);
    }
  }
}

// =============================================================================
// TEST UTILITIES - Config snapshot and restore for test isolation
// =============================================================================

/** Deep clone helper for config objects */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Create a snapshot of the current config state.
 * Use with restoreConfig() for test isolation.
 *
 * @example
 * const snapshot = snapshotConfig();
 * try {
 *   process.env.SOME_VAR = 'test';
 *   reloadConfig();
 *   // ... run test
 * } finally {
 *   restoreConfig(snapshot);
 * }
 */
export function snapshotConfig(): Config {
  return deepClone(config);
}

/**
 * Restore config from a previously saved snapshot.
 * Does NOT modify environment variables - only the config object.
 */
export function restoreConfig(snapshot: Config): void {
  for (const key of Object.keys(snapshot) as Array<keyof Config>) {
    const section = snapshot[key];
    if (typeof section === 'object' && section !== null) {
      Object.assign(config[key], section);
    }
  }
}

/**
 * Run a test function with temporary environment variable overrides.
 * Automatically saves config state, applies env changes, and restores on completion.
 *
 * @param envOverrides - Environment variables to set (use undefined to delete)
 * @param testFn - Test function to run
 * @returns The result of testFn
 *
 * @example
 * await withTestEnv(
 *   { AGENT_MEMORY_EMBEDDING_PROVIDER: 'disabled' },
 *   async () => {
 *     const service = new EmbeddingService();
 *     await expect(service.embed('test')).rejects.toThrow();
 *   }
 * );
 */
export async function withTestEnv<T>(
  envOverrides: Record<string, string | undefined>,
  testFn: () => T | Promise<T>
): Promise<T> {
  const configSnapshot = snapshotConfig();
  const envSnapshot: Record<string, string | undefined> = {};

  // Save original env values
  for (const key of Object.keys(envOverrides)) {
    envSnapshot[key] = process.env[key];
  }

  try {
    // Apply env overrides
    for (const [key, value] of Object.entries(envOverrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    // Reload config with new env values
    reloadConfig();

    // Run test
    return await testFn();
  } finally {
    // Restore original env values
    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    // Restore config (don't rely on reloadConfig since env might have side effects)
    restoreConfig(configSnapshot);
  }
}

// Re-export registry for documentation generation
export { configRegistry } from './registry/index.js';
export { getAllEnvVars } from './registry/schema-builder.js';

export default config;
