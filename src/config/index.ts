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
}

// =============================================================================
// CONFIG SCHEMA (built from registry)
// =============================================================================

const configSchema = buildConfigSchema(configRegistry);

// =============================================================================
// NESTED CONFIG BUILDERS
// =============================================================================

/**
 * Build nested option values from exported option objects
 */
function buildNestedOptions<
  T extends Record<string, { envKey: string; defaultValue: unknown; parse?: string }>,
>(options: T): Record<keyof T, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, opt] of Object.entries(options)) {
    const envValue = process.env[opt.envKey];
    if (envValue === undefined || envValue === '') {
      result[key] = opt.defaultValue;
    } else if (opt.parse === 'int') {
      result[key] = parseInt_(envValue, opt.defaultValue as number);
    } else if (opt.parse === 'number') {
      result[key] = parseNumber(envValue, opt.defaultValue as number);
    } else if (opt.parse === 'boolean') {
      result[key] = parseBoolean(envValue, opt.defaultValue as boolean);
    } else if (opt.parse === undefined || opt.parse === 'string') {
      result[key] = envValue;
    } else {
      console.warn(`Unknown parse directive '${opt.parse}' for config option '${opt.envKey}'. Using raw string.`);
      result[key] = envValue;
    }
  }
  return result as Record<keyof T, unknown>;
}

// =============================================================================
// BUILD CONFIGURATION
// =============================================================================

/**
 * Build configuration from registry metadata.
 * This is the single source of truth - all env var definitions live in the registry.
 */
export function buildConfig(): Config {
  // Build base config from registry
  const baseConfig = buildConfigFromRegistry(configRegistry) as unknown as Config;

  // Add nested structures that aren't directly in the registry
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
      confidenceThresholds: buildNestedOptions(
        extractionConfidenceThresholds
      ) as Config['extraction']['confidenceThresholds'],
    },

    // Add nested rate limit options
    rateLimit: {
      enabled: baseConfig.rateLimit.enabled,
      perAgent: buildNestedOptions(rateLimitPerAgentOptions) as Config['rateLimit']['perAgent'],
      global: buildNestedOptions(rateLimitGlobalOptions) as Config['rateLimit']['global'],
      burst: buildNestedOptions(rateLimitBurstOptions) as Config['rateLimit']['burst'],
    },

    // Add nested recency decay options
    recency: {
      ...baseConfig.recency,
      decayHalfLifeDays: buildNestedOptions(
        recencyDecayHalfLifeOptions
      ) as Config['recency']['decayHalfLifeDays'],
    },

    // Add nested scoring weights, feedback scoring, and entity scoring
    scoring: {
      weights: buildNestedOptions(scoringWeightOptions) as Config['scoring']['weights'],
      feedbackScoring: buildNestedOptions(feedbackScoringOptions) as Config['scoring']['feedbackScoring'],
      entityScoring: buildNestedOptions(entityScoringOptions) as Config['scoring']['entityScoring'],
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
