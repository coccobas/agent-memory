/**
 * Unit tests for parse-hook-args.ts
 */

import { describe, it, expect } from 'vitest';
import { parseHookArgs } from '../../../src/commands/hook/parse-hook-args.js';
import { HookCliError } from '../../../src/commands/hook/cli-error.js';

describe('parseHookArgs', () => {
  describe('subcommand extraction', () => {
    it('should extract subcommand from first argument', () => {
      const result = parseHookArgs(['start']);
      expect(result.subcommand).toBe('start');
    });

    it('should handle empty argv', () => {
      const result = parseHookArgs([]);
      expect(result.subcommand).toBe('');
    });

    it('should handle undefined argv elements', () => {
      const sparseArray = ['test'] as string[];
      delete (sparseArray as Record<number, string>)[0];
      const result = parseHookArgs(sparseArray);
      expect(result.subcommand).toBe('');
    });
  });

  describe('--project-id option', () => {
    it('should parse --project-id with separate value', () => {
      const result = parseHookArgs(['start', '--project-id', 'proj-123']);
      expect(result.projectId).toBe('proj-123');
    });

    it('should parse --project shorthand with separate value', () => {
      const result = parseHookArgs(['start', '--project', 'proj-456']);
      expect(result.projectId).toBe('proj-456');
    });

    it('should parse --project-id= format', () => {
      const result = parseHookArgs(['start', '--project-id=proj-789']);
      expect(result.projectId).toBe('proj-789');
    });

    it('should parse --project= format', () => {
      const result = parseHookArgs(['start', '--project=proj-abc']);
      expect(result.projectId).toBe('proj-abc');
    });

    it('should throw error for missing value after --project-id', () => {
      // Bug #347 fix: Now throws error instead of accepting empty value
      expect(() => parseHookArgs(['start', '--project-id'])).toThrow(
        'Missing value for --project-id'
      );
    });
  });

  describe('--agent-id option', () => {
    it('should parse --agent-id with separate value', () => {
      const result = parseHookArgs(['start', '--agent-id', 'agent-123']);
      expect(result.agentId).toBe('agent-123');
    });

    it('should parse --agent shorthand with separate value', () => {
      const result = parseHookArgs(['start', '--agent', 'agent-456']);
      expect(result.agentId).toBe('agent-456');
    });

    it('should parse --agent-id= format', () => {
      const result = parseHookArgs(['start', '--agent-id=agent-789']);
      expect(result.agentId).toBe('agent-789');
    });

    it('should parse --agent= format', () => {
      const result = parseHookArgs(['start', '--agent=agent-abc']);
      expect(result.agentId).toBe('agent-abc');
    });
  });

  describe('--auto-extract option', () => {
    it('should parse --auto-extract flag', () => {
      const result = parseHookArgs(['start', '--auto-extract']);
      expect(result.autoExtract).toBe(true);
    });

    it('should default to undefined when not provided', () => {
      const result = parseHookArgs(['start']);
      expect(result.autoExtract).toBeUndefined();
    });
  });

  describe('multiple options', () => {
    it('should parse all options together', () => {
      const result = parseHookArgs([
        'start',
        '--project-id',
        'proj-1',
        '--agent-id',
        'agent-1',
        '--auto-extract',
      ]);
      expect(result.subcommand).toBe('start');
      expect(result.projectId).toBe('proj-1');
      expect(result.agentId).toBe('agent-1');
      expect(result.autoExtract).toBe(true);
    });

    it('should parse options in any order', () => {
      const result = parseHookArgs([
        'stop',
        '--auto-extract',
        '--agent-id=cursor-ai',
        '--project',
        'my-project',
      ]);
      expect(result.subcommand).toBe('stop');
      expect(result.projectId).toBe('my-project');
      expect(result.agentId).toBe('cursor-ai');
      expect(result.autoExtract).toBe(true);
    });
  });

  describe('unknown options', () => {
    it('should throw HookCliError for unknown options', () => {
      expect(() => parseHookArgs(['start', '--unknown'])).toThrow(HookCliError);
    });

    it('should include option name in error message', () => {
      try {
        parseHookArgs(['start', '--invalid-option']);
      } catch (error) {
        expect(error).toBeInstanceOf(HookCliError);
        expect((error as HookCliError).message).toContain('--invalid-option');
      }
    });

    it('should throw with exit code 2', () => {
      try {
        parseHookArgs(['start', '-x']);
      } catch (error) {
        expect(error).toBeInstanceOf(HookCliError);
        expect((error as HookCliError).exitCode).toBe(2);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle positional arguments without options', () => {
      const result = parseHookArgs(['ingest']);
      expect(result.subcommand).toBe('ingest');
      expect(result.projectId).toBeUndefined();
      expect(result.agentId).toBeUndefined();
      expect(result.autoExtract).toBeUndefined();
    });

    it('should throw error for empty = values', () => {
      // Bug #349 fix: Now throws error instead of accepting empty value
      expect(() => parseHookArgs(['start', '--project-id='])).toThrow(
        'Missing value for --project-id'
      );
      expect(() => parseHookArgs(['start', '--agent-id='])).toThrow('Missing value for --agent-id');
    });
  });
});
