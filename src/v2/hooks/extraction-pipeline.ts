/**
 * V2 Extraction Pipeline — strategy-based extraction orchestrator.
 *
 * Runs registered ExtractorStrategy instances against transcript messages,
 * merges results, deduplicates by normalized title (keeping higher confidence),
 * and sorts by confidence descending.
 */

import type {
  ExtractorStrategy,
  ExtractionCandidate,
  CandidateProvenance,
} from '../contracts/extractor.js';
import type { TranscriptMessage } from '../contracts/transcript.js';

/**
 * Normalize a title for deduplication purposes.
 * Lowercases and strips extra whitespace.
 */
function normalizeTitle(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Merge two provenance ranges, taking the widest span.
 * Returns null if both inputs are undefined.
 */
function mergeProvenance(
  a: CandidateProvenance | undefined,
  b: CandidateProvenance | undefined
): CandidateProvenance | null {
  if (!a && !b) return null;
  if (!a) return b!;
  if (!b) return a;

  return {
    transcriptId: a.transcriptId || b.transcriptId,
    seqStart: Math.min(a.seqStart, b.seqStart),
    seqEnd: Math.max(a.seqEnd, b.seqEnd),
  };
}

export class ExtractionPipeline {
  private readonly strategies: ExtractorStrategy[] = [];

  register(strategy: ExtractorStrategy): void {
    this.strategies.push(strategy);
  }

  run(messages: readonly TranscriptMessage[]): ExtractionCandidate[] {
    if (this.strategies.length === 0) return [];

    // Collect all candidates from all strategies
    const allCandidates: ExtractionCandidate[] = [];
    for (const strategy of this.strategies) {
      const candidates = strategy.extract(messages);
      allCandidates.push(...candidates);
    }

    // Deduplicate by normalized title, keeping higher confidence
    // and merging provenance ranges across duplicates
    const deduped = new Map<string, ExtractionCandidate>();
    for (const candidate of allCandidates) {
      const key = normalizeTitle(candidate.title);
      const existing = deduped.get(key);
      if (!existing || candidate.confidence > existing.confidence) {
        const mergedProvenance = mergeProvenance(existing?.provenance, candidate.provenance);
        deduped.set(
          key,
          mergedProvenance ? { ...candidate, provenance: mergedProvenance } : candidate
        );
      } else if (existing && candidate.provenance && existing.provenance) {
        // Lower confidence duplicate — still merge its provenance range
        const mergedProvenance = mergeProvenance(existing.provenance, candidate.provenance);
        if (mergedProvenance) {
          deduped.set(key, { ...existing, provenance: mergedProvenance });
        }
      }
    }

    // Sort by confidence descending
    return [...deduped.values()].sort((a, b) => b.confidence - a.confidence);
  }
}
