/**
 * Dependency Injection Container
 *
 * Simplified container that acts as a thin shim for backward compatibility.
 * Holds references to Runtime and AppContext - no service instantiation.
 *
 * Usage:
 * - registerRuntime() at process startup
 * - registerContext() after creating AppContext
 * - getRuntime() / getDb() / getSqlite() to access
 * - resetContainer() for test cleanup
 */

import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Config } from '../config/index.js';
import { buildConfig } from '../config/index.js';
import type { AppContext } from './context.js';
import { shutdownRuntime, type Runtime } from './runtime.js';

// =============================================================================
// CONTAINER STATE
// =============================================================================

/**
 * Drizzle DB type that works with any schema configuration.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Required for schema flexibility
type AnyDrizzleDb = BetterSQLite3Database<any>;

interface ContainerState {
  // Configuration
  config: Config;

  // Process-scoped runtime (shared across MCP/REST)
  runtime: Runtime | null;

  // Database references
  db: AnyDrizzleDb | null;
  sqlite: Database.Database | null;

  // AppContext reference (for services access)
  context: AppContext | null;

  // Flags
  initialized: boolean;
}

let state: ContainerState = createInitialState();

function createInitialState(): ContainerState {
  return {
    config: buildConfig(),
    runtime: null,
    db: null,
    sqlite: null,
    context: null,
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
  // Shutdown runtime if registered
  if (state.runtime) {
    try {
      shutdownRuntime(state.runtime);
    } catch {
      // Ignore shutdown errors
    }
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
// RUNTIME REGISTRATION
// =============================================================================

/**
 * Register the process-scoped Runtime
 * Call this once at process startup, before creating AppContexts.
 */
export function registerRuntime(runtime: Runtime): void {
  state.runtime = runtime;
}

/**
 * Get the registered Runtime
 * @throws Error if runtime not registered
 */
export function getRuntime(): Runtime {
  if (!state.runtime) {
    throw new Error('Runtime not registered. Call registerRuntime() first at startup.');
  }
  return state.runtime;
}

/**
 * Check if runtime is registered
 */
export function isRuntimeRegistered(): boolean {
  return state.runtime !== null;
}

// =============================================================================
// CONTEXT & DATABASE REGISTRATION
// =============================================================================

/**
 * Register the database instances
 */
export function registerDatabase(db: AnyDrizzleDb, sqlite: Database.Database): void {
  state.db = db;
  state.sqlite = sqlite;
}

/**
 * Register the full AppContext with the container.
 * This populates the container state from an initialized AppContext.
 */
export function registerContext(context: AppContext): void {
  state.context = context;
  state.config = context.config;
  state.db = context.db;
  state.sqlite = context.sqlite;
  state.initialized = true;
}

/**
 * Get the registered AppContext
 * @throws Error if context not registered
 */
export function getContext(): AppContext {
  if (!state.context) {
    throw new Error('AppContext not registered. Call registerContext() first.');
  }
  return state.context;
}

/**
 * Check if context is registered
 */
export function isContextRegistered(): boolean {
  return state.context !== null;
}

/**
 * Clear database registration (call when closing database)
 */
export function clearDatabaseRegistration(): void {
  state.db = null;
  state.sqlite = null;
}

// =============================================================================
// ACCESSORS
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
export function getDatabase(): AnyDrizzleDb {
  if (!state.db) {
    throw new Error('Database not initialized. Call createAppContext() first.');
  }
  return state.db;
}

/**
 * Get the SQLite instance
 * @throws Error if database not initialized
 */
export function getSqlite(): Database.Database {
  if (!state.sqlite) {
    throw new Error('Database not initialized. Call createAppContext() first.');
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
 * Check if container is fully initialized
 */
export function isContainerInitialized(): boolean {
  return state.initialized;
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
