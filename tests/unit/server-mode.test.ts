import { describe, it, expect } from 'vitest';

import { parseServerMode } from '../../src/utils/server-mode.js';

describe('parseServerMode', () => {
  it('defaults to mcp', () => {
    expect(parseServerMode([], '')).toBe('mcp');
    expect(parseServerMode([], undefined)).toBe('mcp');
  });

  it('uses env mode when provided', () => {
    expect(parseServerMode([], 'rest')).toBe('rest');
    expect(parseServerMode([], 'both')).toBe('both');
    expect(parseServerMode([], 'MCP')).toBe('mcp');
  });

  it('argv overrides env mode', () => {
    expect(parseServerMode(['rest'], 'mcp')).toBe('rest');
    expect(parseServerMode(['--both'], 'rest')).toBe('both');
    expect(parseServerMode(['--mode=mcp'], 'both')).toBe('mcp');
  });

  it('accepts multiple argv forms', () => {
    expect(parseServerMode(['--mcp'], '')).toBe('mcp');
    expect(parseServerMode(['--rest'], '')).toBe('rest');
    expect(parseServerMode(['--both'], '')).toBe('both');
    expect(parseServerMode(['mcp'], '')).toBe('mcp');
    expect(parseServerMode(['rest'], '')).toBe('rest');
    expect(parseServerMode(['both'], '')).toBe('both');
    expect(parseServerMode(['--mode=rest'], '')).toBe('rest');
    expect(parseServerMode(['--mode=both'], '')).toBe('both');
  });

  it('throws on unknown modes', () => {
    expect(() => parseServerMode(['--mode=wat'], '')).toThrow(/Unknown mode/i);
    expect(() => parseServerMode([], 'wat')).toThrow(/Unknown mode/i);
  });
});

