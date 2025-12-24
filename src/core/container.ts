/**
 * Dependency Injection Container
 *
 * Class-based container for managing application state.
 * Supports multiple instances for parallel test execution.
 *
 * Usage:
 * - registerRuntime() at process startup
 * - registerContext() after creating AppContext
 * - getRuntime() / getDb() / getSqlite() to access
 * - resetContainer() for test cleanup
 *
 * For tests needing isolation, create a new Container instance.
 */

import type Database from 'better-sqlite3';
import type { Config } from '../config/index.js';
import { buildConfig } from '../config/index.js';
import type { AppContext } from './context.js';
import { shutdownRuntime, type Runtime } from './runtime.js';
import type { AppDb } from './types.js';

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
    return {
      config: buildConfig(),
      runtime: null,
      db: null,
      sqlite: null,
      context: null,
      initialized: false,
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
    // Shutdown runtime if registered
    if (this.state.runtime) {
      try {
        shutdownRuntime(this.state.runtime);
      } catch {
        // Ignore shutdown errors
      }
    }

    // Close database if open
    if (this.state.sqlite) {
      try {
        this.state.sqlite.close();
      } catch {
        // Ignore close errors
      }
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
      throw new Error('Runtime not registered. Call registerRuntime() first at startup.');
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
      throw new Error('AppContext not registered. Call registerContext() first.');
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
      throw new Error('Database not initialized. Call createAppContext() first.');
    }
    return this.state.db;
  }

  /**
   * Get the SQLite instance (SQLite mode only)
   * @throws Error if database not initialized or in PostgreSQL mode
   */
  getSqlite(): Database.Database {
    if (!this.state.sqlite) {
      throw new Error(
        'SQLite instance not available. Either database not initialized or using PostgreSQL mode.'
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
// DEFAULT INSTANCE (BACKWARD COMPATIBILITY)
// =============================================================================

/**
 * Default container instance for backward compatibility.
 * Use this for standard application code.
 * For isolated tests, create new Container instances.
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
