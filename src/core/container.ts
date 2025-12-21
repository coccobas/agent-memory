/**
 * Dependency Injection Container
 *
 * Centralizes all mutable singletons into a single registry with:
 * - Single reset point for tests
 * - Lazy initialization
 * - Backward-compatible accessor functions
 *
 * This replaces scattered mutable singletons across the codebase.
 */

import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Config } from '../config/index.js';
import { buildConfig } from '../config/index.js';

// =============================================================================
// SERVICE INTERFACES
// =============================================================================

/**
 * Embedding service interface
 */
export interface IEmbeddingService {
  isAvailable(): boolean;
  embed(text: string): Promise<{ embedding: number[]; cached: boolean }>;
  embedBatch(texts: string[]): Promise<{ embeddings: number[][]; cached: number }>;
  getCacheStats(): { hits: number; misses: number; hitRate: number };
}

/**
 * Vector service interface
 */
export interface IVectorService {
  isAvailable(): boolean;
  initialize(): Promise<void>;
  storeEmbedding(
    entryType: string,
    entryId: string,
    embedding: number[],
    text: string,
    versionId?: string
  ): Promise<void>;
  searchSimilar(
    embedding: number[],
    options?: { limit?: number; entryTypes?: string[]; threshold?: number }
  ): Promise<Array<{ entryType: string; entryId: string; similarity: number; text: string }>>;
  getCount(): number;
}

/**
 * Rate limiter interface
 */
export interface IRateLimiter {
  check(key?: string): { allowed: boolean; remaining: number; retryAfterMs?: number };
  reset(): void;
}

// =============================================================================
// CONTAINER STATE
// =============================================================================

interface ContainerState {
  // Core
  config: Config;

  // Database (lazy initialized)
  db: BetterSQLite3Database | null;
  sqlite: Database.Database | null;

  // Services (lazy initialized)
  embeddingService: IEmbeddingService | null;
  vectorService: IVectorService | null;

  // Rate limiters
  perAgentLimiter: IRateLimiter | null;
  globalLimiter: IRateLimiter | null;
  burstLimiter: IRateLimiter | null;

  // Health check
  healthCheckInterval: NodeJS.Timeout | null;

  // Flags
  initialized: boolean;
}

let state: ContainerState = createInitialState();

function createInitialState(): ContainerState {
  return {
    config: buildConfig(),
    db: null,
    sqlite: null,
    embeddingService: null,
    vectorService: null,
    perAgentLimiter: null,
    globalLimiter: null,
    burstLimiter: null,
    healthCheckInterval: null,
    initialized: false,
  };
}

// =============================================================================
// CONTAINER API
// =============================================================================

/**
 * Get the current container state (for advanced use cases)
 */
export function getContainerState(): Readonly<ContainerState> {
  return state;
}

/**
 * Reset the entire container to initial state
 * Use this in tests to ensure clean state between tests
 */
export function resetContainer(): void {
  // Clear intervals
  if (state.healthCheckInterval) {
    clearInterval(state.healthCheckInterval);
  }

  // Close database if open
  if (state.sqlite) {
    try {
      state.sqlite.close();
    } catch {
      // Ignore close errors
    }
  }

  // Reset to initial state
  state = createInitialState();
}

/**
 * Initialize the container with optional overrides
 * Useful for testing with mocked services
 */
export function initializeContainer(overrides?: Partial<ContainerState>): ContainerState {
  if (overrides) {
    state = { ...state, ...overrides };
  }
  state.initialized = true;
  return state;
}

// =============================================================================
// SERVICE REGISTRATION
// =============================================================================

/**
 * Register the database instances
 */
export function registerDatabase(
  db: BetterSQLite3Database,
  sqlite: Database.Database
): void {
  state.db = db;
  state.sqlite = sqlite;
}

/**
 * Register the embedding service
 */
export function registerEmbeddingService(service: IEmbeddingService): void {
  state.embeddingService = service;
}

/**
 * Register the vector service
 */
export function registerVectorService(service: IVectorService): void {
  state.vectorService = service;
}

/**
 * Register rate limiters
 */
export function registerRateLimiters(limiters: {
  perAgent: IRateLimiter;
  global: IRateLimiter;
  burst: IRateLimiter;
}): void {
  state.perAgentLimiter = limiters.perAgent;
  state.globalLimiter = limiters.global;
  state.burstLimiter = limiters.burst;
}

/**
 * Register health check interval
 */
export function registerHealthCheckInterval(interval: NodeJS.Timeout): void {
  state.healthCheckInterval = interval;
}

// =============================================================================
// BACKWARD-COMPATIBLE ACCESSORS
// =============================================================================

/**
 * Get the configuration
 */
export function getConfig(): Config {
  return state.config;
}

/**
 * Get the database instance
 * @throws Error if database not initialized
 */
export function getDatabase(): BetterSQLite3Database {
  if (!state.db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return state.db;
}

/**
 * Get the SQLite instance
 * @throws Error if database not initialized
 */
export function getSqlite(): Database.Database {
  if (!state.sqlite) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return state.sqlite;
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return state.db !== null && state.sqlite !== null;
}

/**
 * Get the embedding service
 */
export function getEmbeddingServiceFromContainer(): IEmbeddingService | null {
  return state.embeddingService;
}

/**
 * Get the vector service
 */
export function getVectorServiceFromContainer(): IVectorService | null {
  return state.vectorService;
}

/**
 * Get rate limiters
 */
export function getRateLimiters(): {
  perAgent: IRateLimiter | null;
  global: IRateLimiter | null;
  burst: IRateLimiter | null;
} {
  return {
    perAgent: state.perAgentLimiter,
    global: state.globalLimiter,
    burst: state.burstLimiter,
  };
}

// =============================================================================
// CONFIG RELOAD
// =============================================================================

/**
 * Reload configuration from environment variables
 * Primarily for testing
 */
export function reloadContainerConfig(): void {
  state.config = buildConfig();
}
