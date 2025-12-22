export type ClaudeHookRole = 'user' | 'agent' | 'system';

export type ClaudeHookInput = {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  prompt?: string;
  user_prompt?: string;
  text?: string;
  message?: string;
};

export type HookCommandResult = {
  exitCode: number;
  stdout: string[];
  stderr: string[];
};
