import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { getPromptFromHookInput } from './shared.js';
import { ensureSessionIdExists } from './session.js';
import {
  allowed,
  blocked,
  findCommand,
  generateHelp,
  type CommandContext,
} from './command-registry.js';

/**
 * Run the UserPromptSubmit hook command
 *
 * This hook intercepts user prompts starting with "!am" and routes them
 * to the appropriate command handler via the command registry.
 */
export async function runUserPromptSubmitCommand(params: {
  projectId?: string;
  input: ClaudeHookInput;
}): Promise<HookCommandResult> {
  const { projectId, input } = params;

  const sessionId = input.session_id;
  if (!sessionId) {
    return allowed();
  }

  const prompt = getPromptFromHookInput(input);
  if (!prompt) {
    return allowed();
  }

  const trimmed = prompt.trim();
  if (!trimmed.toLowerCase().startsWith('!am')) {
    return allowed();
  }

  // Parse command parts: "!am command subcommand arg1 arg2..."
  const parts = trimmed.split(/\s+/).slice(1);
  const command = (parts[0] ?? '').toLowerCase();
  const subcommand = (parts[1] ?? '').toLowerCase();
  const args = parts.slice(2);

  // Ensure session exists in database
  await ensureSessionIdExists(sessionId, projectId);

  // Find the matching command descriptor
  const descriptor = findCommand(command, subcommand);

  if (!descriptor) {
    // Unknown command - show help
    return blocked(generateHelp());
  }

  // Build command context
  const ctx: CommandContext = {
    sessionId,
    projectId,
    command,
    subcommand,
    args,
  };

  // Execute the handler
  return descriptor.handler(ctx);
}
