/**
 * Reindex CLI command for regenerating embeddings
 *
 * Usage:
 *   agent-memory reindex [options]
 *
 * Options:
 *   --type <type>       Entry type to reindex: tools, guidelines, knowledge (default: all)
 *   --batch-size <n>    Batch size for processing (default: 50)
 *   --delay <ms>        Delay between batches in ms (default: 1000)
 *   --force             Force regeneration even if embeddings exist
 *   --retry-failed      Retry failed embedding jobs from queue
 */

import {
  backfillEmbeddings,
  getBackfillStats,
  type BackfillServices,
} from '../services/backfill.service.js';
import {
  retryFailedEmbeddings,
  getEmbeddingQueueStats,
  getFailedEmbeddingJobs,
  type EntryType,
} from '../db/repositories/embedding-hooks.js';
import { EmbeddingService } from '../services/embedding.service.js';
import { VectorService } from '../services/vector.service.js';
import { createComponentLogger } from '../utils/logger.js';
import type { DbClient } from '../db/connection.js';

const logger = createComponentLogger('reindex-cmd');

interface ReindexOptions {
  type?: EntryType | 'all';
  batchSize: number;
  delayMs: number;
  force: boolean;
  retryFailed: boolean;
  showStats: boolean;
}

function parseArgs(args: string[]): ReindexOptions {
  const options: ReindexOptions = {
    type: 'all',
    batchSize: 50,
    delayMs: 1000,
    force: false,
    retryFailed: false,
    showStats: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--type':
      case '-t':
        if (next && !next.startsWith('-')) {
          const valid = ['tools', 'guidelines', 'knowledge', 'all'];
          if (!valid.includes(next)) {
            console.error(`Invalid type: ${next}. Must be one of: ${valid.join(', ')}`);
            process.exit(1);
          }
          // Normalize plural to singular
          options.type = next === 'all' ? 'all' : (next.replace(/s$/, '') as EntryType);
          i++;
        }
        break;

      case '--batch-size':
      case '-b':
        if (next && !next.startsWith('-')) {
          options.batchSize = parseInt(next, 10) || 50;
          i++;
        }
        break;

      case '--delay':
      case '-d':
        if (next && !next.startsWith('-')) {
          options.delayMs = parseInt(next, 10) || 1000;
          i++;
        }
        break;

      case '--force':
      case '-f':
        options.force = true;
        break;

      case '--retry-failed':
      case '-r':
        options.retryFailed = true;
        break;

      case '--stats':
      case '-s':
        options.showStats = true;
        break;

      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
agent-memory reindex - Regenerate embeddings for memory entries

Usage:
  agent-memory reindex [options]

Options:
  --type, -t <type>       Entry type: tools, guidelines, knowledge, all (default: all)
  --batch-size, -b <n>    Batch size for processing (default: 50)
  --delay, -d <ms>        Delay between batches in ms (default: 1000)
  --force, -f             Force regeneration even if embeddings exist
  --retry-failed, -r      Retry failed embedding jobs from queue
  --stats, -s             Show embedding statistics only
  --help, -h              Show this help message

Examples:
  agent-memory reindex                    # Reindex all missing embeddings
  agent-memory reindex --type guidelines  # Reindex only guidelines
  agent-memory reindex --force            # Regenerate all embeddings
  agent-memory reindex --retry-failed     # Retry failed jobs
  agent-memory reindex --stats            # Show current stats
`);
}

function printStats(db: DbClient): void {
  const queueStats = getEmbeddingQueueStats();
  const backfillStats = getBackfillStats(db);
  const failedJobs = getFailedEmbeddingJobs();

  console.log('\n=== Embedding Queue Stats ===');
  console.log(`  Pending:           ${queueStats.pending}`);
  console.log(`  In Flight:         ${queueStats.inFlight}`);
  console.log(`  Processed:         ${queueStats.processed}`);
  console.log(`  Failed:            ${queueStats.failed}`);
  console.log(`  Retried:           ${queueStats.retried}`);
  console.log(`  Skipped (stale):   ${queueStats.skippedStale}`);
  console.log(`  Failed pending:    ${queueStats.failedPendingRetry}`);
  console.log(`  Max concurrency:   ${queueStats.maxConcurrency}`);

  console.log('\n=== Backfill Stats ===');
  console.log(
    `  Tools:       ${backfillStats.tools.withEmbeddings}/${backfillStats.tools.total} with embeddings`
  );
  console.log(
    `  Guidelines:  ${backfillStats.guidelines.withEmbeddings}/${backfillStats.guidelines.total} with embeddings`
  );
  console.log(
    `  Knowledge:   ${backfillStats.knowledge.withEmbeddings}/${backfillStats.knowledge.total} with embeddings`
  );

  if (failedJobs.length > 0) {
    console.log('\n=== Failed Jobs Pending Retry ===');
    for (const job of failedJobs) {
      console.log(`  ${job.key}: ${job.attempts} attempts, last error: ${job.lastError}`);
    }
  }
}

export async function runReindexCommand(args: string[]): Promise<void> {
  // Load environment
  const { loadEnv } = await import('../config/env.js');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const projectRoot = resolve(__dirname, '../..');
  loadEnv(projectRoot);

  // Initialize services - getDb() will lazily initialize the database
  await import('../config/index.js');
  const { getDb } = await import('../db/connection.js');

  const options = parseArgs(args);

  // Load config
  const { buildConfig } = await import('../config/index.js');
  const config = buildConfig();

  // Create services directly (standalone CLI command)
  const embeddingService = new EmbeddingService({
    provider: config.embedding.provider,
    openaiApiKey: config.embedding.openaiApiKey,
    openaiModel: config.embedding.openaiModel,
  });

  const vectorService = new VectorService();

  const services: BackfillServices = {
    embedding: embeddingService,
    vector: vectorService,
  };

  if (!embeddingService.isAvailable()) {
    console.error('Error: Embedding service is not available.');
    console.error('Please configure AGENT_MEMORY_OPENAI_API_KEY or use local embeddings.');
    process.exit(1);
  }

  console.log(`Embedding provider: ${embeddingService.getProvider()}`);

  // Get db instance
  const db = getDb();

  // Stats only mode
  if (options.showStats) {
    printStats(db);
    process.exit(0);
  }

  // Retry failed jobs mode
  if (options.retryFailed) {
    console.log('\nRetrying failed embedding jobs...');
    const result = retryFailedEmbeddings();
    console.log(`  Re-queued: ${result.requeued}`);
    console.log(`  Remaining: ${result.remaining}`);

    if (result.requeued > 0) {
      console.log('\nJobs have been re-queued. They will be processed automatically.');
    }
    process.exit(0);
  }

  // Main reindex operation
  const entryTypes: EntryType[] =
    options.type === 'all' ? ['tool', 'guideline', 'knowledge'] : [options.type as EntryType];

  console.log(`\nReindexing ${options.type === 'all' ? 'all entry types' : options.type}...`);
  console.log(`  Batch size: ${options.batchSize}`);
  console.log(`  Delay: ${options.delayMs}ms`);
  console.log(`  Force: ${options.force}`);
  console.log('');

  const startTime = Date.now();

  try {
    const progress = await backfillEmbeddings(
      {
        batchSize: options.batchSize,
        delayMs: options.delayMs,
        entryTypes,
        onProgress: (p) => {
          const percent = p.total > 0 ? Math.round((p.processed / p.total) * 100) : 0;
          process.stdout.write(
            `\r  Progress: ${p.processed}/${p.total} (${percent}%) - ${p.succeeded} succeeded, ${p.failed} failed`
          );
        },
      },
      db,
      services
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n\nCompleted in ${elapsed}s:`);
    console.log(`  Total:     ${progress.total}`);
    console.log(`  Processed: ${progress.processed}`);
    console.log(`  Succeeded: ${progress.succeeded}`);
    console.log(`  Failed:    ${progress.failed}`);

    if (progress.errors.length > 0) {
      console.log('\nErrors:');
      for (const err of progress.errors.slice(0, 10)) {
        console.log(`  ${err.entryType}:${err.entryId} - ${err.error}`);
      }
      if (progress.errors.length > 10) {
        console.log(`  ... and ${progress.errors.length - 10} more`);
      }
    }
  } catch (error) {
    console.error('\nReindex failed:', error instanceof Error ? error.message : String(error));
    logger.error({ error }, 'Reindex command failed');
    process.exit(1);
  }
}
