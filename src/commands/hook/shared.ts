import type { ProposedActionType } from '../../services/verification.service.js';
import type { ClaudeHookInput, ClaudeHookRole } from './types.js';

export function stringifyUnknown(value: unknown, maxLen = 20000): string {
  if (typeof value === 'string') return value.slice(0, maxLen);
  try {
    return JSON.stringify(value).slice(0, maxLen);
  } catch {
    return String(value).slice(0, maxLen);
  }
}

export function getPromptFromHookInput(input: ClaudeHookInput): string | undefined {
  const candidates = [input.prompt, input.user_prompt, input.text, input.message];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return undefined;
}

export function extractProposedActionFromTool(
  toolName: string | undefined,
  toolInput: unknown
): { actionType: ProposedActionType; filePath?: string; content: string; description: string } {
  const name = (toolName || '').toLowerCase();

  if (name === 'write' || name === 'edit') {
    const inputObj = toolInput as Record<string, unknown> | null;
    const filePath =
      inputObj && typeof inputObj.file_path === 'string'
        ? inputObj.file_path
        : inputObj && typeof inputObj.filePath === 'string'
          ? inputObj.filePath
          : undefined;
    const content =
      inputObj && typeof inputObj.content === 'string'
        ? inputObj.content
        : stringifyUnknown(toolInput);
    return {
      actionType: 'file_write',
      filePath,
      content,
      description: `PreToolUse: ${toolName}`,
    };
  }

  if (name === 'bash') {
    return {
      actionType: 'command',
      content: stringifyUnknown(toolInput),
      description: `PreToolUse: ${toolName}`,
    };
  }

  return {
    actionType: 'other',
    content: stringifyUnknown(toolInput),
    description: `PreToolUse: ${toolName || 'unknown'}`,
  };
}

export function extractMessageFromTranscriptEntry(
  entry: unknown
): { role: ClaudeHookRole; content: string } | null {
  if (!entry || typeof entry !== 'object') return null;
  const obj = entry as Record<string, unknown>;

  const roleRaw =
    (typeof obj.role === 'string' && obj.role) ||
    (typeof obj.type === 'string' && obj.type) ||
    (typeof obj.author === 'string' && obj.author) ||
    '';

  let role: ClaudeHookRole | null = null;
  const roleLower = roleRaw.toLowerCase();
  if (roleLower.includes('user')) role = 'user';
  else if (
    roleLower.includes('assistant') ||
    roleLower.includes('agent') ||
    roleLower.includes('claude')
  )
    role = 'agent';
  else if (roleLower.includes('system')) role = 'system';

  const content =
    typeof obj.content === 'string'
      ? obj.content
      : Array.isArray(obj.content)
        ? obj.content
            .map((c) => {
              if (typeof c === 'string') return c;
              if (
                c &&
                typeof c === 'object' &&
                typeof (c as Record<string, unknown>).text === 'string'
              ) {
                return (c as Record<string, unknown>).text as string;
              }
              return '';
            })
            .filter(Boolean)
            .join('\n')
        : typeof obj.message === 'string'
          ? obj.message
          : typeof obj.text === 'string'
            ? obj.text
            : '';

  if (!role || !content) return null;
  return { role, content };
}

