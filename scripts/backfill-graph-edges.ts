#!/usr/bin/env tsx
/**
 * Backfill Graph Edges Script
 *
 * Populates the graph with edges for all existing entry relations.
 * Creates edges in the graph that mirror relations in entry_relations table.
 *
 * Features:
 * - Idempotent: Safe to re-run (skips existing edges)
 * - Batch processing with progress tracking
 * - Dry-run mode for testing
 * - Summary statistics
 * - Node creation if missing (optional)
 *
 * Usage:
 *   npm run backfill:edges                    # Run backfill
 *   npm run backfill:edges -- --dry-run       # Preview without changes
 *   npm run backfill:edges -- --verbose       # Detailed logging
 *   npm run backfill:edges -- --create-nodes  # Create missing nodes
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnv } from '../dist/config/env.js';

// Load .env before importing config
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
loadEnv(projectRoot);

import { createAppContext } from '../dist/core/factory/index.js';
import { buildConfig } from '../dist/config/index.js';
import { createRuntime, extractRuntimeConfig, shutdownRuntime } from '../dist/core/runtime.js';
import { createComponentLogger } from '../dist/utils/logger.js';

const logger = createComponentLogger('backfill:edges');

// =============================================================================
// TYPES
// =============================================================================

interface BackfillStats {
  total: number;
  existing: number;
  created: number;
  skippedMissingNodes: number;
  skippedUnsupportedTypes: number;
  failed: number;
}

interface BackfillOptions {
  dryRun: boolean;
  verbose: boolean;
  createNodes: boolean;
  batchSize: number;
}

// Supported relation types (maps to edge types)
const SUPPORTED_RELATIONS = [
  'applies_to',
  'depends_on',
  'conflicts_with',
  'related_to',
  'parent_task',
  'subtask_of',
] as const;

// Supported entry types (nodes)
const SUPPORTED_ENTRY_TYPES = ['knowledge', 'guideline', 'tool', 'experience', 'task'] as const;

// =============================================================================
// BACKFILL LOGIC
// =============================================================================

/**
 * Backfill edges for all entry relations
 */
async function backfillEdges(options: BackfillOptions): Promise<BackfillStats> {
  // Initialize app context
  const config = buildConfig();
  const runtime = createRuntime(extractRuntimeConfig(config));
  const context = await createAppContext(config, runtime);
  const { repos, services } = context;

  if (!repos.graphNodes || !repos.graphEdges || !services.graphSync || !repos.entryRelations) {
    await shutdownRuntime(runtime);
    throw new Error('Graph services not available. Ensure graph tables are initialized.');
  }

  const stats: BackfillStats = {
    total: 0,
    existing: 0,
    created: 0,
    skippedMissingNodes: 0,
    skippedUnsupportedTypes: 0,
    failed: 0,
  };

  logger.info({ dryRun: options.dryRun }, 'Starting graph edge backfill');

  let offset = 0;
  let batch;

  do {
    // Fetch batch of relations
    batch = await repos.entryRelations.list({}, { limit: options.batchSize, offset });
    stats.total += batch.length;

    for (const relation of batch) {
      try {
        // Check if relation type is supported
        if (!SUPPORTED_RELATIONS.includes(relation.relationType as any)) {
          stats.skippedUnsupportedTypes++;
          if (options.verbose) {
            logger.debug(
              { relationType: relation.relationType },
              'Skipping unsupported relation type'
            );
          }
          continue;
        }

        // Check if entry types are supported
        if (
          !SUPPORTED_ENTRY_TYPES.includes(relation.sourceType as any) ||
          !SUPPORTED_ENTRY_TYPES.includes(relation.targetType as any)
        ) {
          stats.skippedUnsupportedTypes++;
          if (options.verbose) {
            logger.debug(
              { sourceType: relation.sourceType, targetType: relation.targetType },
              'Skipping unsupported entry types'
            );
          }
          continue;
        }

        // Find source node
        let sourceNode = await repos.graphNodes.getByEntry(
          relation.sourceType as any,
          relation.sourceId
        );

        if (!sourceNode && options.createNodes) {
          // Attempt to create missing source node
          sourceNode = await createMissingNode(context, relation.sourceType, relation.sourceId);
        }

        if (!sourceNode) {
          stats.skippedMissingNodes++;
          if (options.verbose) {
            logger.debug(
              { sourceType: relation.sourceType, sourceId: relation.sourceId },
              'Source node not found'
            );
          }
          continue;
        }

        // Find target node
        let targetNode = await repos.graphNodes.getByEntry(
          relation.targetType as any,
          relation.targetId
        );

        if (!targetNode && options.createNodes) {
          // Attempt to create missing target node
          targetNode = await createMissingNode(context, relation.targetType, relation.targetId);
        }

        if (!targetNode) {
          stats.skippedMissingNodes++;
          if (options.verbose) {
            logger.debug(
              { targetType: relation.targetType, targetId: relation.targetId },
              'Target node not found'
            );
          }
          continue;
        }

        // Check if edge already exists
        const existingEdges = await repos.graphEdges.getOutgoingEdges(
          sourceNode.id,
          relation.relationType as any
        );
        const edgeExists = existingEdges.some((e) => e.targetId === targetNode.id);

        if (edgeExists) {
          stats.existing++;
          if (options.verbose) {
            logger.debug(
              {
                relationType: relation.relationType,
                sourceId: sourceNode.id,
                targetId: targetNode.id,
              },
              'Edge already exists'
            );
          }
          continue;
        }

        // Create edge (if not dry run)
        if (!options.dryRun) {
          await services.graphSync.syncRelationToEdge({
            relationType: relation.relationType as any,
            sourceEntryId: relation.sourceId,
            sourceEntryType: relation.sourceType as any,
            targetEntryId: relation.targetId,
            targetEntryType: relation.targetType as any,
            properties: {},
            createdBy: relation.createdBy ?? undefined,
          });
        }

        stats.created++;
        if (options.verbose) {
          logger.info(
            {
              relationType: relation.relationType,
              sourceType: relation.sourceType,
              targetType: relation.targetType,
            },
            'Created edge'
          );
        }
      } catch (error) {
        stats.failed++;
        logger.error(
          {
            relationId: relation.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to create edge'
        );
      }
    }

    offset += options.batchSize;
    logger.info({ processed: stats.total, created: stats.created }, 'Progress');
  } while (batch.length === options.batchSize);

  // Cleanup
  await shutdownRuntime(runtime);

  return stats;
}

/**
 * Create a missing node for an entry
 */
async function createMissingNode(
  context: any,
  entryType: string,
  entryId: string
): Promise<any | null> {
  const { repos, services } = context;

  try {
    // Fetch the entry from its repository
    let entry;
    let name = 'Unknown';
    let scopeType = 'project';
    let scopeId;
    let properties = {};

    switch (entryType) {
      case 'knowledge':
        entry = await repos.knowledge?.getById(entryId);
        if (entry) {
          name = entry.title;
          scopeType = entry.scopeType;
          scopeId = entry.scopeId;
          properties = {
            category: entry.category,
            source: entry.currentVersion?.source,
            confidence: entry.currentVersion?.confidence,
          };
        }
        break;

      case 'guideline':
        entry = await repos.guidelines?.getById(entryId);
        if (entry) {
          name = entry.name;
          scopeType = entry.scopeType;
          scopeId = entry.scopeId;
          properties = {
            category: entry.category,
            priority: entry.priority,
          };
        }
        break;

      case 'tool':
        entry = await repos.tools?.getById(entryId);
        if (entry) {
          name = entry.name;
          scopeType = entry.scopeType;
          scopeId = entry.scopeId;
          properties = {
            category: entry.category,
            description: entry.currentVersion?.description,
          };
        }
        break;

      case 'experience':
        entry = await repos.experiences?.getById(entryId);
        if (entry) {
          name = entry.title;
          scopeType = entry.scopeType;
          scopeId = entry.scopeId;
          properties = {
            level: entry.level,
            category: entry.category,
            source: entry.source,
            confidence: entry.confidence,
          };
        }
        break;

      case 'task':
        entry = await repos.tasks?.getById(entryId);
        if (entry) {
          name = entry.title;
          scopeType = entry.scopeType;
          scopeId = entry.scopeId;
          properties = {
            status: entry.status,
            severity: entry.severity,
          };
        }
        break;
    }

    if (!entry) {
      logger.warn({ entryType, entryId }, 'Entry not found, cannot create node');
      return null;
    }

    // Create node
    const node = await services.graphSync.syncEntryToNode({
      entryType: entryType as any,
      entryId,
      name,
      scopeType,
      scopeId,
      properties,
      createdBy: (entry as any).createdBy ?? undefined,
    });

    logger.info({ entryType, entryId, nodeId: node?.id }, 'Created missing node');
    return node;
  } catch (error) {
    logger.error(
      { entryType, entryId, error: error instanceof Error ? error.message : String(error) },
      'Failed to create missing node'
    );
    return null;
  }
}

/**
 * Print backfill summary
 */
function printSummary(stats: BackfillStats, options: BackfillOptions): void {
  console.log('\n' + '='.repeat(60));
  console.log('EDGE BACKFILL SUMMARY' + (options.dryRun ? ' (DRY RUN)' : ''));
  console.log('='.repeat(60));
  console.log(`\nTotal relations:              ${stats.total}`);
  console.log(`Already existed:              ${stats.existing}`);
  console.log(`Newly created:                ${stats.created}`);
  console.log(`Skipped (missing nodes):      ${stats.skippedMissingNodes}`);
  console.log(`Skipped (unsupported types):  ${stats.skippedUnsupportedTypes}`);
  console.log(`Failed:                       ${stats.failed}`);
  console.log('='.repeat(60) + '\n');

  if (stats.skippedMissingNodes > 0 && !options.createNodes) {
    console.log('NOTE: Some edges were skipped due to missing nodes.');
    console.log('Run with --create-nodes to automatically create missing nodes.\n');
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    createNodes: args.includes('--create-nodes'),
    batchSize: 100,
  };

  try {
    const stats = await backfillEdges(options);
    printSummary(stats, options);

    if (options.dryRun) {
      console.log('Dry run complete. No changes were made.');
      console.log('Run without --dry-run to apply changes.\n');
    } else {
      console.log('Backfill complete!\n');
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Backfill failed'
    );
    process.exit(1);
  }
}

main();
