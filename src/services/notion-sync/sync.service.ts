/**
 * Notion Sync Service
 *
 * Core logic for synchronizing Notion database rows to Agent Memory tasks.
 * Features:
 * - Incremental sync using last_edited_time filter
 * - Upsert logic: create new tasks or append versions for existing
 * - Soft-delete detection for removed Notion items
 * - Checkpoint state per database for recovery
 */

import type { NotionClient, NotionPage } from './client.js';
import type { DatabaseConfig, FieldMapping } from './config.js';
import type {
  ITaskRepository,
  CreateTaskInput,
  UpdateTaskInput,
} from '../../db/repositories/tasks.js';
import type { IEvidenceRepository } from '../../db/repositories/evidence.js';
import type { TaskStatus } from '../../db/schema.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('notion-sync');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of a single database sync operation.
 */
export interface SyncResult {
  /** Database ID that was synced */
  databaseId: string;
  /** Project scope ID */
  projectScopeId: string;
  /** Whether sync completed successfully */
  success: boolean;
  /** Total items processed */
  syncedCount: number;
  /** New tasks created */
  createdCount: number;
  /** Existing tasks updated */
  updatedCount: number;
  /** Tasks soft-deleted (no longer in Notion) */
  deletedCount: number;
  /** Items skipped (unchanged) */
  skippedCount: number;
  /** Errors encountered during sync */
  errors: SyncError[];
  /** ISO timestamp when sync started */
  startedAt: string;
  /** ISO timestamp when sync completed */
  completedAt: string;
  /** New lastSyncTimestamp to save */
  newSyncTimestamp: string;
}

/**
 * Error encountered during sync.
 */
export interface SyncError {
  /** Notion page ID that caused the error */
  pageId: string;
  /** Error message */
  message: string;
  /** Whether the error is recoverable */
  recoverable: boolean;
}

/**
 * Dependencies for the sync service.
 */
export interface SyncServiceDeps {
  /** Notion API client */
  notionClient: NotionClient;
  /** Task repository for persistence */
  taskRepo: ITaskRepository;
  /** Evidence repository for audit trail (optional) */
  evidenceRepo?: IEvidenceRepository;
}

/**
 * Options for sync operation.
 */
export interface SyncOptions {
  /** Force full sync (ignore lastSyncTimestamp) */
  fullSync?: boolean;
  /** Agent ID for audit trail */
  agentId?: string;
  /** Dry run - don't persist changes */
  dryRun?: boolean;
}

// =============================================================================
// FIELD MAPPER (inline for now, will be extracted to 2.3)
// =============================================================================

/**
 * Extract text from Notion rich_text property.
 */
function extractRichText(property: unknown): string {
  if (!property || typeof property !== 'object') return '';
  const prop = property as { rich_text?: Array<{ plain_text?: string }> };
  if (!Array.isArray(prop.rich_text)) return '';
  return prop.rich_text.map((t) => t.plain_text ?? '').join('');
}

/**
 * Extract text from Notion title property.
 */
function extractTitle(property: unknown): string {
  if (!property || typeof property !== 'object') return '';
  const prop = property as { title?: Array<{ plain_text?: string }> };
  if (!Array.isArray(prop.title)) return '';
  return prop.title.map((t) => t.plain_text ?? '').join('');
}

/**
 * Extract value from Notion select property.
 */
function extractSelect(property: unknown): string | undefined {
  if (!property || typeof property !== 'object') return undefined;
  const prop = property as { select?: { name?: string } | null };
  return prop.select?.name;
}

/**
 * Extract values from Notion multi_select property.
 */
function extractMultiSelect(property: unknown): string[] {
  if (!property || typeof property !== 'object') return [];
  const prop = property as { multi_select?: Array<{ name?: string }> };
  if (!Array.isArray(prop.multi_select)) return [];
  return prop.multi_select.map((s) => s.name ?? '').filter(Boolean);
}

/**
 * Extract date from Notion date property.
 */
function extractDate(property: unknown): string | undefined {
  if (!property || typeof property !== 'object') return undefined;
  const prop = property as { date?: { start?: string } | null };
  return prop.date?.start;
}

/**
 * Extract boolean from Notion checkbox property.
 */
function extractCheckbox(property: unknown): boolean {
  if (!property || typeof property !== 'object') return false;
  const prop = property as { checkbox?: boolean };
  return prop.checkbox ?? false;
}

/**
 * Extract status from Notion status property.
 */
function extractStatus(property: unknown): string | undefined {
  if (!property || typeof property !== 'object') return undefined;
  const prop = property as { status?: { name?: string } | null };
  return prop.status?.name;
}

/**
 * Extract number from Notion number property.
 */
function extractNumber(property: unknown): number | undefined {
  if (!property || typeof property !== 'object') return undefined;
  const prop = property as { number?: number | null };
  return prop.number ?? undefined;
}

/**
 * Map Notion status to Agent Memory task status.
 */
function mapNotionStatusToTaskStatus(notionStatus: string | undefined): TaskStatus {
  if (!notionStatus) return 'open';

  const statusLower = notionStatus.toLowerCase();

  // Common Notion status mappings
  if (statusLower.includes('done') || statusLower.includes('complete')) return 'done';
  if (statusLower.includes('progress') || statusLower.includes('doing')) return 'in_progress';
  if (statusLower.includes('block')) return 'blocked';
  if (statusLower.includes('review')) return 'review';
  if (statusLower.includes('backlog')) return 'backlog';
  if (statusLower.includes('cancel') || statusLower.includes('wont')) return 'wont_do';

  return 'open';
}

/**
 * Extract property value based on mapping.
 */
function extractPropertyValue(properties: Record<string, unknown>, mapping: FieldMapping): unknown {
  const property = properties[mapping.notionProperty];
  if (!property) return undefined;

  // Use explicit type hint if provided, otherwise try to detect
  const propType = mapping.notionType ?? detectPropertyType(property);

  switch (propType) {
    case 'title':
      return extractTitle(property);
    case 'rich_text':
      return extractRichText(property);
    case 'select':
      return extractSelect(property);
    case 'multi_select':
      return extractMultiSelect(property);
    case 'date':
      return extractDate(property);
    case 'checkbox':
      return extractCheckbox(property);
    case 'status':
      return extractStatus(property);
    case 'number':
      return extractNumber(property);
    default:
      // Store unsupported types in metadata
      return property;
  }
}

/**
 * Detect Notion property type from structure.
 */
function detectPropertyType(property: unknown): string {
  if (!property || typeof property !== 'object') return 'unknown';
  const prop = property as Record<string, unknown>;

  if ('title' in prop) return 'title';
  if ('rich_text' in prop) return 'rich_text';
  if ('select' in prop) return 'select';
  if ('multi_select' in prop) return 'multi_select';
  if ('date' in prop) return 'date';
  if ('checkbox' in prop) return 'checkbox';
  if ('status' in prop) return 'status';
  if ('number' in prop) return 'number';

  return 'unknown';
}

/**
 * Map a Notion page to task input using field mappings.
 */
function mapNotionPageToTaskInput(
  page: NotionPage,
  config: DatabaseConfig,
  agentId?: string
): { input: Partial<CreateTaskInput>; unmappedProperties: Record<string, unknown> } {
  const input: Partial<CreateTaskInput> = {
    scopeType: 'project',
    scopeId: config.projectScopeId,
    taskType: 'other', // Default type for imported tasks
    createdBy: agentId ?? 'notion-sync',
  };

  const unmappedProperties: Record<string, unknown> = {};

  for (const mapping of config.fieldMappings) {
    const value = extractPropertyValue(page.properties, mapping);

    if (value === undefined) continue;

    switch (mapping.taskField) {
      case 'title':
        input.title = String(value);
        break;
      case 'description':
        input.description = String(value);
        break;
      case 'status':
        input.status = mapNotionStatusToTaskStatus(String(value));
        break;
      case 'resolution':
        input.resolution = String(value);
        break;
      case 'category':
        input.category = String(value);
        break;
      case 'dueDate':
        input.dueDate = String(value);
        break;
      case 'assignee':
        input.assignee = String(value);
        break;
      case 'tags':
        input.tags = Array.isArray(value) ? value : [String(value)];
        break;
    }
  }

  // Collect unmapped properties for metadata
  const mappedPropertyNames = new Set(config.fieldMappings.map((m) => m.notionProperty));
  for (const [name, value] of Object.entries(page.properties)) {
    if (!mappedPropertyNames.has(name)) {
      unmappedProperties[name] = value;
    }
  }

  return { input, unmappedProperties };
}

// =============================================================================
// SYNC SERVICE
// =============================================================================

/**
 * Create a Notion sync service.
 */
export function createNotionSyncService(deps: SyncServiceDeps) {
  const { notionClient, taskRepo, evidenceRepo } = deps;

  /**
   * Find existing task by Notion page ID.
   */
  async function findTaskByNotionPageId(
    pageId: string,
    projectScopeId: string
  ): Promise<{ id: string; metadata: Record<string, unknown> } | undefined> {
    // List tasks in the project and find one with matching notionPageId in metadata
    const tasks = await taskRepo.list({
      scopeType: 'project',
      scopeId: projectScopeId,
      includeInactive: true,
    });

    for (const task of tasks) {
      if (task.metadata) {
        try {
          const metadata = JSON.parse(task.metadata) as Record<string, unknown>;
          if (metadata.notionPageId === pageId) {
            return { id: task.id, metadata };
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    return undefined;
  }

  /**
   * Get all Notion page IDs currently tracked in the project.
   */
  async function getTrackedNotionPageIds(projectScopeId: string): Promise<Set<string>> {
    const tasks = await taskRepo.list({
      scopeType: 'project',
      scopeId: projectScopeId,
      includeInactive: false, // Only active tasks
    });

    const pageIds = new Set<string>();
    for (const task of tasks) {
      if (task.metadata) {
        try {
          const metadata = JSON.parse(task.metadata) as Record<string, unknown>;
          if (metadata.notionPageId && typeof metadata.notionPageId === 'string') {
            pageIds.add(metadata.notionPageId);
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    return pageIds;
  }

  /**
   * Sync a single Notion database to Agent Memory tasks.
   */
  async function syncDatabase(
    config: DatabaseConfig,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const startedAt = new Date().toISOString();
    const errors: SyncError[] = [];
    let createdCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;
    const skippedCount = 0;

    logger.info(
      { databaseId: config.notionDatabaseId, projectScopeId: config.projectScopeId },
      'Starting Notion database sync'
    );

    try {
      // Build filter for incremental sync
      let filter: object | undefined;
      if (!options.fullSync && config.lastSyncTimestamp) {
        filter = {
          timestamp: 'last_edited_time',
          last_edited_time: {
            after: config.lastSyncTimestamp,
          },
        };
        logger.debug({ lastSyncTimestamp: config.lastSyncTimestamp }, 'Using incremental sync');
      } else {
        logger.debug('Using full sync');
      }

      // Fetch all pages from Notion
      const pages = await notionClient.queryAllPages(config.notionDatabaseId, filter);
      logger.info({ pageCount: pages.length }, 'Fetched pages from Notion');

      // Track which Notion pages we've seen (for soft-delete detection)
      const seenPageIds = new Set<string>();

      // Process each page
      for (const page of pages) {
        seenPageIds.add(page.id);

        try {
          const { input, unmappedProperties } = mapNotionPageToTaskInput(
            page,
            config,
            options.agentId
          );

          // Ensure we have at least a title
          if (!input.title) {
            input.title = `Notion Item ${page.id.substring(0, 8)}`;
          }

          // Ensure we have a description
          if (!input.description) {
            input.description = '';
          }

          // Add Notion metadata
          const metadata: Record<string, unknown> = {
            notionPageId: page.id,
            notionDatabaseId: config.notionDatabaseId,
            notionLastEditedTime: page.lastEditedTime,
            ...(Object.keys(unmappedProperties).length > 0 && {
              notionProperties: unmappedProperties,
            }),
          };

          // Check if task already exists
          const existing = await findTaskByNotionPageId(page.id, config.projectScopeId);

          if (options.dryRun) {
            if (existing) {
              updatedCount++;
            } else {
              createdCount++;
            }
            continue;
          }

          if (existing) {
            const updateInput: UpdateTaskInput = {
              title: input.title,
              description: input.description,
              status: input.status,
              resolution: input.resolution,
              category: input.category,
              dueDate: input.dueDate,
              assignee: input.assignee,
              tags: input.tags,
              metadata: { ...existing.metadata, ...metadata },
              updatedBy: options.agentId ?? 'notion-sync',
              changeReason: 'Synced from Notion',
            };

            await taskRepo.update(existing.id, updateInput);
            updatedCount++;
            logger.debug({ taskId: existing.id, pageId: page.id }, 'Updated task from Notion');
          } else {
            const createInput: CreateTaskInput = {
              ...(input as CreateTaskInput),
              metadata,
            };

            const task = await taskRepo.create(createInput);
            createdCount++;
            logger.debug({ taskId: task.id, pageId: page.id }, 'Created task from Notion');
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push({
            pageId: page.id,
            message,
            recoverable: true,
          });
          logger.warn({ pageId: page.id, error: message }, 'Failed to sync page');
        }
      }

      if (!options.fullSync && !config.lastSyncTimestamp) {
        const trackedPageIds = await getTrackedNotionPageIds(config.projectScopeId);

        for (const trackedPageId of trackedPageIds) {
          if (!seenPageIds.has(trackedPageId)) {
            const existing = await findTaskByNotionPageId(trackedPageId, config.projectScopeId);
            if (existing && !options.dryRun) {
              await taskRepo.deactivate(existing.id);
              deletedCount++;
              logger.debug(
                { taskId: existing.id, pageId: trackedPageId },
                'Soft-deleted task (removed from Notion)'
              );
            }
          }
        }
      }

      const completedAt = new Date().toISOString();
      const syncedCount = createdCount + updatedCount + skippedCount;

      logger.info(
        {
          databaseId: config.notionDatabaseId,
          syncedCount,
          createdCount,
          updatedCount,
          deletedCount,
          errorCount: errors.length,
        },
        'Notion database sync completed'
      );

      const result = {
        databaseId: config.notionDatabaseId,
        projectScopeId: config.projectScopeId,
        success: errors.length === 0,
        syncedCount,
        createdCount,
        updatedCount,
        deletedCount,
        skippedCount,
        errors,
        startedAt,
        completedAt,
        newSyncTimestamp: completedAt,
      };

      // Create evidence record for audit trail
      if (evidenceRepo) {
        try {
          await evidenceRepo.create({
            scopeType: 'project',
            scopeId: config.projectScopeId,
            evidenceType: 'other',
            title: `Notion sync: ${config.notionDatabaseId}`,
            description: `Synced ${result.syncedCount} items from Notion database`,
            source: 'notion',
            metadata: {
              notionDatabaseId: config.notionDatabaseId,
              syncedCount: result.syncedCount,
              createdCount: result.createdCount,
              updatedCount: result.updatedCount,
              deletedCount: result.deletedCount,
              errors: result.errors,
              syncTimestamp: completedAt,
              success: result.success,
            },
            createdBy: 'notion-sync-service',
          });
          logger.debug({ databaseId: config.notionDatabaseId }, 'Evidence record created');
        } catch (evidenceError) {
          logger.warn(
            { databaseId: config.notionDatabaseId, error: evidenceError },
            'Failed to create evidence record'
          );
        }
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ databaseId: config.notionDatabaseId, error: message }, 'Notion sync failed');

      const completedAt = new Date().toISOString();
      const errorResult = {
        databaseId: config.notionDatabaseId,
        projectScopeId: config.projectScopeId,
        success: false,
        syncedCount: 0,
        createdCount,
        updatedCount,
        deletedCount,
        skippedCount,
        errors: [
          ...errors,
          {
            pageId: 'database',
            message,
            recoverable: false,
          },
        ],
        startedAt,
        completedAt,
        newSyncTimestamp: config.lastSyncTimestamp ?? startedAt,
      };

      // Create evidence record even on failure
      if (evidenceRepo) {
        try {
          await evidenceRepo.create({
            scopeType: 'project',
            scopeId: config.projectScopeId,
            evidenceType: 'other',
            title: `Notion sync failed: ${config.notionDatabaseId}`,
            description: `Sync failed with error: ${message}`,
            source: 'notion',
            metadata: {
              notionDatabaseId: config.notionDatabaseId,
              syncedCount: errorResult.syncedCount,
              createdCount: errorResult.createdCount,
              updatedCount: errorResult.updatedCount,
              deletedCount: errorResult.deletedCount,
              errors: errorResult.errors,
              syncTimestamp: completedAt,
              success: false,
            },
            createdBy: 'notion-sync-service',
          });
          logger.debug({ databaseId: config.notionDatabaseId }, 'Error evidence record created');
        } catch (evidenceError) {
          logger.warn(
            { databaseId: config.notionDatabaseId, error: evidenceError },
            'Failed to create error evidence record'
          );
        }
      }

      return errorResult;
    }
  }

  return {
    syncDatabase,
    findTaskByNotionPageId,
    getTrackedNotionPageIds,
  };
}

export type NotionSyncService = ReturnType<typeof createNotionSyncService>;
