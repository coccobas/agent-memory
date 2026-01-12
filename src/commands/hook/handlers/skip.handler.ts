import type { CommandContext } from '../command-registry.js';
import type { HookCommandResult } from '../types.js';
import { blocked } from '../command-registry.js';
import { findCandidateByShortId, getReviewCandidates, skipCandidate } from '../review.js';

/**
 * Handle the 'skip' command - removes entry from review queue
 */
export async function handleSkip(ctx: CommandContext): Promise<HookCommandResult> {
  const { sessionId, subcommand: targetId } = ctx;

  if (!targetId) {
    return blocked('Usage: !am skip <id>');
  }

  const candidates = await getReviewCandidates(sessionId);
  const candidate = findCandidateByShortId(candidates, targetId);

  if (!candidate) {
    return blocked(`Entry not found: ${targetId}`);
  }

  const success = await skipCandidate(candidate);

  if (success) {
    return blocked(`✓ Skipped: ${candidate.name}`);
  }

  return blocked(`✗ Failed to skip: ${candidate.name}`);
}
