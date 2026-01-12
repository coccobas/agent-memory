import type { CommandContext } from '../command-registry.js';
import type { HookCommandResult } from '../types.js';
import { blocked } from '../command-registry.js';
import { findCandidateByShortId, getReviewCandidates, rejectCandidate } from '../review.js';

/**
 * Handle the 'reject' command - deactivates entry
 */
export async function handleReject(ctx: CommandContext): Promise<HookCommandResult> {
  const { sessionId, subcommand: targetId } = ctx;

  if (!targetId) {
    return blocked('Usage: !am reject <id>');
  }

  const candidates = await getReviewCandidates(sessionId);
  const candidate = findCandidateByShortId(candidates, targetId);

  if (!candidate) {
    return blocked(`Entry not found: ${targetId}`);
  }

  const success = await rejectCandidate(candidate);

  if (success) {
    return blocked(`✓ Rejected: ${candidate.name}`);
  }

  return blocked(`✗ Failed to reject: ${candidate.name}`);
}
