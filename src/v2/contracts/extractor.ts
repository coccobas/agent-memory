/**
 * V2 Extractor contracts for the extraction pipeline.
 *
 * Strategy pattern: each extractor implements a different approach
 * (regex, behavior patterns, LLM, etc.) and produces candidates
 * that the pipeline merges, deduplicates, and stores.
 */

import type { EntryType } from './entry.js';
import type { TranscriptMessage } from './transcript.js';

export interface CandidateProvenance {
  readonly transcriptId: string;
  readonly seqStart: number;
  readonly seqEnd: number;
}

export interface ExtractionCandidate {
  readonly title: string;
  readonly content: string;
  readonly entryType: EntryType;
  readonly category: string;
  readonly confidence: number;
  readonly source: string;
  readonly tags?: readonly string[];
  readonly metadata?: Record<string, unknown>;
  readonly provenance?: CandidateProvenance;
}

export interface ExtractorStrategy {
  readonly name: string;
  extract(messages: readonly TranscriptMessage[]): ExtractionCandidate[];
}
