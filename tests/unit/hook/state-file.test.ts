/**
 * Unit tests for state-file.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import {
  getAgentMemoryStatePath,
  loadState,
  saveState,
  setReviewSuspended,
  isReviewSuspended,
  hasWarnedReview,
  setWarnedReview,
} from '../../../src/commands/hook/state-file.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe('state-file', () => {
  const mockExistsSync = vi.mocked(fs.existsSync);
  const mockMkdirSync = vi.mocked(fs.mkdirSync);
  const mockReadFileSync = vi.mocked(fs.readFileSync);
  const mockWriteFileSync = vi.mocked(fs.writeFileSync);

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: file doesn't exist
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('{}');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAgentMemoryStatePath', () => {
    it('should return path relative to cwd by default', () => {
      const path = getAgentMemoryStatePath();
      expect(path).toContain('.claude');
      expect(path).toContain('hooks');
      expect(path).toContain('.agent-memory-state.json');
    });

    it('should use custom base directory', () => {
      const path = getAgentMemoryStatePath('/custom/dir');
      expect(path).toContain('/custom/dir');
      expect(path).toContain('.agent-memory-state.json');
    });
  });

  describe('loadState', () => {
    it('should return empty object when file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const state = loadState('/path/to/state.json');
      expect(state).toEqual({});
    });

    it('should parse JSON when file exists', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"key": "value"}');

      const state = loadState('/path/to/state.json');
      expect(state).toEqual({ key: 'value' });
    });

    it('should return empty object on invalid JSON', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid json {{{');

      const state = loadState('/path/to/state.json');
      expect(state).toEqual({});
    });

    it('should return empty object on read error', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      const state = loadState('/path/to/state.json');
      expect(state).toEqual({});
    });
  });

  describe('saveState', () => {
    it('should create directory and write file', () => {
      mockExistsSync.mockReturnValue(false);

      saveState('/path/to/state.json', { test: 'value' });

      expect(mockMkdirSync).toHaveBeenCalledWith('/path/to', { recursive: true });
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should merge with existing state', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"existing": "data"}');

      saveState('/path/to/state.json', { newKey: 'newValue' });

      const writeCall = mockWriteFileSync.mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written).toEqual({ existing: 'data', newKey: 'newValue' });
    });

    it('should overwrite existing keys', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"key": "old"}');

      saveState('/path/to/state.json', { key: 'new' });

      const writeCall = mockWriteFileSync.mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written.key).toBe('new');
    });
  });

  describe('setReviewSuspended', () => {
    it('should set suspended state for session', () => {
      mockExistsSync.mockReturnValue(false);

      setReviewSuspended('session-123', true);

      const writeCall = mockWriteFileSync.mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written['review:suspended:session-123']).toBe(true);
    });

    it('should set unsuspended state', () => {
      mockExistsSync.mockReturnValue(false);

      setReviewSuspended('session-456', false);

      const writeCall = mockWriteFileSync.mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written['review:suspended:session-456']).toBe(false);
    });
  });

  describe('isReviewSuspended', () => {
    it('should return true when suspended', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"review:suspended:sess-1": true}');

      const result = isReviewSuspended('sess-1');
      expect(result).toBe(true);
    });

    it('should return false when not suspended', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"review:suspended:sess-1": false}');

      const result = isReviewSuspended('sess-1');
      expect(result).toBe(false);
    });

    it('should return false when key not found', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{}');

      const result = isReviewSuspended('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('hasWarnedReview', () => {
    it('should return true when warned', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"review:warned:sess-1": true}');

      const result = hasWarnedReview('sess-1');
      expect(result).toBe(true);
    });

    it('should return false when not warned', () => {
      mockExistsSync.mockReturnValue(false);

      const result = hasWarnedReview('sess-1');
      expect(result).toBe(false);
    });
  });

  describe('setWarnedReview', () => {
    it('should set warned state for session', () => {
      mockExistsSync.mockReturnValue(false);

      setWarnedReview('session-789');

      const writeCall = mockWriteFileSync.mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written['review:warned:session-789']).toBe(true);
    });
  });
});
