/**
 * Centralized constants for Agent Memory
 *
 * All magic numbers and configurable thresholds should be defined here
 * to improve maintainability and make configuration easier.
 */

// =============================================================================
// SEMANTIC SEARCH THRESHOLDS
// =============================================================================

/**
 * Default semantic similarity threshold for search results
 * Results with similarity below this threshold are filtered out
 * Range: 0-1, where 1 is identical
 */
export const DEFAULT_SEMANTIC_THRESHOLD = 0.7;

/**
 * Weight given to semantic score in hybrid scoring (semantic + traditional)
 * Remaining weight goes to traditional factors (recency, priority, scope)
 */
export const SEMANTIC_SCORE_WEIGHT = 0.7;

// =============================================================================
// DUPLICATE DETECTION THRESHOLDS
// =============================================================================

/**
 * Default similarity threshold for duplicate detection
 * Entries with name similarity >= this threshold are considered potential duplicates
 */
export const DEFAULT_DUPLICATE_THRESHOLD = 0.8;

// =============================================================================
// MEMORY MANAGEMENT THRESHOLDS
// =============================================================================

/**
 * Heap memory pressure threshold (percentage)
 * When heap usage exceeds this, caches will proactively evict
 */
export const HEAP_PRESSURE_THRESHOLD = 0.85;

/**
 * Cache memory pressure threshold (percentage of limit)
 * When total cache memory exceeds this percentage of limit, eviction is triggered
 */
export const CACHE_PRESSURE_THRESHOLD = 0.8;

/**
 * Target memory level after eviction (percentage of limit)
 * Eviction continues until memory drops to this level to avoid frequent evictions
 */
export const CACHE_EVICTION_TARGET = 0.8;

// =============================================================================
// ERROR CORRELATION THRESHOLDS
// =============================================================================

/**
 * High correlation threshold for error analysis
 * Agent pairs with correlation above this are flagged as potentially problematic
 */
export const HIGH_ERROR_CORRELATION_THRESHOLD = 0.7;

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

/**
 * Default TTL for query cache entries (milliseconds)
 * 5 minutes
 */
export const QUERY_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Default TTL for scope chain cache entries (milliseconds)
 * 10 minutes
 */
export const SCOPE_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Maximum number of prepared statements to cache
 */
export const MAX_PREPARED_STATEMENTS = 100;

/**
 * Default maximum size for query result cache
 */
export const DEFAULT_QUERY_CACHE_SIZE = 200;

/**
 * Default maximum memory for query cache (MB)
 */
export const DEFAULT_QUERY_CACHE_MEMORY_MB = 50;

// =============================================================================
// CONFLICT DETECTION
// =============================================================================

/**
 * Time window for conflict detection (milliseconds)
 * Updates within this window are flagged as potential conflicts
 */
export const CONFLICT_WINDOW_MS = 5000;

// =============================================================================
// PAGINATION
// =============================================================================

/**
 * Default limit for query results
 */
export const DEFAULT_QUERY_LIMIT = 20;

/**
 * Maximum limit for query results
 */
export const MAX_QUERY_LIMIT = 100;

// =============================================================================
// HEALTH CHECK & RECONNECTION
// =============================================================================

/**
 * Default interval for background health checks (milliseconds)
 */
export const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 30000;

/**
 * Default interval for memory coordinator checks (milliseconds)
 */
export const DEFAULT_MEMORY_CHECK_INTERVAL_MS = 30000;

/**
 * Default total memory limit for all caches (MB)
 */
export const DEFAULT_TOTAL_CACHE_LIMIT_MB = 100;
