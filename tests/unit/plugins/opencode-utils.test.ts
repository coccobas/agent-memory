import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getToolInput,
  getToolResponse,
  formatCommandResponse,
  isTaskCompletion,
  isMemoryTrigger,
  parseAmCommand,
  ErrorTracker,
  SuggestionManager,
  type ExtractionSuggestion,
} from '../../../plugins/opencode/utils.js';

describe('opencode plugin utils', () => {
  describe('getToolInput', () => {
    it('should extract args from output first', () => {
      const input = { args: 'input-args' };
      const output = { args: 'output-args' };
      expect(getToolInput(input, output)).toBe('output-args');
    });

    it('should fall back to input.args', () => {
      const input = { args: 'input-args' };
      const output = {};
      expect(getToolInput(input, output)).toBe('input-args');
    });

    it('should try input.input', () => {
      const input = { input: 'the-input' };
      expect(getToolInput(input, {})).toBe('the-input');
    });

    it('should try input.toolInput', () => {
      const input = { toolInput: 'tool-input-value' };
      expect(getToolInput(input, {})).toBe('tool-input-value');
    });

    it('should try input.tool_input (snake_case)', () => {
      const input = { tool_input: 'snake-case-input' };
      expect(getToolInput(input, {})).toBe('snake-case-input');
    });

    it('should return undefined if no match', () => {
      expect(getToolInput({}, {})).toBeUndefined();
      expect(getToolInput(null, null)).toBeUndefined();
    });
  });

  describe('getToolResponse', () => {
    it('should extract result first', () => {
      const output = { result: 'the-result', output: 'the-output' };
      expect(getToolResponse(output)).toBe('the-result');
    });

    it('should fall back to output', () => {
      const output = { output: 'the-output' };
      expect(getToolResponse(output)).toBe('the-output');
    });

    it('should fall back to data', () => {
      const output = { data: 'the-data' };
      expect(getToolResponse(output)).toBe('the-data');
    });

    it('should return raw output if no match', () => {
      const output = { something: 'else' };
      expect(getToolResponse(output)).toBe(output);
    });
  });

  describe('formatCommandResponse', () => {
    it('should format command and response', () => {
      const result = formatCommandResponse('!am status', 'Session active');
      expect(result).toBe('`!am status`\n\n```\nSession active\n```');
    });

    it('should handle multiline responses', () => {
      const result = formatCommandResponse('!am help', 'Line 1\nLine 2');
      expect(result).toContain('Line 1\nLine 2');
    });
  });

  describe('isTaskCompletion', () => {
    it('should detect "thanks"', () => {
      expect(isTaskCompletion('thanks')).toBe(true);
      expect(isTaskCompletion('Thanks!')).toBe(true);
      expect(isTaskCompletion('thank you')).toBe(true);
    });

    it('should detect "done" and "fixed"', () => {
      expect(isTaskCompletion('done')).toBe(true);
      expect(isTaskCompletion('fixed')).toBe(true);
      expect(isTaskCompletion('solved')).toBe(true);
    });

    it('should detect "works" variations', () => {
      expect(isTaskCompletion('works')).toBe(true);
      expect(isTaskCompletion('works now')).toBe(true);
      expect(isTaskCompletion('it works!')).toBe(true);
    });

    it('should detect "that\'s it/all/perfect/great"', () => {
      expect(isTaskCompletion("that's it")).toBe(true);
      expect(isTaskCompletion("that's all")).toBe(true);
      expect(isTaskCompletion("that's perfect")).toBe(true);
      expect(isTaskCompletion('thats great')).toBe(true);
    });

    it('should detect "looks good" and similar', () => {
      expect(isTaskCompletion('looks good')).toBe(true);
      expect(isTaskCompletion('awesome')).toBe(true);
      expect(isTaskCompletion('excellent')).toBe(true);
      expect(isTaskCompletion('perfect')).toBe(true);
    });

    it('should detect short affirmatives', () => {
      expect(isTaskCompletion('ok')).toBe(true);
      expect(isTaskCompletion('okay')).toBe(true);
      expect(isTaskCompletion('great')).toBe(true);
      expect(isTaskCompletion('nice')).toBe(true);
      expect(isTaskCompletion('cool')).toBe(true);
    });

    it('should not match non-completion phrases', () => {
      expect(isTaskCompletion('can you help me?')).toBe(false);
      expect(isTaskCompletion('please fix this')).toBe(false);
      expect(isTaskCompletion('what is wrong?')).toBe(false);
    });
  });

  describe('isMemoryTrigger', () => {
    it('should detect "always/never" patterns', () => {
      expect(isMemoryTrigger('we always use TypeScript')).toBe(true);
      expect(isMemoryTrigger('never do this')).toBe(true);
      expect(isMemoryTrigger('must have tests')).toBe(true);
      expect(isMemoryTrigger('should avoid any')).toBe(true);
    });

    it('should detect decision patterns', () => {
      expect(isMemoryTrigger('we decided to use React')).toBe(true);
      expect(isMemoryTrigger('we chose PostgreSQL')).toBe(true);
      expect(isMemoryTrigger('the standard is ESLint')).toBe(true);
    });

    it('should detect explicit memory triggers', () => {
      expect(isMemoryTrigger('remember that we use strict mode')).toBe(true);
      expect(isMemoryTrigger('note that this is important')).toBe(true);
      expect(isMemoryTrigger('important: always test first')).toBe(true);
    });

    it('should not match regular text', () => {
      expect(isMemoryTrigger('how do I fix this?')).toBe(false);
      expect(isMemoryTrigger('please help')).toBe(false);
    });
  });

  describe('parseAmCommand', () => {
    it('should parse basic commands', () => {
      expect(parseAmCommand('!am status')).toEqual({ command: 'status', args: '' });
      expect(parseAmCommand('!am help')).toEqual({ command: 'help', args: '' });
    });

    it('should parse commands with arguments', () => {
      expect(parseAmCommand('!am remember always use TypeScript')).toEqual({
        command: 'remember',
        args: 'always use TypeScript',
      });
      expect(parseAmCommand('!am search authentication')).toEqual({
        command: 'search',
        args: 'authentication',
      });
    });

    it('should handle case insensitivity', () => {
      expect(parseAmCommand('!AM STATUS')).toEqual({ command: 'status', args: '' });
      expect(parseAmCommand('!Am Help')).toEqual({ command: 'help', args: '' });
    });

    it('should default to help if no command', () => {
      expect(parseAmCommand('!am')).toEqual({ command: 'help', args: '' });
      expect(parseAmCommand('!am ')).toEqual({ command: 'help', args: '' });
      expect(parseAmCommand('!am  ')).toEqual({ command: 'help', args: '' });
    });

    it('should return null for non-am commands', () => {
      expect(parseAmCommand('hello world')).toBeNull();
      expect(parseAmCommand('/am status')).toBeNull();
      expect(parseAmCommand('am status')).toBeNull();
    });
  });

  describe('ErrorTracker', () => {
    let tracker: ErrorTracker;

    beforeEach(() => {
      tracker = new ErrorTracker(3, 1000);
    });

    it('should track errors', () => {
      tracker.track('Edit', 'File not found');
      expect(tracker.count).toBe(1);
    });

    it('should respect max history', () => {
      tracker.track('Edit', 'Error 1');
      tracker.track('Edit', 'Error 2');
      tracker.track('Edit', 'Error 3');
      tracker.track('Edit', 'Error 4');
      expect(tracker.count).toBe(3);
    });

    it('should detect recovery within window', () => {
      tracker.track('Edit', 'File not found');
      const recovered = tracker.checkRecovery('Edit');
      expect(recovered).toBeDefined();
      expect(recovered?.message).toBe('File not found');
      expect(tracker.count).toBe(0);
    });

    it('should not detect recovery for different tool', () => {
      tracker.track('Edit', 'File not found');
      const recovered = tracker.checkRecovery('Write');
      expect(recovered).toBeUndefined();
      expect(tracker.count).toBe(1);
    });

    it('should not detect recovery outside window', async () => {
      const shortWindowTracker = new ErrorTracker(5, 10);
      shortWindowTracker.track('Edit', 'Error');
      await new Promise((r) => setTimeout(r, 20));
      const recovered = shortWindowTracker.checkRecovery('Edit');
      expect(recovered).toBeUndefined();
    });

    it('should clear all errors', () => {
      tracker.track('Edit', 'Error 1');
      tracker.track('Write', 'Error 2');
      tracker.clear();
      expect(tracker.count).toBe(0);
    });
  });

  describe('SuggestionManager', () => {
    let manager: SuggestionManager;

    const mockSuggestions: ExtractionSuggestion[] = [
      { hash: 'abc123', type: 'guideline', title: 'Use TypeScript', content: 'Always use TS' },
      { hash: 'def456', type: 'knowledge', title: 'Auth system', content: 'Uses JWT' },
    ];

    beforeEach(() => {
      manager = new SuggestionManager();
    });

    it('should add suggestions', () => {
      manager.add(mockSuggestions);
      expect(manager.count).toBe(2);
    });

    it('should find by hash prefix', () => {
      manager.add(mockSuggestions);
      const found = manager.findByHash('abc');
      expect(found?.title).toBe('Use TypeScript');
    });

    it('should return undefined for non-existent hash', () => {
      manager.add(mockSuggestions);
      expect(manager.findByHash('xyz')).toBeUndefined();
    });

    it('should remove by hash', () => {
      manager.add(mockSuggestions);
      const removed = manager.remove('abc123');
      expect(removed?.title).toBe('Use TypeScript');
      expect(manager.count).toBe(1);
    });

    it('should return undefined when removing non-existent', () => {
      manager.add(mockSuggestions);
      expect(manager.remove('nonexistent')).toBeUndefined();
    });

    it('should get all suggestions as copy', () => {
      manager.add(mockSuggestions);
      const all = manager.getAll();
      expect(all).toHaveLength(2);
      all.push({ hash: 'new', type: 'test', title: 'test', content: 'test' });
      expect(manager.count).toBe(2);
    });

    it('should clear and return count', () => {
      manager.add(mockSuggestions);
      const cleared = manager.clear();
      expect(cleared).toBe(2);
      expect(manager.count).toBe(0);
    });
  });
});
