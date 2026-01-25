/**
 * Background Classification Queue
 *
 * Processes text classification asynchronously to avoid blocking the main flow.
 * Messages that don't match regex patterns are queued for LLM classification.
 *
 * @module extraction/classifier-queue
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { ClassifierService, ClassificationResult } from './classifier.service.js';
import { getDefaultClassifierService } from './classifier.service.js';

const logger = createComponentLogger('classifier-queue');

export interface QueuedClassification {
  id: string;
  text: string;
  context: ClassificationContext;
  queuedAt: number;
  result?: ClassificationResult;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface ClassificationContext {
  sessionId: string;
  projectId?: string;
  agentId?: string;
  messageRole?: 'user' | 'assistant';
}

export interface ClassificationQueueConfig {
  maxQueueSize: number;
  processingIntervalMs: number;
  maxConcurrent: number;
  enabled: boolean;
  fallbackThreshold: number;
  fallbackEnabled: boolean;
}

export const DEFAULT_QUEUE_CONFIG: ClassificationQueueConfig = {
  maxQueueSize: 100,
  processingIntervalMs: 100,
  maxConcurrent: 3,
  enabled: true,
  fallbackThreshold: 0.7,
  fallbackEnabled: true,
};

export type FallbackClassifier = (
  text: string
) => Promise<{ type: 'guideline' | 'knowledge' | 'tool'; confidence: number; reasoning?: string }>;

type ClassificationCallback = (result: QueuedClassification) => void | Promise<void>;

export class ClassificationQueue {
  private queue: Map<string, QueuedClassification> = new Map();
  private processing: Set<string> = new Set();
  private classifier: ClassifierService;
  private config: ClassificationQueueConfig;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private callbacks: ClassificationCallback[] = [];
  private idCounter: number = 0;
  private fallbackClassifier: FallbackClassifier | null = null;

  constructor(config?: Partial<ClassificationQueueConfig>, classifier?: ClassifierService) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
    this.classifier = classifier ?? getDefaultClassifierService();

    if (this.config.enabled) {
      this.startProcessing();
    }
  }

  setFallbackClassifier(fallback: FallbackClassifier): void {
    this.fallbackClassifier = fallback;
    logger.debug('Fallback classifier configured');
  }

  enqueue(text: string, context: ClassificationContext): string {
    if (!this.config.enabled) {
      return '';
    }

    if (this.queue.size >= this.config.maxQueueSize) {
      const oldest = this.queue.keys().next().value;
      if (oldest) {
        this.queue.delete(oldest);
        logger.debug({ droppedId: oldest }, 'Queue full, dropped oldest item');
      }
    }

    const id = `clf_${Date.now()}_${++this.idCounter}`;
    const item: QueuedClassification = {
      id,
      text,
      context,
      queuedAt: Date.now(),
      status: 'pending',
    };

    this.queue.set(id, item);
    logger.debug({ id, textLength: text.length }, 'Queued for classification');

    return id;
  }

  onComplete(callback: ClassificationCallback): void {
    this.callbacks.push(callback);
  }

  getResult(id: string): QueuedClassification | undefined {
    return this.queue.get(id);
  }

  getCompletedResults(): QueuedClassification[] {
    return Array.from(this.queue.values()).filter(
      (item) => item.status === 'completed' && item.result
    );
  }

  clearCompleted(): void {
    for (const [id, item] of this.queue.entries()) {
      if (item.status === 'completed' || item.status === 'failed') {
        this.queue.delete(id);
      }
    }
  }

  getStats(): {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  } {
    let pending = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;

    for (const item of this.queue.values()) {
      switch (item.status) {
        case 'pending':
          pending++;
          break;
        case 'processing':
          processing++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
      }
    }

    return { pending, processing, completed, failed, total: this.queue.size };
  }

  private startProcessing(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      void this.processNext();
    }, this.config.processingIntervalMs);

    logger.debug({ intervalMs: this.config.processingIntervalMs }, 'Queue processing started');
  }

  private async processNext(): Promise<void> {
    if (this.processing.size >= this.config.maxConcurrent) {
      return;
    }

    const nextItem = Array.from(this.queue.values()).find(
      (item) => item.status === 'pending' && !this.processing.has(item.id)
    );

    if (!nextItem) return;

    this.processing.add(nextItem.id);
    nextItem.status = 'processing';

    try {
      let result = await this.classifier.classify(nextItem.text);

      const needsFallback =
        this.config.fallbackEnabled &&
        this.fallbackClassifier &&
        (result.type === 'none' || result.confidence < this.config.fallbackThreshold);

      if (needsFallback) {
        logger.debug(
          {
            id: nextItem.id,
            localType: result.type,
            localConfidence: result.confidence,
            threshold: this.config.fallbackThreshold,
          },
          'Low confidence from local classifier, falling back to main LLM'
        );

        try {
          const fallbackResult = await this.fallbackClassifier!(nextItem.text);
          const startTime = Date.now();
          const autoStoreThreshold = this.config.fallbackThreshold + 0.15;

          result = {
            type: fallbackResult.type,
            confidence: fallbackResult.confidence,
            reasoning: fallbackResult.reasoning,
            processingTimeMs: result.processingTimeMs + (Date.now() - startTime),
            autoStore: fallbackResult.confidence >= autoStoreThreshold,
            suggest:
              fallbackResult.confidence >= this.config.fallbackThreshold &&
              fallbackResult.confidence < autoStoreThreshold,
          };

          logger.debug(
            {
              id: nextItem.id,
              fallbackType: result.type,
              fallbackConfidence: result.confidence,
            },
            'Fallback classification completed'
          );
        } catch (fallbackError) {
          logger.warn(
            {
              id: nextItem.id,
              error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            },
            'Fallback classification failed, using local result'
          );
        }
      }

      nextItem.result = result;
      nextItem.status = 'completed';

      logger.debug(
        {
          id: nextItem.id,
          type: result.type,
          confidence: result.confidence,
          autoStore: result.autoStore,
          suggest: result.suggest,
          processingTimeMs: result.processingTimeMs,
          usedFallback: needsFallback,
        },
        'Classification completed'
      );

      await this.notifyCallbacks(nextItem);
    } catch (error) {
      nextItem.status = 'failed';
      nextItem.error = error instanceof Error ? error.message : String(error);
      logger.warn({ id: nextItem.id, error: nextItem.error }, 'Classification failed');
    } finally {
      this.processing.delete(nextItem.id);
    }
  }

  private async notifyCallbacks(item: QueuedClassification): Promise<void> {
    for (const callback of this.callbacks) {
      try {
        await callback(item);
      } catch (error) {
        logger.warn(
          { id: item.id, error: error instanceof Error ? error.message : String(error) },
          'Callback error'
        );
      }
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.debug('Queue processing stopped');
    }
  }

  clear(): void {
    this.queue.clear();
    this.processing.clear();
  }
}

let defaultQueue: ClassificationQueue | null = null;

export function createClassificationQueue(
  config?: Partial<ClassificationQueueConfig>,
  classifier?: ClassifierService
): ClassificationQueue {
  return new ClassificationQueue(config, classifier);
}

export function getDefaultClassificationQueue(): ClassificationQueue {
  if (!defaultQueue) {
    defaultQueue = new ClassificationQueue();
  }
  return defaultQueue;
}

export function resetDefaultClassificationQueue(): void {
  if (defaultQueue) {
    defaultQueue.stop();
    defaultQueue.clear();
    defaultQueue = null;
  }
}
