/**
 * Realistic Test Cases Module
 *
 * Exports realistic test cases derived from actual conversation patterns,
 * meeting notes, code reviews, and documentation.
 */

export { CHAT_TRANSCRIPT_CASES } from './chat-transcripts.js';
export { MEETING_NOTES_CASES } from './meeting-notes.js';
export { CODE_REVIEW_CASES } from './code-review-comments.js';
export { ISSUE_DISCUSSION_CASES } from './issue-discussions.js';
export { DOCUMENTATION_CASES } from './documentation-excerpts.js';

import type { ExtractionTestCase } from '../extraction-quality-types.js';
import { CHAT_TRANSCRIPT_CASES } from './chat-transcripts.js';
import { MEETING_NOTES_CASES } from './meeting-notes.js';
import { CODE_REVIEW_CASES } from './code-review-comments.js';
import { ISSUE_DISCUSSION_CASES } from './issue-discussions.js';
import { DOCUMENTATION_CASES } from './documentation-excerpts.js';

/**
 * All realistic test cases combined
 */
export const ALL_REALISTIC_CASES: ExtractionTestCase[] = [
  ...CHAT_TRANSCRIPT_CASES,
  ...MEETING_NOTES_CASES,
  ...CODE_REVIEW_CASES,
  ...ISSUE_DISCUSSION_CASES,
  ...DOCUMENTATION_CASES,
];

/**
 * Get realistic cases statistics
 */
export function getRealisticCasesStats(): {
  total: number;
  bySource: Record<string, number>;
  byDifficulty: Record<string, number>;
  byCategory: Record<string, number>;
} {
  const stats = {
    total: ALL_REALISTIC_CASES.length,
    bySource: {
      'chat-transcripts': CHAT_TRANSCRIPT_CASES.length,
      'meeting-notes': MEETING_NOTES_CASES.length,
      'code-reviews': CODE_REVIEW_CASES.length,
      'issue-discussions': ISSUE_DISCUSSION_CASES.length,
      documentation: DOCUMENTATION_CASES.length,
    },
    byDifficulty: {} as Record<string, number>,
    byCategory: {} as Record<string, number>,
  };

  for (const tc of ALL_REALISTIC_CASES) {
    stats.byDifficulty[tc.difficulty] = (stats.byDifficulty[tc.difficulty] || 0) + 1;
    stats.byCategory[tc.category] = (stats.byCategory[tc.category] || 0) + 1;
  }

  return stats;
}
