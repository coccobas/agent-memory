/**
 * V2 Extractor — deduplication + storage orchestration.
 *
 * At session end, loads transcript messages, runs the extraction pipeline,
 * deduplicates against existing entries (via FTS), and stores new entries
 * via the v2 write plane with source='hook_capture'.
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ExtractionCandidate } from '../contracts/extractor.js';
import type { ExtractionSummary } from '../contracts/transcript.js';
import type { SqliteMemoryV2Runtime } from '../adapters/sqlite/factory.js';
import { loadMessages, updateTranscriptStatus } from '../adapters/sqlite/transcript-store.js';
import { insertProvenance, hasProvenanceTable } from '../adapters/sqlite/provenance-store.js';
import { ExtractionPipeline } from './extraction-pipeline.js';
import { RegexExtractorStrategy } from './strategies/regex-extractor.js';

// ---------------------------------------------------------------------------
// FTS-based deduplication
// ---------------------------------------------------------------------------

/**
 * Filter out candidates that already exist in the FTS index.
 *
 * Uses FTS5 MATCH to find entries with similar titles.
 * If a match is found, the candidate is considered a duplicate and skipped.
 * This is best-effort: false negatives are acceptable.
 */
export function deduplicateCandidates(
  sqlite: Database.Database,
  candidates: readonly ExtractionCandidate[]
): ExtractionCandidate[] {
  const kept: ExtractionCandidate[] = [];

  for (const candidate of candidates) {
    // Build FTS query from title words (removing special chars)
    const words = candidate.title
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (words.length === 0) {
      kept.push(candidate);
      continue;
    }

    // Use quoted phrase match for better precision
    const ftsQuery = words.join(' ');

    try {
      const match = sqlite
        .prepare(
          `SELECT entry_id FROM v2_entry_fts
           WHERE v2_entry_fts MATCH ?
           LIMIT 1`
        )
        .get(ftsQuery) as { entry_id: string } | undefined;

      if (!match) {
        kept.push(candidate);
      }
    } catch {
      // FTS query syntax error → keep the candidate (fail open)
      kept.push(candidate);
    }
  }

  return kept;
}

// ---------------------------------------------------------------------------
// Session-end extraction
// ---------------------------------------------------------------------------

export interface ExtractionOptions {
  readonly projectExternalId: string;
  readonly agentId?: string;
}

/**
 * Run extraction on a completed transcript.
 *
 * 1. Load all messages from the transcript
 * 2. Run extraction pipeline (regex strategy by default)
 * 3. Deduplicate against existing entries
 * 4. Store new entries via write service
 * 5. Update transcript status to 'extracted'
 */
export async function runSessionEndExtraction(
  sqlite: Database.Database,
  runtime: SqliteMemoryV2Runtime,
  transcriptId: string,
  options: ExtractionOptions
): Promise<ExtractionSummary> {
  // 1. Load messages
  const messages = loadMessages(sqlite, transcriptId);

  if (messages.length === 0) {
    updateTranscriptStatus(sqlite, transcriptId, 'extracted');
    return { candidates: 0, stored: 0, duplicatesSkipped: 0 };
  }

  // 2. Run extraction pipeline
  const pipeline = new ExtractionPipeline();
  pipeline.register(new RegexExtractorStrategy());
  const rawCandidates = pipeline.run(messages);

  // Stamp transcriptId onto provenance (strategies don't know the transcriptId)
  const candidates = rawCandidates.map((c) =>
    c.provenance ? { ...c, provenance: { ...c.provenance, transcriptId } } : c
  );

  if (candidates.length === 0) {
    updateTranscriptStatus(sqlite, transcriptId, 'extracted');
    return { candidates: 0, stored: 0, duplicatesSkipped: 0 };
  }

  // 3. Deduplicate against existing entries
  const unique = deduplicateCandidates(sqlite, candidates);
  const duplicatesSkipped = candidates.length - unique.length;

  // 4. Store new entries + provenance links
  const provenanceAvailable = hasProvenanceTable(sqlite);
  let stored = 0;
  for (const candidate of unique) {
    try {
      const entry = await runtime.memory.write.upsertEntry({
        actorId: options.agentId ?? 'hook-capture',
        data: {
          type: candidate.entryType,
          title: candidate.title,
          content: candidate.content,
          source: 'hook_capture',
          scope: { type: 'project', id: options.projectExternalId },
          category: candidate.category,
          confidence: candidate.confidence,
          tags: candidate.tags ? [...candidate.tags] : undefined,
          metadata: {
            ...candidate.metadata,
            extractedBy: candidate.source,
          },
        },
      });
      stored += 1;

      // Store provenance link (supplementary — failure is non-fatal)
      if (provenanceAvailable && candidate.provenance && candidate.provenance.transcriptId) {
        try {
          insertProvenance(sqlite, {
            id: randomUUID(),
            entryId: entry.ref.id,
            transcriptId: candidate.provenance.transcriptId,
            seqStart: candidate.provenance.seqStart,
            seqEnd: candidate.provenance.seqEnd,
            extractorName: candidate.source,
            confidence: candidate.confidence,
          });
        } catch {
          // Provenance failure shouldn't block entry storage
        }
      }
    } catch {
      // Individual entry failure shouldn't abort the batch
    }
  }

  // 5. Update transcript status
  updateTranscriptStatus(sqlite, transcriptId, 'extracted');

  return {
    candidates: candidates.length,
    stored,
    duplicatesSkipped,
  };
}
