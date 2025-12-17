/**
 * Centralized configuration module for Agent Memory
 *
 * Loads configuration from .env file and environment variables.
 * Environment variables always take precedence over .env file values.
 *
 * Usage:
 *   import { config } from './config/index.js';
 *   console.log(config.database.path);
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

// Calculate project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../..');

// Load .env file (if exists) - environment variables take precedence
const envPath = resolve(projectRoot, '.env');
if (existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value === '1' || value.toLowerCase() === 'true';
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') return defaultValue;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function parseInt_(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function parseString<T extends string>(
  value: string | undefined,
  defaultValue: T,
  allowedValues?: readonly T[]
): T {
  if (value === undefined || value === '') return defaultValue;
  const lower = value.toLowerCase() as T;
  if (allowedValues && !allowedValues.includes(lower)) {
    return defaultValue;
  }
  return lower;
}

/**
 * Expand tilde (~) to home directory in file paths.
 * Supports both Unix-style HOME and Windows-style USERPROFILE.
 */
function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return filePath.replace(/^~/, home);
  }
  return filePath;
}

// =============================================================================
// CONFIGURATION INTERFACE
// =============================================================================

export interface Config {
  // Database
  database: {
    path: string;
    skipInit: boolean;
    verbose: boolean;
  };

  // Vector Database
  vectorDb: {
    path: string;
    distanceMetric: 'cosine' | 'l2' | 'dot';
  };

  // Embedding
  embedding: {
    provider: 'openai' | 'local' | 'disabled';
    openaiApiKey: string | undefined;
    openaiModel: string;
  };

  // Logging
  logging: {
    level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
    debug: boolean;
    performance: boolean;
  };

  // Cache
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

  // Memory
  memory: {
    heapPressureThreshold: number;
    checkIntervalMs: number;
  };

  // Rate Limiting
  rateLimit: {
    enabled: boolean;
    perAgent: { maxRequests: number; windowMs: number };
    global: { maxRequests: number; windowMs: number };
    burst: { maxRequests: number; windowMs: number };
  };

  // Semantic Search
  semanticSearch: {
    defaultThreshold: number;
    scoreWeight: number;
    duplicateThreshold: number;
  };

  // Validation Limits
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
  };

  // Pagination
  pagination: {
    defaultLimit: number;
    maxLimit: number;
  };

  // Health & Reconnection
  health: {
    checkIntervalMs: number;
    maxReconnectAttempts: number;
    reconnectBaseDelayMs: number;
    reconnectMaxDelayMs: number;
  };

  // Retry
  retry: {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
  };

  // Conflict Detection
  conflict: {
    windowMs: number;
    highErrorCorrelationThreshold: number;
  };

  // Runtime
  runtime: {
    nodeEnv: string;
    projectRoot: string;
  };

  // Timestamps
  timestamps: {
    displayTimezone: string; // 'local' | 'utc' | IANA timezone (e.g., 'Europe/Rome')
  };
}

// =============================================================================
// BUILD CONFIGURATION
// =============================================================================

// Determine embedding provider with fallback logic
function getEmbeddingProvider(): 'openai' | 'local' | 'disabled' {
  const providerEnv = process.env.AGENT_MEMORY_EMBEDDING_PROVIDER?.toLowerCase();
  if (providerEnv === 'disabled') return 'disabled';
  if (providerEnv === 'local') return 'local';
  if (providerEnv === 'openai') return 'openai';
  // Default: openai if API key provided, otherwise local
  return process.env.AGENT_MEMORY_OPENAI_API_KEY ? 'openai' : 'local';
}

export const config: Config = {
  database: {
    path: expandTilde(process.env.AGENT_MEMORY_DB_PATH || resolve(projectRoot, 'data/memory.db')),
    skipInit: parseBoolean(process.env.AGENT_MEMORY_SKIP_INIT, false),
    verbose: parseBoolean(process.env.AGENT_MEMORY_PERF, false),
  },

  vectorDb: {
    path: expandTilde(process.env.AGENT_MEMORY_VECTOR_DB_PATH || resolve(projectRoot, 'data/vectors.lance')),
    distanceMetric: parseString(
      process.env.AGENT_MEMORY_DISTANCE_METRIC,
      'cosine',
      ['cosine', 'l2', 'dot'] as const
    ),
  },

  embedding: {
    provider: getEmbeddingProvider(),
    openaiApiKey: process.env.AGENT_MEMORY_OPENAI_API_KEY,
    openaiModel: process.env.AGENT_MEMORY_OPENAI_MODEL || 'text-embedding-3-small',
  },

  logging: {
    level: parseString(
      process.env.LOG_LEVEL,
      'info',
      ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const
    ),
    debug: parseBoolean(process.env.AGENT_MEMORY_DEBUG, false),
    performance: parseBoolean(process.env.AGENT_MEMORY_PERF, false),
  },

  cache: {
    totalLimitMB: parseInt_(process.env.AGENT_MEMORY_CACHE_LIMIT_MB, 100),
    queryCacheTTLMs: parseInt_(process.env.AGENT_MEMORY_QUERY_CACHE_TTL_MS, 5 * 60 * 1000),
    scopeCacheTTLMs: parseInt_(process.env.AGENT_MEMORY_SCOPE_CACHE_TTL_MS, 10 * 60 * 1000),
    maxPreparedStatements: parseInt_(process.env.AGENT_MEMORY_MAX_PREPARED_STATEMENTS, 100),
    queryCacheSize: parseInt_(process.env.AGENT_MEMORY_QUERY_CACHE_SIZE, 200),
    queryCacheMemoryMB: parseInt_(process.env.AGENT_MEMORY_QUERY_CACHE_MEMORY_MB, 50),
    pressureThreshold: parseNumber(process.env.AGENT_MEMORY_CACHE_PRESSURE_THRESHOLD, 0.8),
    evictionTarget: parseNumber(process.env.AGENT_MEMORY_CACHE_EVICTION_TARGET, 0.8),
  },

  memory: {
    heapPressureThreshold: parseNumber(process.env.AGENT_MEMORY_HEAP_PRESSURE_THRESHOLD, 0.85),
    checkIntervalMs: parseInt_(process.env.AGENT_MEMORY_MEMORY_CHECK_INTERVAL_MS, 30000),
  },

  rateLimit: {
    enabled: process.env.AGENT_MEMORY_RATE_LIMIT !== '0',
    perAgent: {
      maxRequests: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_PER_AGENT_MAX, 100),
      windowMs: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_PER_AGENT_WINDOW_MS, 60000),
    },
    global: {
      maxRequests: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_GLOBAL_MAX, 1000),
      windowMs: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_GLOBAL_WINDOW_MS, 60000),
    },
    burst: {
      maxRequests: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_BURST_MAX, 20),
      windowMs: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_BURST_WINDOW_MS, 1000),
    },
  },

  semanticSearch: {
    defaultThreshold: parseNumber(process.env.AGENT_MEMORY_SEMANTIC_THRESHOLD, 0.7),
    scoreWeight: parseNumber(process.env.AGENT_MEMORY_SEMANTIC_SCORE_WEIGHT, 0.7),
    duplicateThreshold: parseNumber(process.env.AGENT_MEMORY_DUPLICATE_THRESHOLD, 0.8),
  },

  validation: {
    nameMaxLength: parseInt_(process.env.AGENT_MEMORY_NAME_MAX_LENGTH, 500),
    titleMaxLength: parseInt_(process.env.AGENT_MEMORY_TITLE_MAX_LENGTH, 1000),
    descriptionMaxLength: parseInt_(process.env.AGENT_MEMORY_DESCRIPTION_MAX_LENGTH, 10000),
    contentMaxLength: parseInt_(process.env.AGENT_MEMORY_CONTENT_MAX_LENGTH, 100000),
    rationaleMaxLength: parseInt_(process.env.AGENT_MEMORY_RATIONALE_MAX_LENGTH, 5000),
    metadataMaxBytes: parseInt_(process.env.AGENT_MEMORY_METADATA_MAX_BYTES, 50000),
    parametersMaxBytes: parseInt_(process.env.AGENT_MEMORY_PARAMETERS_MAX_BYTES, 50000),
    examplesMaxBytes: parseInt_(process.env.AGENT_MEMORY_EXAMPLES_MAX_BYTES, 100000),
    tagsMaxCount: parseInt_(process.env.AGENT_MEMORY_TAGS_MAX_COUNT, 50),
    examplesMaxCount: parseInt_(process.env.AGENT_MEMORY_EXAMPLES_MAX_COUNT, 20),
    bulkOperationMax: parseInt_(process.env.AGENT_MEMORY_BULK_OPERATION_MAX, 100),
  },

  pagination: {
    defaultLimit: parseInt_(process.env.AGENT_MEMORY_DEFAULT_QUERY_LIMIT, 20),
    maxLimit: parseInt_(process.env.AGENT_MEMORY_MAX_QUERY_LIMIT, 100),
  },

  health: {
    checkIntervalMs: parseInt_(process.env.AGENT_MEMORY_HEALTH_CHECK_INTERVAL_MS, 30000),
    maxReconnectAttempts: parseInt_(process.env.AGENT_MEMORY_MAX_RECONNECT_ATTEMPTS, 3),
    reconnectBaseDelayMs: parseInt_(process.env.AGENT_MEMORY_RECONNECT_BASE_DELAY_MS, 1000),
    reconnectMaxDelayMs: parseInt_(process.env.AGENT_MEMORY_RECONNECT_MAX_DELAY_MS, 5000),
  },

  retry: {
    maxAttempts: parseInt_(process.env.AGENT_MEMORY_RETRY_MAX_ATTEMPTS, 3),
    initialDelayMs: parseInt_(process.env.AGENT_MEMORY_RETRY_INITIAL_DELAY_MS, 100),
    maxDelayMs: parseInt_(process.env.AGENT_MEMORY_RETRY_MAX_DELAY_MS, 5000),
    backoffMultiplier: parseNumber(process.env.AGENT_MEMORY_RETRY_BACKOFF_MULTIPLIER, 2),
  },

  conflict: {
    windowMs: parseInt_(process.env.AGENT_MEMORY_CONFLICT_WINDOW_MS, 5000),
    highErrorCorrelationThreshold: parseNumber(
      process.env.AGENT_MEMORY_HIGH_ERROR_CORRELATION_THRESHOLD,
      0.7
    ),
  },

  runtime: {
    nodeEnv: process.env.NODE_ENV || 'development',
    projectRoot,
  },

  timestamps: {
    displayTimezone: process.env.AGENT_MEMORY_TIMEZONE || 'local',
  },
};

/**
 * Rebuild config from current environment variables
 * This is primarily used for testing where env vars change between tests
 */
function buildConfig(): Config {
  return {
    database: {
      path: expandTilde(process.env.AGENT_MEMORY_DB_PATH || resolve(projectRoot, 'data/memory.db')),
      skipInit: parseBoolean(process.env.AGENT_MEMORY_SKIP_INIT, false),
      verbose: parseBoolean(process.env.AGENT_MEMORY_PERF, false),
    },

    vectorDb: {
      path: expandTilde(process.env.AGENT_MEMORY_VECTOR_DB_PATH || resolve(projectRoot, 'data/vectors.lance')),
      distanceMetric: parseString(
        process.env.AGENT_MEMORY_DISTANCE_METRIC,
        'cosine',
        ['cosine', 'l2', 'dot'] as const
      ),
    },

    embedding: {
      provider: getEmbeddingProvider(),
      openaiApiKey: process.env.AGENT_MEMORY_OPENAI_API_KEY,
      openaiModel: process.env.AGENT_MEMORY_OPENAI_MODEL || 'text-embedding-3-small',
    },

    logging: {
      level: parseString(
        process.env.LOG_LEVEL,
        'info',
        ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const
      ),
      debug: parseBoolean(process.env.AGENT_MEMORY_DEBUG, false),
      performance: parseBoolean(process.env.AGENT_MEMORY_PERF, false),
    },

    cache: {
      totalLimitMB: parseInt_(process.env.AGENT_MEMORY_CACHE_LIMIT_MB, 100),
      queryCacheTTLMs: parseInt_(process.env.AGENT_MEMORY_QUERY_CACHE_TTL_MS, 5 * 60 * 1000),
      scopeCacheTTLMs: parseInt_(process.env.AGENT_MEMORY_SCOPE_CACHE_TTL_MS, 10 * 60 * 1000),
      maxPreparedStatements: parseInt_(process.env.AGENT_MEMORY_MAX_PREPARED_STATEMENTS, 100),
      queryCacheSize: parseInt_(process.env.AGENT_MEMORY_QUERY_CACHE_SIZE, 200),
      queryCacheMemoryMB: parseInt_(process.env.AGENT_MEMORY_QUERY_CACHE_MEMORY_MB, 50),
      pressureThreshold: parseNumber(process.env.AGENT_MEMORY_CACHE_PRESSURE_THRESHOLD, 0.8),
      evictionTarget: parseNumber(process.env.AGENT_MEMORY_CACHE_EVICTION_TARGET, 0.8),
    },

    memory: {
      heapPressureThreshold: parseNumber(process.env.AGENT_MEMORY_HEAP_PRESSURE_THRESHOLD, 0.85),
      checkIntervalMs: parseInt_(process.env.AGENT_MEMORY_MEMORY_CHECK_INTERVAL_MS, 30000),
    },

    rateLimit: {
      enabled: process.env.AGENT_MEMORY_RATE_LIMIT !== '0',
      perAgent: {
        maxRequests: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_PER_AGENT_MAX, 100),
        windowMs: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_PER_AGENT_WINDOW_MS, 60000),
      },
      global: {
        maxRequests: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_GLOBAL_MAX, 1000),
        windowMs: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_GLOBAL_WINDOW_MS, 60000),
      },
      burst: {
        maxRequests: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_BURST_MAX, 20),
        windowMs: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_BURST_WINDOW_MS, 1000),
      },
    },

    semanticSearch: {
      defaultThreshold: parseNumber(process.env.AGENT_MEMORY_SEMANTIC_THRESHOLD, 0.7),
      scoreWeight: parseNumber(process.env.AGENT_MEMORY_SEMANTIC_SCORE_WEIGHT, 0.7),
      duplicateThreshold: parseNumber(process.env.AGENT_MEMORY_DUPLICATE_THRESHOLD, 0.8),
    },

    validation: {
      nameMaxLength: parseInt_(process.env.AGENT_MEMORY_NAME_MAX_LENGTH, 500),
      titleMaxLength: parseInt_(process.env.AGENT_MEMORY_TITLE_MAX_LENGTH, 1000),
      descriptionMaxLength: parseInt_(process.env.AGENT_MEMORY_DESCRIPTION_MAX_LENGTH, 10000),
      contentMaxLength: parseInt_(process.env.AGENT_MEMORY_CONTENT_MAX_LENGTH, 100000),
      rationaleMaxLength: parseInt_(process.env.AGENT_MEMORY_RATIONALE_MAX_LENGTH, 5000),
      metadataMaxBytes: parseInt_(process.env.AGENT_MEMORY_METADATA_MAX_BYTES, 50000),
      parametersMaxBytes: parseInt_(process.env.AGENT_MEMORY_PARAMETERS_MAX_BYTES, 50000),
      examplesMaxBytes: parseInt_(process.env.AGENT_MEMORY_EXAMPLES_MAX_BYTES, 100000),
      tagsMaxCount: parseInt_(process.env.AGENT_MEMORY_TAGS_MAX_COUNT, 50),
      examplesMaxCount: parseInt_(process.env.AGENT_MEMORY_EXAMPLES_MAX_COUNT, 20),
      bulkOperationMax: parseInt_(process.env.AGENT_MEMORY_BULK_OPERATION_MAX, 100),
    },

    pagination: {
      defaultLimit: parseInt_(process.env.AGENT_MEMORY_DEFAULT_QUERY_LIMIT, 20),
      maxLimit: parseInt_(process.env.AGENT_MEMORY_MAX_QUERY_LIMIT, 100),
    },

    health: {
      checkIntervalMs: parseInt_(process.env.AGENT_MEMORY_HEALTH_CHECK_INTERVAL_MS, 30000),
      maxReconnectAttempts: parseInt_(process.env.AGENT_MEMORY_MAX_RECONNECT_ATTEMPTS, 3),
      reconnectBaseDelayMs: parseInt_(process.env.AGENT_MEMORY_RECONNECT_BASE_DELAY_MS, 1000),
      reconnectMaxDelayMs: parseInt_(process.env.AGENT_MEMORY_RECONNECT_MAX_DELAY_MS, 5000),
    },

    retry: {
      maxAttempts: parseInt_(process.env.AGENT_MEMORY_RETRY_MAX_ATTEMPTS, 3),
      initialDelayMs: parseInt_(process.env.AGENT_MEMORY_RETRY_INITIAL_DELAY_MS, 100),
      maxDelayMs: parseInt_(process.env.AGENT_MEMORY_RETRY_MAX_DELAY_MS, 5000),
      backoffMultiplier: parseNumber(process.env.AGENT_MEMORY_RETRY_BACKOFF_MULTIPLIER, 2),
    },

    conflict: {
      windowMs: parseInt_(process.env.AGENT_MEMORY_CONFLICT_WINDOW_MS, 5000),
      highErrorCorrelationThreshold: parseNumber(
        process.env.AGENT_MEMORY_HIGH_ERROR_CORRELATION_THRESHOLD,
        0.7
      ),
    },

    runtime: {
      nodeEnv: process.env.NODE_ENV || 'development',
      projectRoot,
    },

    timestamps: {
      displayTimezone: process.env.AGENT_MEMORY_TIMEZONE || 'local',
    },
  };
}

/**
 * Reload configuration from environment variables.
 * This is primarily for testing purposes - allows tests to modify env vars
 * and have those changes reflected in the config.
 *
 * WARNING: This mutates the config object. Only use in tests.
 */
export function reloadConfig(): void {
  const newConfig = buildConfig();
  Object.assign(config, newConfig);

  // Re-assign nested objects
  Object.keys(newConfig).forEach((key) => {
    const section = newConfig[key as keyof Config];
    if (typeof section === 'object' && section !== null) {
      Object.assign(config[key as keyof Config], section);
    }
  });
}

export default config;
