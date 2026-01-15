#!/usr/bin/env tsx
/**
 * Backfill Graph Nodes Script
 *
 * Populates the graph with nodes for all existing memory entries.
 * Creates nodes for knowledge, guidelines, tools, and experiences.
 *
 * Features:
 * - Idempotent: Safe to re-run (skips existing nodes)
 * - Batch processing with progress tracking
 * - Dry-run mode for testing
 * - Summary statistics
 *
 * Usage:
 *   npm run backfill:nodes              # Run backfill
 *   npm run backfill:nodes -- --dry-run # Preview without changes
 *   npm run backfill:nodes -- --verbose # Detailed logging
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

const logger = createComponentLogger('backfill:nodes');

// =============================================================================
// TYPES
// =============================================================================

interface BackfillStats {
  knowledge: {
    total: number;
    existing: number;
    created: number;
    failed: number;
  };
  guideline: {
    total: number;
    existing: number;
    created: number;
    failed: number;
  };
  tool: {
    total: number;
    existing: number;
    created: number;
    failed: number;
  };
  experience: {
    total: number;
    existing: number;
    created: number;
    failed: number;
  };
}

interface BackfillOptions {
  dryRun: boolean;
  verbose: boolean;
  batchSize: number;
}

// =============================================================================
// BACKFILL LOGIC
// =============================================================================

/**
 * Backfill nodes for all entries
 */
async function backfillNodes(options: BackfillOptions): Promise<BackfillStats> {
  // Initialize app context
  const config = buildConfig();
  const runtime = createRuntime(extractRuntimeConfig(config));
  const context = await createAppContext(config, runtime);
  const { repos, services } = context;

  if (!repos.graphNodes || !services.graphSync) {
    await shutdownRuntime(runtime);
    throw new Error('Graph services not available. Ensure graph tables are initialized.');
  }

  const stats: BackfillStats = {
    knowledge: { total: 0, existing: 0, created: 0, failed: 0 },
    guideline: { total: 0, existing: 0, created: 0, failed: 0 },
    tool: { total: 0, existing: 0, created: 0, failed: 0 },
    experience: { total: 0, existing: 0, created: 0, failed: 0 },
  };

  logger.info({ dryRun: options.dryRun }, 'Starting graph node backfill');

  // Backfill knowledge entries
  if (repos.knowledge) {
    await backfillKnowledge(context, options, stats);
  }

  // Backfill guideline entries
  if (repos.guidelines) {
    await backfillGuidelines(context, options, stats);
  }

  // Backfill tool entries
  if (repos.tools) {
    await backfillTools(context, options, stats);
  }

  // Backfill experience entries
  if (repos.experiences) {
    await backfillExperiences(context, options, stats);
  }

  // Cleanup
  await shutdownRuntime(runtime);

  return stats;
}

/**
 * Backfill knowledge entries
 */
async function backfillKnowledge(
  context: any,
  options: BackfillOptions,
  stats: BackfillStats
): Promise<void> {
  const { repos, services } = context;
  logger.info('Backfilling knowledge entries...');

  let offset = 0;
  let batch;

  do {
    // Fetch batch
    batch = await repos.knowledge!.list({}, { limit: options.batchSize, offset });
    stats.knowledge.total += batch.length;

    for (const entry of batch) {
      try {
        // Check if node already exists
        const existing = await repos.graphNodes!.getByEntry('knowledge', entry.id);

        if (existing) {
          stats.knowledge.existing++;
          if (options.verbose) {
            logger.debug({ id: entry.id, title: entry.title }, 'Node already exists');
          }
          continue;
        }

        // Create node (if not dry run)
        if (!options.dryRun) {
          await services.graphSync!.syncEntryToNode({
            entryType: 'knowledge',
            entryId: entry.id,
            name: entry.title,
            scopeType: entry.scopeType,
            scopeId: entry.scopeId ?? undefined,
            properties: {
              category: entry.category,
              source: entry.currentVersion?.source,
              confidence: entry.currentVersion?.confidence,
            },
            createdBy: entry.createdBy ?? undefined,
          });
        }

        stats.knowledge.created++;
        if (options.verbose) {
          logger.info({ id: entry.id, title: entry.title }, 'Created node');
        }
      } catch (error) {
        stats.knowledge.failed++;
        logger.error(
          { id: entry.id, error: error instanceof Error ? error.message : String(error) },
          'Failed to create node'
        );
      }
    }

    offset += options.batchSize;
    logger.info(
      { processed: stats.knowledge.total, created: stats.knowledge.created },
      'Knowledge progress'
    );
  } while (batch.length === options.batchSize);
}

/**
 * Backfill guideline entries
 */
async function backfillGuidelines(
  context: any,
  options: BackfillOptions,
  stats: BackfillStats
): Promise<void> {
  const { repos, services } = context;
  logger.info('Backfilling guideline entries...');

  let offset = 0;
  let batch;

  do {
    batch = await repos.guidelines!.list({}, { limit: options.batchSize, offset });
    stats.guideline.total += batch.length;

    for (const entry of batch) {
      try {
        const existing = await repos.graphNodes!.getByEntry('guideline', entry.id);

        if (existing) {
          stats.guideline.existing++;
          if (options.verbose) {
            logger.debug({ id: entry.id, name: entry.name }, 'Node already exists');
          }
          continue;
        }

        if (!options.dryRun) {
          await services.graphSync!.syncEntryToNode({
            entryType: 'guideline',
            entryId: entry.id,
            name: entry.name,
            scopeType: entry.scopeType,
            scopeId: entry.scopeId ?? undefined,
            properties: {
              category: entry.category,
              priority: entry.priority,
            },
            createdBy: entry.createdBy ?? undefined,
          });
        }

        stats.guideline.created++;
        if (options.verbose) {
          logger.info({ id: entry.id, name: entry.name }, 'Created node');
        }
      } catch (error) {
        stats.guideline.failed++;
        logger.error(
          { id: entry.id, error: error instanceof Error ? error.message : String(error) },
          'Failed to create node'
        );
      }
    }

    offset += options.batchSize;
    logger.info(
      { processed: stats.guideline.total, created: stats.guideline.created },
      'Guideline progress'
    );
  } while (batch.length === options.batchSize);
}

/**
 * Backfill tool entries
 */
async function backfillTools(
  context: any,
  options: BackfillOptions,
  stats: BackfillStats
): Promise<void> {
  const { repos, services } = context;
  logger.info('Backfilling tool entries...');

  let offset = 0;
  let batch;

  do {
    batch = await repos.tools!.list({}, { limit: options.batchSize, offset });
    stats.tool.total += batch.length;

    for (const entry of batch) {
      try {
        const existing = await repos.graphNodes!.getByEntry('tool', entry.id);

        if (existing) {
          stats.tool.existing++;
          if (options.verbose) {
            logger.debug({ id: entry.id, name: entry.name }, 'Node already exists');
          }
          continue;
        }

        if (!options.dryRun) {
          await services.graphSync!.syncEntryToNode({
            entryType: 'tool',
            entryId: entry.id,
            name: entry.name,
            scopeType: entry.scopeType,
            scopeId: entry.scopeId ?? undefined,
            properties: {
              category: entry.category,
              description: entry.currentVersion?.description,
            },
            createdBy: entry.createdBy ?? undefined,
          });
        }

        stats.tool.created++;
        if (options.verbose) {
          logger.info({ id: entry.id, name: entry.name }, 'Created node');
        }
      } catch (error) {
        stats.tool.failed++;
        logger.error(
          { id: entry.id, error: error instanceof Error ? error.message : String(error) },
          'Failed to create node'
        );
      }
    }

    offset += options.batchSize;
    logger.info({ processed: stats.tool.total, created: stats.tool.created }, 'Tool progress');
  } while (batch.length === options.batchSize);
}

/**
 * Backfill experience entries
 */
async function backfillExperiences(
  context: any,
  options: BackfillOptions,
  stats: BackfillStats
): Promise<void> {
  const { repos, services } = context;
  logger.info('Backfilling experience entries...');

  let offset = 0;
  let batch;

  do {
    batch = await repos.experiences!.list({}, { limit: options.batchSize, offset });
    stats.experience.total += batch.length;

    for (const entry of batch) {
      try {
        const existing = await repos.graphNodes!.getByEntry('experience', entry.id);

        if (existing) {
          stats.experience.existing++;
          if (options.verbose) {
            logger.debug({ id: entry.id, title: entry.title }, 'Node already exists');
          }
          continue;
        }

        if (!options.dryRun) {
          await services.graphSync!.syncEntryToNode({
            entryType: 'experience',
            entryId: entry.id,
            name: entry.title,
            scopeType: entry.scopeType,
            scopeId: entry.scopeId ?? undefined,
            properties: {
              level: entry.level,
              category: entry.category,
              source: entry.source,
              confidence: entry.confidence,
            },
            createdBy: entry.createdBy ?? undefined,
          });
        }

        stats.experience.created++;
        if (options.verbose) {
          logger.info({ id: entry.id, title: entry.title }, 'Created node');
        }
      } catch (error) {
        stats.experience.failed++;
        logger.error(
          { id: entry.id, error: error instanceof Error ? error.message : String(error) },
          'Failed to create node'
        );
      }
    }

    offset += options.batchSize;
    logger.info(
      { processed: stats.experience.total, created: stats.experience.created },
      'Experience progress'
    );
  } while (batch.length === options.batchSize);
}

/**
 * Print backfill summary
 */
function printSummary(stats: BackfillStats, options: BackfillOptions): void {
  console.log('\n' + '='.repeat(60));
  console.log('BACKFILL SUMMARY' + (options.dryRun ? ' (DRY RUN)' : ''));
  console.log('='.repeat(60));

  const types = ['knowledge', 'guideline', 'tool', 'experience'] as const;
  for (const type of types) {
    const s = stats[type];
    console.log(`\n${type.toUpperCase()}:`);
    console.log(`  Total entries:    ${s.total}`);
    console.log(`  Already existed:  ${s.existing}`);
    console.log(`  Newly created:    ${s.created}`);
    console.log(`  Failed:           ${s.failed}`);
  }

  const totals = {
    total: types.reduce((sum, t) => sum + stats[t].total, 0),
    existing: types.reduce((sum, t) => sum + stats[t].existing, 0),
    created: types.reduce((sum, t) => sum + stats[t].created, 0),
    failed: types.reduce((sum, t) => sum + stats[t].failed, 0),
  };

  console.log('\nTOTALS:');
  console.log(`  Total entries:    ${totals.total}`);
  console.log(`  Already existed:  ${totals.existing}`);
  console.log(`  Newly created:    ${totals.created}`);
  console.log(`  Failed:           ${totals.failed}`);
  console.log('='.repeat(60) + '\n');
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    batchSize: 100,
  };

  try {
    const stats = await backfillNodes(options);
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
