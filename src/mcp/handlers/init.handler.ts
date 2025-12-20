/**
 * Initialization Handler
 *
 * Handles database initialization, migration status, and reset operations
 */

import { getSqlite } from '../../db/connection.js';
import { initializeDatabase, getMigrationStatus, resetDatabase } from '../../db/init.js';
import { requireAdminKey } from '../../utils/admin.js';

interface InitParams {
  force?: boolean;
  verbose?: boolean;
}

interface StatusParams {
  // No parameters needed
}

interface ResetParams {
  confirm?: boolean;
  verbose?: boolean;
}

/**
 * Initialize or re-initialize the database
 */
function init(params: InitParams) {
  requireAdminKey(params as unknown as Record<string, unknown>);
  const sqlite = getSqlite();
  const result = initializeDatabase(sqlite, {
    force: params.force ?? false,
    verbose: params.verbose ?? false,
  });

  return {
    success: result.success,
    alreadyInitialized: result.alreadyInitialized,
    migrationsApplied: result.migrationsApplied,
    migrationCount: result.migrationsApplied.length,
    integrityVerified: result.integrityVerified,
    integrityErrors: result.integrityErrors,
    errors: result.errors.length > 0 ? result.errors : undefined,
    message: result.success
      ? result.alreadyInitialized
        ? 'Database already initialized'
        : `Successfully applied ${result.migrationsApplied.length} migration(s)`
      : 'Initialization failed',
  };
}

/**
 * Verify database integrity
 */
function verify(_params: StatusParams = {}) {
  const sqlite = getSqlite();
  // Initialize with verbose=false to just check integrity (and backfill if needed)
  // Logic in initializeDatabase will perform checks
  const result = initializeDatabase(sqlite, { verbose: false, force: false });

  return {
    success: result.success,
    integrityVerified: result.integrityVerified,
    integrityErrors: result.integrityErrors,
    migrationsApplied: result.migrationsApplied, // Should be empty if just verifying
    message: result.integrityVerified
      ? 'Database integrity verifed'
      : `Integrity check failed: ${result.integrityErrors.join('; ')}`,
  };
}

/**
 * Get current migration and initialization status
 */
function status(_params: StatusParams) {
  const sqlite = getSqlite();
  const status = getMigrationStatus(sqlite);

  return {
    initialized: status.initialized,
    appliedMigrations: status.appliedMigrations,
    appliedCount: status.appliedMigrations.length,
    pendingMigrations: status.pendingMigrations,
    pendingCount: status.pendingMigrations.length,
    totalMigrations: status.totalMigrations,
    status: status.initialized
      ? status.pendingMigrations.length > 0
        ? 'needs_migration'
        : 'ready'
      : 'not_initialized',
  };
}

/**
 * Reset the database (drops all tables and re-initializes)
 * WARNING: This deletes all data!
 */
function reset(params: ResetParams) {
  requireAdminKey(params as unknown as Record<string, unknown>);
  if (!params.confirm) {
    return {
      success: false,
      error:
        'Reset requires confirmation. Set confirm=true to proceed. WARNING: This will delete all data!',
    };
  }

  const sqlite = getSqlite();
  const result = resetDatabase(sqlite, {
    verbose: params.verbose ?? false,
  });

  return {
    success: result.success,
    migrationsApplied: result.migrationsApplied,
    migrationCount: result.migrationsApplied.length,
    errors: result.errors.length > 0 ? result.errors : undefined,
    message: result.success
      ? `Database reset complete. Applied ${result.migrationsApplied.length} migration(s)`
      : 'Reset failed',
  };
}

export const initHandlers = {
  init,
  status,
  reset,
  verify,
};
