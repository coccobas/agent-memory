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

    const content = buffer.toString('utf8', 0, bytesRead);
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

/**
 * Compute the next cursor index (line count) to persist after ingesting.
 *
 * @deprecated Use readTranscriptFromOffset for better performance with large files.
 *
 * Behavior:
 * - Lines before `startIndex` are assumed already processed.
 * - Unparseable lines in the middle are skipped and considered "consumed".
 * - If the final line is unparseable, it is treated as a partial write and NOT consumed.
 */
export function computeNextTranscriptCursor(lines: string[], startIndex: number): number {
  const start = Math.max(0, Math.min(lines.length, startIndex));
  let cursor = start;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? '';
    try {
      JSON.parse(line);
      cursor = i + 1;
    } catch {
      // If it's the last line, assume it's partially written and retry later.
      if (i === lines.length - 1) {
        break;
      }
      // Otherwise treat it as a malformed line and move on.
      cursor = i + 1;
    }
  }

  return cursor;
}
