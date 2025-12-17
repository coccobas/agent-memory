/**
 * Centralized constants for Agent Memory
 *
 * Re-exports configuration values from the config module for backward compatibility.
 * New code should import directly from '../config/index.js'.
 */

import { config } from '../config/index.js';

// =============================================================================
// SEMANTIC SEARCH THRESHOLDS
// =============================================================================

/**
 * Default semantic similarity threshold for search results
 * Results with similarity below this threshold are filtered out
 * Range: 0-1, where 1 is identical
 */
export const DEFAULT_SEMANTIC_THRESHOLD = config.semanticSearch.defaultThreshold;

/**
 * Weight given to semantic score in hybrid scoring (semantic + traditional)
 * Remaining weight goes to traditional factors (recency, priority, scope)
 */
export const SEMANTIC_SCORE_WEIGHT = config.semanticSearch.scoreWeight;

// =============================================================================
// DUPLICATE DETECTION THRESHOLDS
// =============================================================================

/**
 * Default similarity threshold for duplicate detection
 * Entries with name similarity >= this threshold are considered potential duplicates
 */
export const DEFAULT_DUPLICATE_THRESHOLD = config.semanticSearch.duplicateThreshold;

// =============================================================================
// MEMORY MANAGEMENT THRESHOLDS
// =============================================================================

/**
 * Heap memory pressure threshold (percentage)
 * When heap usage exceeds this, caches will proactively evict
 */
export const HEAP_PRESSURE_THRESHOLD = config.memory.heapPressureThreshold;

/**
 * Cache memory pressure threshold (percentage of limit)
 * When total cache memory exceeds this percentage of limit, eviction is triggered
 */
export const CACHE_PRESSURE_THRESHOLD = config.cache.pressureThreshold;

/**
 * Target memory level after eviction (percentage of limit)
 * Eviction continues until memory drops to this level to avoid frequent evictions
 */
export const CACHE_EVICTION_TARGET = config.cache.evictionTarget;

// =============================================================================
// ERROR CORRELATION THRESHOLDS
// =============================================================================

/**
 * High correlation threshold for error analysis
 * Agent pairs with correlation above this are flagged as potentially problematic
 */
export const HIGH_ERROR_CORRELATION_THRESHOLD = config.conflict.highErrorCorrelationThreshold;

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

/**
 * Default TTL for query cache entries (milliseconds)
 * 5 minutes
 */
export const QUERY_CACHE_TTL_MS = config.cache.queryCacheTTLMs;

/**
 * Default TTL for scope chain cache entries (milliseconds)
 * 10 minutes
 */
export const SCOPE_CACHE_TTL_MS = config.cache.scopeCacheTTLMs;

/**
 * Maximum number of prepared statements to cache
 */
export const MAX_PREPARED_STATEMENTS = config.cache.maxPreparedStatements;

/**
 * Default maximum size for query result cache
 */
export const DEFAULT_QUERY_CACHE_SIZE = config.cache.queryCacheSize;

/**
 * Default maximum memory for query cache (MB)
 */
export const DEFAULT_QUERY_CACHE_MEMORY_MB = config.cache.queryCacheMemoryMB;

// =============================================================================
// CONFLICT DETECTION
// =============================================================================

/**
 * Time window for conflict detection (milliseconds)
 * Updates within this window are flagged as potential conflicts
 */
export const CONFLICT_WINDOW_MS = config.conflict.windowMs;

// =============================================================================
// PAGINATION
// =============================================================================

/**
 * Default limit for query results
 */
export const DEFAULT_QUERY_LIMIT = config.pagination.defaultLimit;

/**
 * Maximum limit for query results
 */
export const MAX_QUERY_LIMIT = config.pagination.maxLimit;

// =============================================================================
// HEALTH CHECK & RECONNECTION
// =============================================================================

/**
 * Default interval for background health checks (milliseconds)
 */
export const DEFAULT_HEALTH_CHECK_INTERVAL_MS = config.health.checkIntervalMs;

/**
 * Default interval for memory coordinator checks (milliseconds)
 */
export const DEFAULT_MEMORY_CHECK_INTERVAL_MS = config.memory.checkIntervalMs;

/**
 * Default total memory limit for all caches (MB)
 */
export const DEFAULT_TOTAL_CACHE_LIMIT_MB = config.cache.totalLimitMB;
