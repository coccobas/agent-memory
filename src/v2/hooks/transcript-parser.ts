/**
 * V2 Transcript Parser — NDJSON incremental reader.
 *
 * Reads Claude Code transcript files (NDJSON format) incrementally
 * from a byte offset, parsing each line into a normalized message.
 * Handles partial last lines gracefully by deferring them.
 */

import { openSync, readSync, closeSync, statSync } from 'node:fs';

import type { TranscriptRole } from '../contracts/transcript.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedMessage {
  readonly role: TranscriptRole;
  readonly content: string;
  readonly toolName: string | null;
  readonly timestamp: string | null;
}

export interface IncrementalReadResult {
  readonly messages: ParsedMessage[];
  readonly newByteOffset: number;
  readonly errors: number;
}

// ---------------------------------------------------------------------------
// Content block types (Claude API format)
// ---------------------------------------------------------------------------

interface TextBlock {
  type: 'text';
  text: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  name: string;
  input: unknown;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content?: unknown;
}

interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | { type: string; [key: string]: unknown };

// ---------------------------------------------------------------------------
// Role normalization
// ---------------------------------------------------------------------------

const ROLE_MAP: Record<string, TranscriptRole> = {
  user: 'user',
  human: 'user',
  assistant: 'assistant',
  ai: 'assistant',
  system: 'system',
  tool_use: 'tool_use',
  tool_result: 'tool_result',
};

/**
 * Normalize role strings to canonical TranscriptRole values.
 * Maps aliases like 'human' → 'user', 'ai' → 'assistant'.
 */
export function normalizeRole(raw: string): TranscriptRole | null {
  if (!raw) return null;
  return ROLE_MAP[raw.toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Content extraction
// ---------------------------------------------------------------------------

/**
 * Extract content from either a plain string or an array of content blocks.
 *
 * Handles all Claude API block types:
 * - text: Direct text content
 * - thinking: Claude's internal reasoning (preserved as-is)
 * - tool_use: Serialized as JSON for storage (tool name + input)
 * - tool_result: Tool response content (may be string or nested blocks)
 */
export function extractMessageContent(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content as ContentBlock[]) {
      if (block.type === 'text' && 'text' in block) {
        parts.push((block as TextBlock).text);
      } else if (block.type === 'thinking' && 'thinking' in block) {
        parts.push((block as ThinkingBlock).thinking);
      } else if (block.type === 'tool_use' && 'name' in block) {
        const tu = block as ToolUseBlock;
        parts.push(JSON.stringify({ tool: tu.name, input: tu.input }));
      } else if (block.type === 'tool_result') {
        const tr = block as ToolResultBlock;
        const inner = tr.content;
        if (typeof inner === 'string') {
          parts.push(inner);
        } else if (Array.isArray(inner)) {
          // tool_result can nest text blocks
          for (const sub of inner as ContentBlock[]) {
            if (sub.type === 'text' && 'text' in sub) {
              parts.push((sub as TextBlock).text);
            }
          }
        }
      }
    }
    return parts.join('\n');
  }

  return String(content);
}

/**
 * Extract tool name from content blocks (if any tool_use block present).
 */
function extractToolName(content: unknown): string | null {
  if (!Array.isArray(content)) return null;

  for (const block of content as ContentBlock[]) {
    if (block.type === 'tool_use' && 'name' in block) {
      return (block as ToolUseBlock).name;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Line parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single NDJSON line into a message.
 * Returns null if the line is unparseable or lacks required fields.
 *
 * Supports two formats:
 * 1. Flat: `{role: "user", content: "...", timestamp: "..."}`
 * 2. Claude Code envelope: `{type: "user", message: {role: "user", content: "..."}, timestamp: "..."}`
 *
 * The envelope format nests the actual message inside a `message` field,
 * while the top-level `type` field doubles as the role indicator.
 * Lines with non-message types (e.g. "progress", "file-history-snapshot") are skipped.
 */
export function parseTranscriptLine(line: string): ParsedMessage | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }

  // Try flat format first: {role, content}
  let rawRole = parsed.role as string | undefined;
  let rawContent = parsed.content;

  // If no top-level role, try Claude Code envelope: {type, message: {role, content}}
  if (!rawRole && parsed.message && typeof parsed.message === 'object') {
    const envelope = parsed.message as Record<string, unknown>;
    rawRole = envelope.role as string | undefined;
    rawContent = envelope.content;
  }

  if (!rawRole) return null;

  const role = normalizeRole(rawRole);
  if (!role) return null;

  const content = extractMessageContent(rawContent);
  const toolName = extractToolName(rawContent);
  const timestamp = (parsed.timestamp as string | undefined) ?? null;

  return { role, content, toolName, timestamp };
}

// ---------------------------------------------------------------------------
// Incremental file reading
// ---------------------------------------------------------------------------

/**
 * Read transcript file incrementally from a byte offset.
 *
 * Reads all complete lines (ending with \n) from the offset,
 * deferring any partial last line until the next invocation.
 * Returns parsed messages and the new byte offset.
 */
export function readTranscriptIncremental(
  filePath: string,
  fromByteOffset: number
): IncrementalReadResult {
  let fileSize: number;
  try {
    fileSize = statSync(filePath).size;
  } catch {
    return { messages: [], newByteOffset: fromByteOffset, errors: 0 };
  }

  if (fileSize <= fromByteOffset) {
    return { messages: [], newByteOffset: fromByteOffset, errors: 0 };
  }

  const bytesToRead = fileSize - fromByteOffset;
  const buffer = Buffer.alloc(bytesToRead);

  let fd: number;
  try {
    fd = openSync(filePath, 'r');
  } catch {
    return { messages: [], newByteOffset: fromByteOffset, errors: 0 };
  }

  let bytesRead: number;
  try {
    bytesRead = readSync(fd, buffer, 0, bytesToRead, fromByteOffset);
  } finally {
    closeSync(fd);
  }

  const chunk = buffer.subarray(0, bytesRead).toString('utf-8');

  // Split on newlines, keeping track of whether the last line is complete
  const lines = chunk.split('\n');
  // Split produces an extra empty element after a trailing \n, or
  // an incomplete line fragment if the file was mid-write. Either way,
  // drop the last element — only process lines terminated by \n.
  const completeLines = lines.slice(0, -1);

  const messages: ParsedMessage[] = [];
  let errors = 0;
  let consumedBytes = 0;

  for (const line of completeLines) {
    consumedBytes += Buffer.byteLength(line, 'utf-8') + 1; // +1 for \n

    if (!line.trim()) continue;

    const msg = parseTranscriptLine(line);
    if (msg) {
      messages.push(msg);
    } else {
      errors += 1;
    }
  }

  return {
    messages,
    newByteOffset: fromByteOffset + consumedBytes,
    errors,
  };
}
