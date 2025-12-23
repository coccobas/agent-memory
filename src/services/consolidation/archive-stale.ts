/**
 * Archive Stale Entries
 *
 * Deactivates entries that are older than a specified threshold.
 */

import { createComponentLogger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import type { EntryType } from '../../db/schema.js';
import type { ArchiveStaleParams, ArchiveStaleResult } from './types.js';
import {
  getEntriesForConsolidation,
  deactivateEntry,
  calculateRecencyScore,
  getAgeDays,
} from './helpers.js';

const logger = createComponentLogger('consolidation.archive');

/**
 * Get per-entry-type half-life days from config
 */
function getHalfLifeDays(type: EntryType): number {
  const perType = config.recency?.decayHalfLifeDays;
  if (perType && type in perType) {
    return perType[type as keyof typeof perType];
  }
  return config.recency?.defaultDecayHalfLifeDays ?? 30;
}

/**
 * Archive stale entries based on age and/or recency score
 */
export async function archiveStale(params: ArchiveStaleParams): Promise<ArchiveStaleResult> {
  const {
    scopeType,
    scopeId,
    entryTypes = ['guideline', 'knowledge', 'tool'],
    staleDays,
    minRecencyScore,
    dryRun = false,
    archivedBy: _archivedBy,
    db,
  } = params;

  const result: ArchiveStaleResult = {
    dryRun,
    staleDays,
    minRecencyScore,
    entriesScanned: 0,
    entriesArchived: 0,
    archivedEntries: [],
    errors: [],
  };

  try {
    for (const entryType of entryTypes) {
      const halfLifeDays = getHalfLifeDays(entryType);
      const entries = getEntriesForConsolidation(entryType, scopeType, scopeId, db);

      for (const entry of entries) {
        result.entriesScanned++;

        // Use updatedAt if available, otherwise createdAt
        const timestamp = entry.updatedAt || entry.createdAt;
        const ageDays = getAgeDays(timestamp);

        if (ageDays === null) continue;

        // Check if entry is stale based on age
        if (ageDays < staleDays) continue;

        // Calculate recency score using per-entry-type half-life
        const recencyScore = calculateRecencyScore(ageDays, halfLifeDays);

        // If minRecencyScore is specified, only archive if recencyScore is below it
        if (minRecencyScore !== undefined && recencyScore >= minRecencyScore) continue;

        // Entry is stale - archive it
        result.archivedEntries.push({
          id: entry.id,
          type: entryType,
          name: entry.name,
          ageDays: Math.round(ageDays * 10) / 10,
          recencyScore: Math.round(recencyScore * 1000) / 1000,
        });

        if (!dryRun) {
          try {
            deactivateEntry(entryType, entry.id, db);
            result.entriesArchived++;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            result.errors.push(`Failed to archive ${entryType} ${entry.id}: ${errorMsg}`);
          }
        }
      }
    }

    if (dryRun) {
      result.entriesArchived = result.archivedEntries.length;
    }

    logger.info(
      {
        dryRun,
        staleDays,
        minRecencyScore,
        scanned: result.entriesScanned,
        archived: result.entriesArchived,
      },
      'Archive stale entries completed'
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Archive stale failed: ${errorMsg}`);
    logger.error({ error }, 'Archive stale entries failed');
  }

  return result;
}
