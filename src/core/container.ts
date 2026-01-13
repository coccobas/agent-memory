/**
 * Dependency Injection Container
 *
 * Class-based container for managing application state.
 * Supports multiple instances for parallel test execution.
 *
 * ## Singleton Pattern Rationale
 *
 * The `defaultContainer` export is a module-level singleton. This pattern was chosen because:
 *
 * 1. **Backward Compatibility**: Many services use `getDb()` and `getSqlite()` convenience
 *    functions that delegate to the default container. A singleton ensures consistent behavior.
 *
 * 2. **Process Lifecycle**: Database connections, caches, and circuit breakers are process-wide
 *    resources. Managing them centrally prevents resource leaks and connection exhaustion.
 *
 * 3. **Configuration Consistency**: A single container ensures all services see the same
 *    configuration state, especially important for runtime config reloading.
 *
 * ## Request Isolation
 *
 * Despite being a singleton, request isolation is achieved through:
 *
 * - **AppContext**: Each request can create its own AppContext with request-scoped state
 * - **Transaction Boundaries**: Database transactions provide isolation per operation
 * - **Stateless Services**: Most services are stateless; state lives in AppContext or database
 *
 * ## Test Isolation
 *
 * For tests requiring complete isolation:
 *
 * ```typescript
 * // Create isolated container instance
 * const testContainer = new Container();
 * testContainer.registerRuntime(mockRuntime);
 *
 * // Or reset the default container
 * resetContainer();
 * ```
 *
 * Tests can also use `vitest.mock` to replace the defaultContainer export entirely.
 *
 * ## Usage
 *
 * - `registerRuntime()` at process startup
 * - `registerContext()` after creating AppContext
 * - `getRuntime()` / `getDb()` / `getSqlite()` to access
 * - `resetContainer()` for test cleanup
 *
 * For tests needing isolation, create a new Container instance.
 */

import type Database from 'better-sqlite3';
import type { Config } from '../config/index.js';
import { buildConfig } from '../config/index.js';
import type { AppContext } from './context.js';
import { shutdownRuntime, type Runtime } from './runtime.js';
import type { AppDb } from './types.js';
import { createComponentLogger } from '../utils/logger.js';
import { LRUCache } from '../utils/lru-cache.js';
import { createServiceUnavailableError } from './errors.js';

// Forward declarations for types to avoid circular dependencies
// The actual CircuitBreaker class is imported dynamically or passed in
export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  resetTimeoutMs: number;
  successThreshold: number;
  isFailure?: (error: Error) => boolean;
}

export interface ICircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getStats(): unknown;
  getName(): string;
  isOpen(): boolean;
  forceClose(): void;
  forceOpen(): void;
}

export interface IHealthMonitor {
  startPeriodicChecks(intervalMs?: number): void;
  stopPeriodicChecks(): void;
}

// =============================================================================
// CONTAINER STATE INTERFACE
// =============================================================================

interface ContainerState {
  // Configuration
  config: Config;

  // Process-scoped runtime (shared across MCP/REST)
  runtime: Runtime | null;

  // Database references (using typed schema)
  db: AppDb | null;
  sqlite: Database.Database | null | undefined; // undefined in PostgreSQL mode

  // AppContext reference (for services access)
  context: AppContext | null;

  // Flags
  initialized: boolean;

  // Singleton management (for test isolation)
  circuitBreakers: Map<string, ICircuitBreaker>;
  preparedStatementCache: LRUCache<Database.Statement>;
  healthCheckInterval: NodeJS.Timeout | null;
  healthMonitor: IHealthMonitor | null;
  healthMonitorCreating: boolean; // Bug #213 fix: mutex flag for health monitor creation
}

// =============================================================================
// CONTAINER CLASS
// =============================================================================

/**
 * Container class for managing application state.
 * Create new instances for isolated test environments.
 */
export class Container {
  private state: ContainerState;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): ContainerState {
    const logger = createComponentLogger('container');
    const config = buildConfig();

    return {
      config,
      runtime: null,
      db: null,
      sqlite: null,
      context: null,
      initialized: false,
      // Singleton management
      circuitBreakers: new Map(),
      preparedStatementCache: new LRUCache<Database.Statement>({
        maxSize: config.cache.maxPreparedStatements,
        onEvict: (sql) => logger.debug({ sql: sql.substring(0, 50) }, 'Evicting prepared statement'),
      }),
      healthCheckInterval: null,
      healthMonitor: null,
      healthMonitorCreating: false, // Bug #213 fix: mutex flag
    };
  }

  // ===========================================================================
  // STATE ACCESS
  // ===========================================================================

  /**
   * Get the current container state (for advanced use cases)
   */
  getContainerState(): Readonly<ContainerState> {
    return this.state;
  }

  /**
   * Reset the entire container to initial state
   * Use this in tests to ensure clean state between tests
   */
  reset(): void {
    const logger = createComponentLogger('container');

    // Shutdown runtime if registered
    if (this.state.runtime) {
      try {
        shutdownRuntime(this.state.runtime);
      } catch (error) {
        logger.debug({ error }, 'Runtime shutdown error (ignored)');
      }
    }

    // Close database if open
    if (this.state.sqlite) {
      try {
        this.state.sqlite.close();
      } catch (error) {
        logger.debug({ error }, 'SQLite close error (ignored)');
      }
    }

    // Clear health check interval
    if (this.state.healthCheckInterval) {
      clearInterval(this.state.healthCheckInterval);
    }

    // Clear circuit breakers
    this.state.circuitBreakers.clear();

    // Clear prepared statement cache
    // Note: better-sqlite3 statements don't need explicit finalization
    // They are cleaned up when the database connection closes
    this.state.preparedStatementCache.clear();

    // Stop health monitor periodic checks
    if (this.state.healthMonitor) {
      this.state.healthMonitor.stopPeriodicChecks();
    }

    // Reset to initial state
    this.state = this.createInitialState();
  }

  /**
   * Initialize the container with optional overrides
   * Useful for testing with mocked services
   */
  initialize(overrides?: Partial<ContainerState>): ContainerState {
    if (overrides) {
      this.state = { ...this.state, ...overrides };
    }
    this.state.initialized = true;
    return this.state;
  }

  // ===========================================================================
  // RUNTIME REGISTRATION
  // ===========================================================================

  /**
   * Register the process-scoped Runtime
   * Call this once at process startup, before creating AppContexts.
   */
  registerRuntime(runtime: Runtime): void {
    this.state.runtime = runtime;
  }

  /**
   * Get the registered Runtime
   * @throws Error if runtime not registered
   */
  getRuntime(): Runtime {
    if (!this.state.runtime) {
      throw createServiceUnavailableError('runtime', 'not registered. Call registerRuntime() first at startup');
    }
    return this.state.runtime;
  }

  /**
   * Check if runtime is registered
   */
  isRuntimeRegistered(): boolean {
    return this.state.runtime !== null;
  }

  // ===========================================================================
  // CONTEXT & DATABASE REGISTRATION
  // ===========================================================================

  /**
   * Register the database instances
   * @param db - Drizzle ORM database instance
   * @param sqlite - Raw SQLite instance (undefined for PostgreSQL mode)
   */
  registerDatabase(db: AppDb, sqlite?: Database.Database): void {
    this.state.db = db;
    this.state.sqlite = sqlite;
  }

  /**
   * Register the full AppContext with the container.
   * This populates the container state from an initialized AppContext.
   */
  registerContext(context: AppContext): void {
    this.state.context = context;
    this.state.config = context.config;
    this.state.db = context.db;
    this.state.sqlite = context.sqlite;
    this.state.initialized = true;
  }

  /**
   * Get the registered AppContext
   * @throws Error if context not registered
   */
  getContext(): AppContext {
    if (!this.state.context) {
      throw createServiceUnavailableError('AppContext', 'not registered. Call registerContext() first');
    }
    return this.state.context;
  }

  /**
   * Check if context is registered
   */
  isContextRegistered(): boolean {
    return this.state.context !== null;
  }

  /**
   * Clear database registration (call when closing database)
   */
  clearDatabaseRegistration(): void {
    this.state.db = null;
    this.state.sqlite = null;
  }

  // ===========================================================================
  // ACCESSORS
  // ===========================================================================

  /**
   * Get the configuration
   */
  getConfig(): Config {
    return this.state.config;
  }

  /**
   * Get the database instance
   * @throws Error if database not initialized
   */
  getDatabase(): AppDb {
    if (!this.state.db) {
      throw createServiceUnavailableError('database', 'not initialized. Call createAppContext() first');
    }
    return this.state.db;
  }

  /**
   * Get the SQLite instance (SQLite mode only)
   * @throws Error if database not initialized or in PostgreSQL mode
   */
  getSqlite(): Database.Database {
    if (!this.state.sqlite) {
      throw createServiceUnavailableError(
        'SQLite',
        'not available. Either database not initialized or using PostgreSQL mode'
      );
    }
    return this.state.sqlite;
  }

  /**
   * Check if database is initialized
   * In PostgreSQL mode, only db is set (sqlite is undefined)
   */
  isDatabaseInitialized(): boolean {
    return this.state.db !== null;
  }

  /**
   * Check if container is fully initialized
   */
  isInitialized(): boolean {
    return this.state.initialized;
  }

  // ===========================================================================
  // CIRCUIT BREAKER MANAGEMENT
  // ===========================================================================

  /**
   * Get or create a circuit breaker by name
   * @param name - Circuit breaker name
   * @param factory - Factory function to create the circuit breaker if it doesn't exist
   */
  getCircuitBreaker(name: string, factory?: () => ICircuitBreaker): ICircuitBreaker | undefined {
    let breaker = this.state.circuitBreakers.get(name);
    if (!breaker && factory) {
      breaker = factory();
      this.state.circuitBreakers.set(name, breaker);
    }
    return breaker;
  }

  /**
   * Get all registered circuit breakers
   */
  getAllCircuitBreakers(): Map<string, ICircuitBreaker> {
    return this.state.circuitBreakers;
  }

  /**
   * Reset all circuit breakers (force close)
   */
  resetAllCircuitBreakers(): void {
    for (const breaker of this.state.circuitBreakers.values()) {
      breaker.forceClose();
    }
  }

  // ===========================================================================
  // PREPARED STATEMENT CACHE MANAGEMENT
  // ===========================================================================

  /**
   * Get or create a prepared statement
   * @param sql - SQL query string
   * @param factory - Factory function to create the statement if it doesn't exist
   */
  getPreparedStatement(sql: string, factory?: () => Database.Statement): Database.Statement | undefined {
    let stmt = this.state.preparedStatementCache.get(sql);
    if (!stmt && factory) {
      stmt = factory();
      this.state.preparedStatementCache.set(sql, stmt);
    }
    return stmt;
  }

  /**
   * Clear all prepared statements from cache
   */
  clearPreparedStatementCache(): void {
    // Note: better-sqlite3 statements don't need explicit finalization
    // They are cleaned up when the database connection closes
    this.state.preparedStatementCache.clear();
  }

  /**
   * Get the prepared statement cache size
   */
  getPreparedStatementCacheSize(): number {
    return this.state.preparedStatementCache.size;
  }

  // ===========================================================================
  // HEALTH CHECK INTERVAL MANAGEMENT
  // ===========================================================================

  /**
   * Set the health check interval
   */
  setHealthCheckInterval(interval: NodeJS.Timeout): void {
    // Clear existing interval if any
    if (this.state.healthCheckInterval) {
      clearInterval(this.state.healthCheckInterval);
    }
    this.state.healthCheckInterval = interval;
  }

  /**
   * Clear the health check interval
   */
  clearHealthCheckInterval(): void {
    if (this.state.healthCheckInterval) {
      clearInterval(this.state.healthCheckInterval);
      this.state.healthCheckInterval = null;
    }
  }

  /**
   * Check if health check interval is active
   */
  hasHealthCheckInterval(): boolean {
    return this.state.healthCheckInterval !== null;
  }

  // ===========================================================================
  // HEALTH MONITOR MANAGEMENT
  // ===========================================================================

  /**
   * Get or create the health monitor singleton
   * @param factory - Factory function to create the health monitor if it doesn't exist
   */
  getHealthMonitor(factory?: () => IHealthMonitor): IHealthMonitor | null {
    // Bug #213 fix: Use creating flag as mutex to prevent duplicate creation
    // This handles the race condition where multiple callers see healthMonitor as null
    // and all try to create it simultaneously
    if (!this.state.healthMonitor && factory && !this.state.healthMonitorCreating) {
      this.state.healthMonitorCreating = true;
      try {
        this.state.healthMonitor = factory();
      } finally {
        this.state.healthMonitorCreating = false;
      }
    }
    return this.state.healthMonitor;
  }

  /**
   * Set the health monitor instance
   */
  setHealthMonitor(monitor: IHealthMonitor): void {
    this.state.healthMonitor = monitor;
  }

  /**
   * Reset the health monitor (stops periodic checks and clears instance)
   */
  resetHealthMonitor(): void {
    if (this.state.healthMonitor) {
      this.state.healthMonitor.stopPeriodicChecks();
      this.state.healthMonitor = null;
    }
  }

  /**
   * Check if health monitor is registered
   */
  hasHealthMonitor(): boolean {
    return this.state.healthMonitor !== null;
  }

  // ===========================================================================
  // CONFIG RELOAD
  // ===========================================================================

  /**
   * Reload configuration from environment variables
   * Primarily for testing
   */
  reloadConfig(): void {
    this.state.config = buildConfig();
  }
}

// =============================================================================
// DEFAULT INSTANCE (SINGLETON)
// =============================================================================

/**
 * Default container instance (module-level singleton).
 *
 * ## Why a Singleton?
 *
 * This singleton exists for several important reasons:
 *
 * 1. **Process-Wide Resources**: Database connections, caches, and circuit breakers
 *    should be shared across all requests to avoid resource exhaustion.
 *
 * 2. **Convenience API**: Functions like `getDb()`, `getSqlite()`, and `getRuntime()`
 *    delegate to this container, providing a simple API without passing containers.
 *
 * 3. **Framework Agnostic**: Works with any framework (Fastify, MCP server, CLI)
 *    without requiring dependency injection setup.
 *
 * ## When to Use a New Instance
 *
 * Create a new `Container()` instance when:
 * - Running parallel tests that need isolated state
 * - Testing container registration/lifecycle behavior
 * - Simulating multi-tenant scenarios in tests
 *
 * @example
 * ```typescript
 * // Standard usage - use default container
 * const db = getDb();
 *
 * // Test isolation - create new instance
 * const isolated = new Container();
 * isolated.registerRuntime(mockRuntime);
 * ```
 */
export const defaultContainer = new Container();

// =============================================================================
// CONVENIENCE EXPORTS (DELEGATE TO DEFAULT CONTAINER)
// =============================================================================

/**
 * Get the current container state (for advanced use cases)
 */
export function getContainerState(): Readonly<ContainerState> {
  return defaultContainer.getContainerState();
}

/**
 * Reset the entire container to initial state
 * Use this in tests to ensure clean state between tests
 */
export function resetContainer(): void {
  defaultContainer.reset();
}

/**
 * Initialize the container with optional overrides
 * Useful for testing with mocked services
 */
export function initializeContainer(overrides?: Partial<ContainerState>): ContainerState {
  return defaultContainer.initialize(overrides);
}

/**
 * Register the process-scoped Runtime
 * Call this once at process startup, before creating AppContexts.
 */
export function registerRuntime(runtime: Runtime): void {
  defaultContainer.registerRuntime(runtime);
}

/**
 * Get the registered Runtime
 * @throws Error if runtime not registered
 */
export function getRuntime(): Runtime {
  return defaultContainer.getRuntime();
}

/**
 * Check if runtime is registered
 */
export function isRuntimeRegistered(): boolean {
  return defaultContainer.isRuntimeRegistered();
}

/**
 * Register the database instances
 * @param db - Drizzle ORM database instance
 * @param sqlite - Raw SQLite instance (undefined for PostgreSQL mode)
 */
export function registerDatabase(db: AppDb, sqlite?: Database.Database): void {
  defaultContainer.registerDatabase(db, sqlite);
}

/**
 * Register the full AppContext with the container.
 * This populates the container state from an initialized AppContext.
 */
export function registerContext(context: AppContext): void {
  defaultContainer.registerContext(context);
}

/**
 * Get the registered AppContext
 * @throws Error if context not registered
 */
export function getContext(): AppContext {
  return defaultContainer.getContext();
}

/**
 * Check if context is registered
 */
export function isContextRegistered(): boolean {
  return defaultContainer.isContextRegistered();
}

/**
 * Clear database registration (call when closing database)
 */
export function clearDatabaseRegistration(): void {
  defaultContainer.clearDatabaseRegistration();
}

/**
 * Get the configuration
 */
export function getConfig(): Config {
  return defaultContainer.getConfig();
}

/**
 * Get the database instance
 * @throws Error if database not initialized
 */
export function getDatabase(): AppDb {
  return defaultContainer.getDatabase();
}

/**
 * Get the SQLite instance
 * @throws Error if database not initialized
 */
export function getSqlite(): Database.Database {
  return defaultContainer.getSqlite();
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return defaultContainer.isDatabaseInitialized();
}

/**
 * Check if container is fully initialized
 */
export function isContainerInitialized(): boolean {
  return defaultContainer.isInitialized();
}

/**
 * Reload configuration from environment variables
 * Primarily for testing
 */
export function reloadContainerConfig(): void {
  defaultContainer.reloadConfig();
}

// =============================================================================
// CIRCUIT BREAKER EXPORTS
// =============================================================================

/**
 * Get or create a circuit breaker by name
 */
export function getCircuitBreaker(
  name: string,
  factory?: () => ICircuitBreaker
): ICircuitBreaker | undefined {
  return defaultContainer.getCircuitBreaker(name, factory);
}

/**
 * Get all registered circuit breakers
 */
export function getAllCircuitBreakers(): Map<string, ICircuitBreaker> {
  return defaultContainer.getAllCircuitBreakers();
}

/**
 * Reset all circuit breakers (force close)
 */
export function resetAllCircuitBreakers(): void {
  defaultContainer.resetAllCircuitBreakers();
}

// =============================================================================
// PREPARED STATEMENT CACHE EXPORTS
// =============================================================================

/**
 * Get or create a prepared statement
 */
export function getPreparedStatement(
  sql: string,
  factory?: () => Database.Statement
): Database.Statement | undefined {
  return defaultContainer.getPreparedStatement(sql, factory);
}

/**
 * Clear all prepared statements from cache
 */
export function clearPreparedStatementCache(): void {
  defaultContainer.clearPreparedStatementCache();
}

/**
 * Get the prepared statement cache size
 */
export function getPreparedStatementCacheSize(): number {
  return defaultContainer.getPreparedStatementCacheSize();
}

// =============================================================================
// HEALTH CHECK INTERVAL EXPORTS
// =============================================================================

/**
 * Set the health check interval
 */
export function setHealthCheckInterval(interval: NodeJS.Timeout): void {
  defaultContainer.setHealthCheckInterval(interval);
}

/**
 * Clear the health check interval
 */
export function clearHealthCheckInterval(): void {
  defaultContainer.clearHealthCheckInterval();
}

/**
 * Check if health check interval is active
 */
export function hasHealthCheckInterval(): boolean {
  return defaultContainer.hasHealthCheckInterval();
}

// =============================================================================
// HEALTH MONITOR EXPORTS
// =============================================================================

/**
 * Get or create the health monitor singleton
 */
export function getHealthMonitor(factory?: () => IHealthMonitor): IHealthMonitor | null {
  return defaultContainer.getHealthMonitor(factory);
}

/**
 * Set the health monitor instance
 */
export function setHealthMonitor(monitor: IHealthMonitor): void {
  defaultContainer.setHealthMonitor(monitor);
}

/**
 * Reset the health monitor
 */
export function resetHealthMonitor(): void {
  defaultContainer.resetHealthMonitor();
}

/**
 * Check if health monitor is registered
 */
export function hasHealthMonitor(): boolean {
  return defaultContainer.hasHealthMonitor();
}
