export type ClaudeHookRole = 'user' | 'agent' | 'system';

export type ClaudeHookInput = {
  // Common fields
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;

  // PreToolUse / PostToolUse fields
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown; // PostToolUse only

  // UserPromptSubmit fields
  prompt?: string;
  user_prompt?: string;

  // Common content fields
  text?: string;
  message?: string;

  // SubagentStop fields
  subagent_id?: string;
  subagent_type?: string;
  result?: unknown;
  parent_session_id?: string;

  // Notification fields
  notification_type?: string;
};

export type HookCommandResult = {
  exitCode: number;
  stdout: string[];
  stderr: string[];
};
