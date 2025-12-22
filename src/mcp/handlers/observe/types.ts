/**
 * Shared types for observe handlers
 */

import type { ExtractedEntry } from '../../../services/extraction.service.js';
import type { SimilarEntry } from '../../../services/duplicate.service.js';

export interface ProcessedEntry extends ExtractedEntry {
  isDuplicate: boolean;
  similarEntries: SimilarEntry[];
  shouldStore: boolean;
}

export interface StoredEntry {
  id: string;
  type: 'guideline' | 'knowledge' | 'tool';
  name: string;
}

export type ObserveCommitEntry = ExtractedEntry & {
  confidence: number;
  content: string;
  type: 'guideline' | 'knowledge' | 'tool';
};
