import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';

// Mock crypto.randomBytes for deterministic tests
vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    randomBytes: vi.fn((size: number) => {
      // Return predictable bytes for testing
      const buffer = Buffer.alloc(size);
      for (let i = 0; i < size; i++) {
        buffer[i] = i % 256;
      }
      return buffer;
    }),
  };
});

// Import after mocking
import { addKeyCommand } from '../../src/cli/commands/key.js';
import { Command } from 'commander';

describe('Key Command', () => {
  let program: Command;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    program = new Command();
    program.option('--format <format>', 'Output format', 'json');
    addKeyCommand(program);

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('key generate', () => {
    it('should generate a key with default settings', async () => {
      await program.parseAsync(['key', 'generate'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.key).toBeDefined();
      expect(parsed.bytes).toBe(32);
      expect(parsed.encoding).toBe('base64url');
      expect(parsed.bits).toBe(256);
    });

    it('should generate a key with custom byte size', async () => {
      await program.parseAsync(['key', 'generate', '--bytes', '48'], { from: 'user' });

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.bytes).toBe(48);
      expect(parsed.bits).toBe(384);
    });

    it('should generate a key with hex encoding', async () => {
      await program.parseAsync(['key', 'generate', '--encoding', 'hex'], { from: 'user' });

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.encoding).toBe('hex');
      // Hex encoding: 32 bytes = 64 hex characters
      expect(parsed.key).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate a key with base64 encoding', async () => {
      await program.parseAsync(['key', 'generate', '--encoding', 'base64'], { from: 'user' });

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.encoding).toBe('base64');
    });

    it('should include agentId when --for-agent is provided', async () => {
      await program.parseAsync(['key', 'generate', '--for-agent', 'my-agent'], { from: 'user' });

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.agentId).toBe('my-agent');
    });

    it('should generate multiple keys when --count is provided', async () => {
      await program.parseAsync(['key', 'generate', '--count', '3'], { from: 'user' });

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(3);
    });

    it('should reject bytes less than 16', async () => {
      await expect(
        program.parseAsync(['key', 'generate', '--bytes', '8'], { from: 'user' })
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error: Minimum 16 bytes (128 bits) required for security'
      );
    });

    it('should reject bytes greater than 64', async () => {
      await expect(
        program.parseAsync(['key', 'generate', '--bytes', '128'], { from: 'user' })
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Maximum 64 bytes (512 bits) supported');
    });

    it('should reject invalid encoding', async () => {
      await expect(
        program.parseAsync(['key', 'generate', '--encoding', 'utf8'], { from: 'user' })
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error: Encoding must be base64url, base64, or hex'
      );
    });

    it('should reject count less than 1', async () => {
      await expect(
        program.parseAsync(['key', 'generate', '--count', '0'], { from: 'user' })
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Count must be between 1 and 10');
    });

    it('should reject count greater than 10', async () => {
      await expect(
        program.parseAsync(['key', 'generate', '--count', '100'], { from: 'user' })
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Count must be between 1 and 10');
    });

    it('should output table format with setup instructions', async () => {
      program = new Command();
      program.option('--format <format>', 'Output format', 'table');
      addKeyCommand(program);

      await program.parseAsync(['key', 'generate'], { from: 'user' });

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      const output = calls.join('\n');

      expect(output).toContain('# Generated API key');
      expect(output).toContain('export AGENT_MEMORY_API_KEY=');
      expect(output).toContain('# Key strength: 256 bits');
    });

    it('should output multi-key config format when --for-agent is provided in table format', async () => {
      program = new Command();
      program.option('--format <format>', 'Output format', 'table');
      addKeyCommand(program);

      await program.parseAsync(['key', 'generate', '--for-agent', 'claude'], { from: 'user' });

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      const output = calls.join('\n');

      expect(output).toContain('AGENT_MEMORY_REST_API_KEYS');
      expect(output).toContain('"agentId":"claude"');
    });
  });

  describe('key generation cryptographic properties', () => {
    it('should call randomBytes with correct size', async () => {
      await program.parseAsync(['key', 'generate', '--bytes', '24'], { from: 'user' });

      expect(randomBytes).toHaveBeenCalledWith(24);
    });

    it('should generate unique keys for each call', async () => {
      // Reset mock to return different values
      let callCount = 0;
      vi.mocked(randomBytes).mockImplementation((size: number) => {
        const buffer = Buffer.alloc(size);
        for (let i = 0; i < size; i++) {
          buffer[i] = (i + callCount * 100) % 256;
        }
        callCount++;
        return buffer;
      });

      await program.parseAsync(['key', 'generate', '--count', '2'], { from: 'user' });

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output) as Array<{ key: string }>;

      expect(parsed[0].key).not.toBe(parsed[1].key);
    });

    it('should produce correct key length for base64url encoding', async () => {
      // 32 bytes = 43 base64url characters (no padding)
      await program.parseAsync(['key', 'generate', '--bytes', '32'], { from: 'user' });

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      // base64url: 4 chars per 3 bytes, rounded up, no padding
      // 32 bytes -> ceil(32/3)*4 = 44, but base64url strips trailing =
      expect(parsed.key.length).toBeGreaterThanOrEqual(42);
      expect(parsed.key.length).toBeLessThanOrEqual(44);
    });

    it('should produce correct key length for hex encoding', async () => {
      // 32 bytes = 64 hex characters
      await program.parseAsync(['key', 'generate', '--bytes', '32', '--encoding', 'hex'], {
        from: 'user',
      });

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.key.length).toBe(64);
    });
  });
});
