import type { CommandContext } from '../command-registry.js';
import type { HookCommandResult } from '../types.js';
import { blocked } from '../command-registry.js';
import { findCandidateByShortId, formatCandidateDetail, getReviewCandidates } from '../review.js';

/**
 * Handle the 'show' command - shows entry details
 */
export async function handleShow(ctx: CommandContext): Promise<HookCommandResult> {
  const { sessionId, subcommand: targetId } = ctx;

  if (!targetId) {
    return blocked('Usage: !am show <id>');
  }

  const candidates = await getReviewCandidates(sessionId);
  const candidate = findCandidateByShortId(candidates, targetId);

  if (!candidate) {
    return blocked(`Entry not found: ${targetId}`);
  }

  return blocked(formatCandidateDetail(candidate));
}
