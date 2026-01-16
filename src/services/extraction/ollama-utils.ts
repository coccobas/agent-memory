/**
 * Ollama-specific utilities for extraction
 */

import { createComponentLogger } from '../../utils/logger.js';
import { createExtractionError, createSizeLimitError } from '../../core/errors.js';

const logger = createComponentLogger('ollama-utils');

/**
 * Get Ollama timeout from environment with bounds validation
 */
export function getOllamaTimeout(): number {
  const timeoutMsRaw = process.env.AGENT_MEMORY_OLLAMA_TIMEOUT_MS;
  return timeoutMsRaw && !Number.isNaN(Number(timeoutMsRaw))
    ? Math.min(300000, Math.max(1000, Number(timeoutMsRaw))) // Clamp to [1s, 5min]
    : 30000; // Default 30s
}

/**
 * Validate Ollama response structure and extract response field
 */
export function validateOllamaResponse(responseText: string): string {
  let data: { response?: unknown; error?: string };

  try {
    data = JSON.parse(responseText) as typeof data;
  } catch (parseError) {
    logger.warn(
      { responseText: responseText.slice(0, 200) },
      'Failed to parse Ollama response as JSON'
    );
    throw createExtractionError('ollama', 'invalid JSON response');
  }

  // Check for Ollama-specific error response
  if (data.error) {
    throw createExtractionError('ollama', `API error: ${data.error}`);
  }

  // Validate response field exists and is string
  if (typeof data.response !== 'string' || data.response.length === 0) {
    logger.warn(
      { responseType: typeof data.response, hasResponse: 'response' in data },
      'Ollama response missing or invalid response field'
    );
    throw createExtractionError('ollama', 'no valid response in data');
  }

  return data.response;
}

/**
 * Retryable error patterns for Ollama
 */
export const OLLAMA_RETRYABLE_ERRORS = [
  'econnrefused',
  'fetch failed',
  'network',
  'timeout',
  'socket',
  '500',
  '502',
  '503',
  '504',
  'internal server error',
  'bad gateway',
  'service unavailable',
  'gateway timeout',
];

/**
 * Check if error is retryable for Ollama
 */
export function isOllamaRetryable(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return OLLAMA_RETRYABLE_ERRORS.some((pattern) => msg.includes(pattern));
}

/**
 * Read response body with size limit to prevent memory exhaustion
 */
export async function readResponseWithLimit(
  response: Response,
  maxSizeBytes: number,
  abortController: AbortController
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw createExtractionError('response', 'body is not readable');
  }

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

  // Per-read timeout to prevent hung requests
  const READ_TIMEOUT_MS = 30000;

  try {
    // eslint-disable-next-line no-constant-condition -- intentional infinite loop with break condition
    while (true) {
      // Check if abort was requested before each read
      if (abortController.signal.aborted) {
        throw createExtractionError('response', 'request aborted');
      }

      // Add timeout to each read operation
      const readPromise = reader.read();
      const timeoutPromise = new Promise<never>((_, reject) => {
        const id = setTimeout(() => {
          reject(createExtractionError('response', 'stream read timeout - server not responding'));
        }, READ_TIMEOUT_MS);
        // Clean up timeout if read completes first
        void readPromise.finally(() => clearTimeout(id));
      });

      // TypeScript limitation: Promise.race with Promise<never> widens to any
      // Safe to cast because timeoutPromise never resolves, only rejects
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = (await Promise.race([readPromise, timeoutPromise])) as {
        done: boolean;
        value?: Uint8Array;
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (result.done) break;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const value = result.value;
      if (!value) break;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      totalBytes += value.byteLength;

      // Abort if response exceeds size limit
      if (totalBytes > maxSizeBytes) {
        abortController.abort();
        throw createSizeLimitError('response', maxSizeBytes, totalBytes, 'bytes');
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      chunks.push(decoder.decode(value, { stream: true }));
    }

    // Flush any remaining bytes
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    reader.releaseLock();
  }
}

/**
 * Fetch with timeout for Ollama requests
 */
export async function fetchOllamaWithTimeout(
  url: string,
  body: unknown,
  timeoutMs: number
): Promise<string> {
  const abortController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortController.signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw createExtractionError(
        'ollama',
        `request failed: ${response.status} ${response.statusText}`
      );
    }

    // Stream response with size limit to prevent memory exhaustion
    const maxResponseSize = 10 * 1024 * 1024; // 10MB max response
    const responseText = await readResponseWithLimit(response, maxResponseSize, abortController);

    return responseText;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}
