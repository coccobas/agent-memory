import type { CommandContext } from '../command-registry.js';
import type { HookCommandResult } from '../types.js';
import { blocked } from '../command-registry.js';
import { formatCandidateList, getReviewCandidates } from '../review.js';
import { setObserveReviewedAt } from '../session.js';
import { setReviewSuspended } from '../state-file.js';

/**
 * Handle the 'review' command (no subcommand) - lists review candidates
 */
export async function handleReview(ctx: CommandContext): Promise<HookCommandResult> {
  const { sessionId } = ctx;
  const candidates = await getReviewCandidates(sessionId);
  return blocked(formatCandidateList(candidates));
}

/**
 * Handle review control commands: review off/on/suspend/resume/done
 */
export async function handleReviewControl(ctx: CommandContext): Promise<HookCommandResult> {
  const { sessionId, subcommand } = ctx;

  switch (subcommand) {
    case 'off':
    case 'suspend':
      setReviewSuspended(sessionId, true);
      return blocked('✓ Review suspended');

    case 'on':
    case 'resume':
      setReviewSuspended(sessionId, false);
      return blocked('✓ Review enabled');

    case 'done': {
      const reviewedAt = new Date().toISOString();
      await setObserveReviewedAt(sessionId, reviewedAt);
      return blocked('✓ Review acknowledged');
    }

    default:
      // Fallback to listing candidates
      return handleReview(ctx);
  }
}
