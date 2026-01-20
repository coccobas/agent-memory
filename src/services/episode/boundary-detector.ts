/**
 * Episode Boundary Detector
 *
 * Automatically detects episode boundaries from tool execution streams
 * using embedding similarity between consecutive event windows.
 *
 * Based on Nemori's Event Segmentation Theory approach:
 * - Topic shifts in tool activity indicate episode boundaries
 * - No explicit begin/end calls needed
 *
 * Operating modes:
 * - Phase 1 (shadowMode=true): Log detected boundaries without creating episodes
 * - Phase 2 (shadowMode=false): Call onBoundaryDetected callback to create episodes
 */

import type { IEmbeddingService } from '../../core/context.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('episode-boundary-detector');

// =============================================================================
// TYPES
// =============================================================================

/**
 * A buffered tool execution event
 */
export interface BufferedEvent {
  timestamp: Date;
  toolName: string;
  action?: string;
  targetFile?: string;
  summary: string;
  sessionId: string;
}

/**
 * Boundary detection decision
 */
export interface BoundaryDecision {
  isBoundary: boolean;
  confidence: number;
  reason: 'similarity_drop' | 'file_context_shift' | 'time_gap' | 'none';
  similarity?: number;
}

/**
 * Detected boundary (for shadow mode logging)
 */
export interface DetectedBoundary {
  timestamp: Date;
  sessionId: string;
  decision: BoundaryDecision;
  windowBefore: BufferedEvent[];
  windowAfter: BufferedEvent[];
  suggestedName?: string;
}

/**
 * Configuration for boundary detection
 */
export interface BoundaryDetectorConfig {
  /** Enable boundary detection */
  enabled: boolean;
  /** Shadow mode - log boundaries without creating episodes */
  shadowMode: boolean;
  /** Number of events in each comparison window */
  windowSize: number;
  /** Similarity threshold below which a boundary is detected */
  similarityThreshold: number;
  /** Minimum events before considering boundary detection */
  minEvents: number;
  /** Time gap (ms) that triggers a boundary */
  timeGapThresholdMs: number;
  /** Debounce period after detecting a boundary (ms) */
  boundaryDebounceMs: number;
}

/**
 * Default configuration
 */
export const DEFAULT_BOUNDARY_CONFIG: BoundaryDetectorConfig = {
  enabled: true,
  shadowMode: true, // Phase 1: shadow mode only
  windowSize: 5,
  similarityThreshold: 0.65,
  minEvents: 6, // Need at least windowSize + 1 events
  timeGapThresholdMs: 10 * 60 * 1000, // 10 minutes
  boundaryDebounceMs: 30 * 1000, // 30 seconds after boundary
};

/**
 * Callback options for boundary detection
 * Used in Phase 2 (shadowMode=false) to create episodes from detected boundaries
 */
export interface BoundaryDetectorCallbacks {
  /**
   * Called when a boundary is detected (only in auto-create mode, not shadow mode)
   * Use this to create episodes with triggerType='auto_detected'
   */
  onBoundaryDetected?: (boundary: DetectedBoundary) => void | Promise<void>;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Get intersection of two sets
 */
function setIntersection<T>(a: Set<T>, b: Set<T>): Set<T> {
  const result = new Set<T>();
  for (const item of a) {
    if (b.has(item)) {
      result.add(item);
    }
  }
  return result;
}

/**
 * Generate episode name from events using pattern detection
 */
function generateEpisodeNameFromEvents(events: BufferedEvent[]): string {
  // Extract unique files
  const files = events.map((e) => e.targetFile).filter((f): f is string => Boolean(f));

  // Extract unique tools
  const tools = [...new Set(events.map((e) => e.toolName.replace(/^memory_/, '')))];

  // Extract unique actions
  const actions = [...new Set(events.map((e) => e.action).filter(Boolean))];

  // If we have files, use the dominant directory/file
  if (files.length > 0) {
    const fileCounts = new Map<string, number>();
    for (const file of files) {
      // Get parent directory or filename
      const parts = file.split('/');
      const key = parts.length > 1 ? (parts[parts.length - 2] ?? file) : file;
      fileCounts.set(key, (fileCounts.get(key) ?? 0) + 1);
    }
    const dominant = [...fileCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (dominant) {
      return `Work on ${dominant[0]}`;
    }
  }

  // If we have actions, describe them
  if (actions.length > 0) {
    const actionStr = actions.slice(0, 2).join(', ');
    return `${actionStr.charAt(0).toUpperCase() + actionStr.slice(1)} operations`;
  }

  // Fall back to tools
  if (tools.length > 0) {
    return `Using ${tools.slice(0, 2).join(', ')}`;
  }

  return 'Work session';
}

// =============================================================================
// BOUNDARY DETECTOR SERVICE
// =============================================================================

/**
 * Create the Episode Boundary Detector Service
 *
 * @param embeddingService - Optional embedding service for similarity-based detection
 * @param config - Boundary detection configuration
 * @param callbacks - Optional callbacks for auto-create mode (Phase 2)
 */
export function createBoundaryDetectorService(
  embeddingService: IEmbeddingService | null,
  config: BoundaryDetectorConfig = DEFAULT_BOUNDARY_CONFIG,
  callbacks?: BoundaryDetectorCallbacks
) {
  // Event buffer per session
  const sessionBuffers = new Map<string, BufferedEvent[]>();

  // Cached window embeddings per session
  const windowEmbeddings = new Map<string, number[]>();

  // Last boundary time per session (for debouncing)
  const lastBoundaryTime = new Map<string, number>();

  // Detected boundaries (shadow mode storage)
  const detectedBoundaries: DetectedBoundary[] = [];

  /**
   * Get or create buffer for session
   */
  function getBuffer(sessionId: string): BufferedEvent[] {
    let buffer = sessionBuffers.get(sessionId);
    if (!buffer) {
      buffer = [];
      sessionBuffers.set(sessionId, buffer);
    }
    return buffer;
  }

  /**
   * Generate summary text for a window of events
   */
  function windowToText(events: BufferedEvent[]): string {
    return events.map((e) => e.summary).join(' | ');
  }

  /**
   * Compute embedding for a window of events
   */
  async function embedWindow(events: BufferedEvent[]): Promise<number[] | undefined> {
    if (!embeddingService) {
      return undefined;
    }

    try {
      const text = windowToText(events);
      const result = await embeddingService.embed(text);
      return result.embedding;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to embed window'
      );
      return undefined;
    }
  }

  /**
   * Check for file context shift between windows
   */
  function checkFileContextShift(
    prevWindow: BufferedEvent[],
    currWindow: BufferedEvent[]
  ): boolean {
    const prevFiles = new Set(
      prevWindow.map((e) => e.targetFile).filter((f): f is string => Boolean(f))
    );
    const currFiles = new Set(
      currWindow.map((e) => e.targetFile).filter((f): f is string => Boolean(f))
    );

    // If either has no files, can't determine shift
    if (prevFiles.size === 0 || currFiles.size === 0) {
      return false;
    }

    // Check if there's any overlap
    const overlap = setIntersection(prevFiles, currFiles);
    return overlap.size === 0;
  }

  /**
   * Check for time gap between windows
   */
  function checkTimeGap(prevWindow: BufferedEvent[], currWindow: BufferedEvent[]): boolean {
    const lastPrev = prevWindow[prevWindow.length - 1];
    const firstCurr = currWindow[0];

    if (!lastPrev || !firstCurr) {
      return false;
    }

    const gapMs = firstCurr.timestamp.getTime() - lastPrev.timestamp.getTime();
    return gapMs > config.timeGapThresholdMs;
  }

  /**
   * Detect boundary between two windows
   */
  async function detectBoundary(
    prevWindow: BufferedEvent[],
    currWindow: BufferedEvent[],
    prevEmbedding: number[] | undefined
  ): Promise<BoundaryDecision> {
    // Check time gap first (fast, no embedding needed)
    if (checkTimeGap(prevWindow, currWindow)) {
      return {
        isBoundary: true,
        confidence: 0.6,
        reason: 'time_gap',
      };
    }

    // Check file context shift (fast, no embedding needed)
    if (checkFileContextShift(prevWindow, currWindow)) {
      return {
        isBoundary: true,
        confidence: 0.7,
        reason: 'file_context_shift',
      };
    }

    // Check embedding similarity (requires embedding service)
    if (embeddingService && prevEmbedding) {
      const currEmbedding = await embedWindow(currWindow);
      if (currEmbedding) {
        const similarity = cosineSimilarity(prevEmbedding, currEmbedding);

        if (similarity < config.similarityThreshold) {
          return {
            isBoundary: true,
            confidence: 1 - similarity,
            reason: 'similarity_drop',
            similarity,
          };
        }

        return {
          isBoundary: false,
          confidence: 0,
          reason: 'none',
          similarity,
        };
      }
    }

    // No boundary detected (or couldn't compute)
    return {
      isBoundary: false,
      confidence: 0,
      reason: 'none',
    };
  }

  /**
   * Check if we should skip due to debounce
   */
  function shouldDebounce(sessionId: string): boolean {
    const lastTime = lastBoundaryTime.get(sessionId);
    if (!lastTime) {
      return false;
    }
    return Date.now() - lastTime < config.boundaryDebounceMs;
  }

  /**
   * Record boundary detection time
   */
  function recordBoundary(sessionId: string): void {
    lastBoundaryTime.set(sessionId, Date.now());
  }

  return {
    /**
     * Ingest a tool execution event
     *
     * @param event - The buffered event to process
     * @returns Detected boundary if one was found, null otherwise
     */
    async ingest(event: BufferedEvent): Promise<DetectedBoundary | null> {
      if (!config.enabled) {
        return null;
      }

      const sessionId = event.sessionId;
      const buffer = getBuffer(sessionId);

      // Add event to buffer
      buffer.push(event);

      // Check if we have enough events for boundary detection
      if (buffer.length < config.minEvents) {
        logger.trace(
          { sessionId, bufferSize: buffer.length, minEvents: config.minEvents },
          'Not enough events for boundary detection'
        );
        return null;
      }

      // Check debounce
      if (shouldDebounce(sessionId)) {
        logger.trace({ sessionId }, 'Skipping boundary check (debounced)');
        return null;
      }

      // Get windows for comparison
      const windowSize = config.windowSize;
      const currWindowStart = buffer.length - windowSize;
      const prevWindowStart = currWindowStart - windowSize;

      if (prevWindowStart < 0) {
        // Not enough events for two full windows
        return null;
      }

      const prevWindow = buffer.slice(prevWindowStart, currWindowStart);
      const currWindow = buffer.slice(currWindowStart);

      // Get or compute previous window embedding
      let prevEmbedding = windowEmbeddings.get(sessionId);
      if (!prevEmbedding && embeddingService) {
        prevEmbedding = await embedWindow(prevWindow);
        if (prevEmbedding) {
          windowEmbeddings.set(sessionId, prevEmbedding);
        }
      }

      // Detect boundary
      const decision = await detectBoundary(prevWindow, currWindow, prevEmbedding);

      if (decision.isBoundary) {
        // Record boundary time for debouncing
        recordBoundary(sessionId);

        // Generate suggested episode name
        const suggestedName = generateEpisodeNameFromEvents(currWindow);

        const boundary: DetectedBoundary = {
          timestamp: new Date(),
          sessionId,
          decision,
          windowBefore: [...prevWindow],
          windowAfter: [...currWindow],
          suggestedName,
        };

        if (config.shadowMode) {
          // Shadow mode: log and store boundaries internally for analysis
          logger.info(
            {
              sessionId,
              reason: decision.reason,
              confidence: decision.confidence,
              similarity: decision.similarity,
              suggestedName,
              prevWindowSize: prevWindow.length,
              currWindowSize: currWindow.length,
            },
            'Episode boundary detected (shadow mode)'
          );
          detectedBoundaries.push(boundary);
        } else {
          // Auto-create mode: call callback to create episodes
          // Do NOT store boundaries internally - delegate to episode service
          logger.info(
            {
              sessionId,
              reason: decision.reason,
              confidence: decision.confidence,
              similarity: decision.similarity,
              suggestedName,
            },
            'Episode boundary detected (auto-create mode)'
          );

          if (callbacks?.onBoundaryDetected) {
            try {
              await Promise.resolve(callbacks.onBoundaryDetected(boundary));
            } catch (error) {
              // Log error but don't crash - boundary detection should be resilient
              logger.error(
                {
                  sessionId,
                  error: error instanceof Error ? error.message : String(error),
                },
                'Error in onBoundaryDetected callback'
              );
            }
          }
        }

        // Update cached embedding for next comparison
        if (embeddingService) {
          const currEmbedding = await embedWindow(currWindow);
          if (currEmbedding) {
            windowEmbeddings.set(sessionId, currEmbedding);
          }
        }

        // Trim buffer to keep only current window
        sessionBuffers.set(sessionId, [...currWindow]);

        return boundary;
      }

      // No boundary - update cached embedding
      if (embeddingService && buffer.length % windowSize === 0) {
        const newEmbedding = await embedWindow(currWindow);
        if (newEmbedding) {
          windowEmbeddings.set(sessionId, newEmbedding);
        }
      }

      return null;
    },

    /**
     * Flush remaining events for a session (e.g., on session end)
     *
     * @param sessionId - The session to flush
     * @returns The remaining buffered events
     */
    flush(sessionId: string): BufferedEvent[] {
      const buffer = sessionBuffers.get(sessionId) ?? [];
      sessionBuffers.delete(sessionId);
      windowEmbeddings.delete(sessionId);
      lastBoundaryTime.delete(sessionId);
      return buffer;
    },

    /**
     * Get all detected boundaries (shadow mode)
     */
    getDetectedBoundaries(): DetectedBoundary[] {
      return [...detectedBoundaries];
    },

    /**
     * Get detected boundaries for a session
     */
    getBoundariesForSession(sessionId: string): DetectedBoundary[] {
      return detectedBoundaries.filter((b) => b.sessionId === sessionId);
    },

    /**
     * Clear all state (useful for testing)
     */
    reset(): void {
      sessionBuffers.clear();
      windowEmbeddings.clear();
      lastBoundaryTime.clear();
      detectedBoundaries.length = 0;
    },

    /**
     * Get current buffer size for a session
     */
    getBufferSize(sessionId: string): number {
      return sessionBuffers.get(sessionId)?.length ?? 0;
    },

    /**
     * Get configuration
     */
    getConfig(): BoundaryDetectorConfig {
      return { ...config };
    },
  };
}

/**
 * Boundary Detector Service type
 */
export type BoundaryDetectorService = ReturnType<typeof createBoundaryDetectorService>;
