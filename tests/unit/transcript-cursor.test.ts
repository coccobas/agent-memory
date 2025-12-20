import { describe, it, expect } from 'vitest';
import { computeNextTranscriptCursor } from '../../src/utils/transcript-cursor.js';

describe('computeNextTranscriptCursor', () => {
  it('does not advance past an unparseable final line', () => {
    const lines = [
      JSON.stringify({ role: 'user', content: 'a' }),
      JSON.stringify({ role: 'agent', content: 'b' }),
      '{"role":"user","content":"partial"', // missing closing brace
    ];

    expect(computeNextTranscriptCursor(lines, 0)).toBe(2);
  });

  it('skips malformed middle lines but continues', () => {
    const lines = [JSON.stringify({ ok: 1 }), '{bad json', JSON.stringify({ ok: 2 })];

    expect(computeNextTranscriptCursor(lines, 0)).toBe(3);
  });
});
