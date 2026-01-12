import type { CommandContext } from '../command-registry.js';
import type { HookCommandResult } from '../types.js';
import { blocked } from '../command-registry.js';
import { getObserveState } from '../session.js';
import { isReviewSuspended } from '../state-file.js';

/**
 * Handle the 'status' command - shows session status
 */
export async function handleStatus(ctx: CommandContext): Promise<HookCommandResult> {
  const { sessionId } = ctx;

  const suspended = isReviewSuspended(sessionId);
  const observe = await getObserveState(sessionId);
  const committed = observe.committedAt ? '✓' : '✗';
  const reviewed = observe.reviewedAt ? '✓' : (observe.needsReviewCount ?? 0) > 0 ? '⚠' : '–';

  return blocked(
    `Session ${sessionId.slice(0, 8)}… | committed:${committed} reviewed:${reviewed} suspended:${suspended ? 'yes' : 'no'} pending:${observe.needsReviewCount ?? 0}`
  );
}
