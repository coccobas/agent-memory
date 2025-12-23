import { verifyAction } from '../../services/verification.service.js';
import { getDb } from '../../db/connection.js';
import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { extractProposedActionFromTool } from './shared.js';

export function runPreToolUseCommand(params: {
  projectId?: string;
  agentId?: string;
  input: ClaudeHookInput;
}): HookCommandResult {
  const { projectId, agentId, input } = params;

  const sessionId = input.session_id || null;
  const proposed = extractProposedActionFromTool(input.tool_name, input.tool_input);

  // Get database connection for CLI hook usage
  const db = getDb();
  const result = verifyAction(
    sessionId,
    projectId ?? null,
    {
      type: proposed.actionType,
      description: proposed.description,
      filePath: proposed.filePath,
      content: proposed.content,
      metadata: {
        source: 'claude-code-hook',
        agentId: agentId ?? 'claude-code',
        hookEvent: input.hook_event_name,
        toolName: input.tool_name,
        cwd: input.cwd,
      },
    },
    db
  );

  if (result.blocked) {
    const messages = (result.violations || []).map((v) => v.message).filter(Boolean);
    const stderr = messages.length > 0 ? messages.join('\n') : 'Blocked by critical guideline';
    return { exitCode: 2, stdout: [], stderr: [stderr] };
  }

  return { exitCode: 0, stdout: [], stderr: [] };
}
