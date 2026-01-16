import { HookCliError } from './cli-error.js';
import type { ClaudeHookInput } from './types.js';

export async function readHookInputFromStdin(): Promise<ClaudeHookInput> {
  if (process.stdin.isTTY) {
    throw new HookCliError(2, 'Hook commands expect JSON on stdin');
  }

  const data = await new Promise<string>((resolvePromise) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buf += String(chunk);
    });
    process.stdin.on('end', () => resolvePromise(buf));
  });

  try {
    return JSON.parse(data) as ClaudeHookInput;
  } catch {
    throw new HookCliError(2, 'Invalid JSON hook input');
  }
}
