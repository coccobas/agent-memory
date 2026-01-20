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
    // Handle empty input by providing a minimal valid object
    const trimmed = data.trim();
    if (!trimmed) {
      return { source: 'startup' } as ClaudeHookInput;
    }
    return JSON.parse(trimmed) as ClaudeHookInput;
  } catch {
    throw new HookCliError(2, `Invalid JSON hook input: ${data.slice(0, 100)}`);
  }
}
