/**
 * Transcript cursor helper
 *
 * Claude transcript files are newline-delimited JSON. In real-world usage the
 * last line can be partially written (no trailing newline) when we read it.
 * This helper prevents permanently skipping that trailing partial line.
 *
 * Performance optimization: Uses byte offsets for incremental reading instead
 * of re-reading the entire file each time.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { openSync, readSync, closeSync, fstatSync, existsSync } from 'node:fs';

export interface TranscriptReadResult {
  /** Parsed lines (complete, valid JSON lines only) */
  lines: string[];
  /** Next byte offset to persist (position after last complete line) */
  nextByteOffset: number;
  /** Whether the file was truncated (offset > file size) */
  wasTruncated: boolean;
}

/**
 * Read transcript lines incrementally from a byte offset.
 *
 * This is more efficient than reading the entire file because it only
 * reads bytes from the last known position. Handles:
 * - Partial lines at end of file (deferred to next read)
 * - File truncation (resets to beginning)
 * - Empty or non-existent files
 *
 * @param filePath Path to the transcript file
 * @param fromByteOffset Byte position to start reading from (0 for beginning)
 * @param maxBytes Maximum bytes to read in one call (default 1MB)
 * @returns Parsed lines and the next byte offset to persist
 */
export function readTranscriptFromOffset(
  filePath: string,
  fromByteOffset: number,
  maxBytes: number = 1024 * 1024
): TranscriptReadResult {
  if (!existsSync(filePath)) {
    return { lines: [], nextByteOffset: 0, wasTruncated: false };
  }

  const fd = openSync(filePath, 'r');
  try {
    const stat = fstatSync(fd);
    const fileSize = stat.size;

    // Handle file truncation (e.g., log rotation)
    if (fromByteOffset > fileSize) {
      return { lines: [], nextByteOffset: 0, wasTruncated: true };
    }

    // Nothing new to read
    if (fromByteOffset >= fileSize) {
      return { lines: [], nextByteOffset: fromByteOffset, wasTruncated: false };
    }

    // Calculate how much to read
    const bytesToRead = Math.min(maxBytes, fileSize - fromByteOffset);
    const buffer = Buffer.alloc(bytesToRead);
    const bytesRead = readSync(fd, buffer, 0, bytesToRead, fromByteOffset);

    if (bytesRead === 0) {
      return { lines: [], nextByteOffset: fromByteOffset, wasTruncated: false };
    }

    // Bug #232 fix: Handle UTF-8 truncation at buffer boundary
    // UTF-8 multi-byte sequences can be split if we read an arbitrary number of bytes.
    // We need to detect incomplete sequences at the end and exclude them.
    let validBytes = bytesRead;
    if (validBytes > 0) {
      // Check for incomplete UTF-8 sequence at the end
      // UTF-8 continuation bytes start with 10xxxxxx (0x80-0xBF)
      // Start bytes: 0xxxxxxx (ASCII), 110xxxxx (2-byte), 1110xxxx (3-byte), 11110xxx (4-byte)
      let i = validBytes - 1;
      // Walk back through potential continuation bytes
      while (i >= 0 && i >= validBytes - 4) {
        // Safe: i >= 0 checked in loop condition, buffer has validBytes bytes
        const byte = buffer[i]!;
        if ((byte & 0xc0) === 0x80) {
          // Continuation byte - keep looking for start
          i--;
        } else if ((byte & 0x80) === 0x00) {
          // ASCII byte - no truncation
          break;
        } else {
          // Start byte found - check if sequence is complete
          let expectedLength = 0;
          if ((byte & 0xe0) === 0xc0) expectedLength = 2;
          else if ((byte & 0xf0) === 0xe0) expectedLength = 3;
          else if ((byte & 0xf8) === 0xf0) expectedLength = 4;

          const actualLength = validBytes - i;
          if (actualLength < expectedLength) {
            // Incomplete sequence - truncate before this start byte
            validBytes = i;
          }
          break;
        }
      }
    }

    const content = buffer.toString('utf8', 0, validBytes);
    const rawLines = content.split('\n');

    // Process lines, handling the last potentially incomplete line
    const lines: string[] = [];
    let consumedBytes = 0;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i]?.trim() ?? '';
      const isLastLine = i === rawLines.length - 1;
      const lineBytes = Buffer.byteLength(rawLines[i] ?? '', 'utf8') + (isLastLine ? 0 : 1); // +1 for newline

      if (!line) {
        // Empty line - consume the bytes but don't add to output
        if (!isLastLine) {
          consumedBytes += lineBytes;
        }
        continue;
      }

      try {
        JSON.parse(line);
        // Valid JSON line
        lines.push(line);
        consumedBytes += lineBytes;
      } catch {
        if (isLastLine) {
          // Last line is incomplete - don't consume it, will retry next time
          break;
        }
        // Malformed line in the middle - skip it but consume the bytes
        consumedBytes += lineBytes;
      }
    }

    return {
      lines,
      nextByteOffset: fromByteOffset + consumedBytes,
      wasTruncated: false,
    };
  } finally {
    closeSync(fd);
  }
}
