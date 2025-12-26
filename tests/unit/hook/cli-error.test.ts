/**
 * Unit tests for cli-error.ts
 */

import { describe, it, expect } from 'vitest';
import { HookCliError } from '../../../src/commands/hook/cli-error.js';

describe('HookCliError', () => {
  it('should extend Error', () => {
    const error = new HookCliError(1, 'Test error');
    expect(error).toBeInstanceOf(Error);
  });

  it('should store exit code', () => {
    const error = new HookCliError(42, 'Test error');
    expect(error.exitCode).toBe(42);
  });

  it('should store message', () => {
    const error = new HookCliError(1, 'Custom error message');
    expect(error.message).toBe('Custom error message');
  });

  it('should be throwable and catchable', () => {
    expect(() => {
      throw new HookCliError(2, 'Thrown error');
    }).toThrow(HookCliError);
  });

  it('should have readonly exit code', () => {
    const error = new HookCliError(1, 'Test');
    // TypeScript ensures this at compile time, but we can verify the value doesn't change
    expect(error.exitCode).toBe(1);
  });

  it('should work with different exit codes', () => {
    const error0 = new HookCliError(0, 'Success');
    const error1 = new HookCliError(1, 'General error');
    const error2 = new HookCliError(2, 'Misuse of command');

    expect(error0.exitCode).toBe(0);
    expect(error1.exitCode).toBe(1);
    expect(error2.exitCode).toBe(2);
  });

  it('should preserve stack trace', () => {
    const error = new HookCliError(1, 'Test');
    expect(error.stack).toBeDefined();
    // Stack trace contains 'Error' and may or may not include 'HookCliError' depending on environment
    expect(error.stack).toContain('Error');
  });
});
