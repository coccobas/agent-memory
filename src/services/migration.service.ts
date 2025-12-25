/**
 * Migration service for entry transformations
 *
 * Provides utilities for migrating entries between formats, scopes, and structures.
 */

import { exportToJson, exportToOpenAPI } from './export.service.js';
import type { ImportService } from './import.service.js';
import type { ScopeType } from '../db/schema.js';
import type { DbClient } from '../db/connection.js';

/**
 * Migration service dependencies
 */
export interface MigrationServiceDeps {
  importService: ImportService;
  db: DbClient;
}

export interface MigrationParams {
  fromFormat: string;
  toFormat: string;
  scopeType?: ScopeType;
  scopeId?: string;
  dryRun?: boolean;
}

export interface MigrationResult {
  migrated: number;
  errors: Array<{ entryId: string; error: string }>;
  dryRun: boolean;
}

/**
 * Migration service interface
 */
export interface MigrationService {
  migrateEntries(params: MigrationParams): Promise<MigrationResult>;
  migrateScope(
    fromScope: { type: ScopeType; id?: string },
    toScope: { type: ScopeType; id?: string },
    entryTypes?: ('tools' | 'guidelines' | 'knowledge')[],
    dryRun?: boolean
  ): Promise<MigrationResult>;
}

/**
 * Create a migration service with injected dependencies
 */
export function createMigrationService(deps: MigrationServiceDeps): MigrationService {
  return {
    async migrateEntries(params: MigrationParams): Promise<MigrationResult> {
      return migrateEntriesImpl(deps, params);
    },
    async migrateScope(
      fromScope: { type: ScopeType; id?: string },
      toScope: { type: ScopeType; id?: string },
      entryTypes?: ('tools' | 'guidelines' | 'knowledge')[],
      dryRun = false
    ): Promise<MigrationResult> {
      return migrateScopeImpl(deps, fromScope, toScope, entryTypes, dryRun);
    },
  };
}

/**
 * Migrate entries from one format to another (implementation)
 */
async function migrateEntriesImpl(
  deps: MigrationServiceDeps,
  params: MigrationParams
): Promise<MigrationResult> {
  const { fromFormat, toFormat, scopeType, scopeId, dryRun = false } = params;

  const result: MigrationResult = {
    migrated: 0,
    errors: [],
    dryRun,
  };

  try {
    // Step 1: Export entries in source format
    let exportResult;
    if (fromFormat === 'openapi') {
      exportResult = exportToOpenAPI(
        {
          types: ['tools'], // OpenAPI only supports tools
          scopeType,
          scopeId,
        },
        deps.db
      );
    } else {
      exportResult = exportToJson(
        {
          types: ['tools', 'guidelines', 'knowledge'],
          scopeType,
          scopeId,
        },
        deps.db
      );
    }

    if (exportResult.metadata.entryCount === 0) {
      return result; // Nothing to migrate
    }

    // Step 2: Import entries in target format (if not dry run)
    if (!dryRun) {
      let importResult;
      if (toFormat === 'openapi') {
        // OpenAPI import expects OpenAPI spec format
        // For now, we can only migrate from JSON to OpenAPI or vice versa
        if (fromFormat !== 'json') {
          result.errors.push({
            entryId: 'migration',
            error: 'OpenAPI target format requires JSON source format',
          });
          return result;
        }
        // Convert JSON export to OpenAPI format would require parsing and conversion
        // For simplicity, we'll just re-import as JSON
        importResult = await deps.importService.importFromJson(exportResult.content, {
          conflictStrategy: 'update',
        });
      } else {
        // Import as JSON (most flexible format)
        importResult = await deps.importService.importFromJson(exportResult.content, {
          conflictStrategy: 'update',
        });
      }

      result.migrated = importResult.created + importResult.updated;
      result.errors = importResult.errors.map((e: { entry: string; error: string }) => ({
        entryId: e.entry,
        error: e.error,
      }));
    } else {
      // Dry run: just report what would be migrated
      result.migrated = exportResult.metadata.entryCount;
    }
  } catch (error) {
    result.errors.push({
      entryId: 'migration',
      error: error instanceof Error ? error.message : 'Unknown migration error',
    });
  }

  return result;
}

/**
 * Migrate entries between scopes (implementation)
 */
async function migrateScopeImpl(
  deps: MigrationServiceDeps,
  fromScope: { type: ScopeType; id?: string },
  toScope: { type: ScopeType; id?: string },
  entryTypes?: ('tools' | 'guidelines' | 'knowledge')[],
  dryRun = false
): Promise<MigrationResult> {
  const result: MigrationResult = {
    migrated: 0,
    errors: [],
    dryRun,
  };

  try {
    // Export from source scope
    const exportResult = exportToJson(
      {
        types: entryTypes || ['tools', 'guidelines', 'knowledge'],
        scopeType: fromScope.type,
        scopeId: fromScope.id,
      },
      deps.db
    );

    if (exportResult.metadata.entryCount === 0) {
      return result;
    }

    if (!dryRun) {
      // Import to target scope with scope mapping
      const importResult = await deps.importService.importFromJson(exportResult.content, {
        conflictStrategy: 'update',
        scopeMapping: {
          [`${fromScope.type}:${fromScope.id || ''}`]: {
            type: toScope.type,
            id: toScope.id,
          },
        },
      });

      result.migrated = importResult.created + importResult.updated;
      result.errors = importResult.errors.map((e: { entry: string; error: string }) => ({
        entryId: e.entry,
        error: e.error,
      }));
    } else {
      result.migrated = exportResult.metadata.entryCount;
    }
  } catch (error) {
    result.errors.push({
      entryId: 'scope_migration',
      error: error instanceof Error ? error.message : 'Unknown migration error',
    });
  }

  return result;
}

