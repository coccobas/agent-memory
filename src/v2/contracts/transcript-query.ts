/**
 * V2 Transcript search contracts.
 *
 * Defines the query/response shapes for searching transcript messages
 * and returning conversation snippets with surrounding context.
 */

import type { ScopeRef } from './entry.js';
import type { TranscriptMessage, TranscriptRecord, TranscriptRole } from './transcript.js';

export interface TranscriptSearchRequest {
  readonly query: string;
  readonly scope?: ScopeRef;
  readonly limit: number;
  readonly offset?: number;
  /** Only match messages with these roles (default: user + assistant) */
  readonly roles?: readonly TranscriptRole[];
  /** Restrict search to a single transcript */
  readonly transcriptId?: string;
  /** Number of messages before/after match to include (default: 2, max: 5) */
  readonly contextWindow?: number;
}

export interface TranscriptSnippet {
  readonly transcriptId: string;
  readonly transcript: Pick<TranscriptRecord, 'claudeSessionId' | 'projectScopeId' | 'createdAt'>;
  readonly messages: readonly TranscriptMessage[];
  readonly matchedMessageId: string;
  readonly score: number;
}

export interface TranscriptSearchResponse {
  readonly results: readonly TranscriptSnippet[];
  readonly totalCount: number;
}
