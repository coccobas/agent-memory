import { describe, it, expect } from 'vitest';
import {
  findCommand,
  generateHelp,
  blocked,
  allowed,
  commandRegistry,
  type CommandContext,
} from '../../../src/commands/hook/command-registry.js';

describe('command-registry', () => {
  describe('findCommand', () => {
    it('should find primary commands by name', () => {
      const status = findCommand('status', '');
      expect(status).toBeDefined();
      expect(status?.name).toBe('status');

      const summary = findCommand('summary', '');
      expect(summary).toBeDefined();
      expect(summary?.name).toBe('summary');

      const list = findCommand('list', '');
      expect(list).toBeDefined();
      expect(list?.name).toBe('list');
    });

    it('should find commands that require arguments', () => {
      const show = findCommand('show', 'abc123');
      expect(show).toBeDefined();
      expect(show?.name).toBe('show');
      expect(show?.requiresArg).toBe(true);

      const approve = findCommand('approve', 'abc123');
      expect(approve).toBeDefined();
      expect(approve?.name).toBe('approve');
      expect(approve?.requiresArg).toBe(true);

      const reject = findCommand('reject', 'abc123');
      expect(reject).toBeDefined();
      expect(reject?.name).toBe('reject');
      expect(reject?.requiresArg).toBe(true);

      const skip = findCommand('skip', 'abc123');
      expect(skip).toBeDefined();
      expect(skip?.name).toBe('skip');
      expect(skip?.requiresArg).toBe(true);
    });

    it('should find compound commands (review off/on/done)', () => {
      const reviewOff = findCommand('review', 'off');
      expect(reviewOff).toBeDefined();
      expect(reviewOff?.name).toBe('review off');

      const reviewOn = findCommand('review', 'on');
      expect(reviewOn).toBeDefined();
      expect(reviewOn?.name).toBe('review on');

      const reviewDone = findCommand('review', 'done');
      expect(reviewDone).toBeDefined();
      expect(reviewDone?.name).toBe('review done');
    });

    it('should find commands by alias', () => {
      const reviewSuspend = findCommand('review', 'suspend');
      expect(reviewSuspend).toBeDefined();
      expect(reviewSuspend?.name).toBe('review off');
      expect(reviewSuspend?.aliases).toContain('review suspend');

      const reviewResume = findCommand('review', 'resume');
      expect(reviewResume).toBeDefined();
      expect(reviewResume?.name).toBe('review on');
      expect(reviewResume?.aliases).toContain('review resume');

      const reviewStatus = findCommand('review', 'status');
      expect(reviewStatus).toBeDefined();
      expect(reviewStatus?.name).toBe('status');
    });

    it('should find review without subcommand as list', () => {
      const review = findCommand('review', '');
      expect(review).toBeDefined();
      expect(review?.name).toBe('review');
    });

    it('should return undefined for unknown commands', () => {
      const unknown = findCommand('unknown', '');
      expect(unknown).toBeUndefined();

      const alsoUnknown = findCommand('foo', 'bar');
      expect(alsoUnknown).toBeUndefined();
    });
  });

  describe('generateHelp', () => {
    it('should generate help text with all commands', () => {
      const help = generateHelp();

      expect(help).toContain('!am commands:');
      expect(help).toContain('status');
      expect(help).toContain('summary');
      expect(help).toContain('review');
      expect(help).toContain('list');
      expect(help).toContain('show');
      expect(help).toContain('approve');
      expect(help).toContain('reject');
      expect(help).toContain('skip');
    });

    it('should include usage patterns for argument commands', () => {
      const help = generateHelp();

      expect(help).toContain('<id>');
      expect(help).toContain('Show entry details');
      expect(help).toContain('Promote to project scope');
    });

    it('should include control commands', () => {
      const help = generateHelp();

      expect(help).toContain('review off|on|done');
      expect(help).toContain('Control review notifications');
    });
  });

  describe('blocked', () => {
    it('should create blocked result with single message', () => {
      const result = blocked('Test message');

      expect(result.exitCode).toBe(2);
      expect(result.stdout).toEqual([]);
      expect(result.stderr).toEqual(['Test message']);
    });

    it('should create blocked result with array of messages', () => {
      const result = blocked(['Line 1', 'Line 2', 'Line 3']);

      expect(result.exitCode).toBe(2);
      expect(result.stdout).toEqual([]);
      expect(result.stderr).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });
  });

  describe('allowed', () => {
    it('should create allowed result', () => {
      const result = allowed();

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toEqual([]);
      expect(result.stderr).toEqual([]);
    });
  });

  describe('commandRegistry', () => {
    it('should have all expected commands', () => {
      const names = commandRegistry.map((c) => c.name);

      expect(names).toContain('status');
      expect(names).toContain('summary');
      expect(names).toContain('review');
      expect(names).toContain('review off');
      expect(names).toContain('review on');
      expect(names).toContain('review done');
      expect(names).toContain('list');
      expect(names).toContain('show');
      expect(names).toContain('approve');
      expect(names).toContain('reject');
      expect(names).toContain('skip');
    });

    it('should have handlers for all commands', () => {
      for (const cmd of commandRegistry) {
        expect(cmd.handler).toBeDefined();
        expect(typeof cmd.handler).toBe('function');
      }
    });

    it('should have descriptions for all commands', () => {
      for (const cmd of commandRegistry) {
        expect(cmd.description).toBeDefined();
        expect(cmd.description.length).toBeGreaterThan(0);
      }
    });

    it('should mark argument commands correctly', () => {
      const argCommands = commandRegistry.filter((c) => c.requiresArg);
      const argNames = argCommands.map((c) => c.name);

      expect(argNames).toContain('show');
      expect(argNames).toContain('approve');
      expect(argNames).toContain('reject');
      expect(argNames).toContain('skip');
      expect(argNames).toContain('remember');
      expect(argCommands.length).toBe(5);
    });
  });
});
