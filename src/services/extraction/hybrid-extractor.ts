/**
 * Hybrid Extraction Service
 *
 * Combines regex fast path with LLM classifier fallback for optimal accuracy and UX.
 *
 * Flow:
 * 1. Regex patterns scan immediately (~1ms)
 * 2. High-confidence matches (≥0.85) → auto-store immediately
 * 3. No match or low confidence → queue for LLM classification (async, ~100-300ms)
 * 4. LLM results: ≥0.85 auto-store, 0.70-0.85 suggest, <0.70 discard
 *
 * @module extraction/hybrid-extractor
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { IExtractionHookService, ExtractionSuggestion } from '../extraction-hook.service.js';
import { ExtractionHookService } from '../extraction-hook.service.js';
import type {
  ClassificationQueue,
  QueuedClassification,
  ClassificationContext,
  FallbackClassifier,
} from './classifier-queue.js';
import { getDefaultClassificationQueue } from './classifier-queue.js';
import { config } from '../../config/index.js';

const logger = createComponentLogger('hybrid-extractor');

export interface HybridExtractionResult {
  regexMatches: ExtractionSuggestion[];
  queuedForLlm: boolean;
  queueId?: string;
  autoStoreCount: number;
  suggestCount: number;
}

export interface PendingSuggestion {
  id: string;
  type: 'guideline' | 'knowledge' | 'tool';
  title: string;
  content: string;
  confidence: number;
  source: 'regex' | 'llm';
  context: ClassificationContext;
  createdAt: number;
}

export interface HybridExtractorConfig {
  regexThreshold: number;
  llmAutoStoreThreshold: number;
  llmSuggestThreshold: number;
  enabled: boolean;
  fallbackThreshold?: number;
  fallbackEnabled?: boolean;
}

export const DEFAULT_HYBRID_CONFIG: HybridExtractorConfig = {
  regexThreshold: 0.85,
  llmAutoStoreThreshold: 0.85,
  llmSuggestThreshold: 0.7,
  enabled: true,
};

export class HybridExtractor {
  private hookService: IExtractionHookService;
  private classificationQueue: ClassificationQueue;
  private config: HybridExtractorConfig;
  private pendingSuggestions: Map<string, PendingSuggestion> = new Map();
  private autoStoreCallback?: (suggestion: PendingSuggestion) => Promise<void>;
  private suggestionCallback?: (suggestion: PendingSuggestion) => void;

  constructor(
    hybridConfig?: Partial<HybridExtractorConfig>,
    hookService?: IExtractionHookService,
    queue?: ClassificationQueue
  ) {
    this.config = { ...DEFAULT_HYBRID_CONFIG, ...hybridConfig };
    this.hookService = hookService ?? new ExtractionHookService(config);
    this.classificationQueue = queue ?? getDefaultClassificationQueue();

    this.classificationQueue.onComplete((result) => this.handleLlmResult(result));
  }

  onAutoStore(callback: (suggestion: PendingSuggestion) => Promise<void>): void {
    this.autoStoreCallback = callback;
  }

  onSuggestion(callback: (suggestion: PendingSuggestion) => void): void {
    this.suggestionCallback = callback;
  }

  setFallbackClassifier(fallback: FallbackClassifier): void {
    this.classificationQueue.setFallbackClassifier(fallback);
  }

  async extract(text: string, context: ClassificationContext): Promise<HybridExtractionResult> {
    if (!this.config.enabled) {
      return {
        regexMatches: [],
        queuedForLlm: false,
        autoStoreCount: 0,
        suggestCount: 0,
      };
    }

    const regexResult = await this.hookService.scan(text);

    const highConfidenceMatches = regexResult.suggestions.filter(
      (s) => s.confidence >= this.config.regexThreshold
    );

    let autoStoreCount = 0;
    let suggestCount = 0;

    for (const match of highConfidenceMatches) {
      const suggestion: PendingSuggestion = {
        id: match.hash,
        type: match.type,
        title: match.title,
        content: match.content,
        confidence: match.confidence,
        source: 'regex',
        context,
        createdAt: Date.now(),
      };

      if (match.confidence >= this.config.llmAutoStoreThreshold) {
        autoStoreCount++;
        if (this.autoStoreCallback) {
          try {
            await this.autoStoreCallback(suggestion);
            logger.debug(
              { type: match.type, title: match.title, confidence: match.confidence },
              'Auto-stored from regex match'
            );
          } catch (error) {
            logger.warn(
              { error: error instanceof Error ? error.message : String(error) },
              'Auto-store callback failed'
            );
          }
        }
      } else {
        suggestCount++;
        this.pendingSuggestions.set(suggestion.id, suggestion);
        if (this.suggestionCallback) {
          this.suggestionCallback(suggestion);
        }
      }
    }

    let queuedForLlm = false;
    let queueId: string | undefined;

    const hasLowConfidenceMatches = regexResult.suggestions.some(
      (s) => s.confidence < this.config.regexThreshold
    );
    const noMatches = regexResult.suggestions.length === 0 && !regexResult.skipped;

    if (hasLowConfidenceMatches || noMatches) {
      queueId = this.classificationQueue.enqueue(text, context);
      queuedForLlm = !!queueId;
      logger.debug(
        { queueId, reason: noMatches ? 'no_regex_match' : 'low_confidence' },
        'Queued for LLM classification'
      );
    }

    return {
      regexMatches: regexResult.suggestions,
      queuedForLlm,
      queueId,
      autoStoreCount,
      suggestCount,
    };
  }

  private async handleLlmResult(result: QueuedClassification): Promise<void> {
    if (!result.result || result.result.type === 'none') {
      return;
    }

    const { type, confidence, reasoning } = result.result;

    const suggestion: PendingSuggestion = {
      id: result.id,
      type: type as 'guideline' | 'knowledge' | 'tool',
      title: this.generateTitle(result.text, type),
      content: result.text,
      confidence,
      source: 'llm',
      context: result.context,
      createdAt: Date.now(),
    };

    if (result.result.autoStore) {
      logger.debug(
        { type, confidence, title: suggestion.title },
        'Auto-storing from LLM classification'
      );
      if (this.autoStoreCallback) {
        try {
          await this.autoStoreCallback(suggestion);
        } catch (error) {
          logger.warn(
            { error: error instanceof Error ? error.message : String(error) },
            'Auto-store callback failed for LLM result'
          );
        }
      }
    } else if (result.result.suggest) {
      logger.debug(
        { type, confidence, title: suggestion.title, reasoning },
        'Surfacing LLM classification as suggestion'
      );
      this.pendingSuggestions.set(suggestion.id, suggestion);
      if (this.suggestionCallback) {
        this.suggestionCallback(suggestion);
      }
    }
  }

  private generateTitle(text: string, type: string): string {
    const firstLine = text.split('\n')[0] || text;
    const truncated = firstLine.length > 50 ? firstLine.slice(0, 47) + '...' : firstLine;
    return (
      truncated.replace(/^(we\s+)?(always|never|should|must)\s+/i, '').trim() || `${type} entry`
    );
  }

  getPendingSuggestions(): PendingSuggestion[] {
    return Array.from(this.pendingSuggestions.values());
  }

  approveSuggestion(id: string): PendingSuggestion | undefined {
    const suggestion = this.pendingSuggestions.get(id);
    if (suggestion) {
      this.pendingSuggestions.delete(id);
    }
    return suggestion;
  }

  rejectSuggestion(id: string): boolean {
    return this.pendingSuggestions.delete(id);
  }

  clearSuggestions(): void {
    this.pendingSuggestions.clear();
  }

  getStats(): {
    pendingSuggestions: number;
    queueStats: ReturnType<ClassificationQueue['getStats']>;
  } {
    return {
      pendingSuggestions: this.pendingSuggestions.size,
      queueStats: this.classificationQueue.getStats(),
    };
  }
}

let defaultHybridExtractor: HybridExtractor | null = null;

export function createHybridExtractor(
  config?: Partial<HybridExtractorConfig>,
  hookService?: IExtractionHookService,
  queue?: ClassificationQueue
): HybridExtractor {
  return new HybridExtractor(config, hookService, queue);
}

export function getDefaultHybridExtractor(): HybridExtractor {
  if (!defaultHybridExtractor) {
    defaultHybridExtractor = new HybridExtractor();
  }
  return defaultHybridExtractor;
}

export function resetDefaultHybridExtractor(): void {
  defaultHybridExtractor = null;
}
