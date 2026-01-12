import type { CommandContext } from '../command-registry.js';
import type { HookCommandResult } from '../types.js';
import { blocked } from '../command-registry.js';
import { formatSessionSummary } from '../session-summary.js';

/**
 * Handle the 'summary' command - shows session summary
 */
export async function handleSummary(ctx: CommandContext): Promise<HookCommandResult> {
  const { sessionId } = ctx;
  const summaryLines = await formatSessionSummary(sessionId);
  return blocked(summaryLines);
}
