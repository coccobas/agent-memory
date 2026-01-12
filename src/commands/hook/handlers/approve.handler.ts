import type { CommandContext } from '../command-registry.js';
import type { HookCommandResult } from '../types.js';
import { blocked } from '../command-registry.js';
import { approveCandidate, findCandidateByShortId, getReviewCandidates } from '../review.js';

/**
 * Handle the 'approve' command - promotes entry to project scope
 */
export async function handleApprove(ctx: CommandContext): Promise<HookCommandResult> {
  const { sessionId, projectId, subcommand: targetId } = ctx;

  if (!targetId) {
    return blocked('Usage: !am approve <id>');
  }

  if (!projectId) {
    return blocked('No project ID configured. Use --project-id when installing hooks.');
  }

  const candidates = await getReviewCandidates(sessionId);
  const candidate = findCandidateByShortId(candidates, targetId);

  if (!candidate) {
    return blocked(`Entry not found: ${targetId}`);
  }

  const success = await approveCandidate(candidate, projectId);

  if (success) {
    return blocked(`✓ Approved: ${candidate.name} → project scope`);
  }

  return blocked(`✗ Failed to approve: ${candidate.name}`);
}
