import type { CommandContext } from '../command-registry.js';
import type { HookCommandResult } from '../types.js';
import { blocked } from '../command-registry.js';
import { formatCandidateList, getReviewCandidates } from '../review.js';

/**
 * Handle the 'list' command - lists review candidates
 */
export async function handleList(ctx: CommandContext): Promise<HookCommandResult> {
  const { sessionId } = ctx;
  const candidates = await getReviewCandidates(sessionId);
  return blocked(formatCandidateList(candidates));
}
