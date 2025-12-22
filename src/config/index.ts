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

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Calculate project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../..');

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

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed >= 65536) {
    return fallback;
  }
  return parsed;
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

/**
 * Get the base data directory.
 * Priority:
 * 1. AGENT_MEMORY_DATA_DIR environment variable (highest)
 * 2. ~/.agent-memory/data (when installed as package via node_modules)
 * 3. projectRoot/data (development mode)
 */
function getDataDir(): string {
  const dataDir = process.env.AGENT_MEMORY_DATA_DIR;
  if (dataDir) {
    return expandTilde(dataDir);
  }
  // Check if running from node_modules (installed as package)
  if (__dirname.includes('node_modules')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (home) {
      return resolve(home, '.agent-memory', 'data');
    }
  }
  return resolve(projectRoot, 'data');
}

/**
 * Resolve a data path with priority:
 * 1. Specific env var override (highest priority)
 * 2. AGENT_MEMORY_DATA_DIR + relative path
 * 3. projectRoot/data + relative path (default)
 */
function resolveDataPath(envVar: string | undefined, relativePath: string): string {
  // If specific env var is set, use it (highest priority)
  if (envVar) {
    return expandTilde(envVar);
  }
  // Otherwise use data dir + relative path
  return resolve(getDataDir(), relativePath);
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
    devMode: boolean;
    autoFixChecksums: boolean;
    busyTimeoutMs: number;
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
    maxConcurrency: number;
  };

  // Extraction (LLM-based auto-capture)
  extraction: {
    provider: 'openai' | 'anthropic' | 'ollama' | 'disabled';
    openaiApiKey: string | undefined;
    openaiBaseUrl: string | undefined; // For LM Studio, LocalAI, etc.
    openaiModel: string;
    anthropicApiKey: string | undefined;
    anthropicModel: string;
    ollamaBaseUrl: string;
    ollamaModel: string;
    maxTokens: number;
    temperature: number;
    confidenceThreshold: number;
    // Per-entry-type confidence thresholds (override default)
    confidenceThresholds: {
      guideline: number;
      knowledge: number;
      tool: number;
      entity: number;
      relationship: number;
    };
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

  // Recency/Decay Scoring
  recency: {
    defaultDecayHalfLifeDays: number;
    defaultRecencyWeight: number;
    maxRecencyBoost: number;
    useUpdatedAt: boolean;
    // Per-entry-type decay half-life (in days)
    decayHalfLifeDays: {
      guideline: number;
      knowledge: number;
      tool: number;
    };
  };

  // Query Scoring Weights
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
    regexPatternMaxLength: number;
    validationRulesQueryLimit: number;
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

  // Output formatting (primarily for MCP tool responses)
  output: {
    format: 'json' | 'compact';
  };

  // REST API
  rest: {
    enabled: boolean;
    host: string;
    port: number;
  };

  // Security (auth + rate limiting)
  security: {
    restAuthDisabled: boolean;
    restApiKey: string | undefined;
    restApiKeys: string | undefined;
    restAgentId: string;
  };

  // Directory Paths
  paths: {
    dataDir: string;
    backup: string;
    export: string;
    log: string;
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

// Determine extraction provider with fallback logic
function getExtractionProvider(): 'openai' | 'anthropic' | 'ollama' | 'disabled' {
  const providerEnv = process.env.AGENT_MEMORY_EXTRACTION_PROVIDER?.toLowerCase();
  if (providerEnv === 'disabled') return 'disabled';
  if (providerEnv === 'ollama') return 'ollama';
  if (providerEnv === 'anthropic') return 'anthropic';
  if (providerEnv === 'openai') return 'openai';
  // Default: check for API keys in order of preference
  if (process.env.AGENT_MEMORY_OPENAI_API_KEY) return 'openai';
  if (process.env.AGENT_MEMORY_ANTHROPIC_API_KEY) return 'anthropic';
  return 'disabled';
}

/**
 * Build configuration from current environment variables.
 * Single source of truth for config construction.
 */
export function buildConfig(): Config {
  return {
    database: {
      path: resolveDataPath(process.env.AGENT_MEMORY_DB_PATH, 'memory.db'),
      skipInit: parseBoolean(process.env.AGENT_MEMORY_SKIP_INIT, false),
      verbose: parseBoolean(process.env.AGENT_MEMORY_PERF, false),
      devMode: parseBoolean(process.env.AGENT_MEMORY_DEV_MODE, false),
      autoFixChecksums: parseBoolean(
        process.env.AGENT_MEMORY_AUTO_FIX_CHECKSUMS,
        parseBoolean(process.env.AGENT_MEMORY_DEV_MODE, false)
      ),
      busyTimeoutMs: parseInt_(process.env.AGENT_MEMORY_DB_BUSY_TIMEOUT_MS, 5000),
    },

    vectorDb: {
      path: resolveDataPath(process.env.AGENT_MEMORY_VECTOR_DB_PATH, 'vectors.lance'),
      distanceMetric: parseString(process.env.AGENT_MEMORY_DISTANCE_METRIC, 'cosine', [
        'cosine',
        'l2',
        'dot',
      ] as const),
    },

    embedding: {
      provider: getEmbeddingProvider(),
      openaiApiKey: process.env.AGENT_MEMORY_OPENAI_API_KEY,
      openaiModel: process.env.AGENT_MEMORY_OPENAI_MODEL || 'text-embedding-3-small',
      maxConcurrency: parseInt_(process.env.AGENT_MEMORY_EMBEDDING_MAX_CONCURRENCY, 16),
    },

    extraction: {
      provider: getExtractionProvider(),
      openaiApiKey: process.env.AGENT_MEMORY_OPENAI_API_KEY,
      openaiBaseUrl: process.env.AGENT_MEMORY_EXTRACTION_OPENAI_BASE_URL, // For LM Studio, LocalAI
      openaiModel: process.env.AGENT_MEMORY_EXTRACTION_OPENAI_MODEL || 'gpt-4o-mini',
      anthropicApiKey: process.env.AGENT_MEMORY_ANTHROPIC_API_KEY,
      anthropicModel:
        process.env.AGENT_MEMORY_EXTRACTION_ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      ollamaBaseUrl: process.env.AGENT_MEMORY_OLLAMA_BASE_URL || 'http://localhost:11434',
      ollamaModel: process.env.AGENT_MEMORY_OLLAMA_MODEL || 'llama3.2',
      maxTokens: parseInt_(process.env.AGENT_MEMORY_EXTRACTION_MAX_TOKENS, 4096),
      temperature: parseNumber(process.env.AGENT_MEMORY_EXTRACTION_TEMPERATURE, 0.2),
      confidenceThreshold: parseNumber(
        process.env.AGENT_MEMORY_EXTRACTION_CONFIDENCE_THRESHOLD,
        0.7
      ),
      // Per-entry-type thresholds: guidelines need higher confidence (critical), tools lower (low-risk)
      confidenceThresholds: {
        guideline: parseNumber(process.env.AGENT_MEMORY_EXTRACTION_CONFIDENCE_GUIDELINE, 0.75),
        knowledge: parseNumber(process.env.AGENT_MEMORY_EXTRACTION_CONFIDENCE_KNOWLEDGE, 0.7),
        tool: parseNumber(process.env.AGENT_MEMORY_EXTRACTION_CONFIDENCE_TOOL, 0.65),
        entity: parseNumber(process.env.AGENT_MEMORY_EXTRACTION_CONFIDENCE_ENTITY, 0.7),
        relationship: parseNumber(
          process.env.AGENT_MEMORY_EXTRACTION_CONFIDENCE_RELATIONSHIP,
          0.75
        ),
      },
    },

    logging: {
      level: parseString(process.env.LOG_LEVEL, 'info', [
        'fatal',
        'error',
        'warn',
        'info',
        'debug',
        'trace',
      ] as const),
      debug: parseBoolean(process.env.AGENT_MEMORY_DEBUG, false),
      performance: parseBoolean(process.env.AGENT_MEMORY_PERF, false),
    },

    cache: {
      // Production-optimized cache sizes (increased from 100/200/50)
      totalLimitMB: parseInt_(process.env.AGENT_MEMORY_CACHE_LIMIT_MB, 512),
      queryCacheTTLMs: parseInt_(process.env.AGENT_MEMORY_QUERY_CACHE_TTL_MS, 5 * 60 * 1000),
      scopeCacheTTLMs: parseInt_(process.env.AGENT_MEMORY_SCOPE_CACHE_TTL_MS, 10 * 60 * 1000),
      maxPreparedStatements: parseInt_(process.env.AGENT_MEMORY_MAX_PREPARED_STATEMENTS, 500),
      queryCacheSize: parseInt_(process.env.AGENT_MEMORY_QUERY_CACHE_SIZE, 1000),
      queryCacheMemoryMB: parseInt_(process.env.AGENT_MEMORY_QUERY_CACHE_MEMORY_MB, 200),
      // Start eviction earlier and more aggressively
      pressureThreshold: parseNumber(process.env.AGENT_MEMORY_CACHE_PRESSURE_THRESHOLD, 0.75),
      evictionTarget: parseNumber(process.env.AGENT_MEMORY_CACHE_EVICTION_TARGET, 0.6),
    },

    memory: {
      heapPressureThreshold: parseNumber(process.env.AGENT_MEMORY_HEAP_PRESSURE_THRESHOLD, 0.85),
      checkIntervalMs: parseInt_(process.env.AGENT_MEMORY_MEMORY_CHECK_INTERVAL_MS, 30000),
    },

    rateLimit: {
      enabled: process.env.AGENT_MEMORY_RATE_LIMIT !== '0',
      perAgent: {
        // Increased from 100 to 500 req/min (8.3 RPS per agent)
        maxRequests: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_PER_AGENT_MAX, 500),
        windowMs: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_PER_AGENT_WINDOW_MS, 60000),
      },
      global: {
        // Increased from 1000 to 5000 req/min (83 RPS global)
        maxRequests: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_GLOBAL_MAX, 5000),
        windowMs: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_GLOBAL_WINDOW_MS, 60000),
      },
      burst: {
        // Increased from 20 to 50 peak RPS
        maxRequests: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_BURST_MAX, 50),
        windowMs: parseInt_(process.env.AGENT_MEMORY_RATE_LIMIT_BURST_WINDOW_MS, 1000),
      },
    },

    semanticSearch: {
      defaultThreshold: parseNumber(process.env.AGENT_MEMORY_SEMANTIC_THRESHOLD, 0.7),
      scoreWeight: parseNumber(process.env.AGENT_MEMORY_SEMANTIC_SCORE_WEIGHT, 0.7),
      duplicateThreshold: parseNumber(process.env.AGENT_MEMORY_DUPLICATE_THRESHOLD, 0.8),
    },

    recency: {
      defaultDecayHalfLifeDays: parseInt_(process.env.AGENT_MEMORY_DECAY_HALF_LIFE_DAYS, 14),
      defaultRecencyWeight: parseNumber(process.env.AGENT_MEMORY_RECENCY_WEIGHT, 0.5),
      maxRecencyBoost: parseNumber(process.env.AGENT_MEMORY_MAX_RECENCY_BOOST, 2.0),
      useUpdatedAt: parseBoolean(process.env.AGENT_MEMORY_USE_UPDATED_AT, true),
      // Per-entry-type decay: guidelines persist longer (30d), knowledge medium (14d), tools decay faster (7d)
      decayHalfLifeDays: {
        guideline: parseInt_(process.env.AGENT_MEMORY_DECAY_HALF_LIFE_GUIDELINE, 30),
        knowledge: parseInt_(process.env.AGENT_MEMORY_DECAY_HALF_LIFE_KNOWLEDGE, 14),
        tool: parseInt_(process.env.AGENT_MEMORY_DECAY_HALF_LIFE_TOOL, 7),
      },
    },

    scoring: {
      weights: {
        explicitRelation: parseInt_(process.env.AGENT_MEMORY_SCORE_EXPLICIT_RELATION, 50),
        tagMatch: parseInt_(process.env.AGENT_MEMORY_SCORE_TAG_MATCH, 10),
        scopeProximity: parseInt_(process.env.AGENT_MEMORY_SCORE_SCOPE_PROXIMITY, 20),
        textMatch: parseInt_(process.env.AGENT_MEMORY_SCORE_TEXT_MATCH, 30),
        priorityMax: parseInt_(process.env.AGENT_MEMORY_SCORE_PRIORITY_MAX, 20),
        semanticMax: parseInt_(process.env.AGENT_MEMORY_SCORE_SEMANTIC_MAX, 40),
        recencyMax: parseInt_(process.env.AGENT_MEMORY_SCORE_RECENCY_MAX, 100),
      },
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
      regexPatternMaxLength: parseInt_(process.env.AGENT_MEMORY_REGEX_PATTERN_MAX_LENGTH, 500),
      validationRulesQueryLimit: parseInt_(process.env.AGENT_MEMORY_VALIDATION_RULES_LIMIT, 1000),
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

    output: {
      format: parseString(process.env.AGENT_MEMORY_OUTPUT_FORMAT, 'json', [
        'json',
        'compact',
      ] as const),
    },

    rest: {
      enabled: parseBoolean(process.env.AGENT_MEMORY_REST_ENABLED, false),
      host: process.env.AGENT_MEMORY_REST_HOST || '127.0.0.1',
      port: parsePort(process.env.AGENT_MEMORY_REST_PORT, 8787),
    },

    security: {
      restAuthDisabled: parseBoolean(process.env.AGENT_MEMORY_REST_AUTH_DISABLED, false),
      restApiKey: process.env.AGENT_MEMORY_REST_API_KEY,
      restApiKeys: process.env.AGENT_MEMORY_REST_API_KEYS,
      restAgentId: process.env.AGENT_MEMORY_REST_AGENT_ID || 'rest-api',
    },

    paths: {
      dataDir: getDataDir(),
      backup: resolveDataPath(process.env.AGENT_MEMORY_BACKUP_PATH, 'backups'),
      export: resolveDataPath(process.env.AGENT_MEMORY_EXPORT_PATH, 'exports'),
      log: resolveDataPath(process.env.AGENT_MEMORY_LOG_PATH, 'logs'),
    },
  };
}

// Create the singleton config instance
export const config: Config = buildConfig();

/**
 * Reload configuration from environment variables.
 * This is primarily for testing purposes - allows tests to modify env vars
 * and have those changes reflected in the config.
 *
 * WARNING: This mutates the config object. Only use in tests.
 */
export function reloadConfig(): void {
  const newConfig = buildConfig();
  // Deep assign all sections
  for (const key of Object.keys(newConfig) as Array<keyof Config>) {
    const section = newConfig[key];
    if (typeof section === 'object' && section !== null) {
      Object.assign(config[key], section);
    }
  }
}

export default config;
