import type { AppContext } from '../../core/context.js';
import type { ContextAwareHandler } from '../descriptors/types.js';
import { loadNotionSyncConfig } from '../../services/notion-sync/config.js';
import { createNotionClient } from '../../services/notion-sync/client.js';
import { createNotionSyncService } from '../../services/notion-sync/sync.service.js';
import { getNotionSyncSchedulerStatus } from '../../services/notion-sync/scheduler.service.js';
import { getOptionalParam, isString, isBoolean } from '../../utils/type-guards.js';
import { createNotFoundError } from '../../core/errors.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';

const sync: ContextAwareHandler = async (context: AppContext, params: Record<string, unknown>) => {
  const configPath = getOptionalParam(params, 'configPath', isString);
  const databaseId = getOptionalParam(params, 'databaseId', isString);
  const fullSync = getOptionalParam(params, 'fullSync', isBoolean) ?? false;
  const dryRun = getOptionalParam(params, 'dryRun', isBoolean) ?? false;

  const config = loadNotionSyncConfig(configPath);
  const client = createNotionClient();
  if (!context.repos.tasks) {
    throw new Error('Task repository not available');
  }

  const syncService = createNotionSyncService({
    notionClient: client,
    taskRepo: context.repos.tasks,
    evidenceRepo: context.repos.evidence,
  });

  const results = [];

  for (const dbConfig of config.databases) {
    if (databaseId && dbConfig.notionDatabaseId !== databaseId) continue;
    if (!dbConfig.syncEnabled) continue;

    const result = await syncService.syncDatabase(dbConfig, { fullSync, dryRun });
    results.push(result);
  }

  if (databaseId && results.length === 0) {
    throw createNotFoundError('database', databaseId);
  }

  return formatTimestamps({
    success: true,
    syncedDatabases: results.length,
    dryRun,
    results,
  });
};

const status: ContextAwareHandler = async (
  _context: AppContext,
  params: Record<string, unknown>
) => {
  const configPath = getOptionalParam(params, 'configPath', isString);

  let configStatus = { loaded: false, databaseCount: 0, error: null as string | null };
  try {
    const config = loadNotionSyncConfig(configPath);
    configStatus = { loaded: true, databaseCount: config.databases.length, error: null };
  } catch (error) {
    configStatus.error = error instanceof Error ? error.message : String(error);
  }

  const schedulerStatus = getNotionSyncSchedulerStatus();

  return formatTimestamps({
    scheduler: schedulerStatus,
    config: configStatus,
  });
};

const list_databases: ContextAwareHandler = async (
  _context: AppContext,
  params: Record<string, unknown>
) => {
  const configPath = getOptionalParam(params, 'configPath', isString);

  const config = loadNotionSyncConfig(configPath);

  return {
    databases: config.databases.map((db) => ({
      notionDatabaseId: db.notionDatabaseId,
      projectScopeId: db.projectScopeId,
      syncEnabled: db.syncEnabled,
      fieldMappingCount: db.fieldMappings.length,
      lastSyncTimestamp: db.lastSyncTimestamp,
    })),
    totalCount: config.databases.length,
    enabledCount: config.databases.filter((db) => db.syncEnabled).length,
  };
};

export const notionSyncHandlers = {
  sync,
  status,
  list_databases,
};
