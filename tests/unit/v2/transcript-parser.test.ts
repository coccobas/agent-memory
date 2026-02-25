import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  parseTranscriptLine,
  normalizeRole,
  extractMessageContent,
  readTranscriptIncremental,
} from '../../../src/v2/hooks/transcript-parser.js';

describe('transcript-parser', () => {
  describe('parseTranscriptLine', () => {
    it('handles {role: "user", content: "hello"}', () => {
      const result = parseTranscriptLine(JSON.stringify({ role: 'user', content: 'hello' }));
      expect(result).not.toBeNull();
      expect(result!.role).toBe('user');
      expect(result!.content).toBe('hello');
    });

    it('handles nested content blocks [{type: "text", text: "..."}]', () => {
      const result = parseTranscriptLine(
        JSON.stringify({
          role: 'assistant',
          content: [{ type: 'text', text: 'some response' }],
        })
      );
      expect(result).not.toBeNull();
      expect(result!.role).toBe('assistant');
      expect(result!.content).toBe('some response');
    });

    it('returns null for unparseable lines', () => {
      expect(parseTranscriptLine('not json at all')).toBeNull();
      expect(parseTranscriptLine('')).toBeNull();
      expect(parseTranscriptLine('{}')).toBeNull();
    });

    it('extracts tool_name from tool_use messages', () => {
      const result = parseTranscriptLine(
        JSON.stringify({
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              input: { file_path: '/tmp/test.ts' },
            },
          ],
        })
      );
      expect(result).not.toBeNull();
      expect(result!.toolName).toBe('Read');
    });
  });

  describe('normalizeRole', () => {
    it('maps "human" to "user"', () => {
      expect(normalizeRole('human')).toBe('user');
    });

    it('maps "ai" to "assistant"', () => {
      expect(normalizeRole('ai')).toBe('assistant');
    });

    it('passes through standard roles', () => {
      expect(normalizeRole('user')).toBe('user');
      expect(normalizeRole('assistant')).toBe('assistant');
      expect(normalizeRole('system')).toBe('system');
      expect(normalizeRole('tool_use')).toBe('tool_use');
      expect(normalizeRole('tool_result')).toBe('tool_result');
    });

    it('returns null for unknown roles', () => {
      expect(normalizeRole('unknown')).toBeNull();
      expect(normalizeRole('')).toBeNull();
    });
  });

  describe('extractMessageContent', () => {
    it('handles string content', () => {
      expect(extractMessageContent('hello world')).toBe('hello world');
    });

    it('handles array content blocks', () => {
      const blocks = [
        { type: 'text', text: 'part one' },
        { type: 'text', text: 'part two' },
      ];
      expect(extractMessageContent(blocks)).toBe('part one\npart two');
    });

    it('handles mixed content block types', () => {
      const blocks = [
        { type: 'text', text: 'some text' },
        { type: 'tool_use', name: 'Read', input: {} },
        { type: 'text', text: 'more text' },
      ];
      expect(extractMessageContent(blocks)).toBe('some text\nmore text');
    });

    it('returns empty for null/undefined', () => {
      expect(extractMessageContent(null)).toBe('');
      expect(extractMessageContent(undefined)).toBe('');
    });
  });

  describe('readTranscriptIncremental', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'transcript-test-'));
    });

    it('reads from byte offset', () => {
      const filePath = join(tmpDir, 'transcript.jsonl');
      const line1 = JSON.stringify({ role: 'user', content: 'hello' }) + '\n';
      const line2 = JSON.stringify({ role: 'assistant', content: 'hi' }) + '\n';
      writeFileSync(filePath, line1 + line2);

      const result = readTranscriptIncremental(filePath, line1.length);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]!.role).toBe('assistant');
    });

    it('handles partial last line (defers it)', () => {
      const filePath = join(tmpDir, 'partial.jsonl');
      const line1 = JSON.stringify({ role: 'user', content: 'hello' }) + '\n';
      const partial = '{"role": "assistant", "content": "in prog';
      writeFileSync(filePath, line1 + partial);

      const result = readTranscriptIncremental(filePath, 0);
      expect(result.messages).toHaveLength(1);
      // byteOffset should stop before the partial line
      expect(result.newByteOffset).toBe(line1.length);
    });

    it('returns updated byte offset', () => {
      const filePath = join(tmpDir, 'offset.jsonl');
      const line1 = JSON.stringify({ role: 'user', content: 'hello' }) + '\n';
      const line2 = JSON.stringify({ role: 'assistant', content: 'world' }) + '\n';
      writeFileSync(filePath, line1 + line2);

      const result = readTranscriptIncremental(filePath, 0);
      expect(result.newByteOffset).toBe(line1.length + line2.length);
      expect(result.messages).toHaveLength(2);
    });

    it('handles empty file gracefully', () => {
      const filePath = join(tmpDir, 'empty.jsonl');
      writeFileSync(filePath, '');

      const result = readTranscriptIncremental(filePath, 0);
      expect(result.messages).toHaveLength(0);
      expect(result.newByteOffset).toBe(0);
    });

    it('handles nonexistent file gracefully', () => {
      const result = readTranscriptIncremental(join(tmpDir, 'missing.jsonl'), 0);
      expect(result.messages).toHaveLength(0);
      expect(result.newByteOffset).toBe(0);
      expect(result.errors).toBeGreaterThanOrEqual(0);
    });
  });
});
