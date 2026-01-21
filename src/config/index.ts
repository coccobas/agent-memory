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

import { configRegistry, buildConfigSchema, buildConfigFromRegistry } from './registry/index.js';
import { projectRoot } from './registry/parsers.js';
import {
  buildExtractionThresholds,
  buildRateLimitPerAgent,
  buildRateLimitGlobal,
  buildRateLimitBurst,
  buildRecencyDecayHalfLife,
  buildScoringWeights,
  buildFeedbackScoring,
  buildEntityScoring,
  buildSmartPriority,
} from './builders/index.js';

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
    quantization: 'none' | 'sq' | 'pq';
    indexThreshold: number;
  };
  embedding: {
    provider: 'openai' | 'lmstudio' | 'local' | 'disabled';
    openaiApiKey: string | undefined;
    openaiModel: string;
    maxConcurrency: number;
    batchSize: number;
    maxRetries: number;
    retryDelayMs: number;
    timeoutMs: number;
    // Task 124: Configurable embedding dimensions
    openaiDimension: number;
    lmstudioDimension: number;
    localDimension: number;
  };
  extraction: {
    mode: 'technical' | 'personal' | 'auto';
    provider: 'openai' | 'anthropic' | 'ollama' | 'disabled';
    openaiApiKey: string | undefined;
    openaiBaseUrl: string | undefined;
    strictBaseUrlAllowlist: boolean;
    openaiModel: string;
    openaiJsonMode: boolean;
    openaiReasoningEffort: 'low' | 'medium' | 'high' | undefined;
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
    // Timeout and limits
    timeoutMs: number;
    maxContextLength: number;
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
    pressureWarningThreshold: number;
    checkIntervalMs: number;
    pressureDebounceMs: number;
    eventDrivenEnabled: boolean;
    autoEvictOnPressure: boolean;
    autoForgetOnCritical: boolean;
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
    smartPriority: {
      enabled: boolean;
      adaptiveWeightsEnabled: boolean;
      adaptiveWeightsMinSamples: number;
      adaptiveWeightsLearningRate: number;
      adaptiveWeightsLookbackDays: number;
      usefulnessEnabled: boolean;
      contextSimilarityEnabled: boolean;
      contextSimilarityThreshold: number;
      contextSimilarityMaxContexts: number;
      contextSimilarityBoostMultiplier: number;
      compositeAdaptiveWeight: number;
      compositeUsefulnessWeight: number;
      compositeContextWeight: number;
      cacheTTLMs: number;
      cacheMaxSize: number;
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
    format: 'json' | 'compact' | 'terminal';
  };
  rest: {
    enabled: boolean;
    host: string;
    port: number;
    bodyLimit: number;
  };
  security: {
    restAuthDisabled: boolean;
    restApiKey: string | undefined;
    restApiKeys: string | undefined;
    restAgentId: string;
    csrfSecret: string | undefined;
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
    decompositionThreshold: number;
    decompositionMaxSubQueries: number;
    decompositionUseLLM: boolean;
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
  crossEncoder: {
    enabled: boolean;
    topK: number;
    alpha: number;
    temperature: number;
    timeoutMs: number;
    model: string | undefined;
    baseUrl: string | undefined;
  };
  hierarchical: {
    enabled: boolean;
    minEntriesThreshold: number;
    maxCandidates: number;
    expansionFactor: number;
    minSimilarity: number;
    semanticQueriesOnly: boolean;
  };
  autoContext: {
    enabled: boolean;
    defaultAgentId: string;
    cacheTTLMs: number;
    autoProject: boolean;
    autoSession: boolean;
    autoSessionName: string;
    sessionTimeoutEnabled: boolean;
    sessionInactivityMs: number;
    sessionTimeoutCheckMs: number;
  };
  autoTagging: {
    enabled: boolean;
    maxTags: number;
    minConfidence: number;
    skipIfUserProvided: boolean;
  };
  tools: {
    visibility: 'core' | 'standard' | 'advanced' | 'experimental' | 'all';
  };
  classification: {
    highConfidenceThreshold: number;
    lowConfidenceThreshold: number;
    enableLLMFallback: boolean;
    feedbackDecayDays: number;
    maxPatternBoost: number;
    maxPatternPenalty: number;
    cacheSize: number;
    cacheTTLMs: number;
    learningRate: number;
  };
  extractionHook: {
    enabled: boolean;
    confidenceThreshold: number;
    maxSuggestionsPerResponse: number;
    cooldownMs: number;
    scanOnWriteOps: boolean;
  };
  suggest: {
    minConfidence: number;
    maxSuggestions: number;
    minContentLength: number;
  };
  graph: {
    autoSync: boolean;
    traversalEnabled: boolean;
    captureEnabled: boolean;
  };
  episode: {
    autoLogEnabled: boolean;
    debounceMs: number;
    autoCreateEnabled: boolean;
    // Boundary detection settings
    boundaryDetectionEnabled: boolean;
    boundaryShadowMode: boolean;
    boundaryWindowSize: number;
    boundarySimilarityThreshold: number;
    boundaryTimeGapMs: number;
  };
}

// =============================================================================
// CONFIG SCHEMA (built from registry)
// =============================================================================

const configSchema = buildConfigSchema(configRegistry);

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

    // Add nested scoring weights, feedback scoring, entity scoring, and smart priority
    scoring: {
      weights: buildScoringWeights(),
      feedbackScoring: buildFeedbackScoring(),
      entityScoring: buildEntityScoring(),
      smartPriority: buildSmartPriority(),
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
      // Bug #260 fix: Guard against prototype pollution
      // Only copy own enumerable properties, excluding dangerous keys
      for (const prop of Object.keys(section)) {
        if (prop !== '__proto__' && prop !== 'constructor' && prop !== 'prototype') {
          (config[key] as Record<string, unknown>)[prop] = (section as Record<string, unknown>)[
            prop
          ];
        }
      }
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
