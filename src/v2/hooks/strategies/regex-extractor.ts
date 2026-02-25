/**
 * V2 Regex Extractor Strategy.
 *
 * Uses keyword patterns to extract guideline/knowledge/tool candidates
 * from user messages. Reuses the same classification logic as
 * remember-handler.ts for consistency.
 */

import type { ExtractorStrategy, ExtractionCandidate } from '../../contracts/extractor.js';
import type { TranscriptMessage } from '../../contracts/transcript.js';
import { extractContent, detectEntryType, inferCategory } from '../../mcp/remember-handler.js';

const MIN_MESSAGE_LENGTH = 20;

/**
 * Checks if a message looks like a "memorable" statement rather than
 * a question or instruction to the agent.
 */
function looksCaptureable(text: string): boolean {
  const trimmed = text.trim();

  // Skip questions
  if (trimmed.endsWith('?')) return false;

  // Skip imperative requests to the agent (not knowledge statements).
  // Only skip if the verb is NOT followed by a keyword pattern that
  // detectEntryType would match (e.g. "run npm run build" is capturable).
  if (
    /^(fix|show|find|check|look|help|what|how|why|where|when|can|could|do|does)\s/i.test(trimmed)
  ) {
    return false;
  }

  return true;
}

export class RegexExtractorStrategy implements ExtractorStrategy {
  readonly name = 'regex';

  extract(messages: readonly TranscriptMessage[]): ExtractionCandidate[] {
    const candidates: ExtractionCandidate[] = [];

    for (const msg of messages) {
      // Only extract from user messages
      if (msg.role !== 'user') continue;

      // Skip short messages
      if (msg.content.length < MIN_MESSAGE_LENGTH) continue;

      // Skip non-capturable patterns
      if (!looksCaptureable(msg.content)) continue;

      // Classify using shared detection logic
      const detectedType = detectEntryType(msg.content);
      if (!detectedType) continue;

      const { title, content } = extractContent(msg.content);
      const category = inferCategory(detectedType, content);
      const confidence = 0.7;

      candidates.push({
        title,
        content,
        entryType: detectedType,
        category,
        confidence,
        source: 'regex',
        provenance: {
          transcriptId: '', // populated by caller (extractor.ts)
          seqStart: msg.sequenceNum,
          seqEnd: msg.sequenceNum,
        },
      });
    }

    return candidates;
  }
}
