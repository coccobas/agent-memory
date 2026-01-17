import { HookCliError } from './cli-error.js';
import type { ClaudeHookInput } from './types.js';

export async function readHookInputFromStdin(): Promise<ClaudeHookInput> {
  if (process.stdin.isTTY) {
    throw new HookCliError(2, 'Hook commands expect JSON on stdin');
  }

  const data = await new Promise<string>((resolvePromise) => {
    let buf = '';
    process.stdin.setEncoding('utf8');

    // Bug fix: Store handlers so we can remove them to prevent memory leaks
    const onData = (chunk: Buffer | string): void => {
      buf += String(chunk);
    };
    const onEnd = (): void => {
      // Clean up listeners before resolving
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      resolvePromise(buf);
    };

    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
  });

  try {
    return JSON.parse(data) as ClaudeHookInput;
  } catch {
    throw new HookCliError(2, 'Invalid JSON hook input');
  }
}
