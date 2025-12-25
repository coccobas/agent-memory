/**
 * Unit tests for HookCliError
 */

import { describe, it, expect } from 'vitest';
import { HookCliError } from '../../src/commands/hook/cli-error.js';

describe('HookCliError', () => {
  it('should create error with exit code and message', () => {
    const error = new HookCliError(1, 'Something went wrong');

    expect(error).toBeInstanceOf(Error);
    expect(error.exitCode).toBe(1);
    expect(error.message).toBe('Something went wrong');
  });

  it('should be an Error instance', () => {
    const error = new HookCliError(127, 'Command not found');

    expect(error).toBeInstanceOf(Error);
    expect(error instanceof HookCliError).toBe(true);
  });

  it('should have correct exit code for success', () => {
    const error = new HookCliError(0, 'Success message');

    expect(error.exitCode).toBe(0);
  });

  it('should handle various exit codes', () => {
    const exitCodes = [1, 2, 64, 127, 128, 255];

    for (const code of exitCodes) {
      const error = new HookCliError(code, `Exit code ${code}`);
      expect(error.exitCode).toBe(code);
    }
  });

  it('should preserve message content', () => {
    const message = 'Multi-line\nmessage\nwith special chars: !@#$%';
    const error = new HookCliError(1, message);

    expect(error.message).toBe(message);
  });
});
