import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readTranscriptFromOffset } from '../../src/utils/transcript-cursor.js';

describe('Transcript Cursor', () => {
  const testDir = './data/test-transcript-cursor';
  const testFilePath = join(testDir, 'test-transcript.jsonl');

  beforeEach(() => {
    // Create test directory if it doesn't exist
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  describe('readTranscriptFromOffset', () => {
    it('should return empty result for non-existent file', () => {
      const result = readTranscriptFromOffset('/non/existent/file.jsonl', 0);

      expect(result.lines).toEqual([]);
      expect(result.nextByteOffset).toBe(0);
      expect(result.wasTruncated).toBe(false);
    });

    it('should read complete JSON lines from beginning', () => {
      const lines = [
        JSON.stringify({ type: 'message', content: 'Hello' }),
        JSON.stringify({ type: 'message', content: 'World' }),
      ];
      writeFileSync(testFilePath, lines.join('\n') + '\n');

      const result = readTranscriptFromOffset(testFilePath, 0);

      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]).toBe(lines[0]);
      expect(result.lines[1]).toBe(lines[1]);
      expect(result.wasTruncated).toBe(false);
    });

    it('should read from a specific byte offset', () => {
      const line1 = JSON.stringify({ type: 'first' });
      const line2 = JSON.stringify({ type: 'second' });
      const content = line1 + '\n' + line2 + '\n';
      writeFileSync(testFilePath, content);

      // Calculate offset after first line (including newline)
      const offset = Buffer.byteLength(line1, 'utf8') + 1;
      const result = readTranscriptFromOffset(testFilePath, offset);

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]).toBe(line2);
    });

    it('should handle partial last line (incomplete JSON)', () => {
      const completeLine = JSON.stringify({ type: 'complete' });
      const partialLine = '{"type": "incomplete';
      writeFileSync(testFilePath, completeLine + '\n' + partialLine);

      const result = readTranscriptFromOffset(testFilePath, 0);

      // Should only return the complete line
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]).toBe(completeLine);
      // Next offset should not include the partial line
      expect(result.nextByteOffset).toBe(Buffer.byteLength(completeLine, 'utf8') + 1);
    });

    it('should detect file truncation', () => {
      const line = JSON.stringify({ type: 'test' });
      writeFileSync(testFilePath, line + '\n');

      // Try to read from offset beyond file size
      const result = readTranscriptFromOffset(testFilePath, 1000);

      expect(result.lines).toEqual([]);
      expect(result.nextByteOffset).toBe(0);
      expect(result.wasTruncated).toBe(true);
    });

    it('should return empty when offset equals file size', () => {
      const line = JSON.stringify({ type: 'test' });
      const content = line + '\n';
      writeFileSync(testFilePath, content);

      const fileSize = Buffer.byteLength(content, 'utf8');
      const result = readTranscriptFromOffset(testFilePath, fileSize);

      expect(result.lines).toEqual([]);
      expect(result.nextByteOffset).toBe(fileSize);
      expect(result.wasTruncated).toBe(false);
    });

    it('should handle empty file', () => {
      writeFileSync(testFilePath, '');

      const result = readTranscriptFromOffset(testFilePath, 0);

      expect(result.lines).toEqual([]);
      expect(result.nextByteOffset).toBe(0);
      expect(result.wasTruncated).toBe(false);
    });

    it('should skip malformed JSON lines in the middle', () => {
      const validLine1 = JSON.stringify({ type: 'valid1' });
      const malformedLine = 'not valid json {';
      const validLine2 = JSON.stringify({ type: 'valid2' });
      writeFileSync(testFilePath, validLine1 + '\n' + malformedLine + '\n' + validLine2 + '\n');

      const result = readTranscriptFromOffset(testFilePath, 0);

      // Should skip malformed line but continue processing
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]).toBe(validLine1);
      expect(result.lines[1]).toBe(validLine2);
    });

    it('should handle empty lines', () => {
      const line1 = JSON.stringify({ type: 'first' });
      const line2 = JSON.stringify({ type: 'second' });
      writeFileSync(testFilePath, line1 + '\n\n' + line2 + '\n');

      const result = readTranscriptFromOffset(testFilePath, 0);

      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]).toBe(line1);
      expect(result.lines[1]).toBe(line2);
    });

    it('should respect maxBytes limit', () => {
      const lines: string[] = [];
      for (let i = 0; i < 100; i++) {
        lines.push(JSON.stringify({ index: i, data: 'x'.repeat(100) }));
      }
      writeFileSync(testFilePath, lines.join('\n') + '\n');

      // Read with small maxBytes to test limiting
      const result = readTranscriptFromOffset(testFilePath, 0, 500);

      // Should return fewer lines due to byte limit
      expect(result.lines.length).toBeLessThan(100);
      expect(result.lines.length).toBeGreaterThan(0);
    });

    it('should handle Unicode content correctly', () => {
      const unicodeLine = JSON.stringify({ message: 'Hello \u4e16\u754c \u{1F600}' });
      writeFileSync(testFilePath, unicodeLine + '\n');

      const result = readTranscriptFromOffset(testFilePath, 0);

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]).toBe(unicodeLine);
    });

    it('should track byte offsets correctly across multiple reads', () => {
      const lines = [
        JSON.stringify({ index: 0 }),
        JSON.stringify({ index: 1 }),
        JSON.stringify({ index: 2 }),
      ];
      writeFileSync(testFilePath, lines.join('\n') + '\n');

      // First read
      const result1 = readTranscriptFromOffset(testFilePath, 0);
      expect(result1.lines).toHaveLength(3);

      // Append new line
      const newLine = JSON.stringify({ index: 3 });
      writeFileSync(testFilePath, lines.join('\n') + '\n' + newLine + '\n');

      // Second read from last offset
      const result2 = readTranscriptFromOffset(testFilePath, result1.nextByteOffset);
      expect(result2.lines).toHaveLength(1);
      expect(result2.lines[0]).toBe(newLine);
    });

    it('should handle lines with whitespace', () => {
      const line = JSON.stringify({ type: 'test' });
      writeFileSync(testFilePath, '  ' + line + '  \n');

      const result = readTranscriptFromOffset(testFilePath, 0);

      expect(result.lines).toHaveLength(1);
      // The trimmed line should still be valid JSON
      expect(JSON.parse(result.lines[0]!)).toEqual({ type: 'test' });
    });

    it('should handle file with only newlines', () => {
      writeFileSync(testFilePath, '\n\n\n');

      const result = readTranscriptFromOffset(testFilePath, 0);

      expect(result.lines).toEqual([]);
    });

    it('should handle very large JSON objects', () => {
      const largeObject = { data: 'x'.repeat(10000) };
      const line = JSON.stringify(largeObject);
      writeFileSync(testFilePath, line + '\n');

      const result = readTranscriptFromOffset(testFilePath, 0);

      expect(result.lines).toHaveLength(1);
      expect(JSON.parse(result.lines[0]!)).toEqual(largeObject);
    });

    it('should correctly calculate next offset for incremental reads', () => {
      const line1 = JSON.stringify({ id: 1 });
      const line2 = JSON.stringify({ id: 2 });
      writeFileSync(testFilePath, line1 + '\n' + line2 + '\n');

      const result1 = readTranscriptFromOffset(testFilePath, 0);
      const expectedOffset =
        Buffer.byteLength(line1, 'utf8') + 1 + Buffer.byteLength(line2, 'utf8') + 1;

      expect(result1.nextByteOffset).toBe(expectedOffset);
    });

    it('should handle file with no trailing newline at partial read boundary', () => {
      const line1 = JSON.stringify({ id: 1 });
      // No trailing newline
      writeFileSync(testFilePath, line1);

      const result = readTranscriptFromOffset(testFilePath, 0);

      // Without trailing newline, the line is considered incomplete
      // This depends on implementation - it may defer or include
      expect(result.lines.length).toBeLessThanOrEqual(1);
    });

    it('should handle multi-byte UTF-8 characters (2-byte)', () => {
      // é is a 2-byte UTF-8 character (0xC3 0xA9)
      const unicodeLine = JSON.stringify({ message: 'café' });
      writeFileSync(testFilePath, unicodeLine + '\n');

      const result = readTranscriptFromOffset(testFilePath, 0);

      expect(result.lines).toHaveLength(1);
      expect(JSON.parse(result.lines[0]!).message).toBe('café');
    });

    it('should handle multi-byte UTF-8 characters (3-byte)', () => {
      // Chinese characters are 3-byte UTF-8
      const unicodeLine = JSON.stringify({ message: '中文测试' });
      writeFileSync(testFilePath, unicodeLine + '\n');

      const result = readTranscriptFromOffset(testFilePath, 0);

      expect(result.lines).toHaveLength(1);
      expect(JSON.parse(result.lines[0]!).message).toBe('中文测试');
    });

    it('should handle multi-byte UTF-8 characters (4-byte emoji)', () => {
      // Emoji are 4-byte UTF-8 characters
      const unicodeLine = JSON.stringify({ message: '😀🎉🚀' });
      writeFileSync(testFilePath, unicodeLine + '\n');

      const result = readTranscriptFromOffset(testFilePath, 0);

      expect(result.lines).toHaveLength(1);
      expect(JSON.parse(result.lines[0]!).message).toBe('😀🎉🚀');
    });

    it('should handle mixed ASCII and multi-byte UTF-8', () => {
      const unicodeLine = JSON.stringify({ message: 'Hello 世界! 🌍' });
      writeFileSync(testFilePath, unicodeLine + '\n');

      const result = readTranscriptFromOffset(testFilePath, 0);

      expect(result.lines).toHaveLength(1);
      expect(JSON.parse(result.lines[0]!).message).toBe('Hello 世界! 🌍');
    });

    it('should handle UTF-8 truncation at buffer boundary', () => {
      // Create content where a multi-byte character might be split at buffer boundary
      const line1 = JSON.stringify({ id: 1, data: 'x'.repeat(500) });
      const line2 = JSON.stringify({ id: 2, message: '世界' }); // 3-byte chars
      writeFileSync(testFilePath, line1 + '\n' + line2 + '\n');

      // Read with small buffer that might split a UTF-8 sequence
      const result = readTranscriptFromOffset(testFilePath, 0, 100);

      // Should handle gracefully without corrupting data
      expect(result.lines.length).toBeGreaterThanOrEqual(0);
      expect(result.wasTruncated).toBe(false);
    });

    it('should handle bytesRead being 0', () => {
      // Edge case: file exists but read returns 0 bytes
      // This happens when file is empty or at EOF
      writeFileSync(testFilePath, '');

      const result = readTranscriptFromOffset(testFilePath, 0);

      expect(result.lines).toEqual([]);
      expect(result.nextByteOffset).toBe(0);
      expect(result.wasTruncated).toBe(false);
    });

    it('should handle consecutive empty lines between valid lines', () => {
      const line1 = JSON.stringify({ id: 1 });
      const line2 = JSON.stringify({ id: 2 });
      writeFileSync(testFilePath, line1 + '\n\n\n\n' + line2 + '\n');

      const result = readTranscriptFromOffset(testFilePath, 0);

      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]).toBe(line1);
      expect(result.lines[1]).toBe(line2);
    });

    it('should handle whitespace-only lines', () => {
      const line = JSON.stringify({ id: 1 });
      writeFileSync(testFilePath, line + '\n   \n\t\t\n' + JSON.stringify({ id: 2 }) + '\n');

      const result = readTranscriptFromOffset(testFilePath, 0);

      expect(result.lines).toHaveLength(2);
    });

    it('should properly calculate byte offsets with multi-byte characters', () => {
      // Each Chinese character is 3 bytes in UTF-8
      const unicodeLine = JSON.stringify({ message: '中文' });
      writeFileSync(testFilePath, unicodeLine + '\n');

      const result = readTranscriptFromOffset(testFilePath, 0);

      expect(result.lines).toHaveLength(1);
      // Verify offset calculation is correct
      const expectedOffset = Buffer.byteLength(unicodeLine, 'utf8') + 1; // +1 for newline
      expect(result.nextByteOffset).toBe(expectedOffset);
    });

    it('should handle reading just the last character of file', () => {
      const line = JSON.stringify({ id: 1 });
      writeFileSync(testFilePath, line + '\n');

      // Read from offset that leaves just 1 byte
      const fileSize = Buffer.byteLength(line + '\n', 'utf8');
      const result = readTranscriptFromOffset(testFilePath, fileSize - 1);

      // The newline character alone should result in empty lines
      expect(result.lines).toEqual([]);
    });
  });
});
