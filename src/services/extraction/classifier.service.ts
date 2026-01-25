/**
 * Lightweight LLM Classifier Service
 *
 * Uses a small local LLM (via LM Studio) for fast classification of text
 * into guideline/knowledge/tool categories. Designed for:
 *
 * - Zero-shot classification (no few-shot examples needed)
 * - No-think mode (fast inference, ~100-300ms)
 * - Background async processing
 * - Auto-store (≥0.85) vs suggestion (0.70-0.85) logic
 *
 * @module extraction/classifier
 */

import { OpenAI } from 'openai';
import { createComponentLogger } from '../../utils/logger.js';
import { config as appConfig } from '../../config/index.js';

const logger = createComponentLogger('classifier-service');

// =============================================================================
// TYPES
// =============================================================================

export type ClassificationType = 'guideline' | 'knowledge' | 'tool' | 'none';

export interface ClassificationResult {
  /** Classified type */
  type: ClassificationType;
  /** Confidence score 0-1 */
  confidence: number;
  /** Brief reasoning from LLM */
  reasoning?: string;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Whether this should be auto-stored (confidence >= 0.85) */
  autoStore: boolean;
  /** Whether this should be surfaced as suggestion (0.70 <= confidence < 0.85) */
  suggest: boolean;
}

export interface ClassifierConfig {
  /** LM Studio base URL (default: http://localhost:1234/v1) */
  baseUrl: string;
  /** Model name (default: qwen3-1.7b) */
  model: string;
  /** Request timeout in ms (default: 5000) */
  timeoutMs: number;
  /** Temperature for inference (default: 0.1 for deterministic) */
  temperature: number;
  /** Max tokens for response (default: 100) */
  maxTokens: number;
  /** Confidence threshold for auto-store (default: 0.85) */
  autoStoreThreshold: number;
  /** Confidence threshold for suggestion (default: 0.70) */
  suggestThreshold: number;
  /** Enable service (default: true) */
  enabled: boolean;
}

/**
 * Get default classifier config from centralized config registry.
 * Falls back to hardcoded defaults if registry values are unavailable.
 */
export function getDefaultClassifierConfig(): ClassifierConfig {
  return {
    baseUrl: appConfig.classifier.baseUrl,
    model: appConfig.classifier.model,
    timeoutMs: appConfig.classifier.timeoutMs,
    temperature: appConfig.classifier.temperature,
    maxTokens: appConfig.classifier.maxTokens,
    autoStoreThreshold: appConfig.classifier.autoStoreThreshold,
    suggestThreshold: appConfig.classifier.suggestThreshold,
    enabled: appConfig.classifier.enabled,
  };
}

/** @deprecated Use getDefaultClassifierConfig() for dynamic config */
export const DEFAULT_CLASSIFIER_CONFIG: ClassifierConfig = {
  baseUrl: 'http://localhost:1234/v1',
  model: 'qwen3-1.7b',
  timeoutMs: 5000,
  temperature: 0.1,
  maxTokens: 150,
  autoStoreThreshold: 0.85,
  suggestThreshold: 0.7,
  enabled: true,
};

// =============================================================================
// CLASSIFICATION PROMPT
// =============================================================================

/**
 * Few-shot classification prompt with improved category definitions.
 * Designed for Qwen3 with /no_think suffix to disable extended thinking.
 *
 * Key improvements:
 * - Clear distinction between guideline (prescriptive) and knowledge (descriptive)
 * - Few-shot examples covering edge cases
 * - Explicit signals for each category
 */
const CLASSIFICATION_PROMPT = `/no_think
Classify into exactly one type. Respond with JSON only.

## Types

**guideline**: PRESCRIPTIVE rules that tell you what to do or not do.
- Signals: "must", "should", "always", "never", "don't", "required", "avoid", "prefer", "use X instead of Y"
- Pattern: "All X must/should Y", "X is required for/before Y", "Don't use X", "Use X instead of Y"
- Key test: Does it PRESCRIBE behavior? → guideline

**knowledge**: DESCRIPTIVE facts about systems, decisions, or architecture.
- Signals: "uses", "works by", "decided to", "because", "the system", "architecture", "is X", "are X"
- Includes: configuration values, limits, technical specifications, version info
- Key test: Does it DESCRIBE what exists or a technical fact? → knowledge

**tool**: Shell/CLI commands executable in terminal.
- Must start with: npm, git, docker, yarn, curl, make, cargo, pip, brew, etc.
- Example: "npm run build", "git status", "docker-compose up"

**none**: Questions, greetings, or unclassifiable text.
- Example: "Hello", "What is X?", "Can you help me?"

## Examples

"All functions must have return type annotations" → guideline (prescribes what functions must have)
"Code reviews are required before merging" → guideline (prescribes a requirement)
"Always use descriptive variable names" → guideline ("Always" = prescriptive)
"Always use TypeScript strict mode" → guideline ("Always" = prescriptive instruction)
"Use Prettier for formatting" → guideline (imperative "Use" = instruction)
"We use TypeScript strict mode" → knowledge ("We use" describes current state)
"The auth system uses JWT tokens" → knowledge (describes architecture)
"We decided to use Vitest because it's faster" → knowledge (describes a decision)
"The API rate limit is 100 requests per minute" → knowledge (technical specification)
"Tokens expire after 24 hours" → knowledge (configuration fact)
"npm run test" → tool (CLI command)
"What's the best way to do X?" → none (question)

## Classify

"{TEXT}"

{"type":"...", "confidence":0.0-1.0}`;

// =============================================================================
// CLASSIFIER SERVICE
// =============================================================================

export class ClassifierService {
  private client: OpenAI | null = null;
  private config: ClassifierConfig;
  private available: boolean = false;

  constructor(classifierConfig?: Partial<ClassifierConfig>) {
    this.config = { ...getDefaultClassifierConfig(), ...classifierConfig };

    if (this.config.enabled) {
      this.initializeClient();
    }
  }

  /**
   * Initialize OpenAI client for LM Studio.
   */
  private initializeClient(): void {
    try {
      this.client = new OpenAI({
        apiKey: 'lm-studio',
        baseURL: this.config.baseUrl,
        timeout: this.config.timeoutMs,
        maxRetries: 0,
      });
      this.available = true;
      logger.info(
        { baseUrl: this.config.baseUrl, model: this.config.model },
        'Classifier service initialized'
      );
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to initialize classifier client'
      );
      this.available = false;
    }
  }

  /**
   * Check if classifier is available.
   */
  isAvailable(): boolean {
    return this.config.enabled && this.available && this.client !== null;
  }

  /**
   * Get current configuration.
   */
  getConfig(): ClassifierConfig {
    return { ...this.config };
  }

  /**
   * Classify text into guideline/knowledge/tool/none.
   *
   * @param text - Text to classify
   * @returns Classification result with confidence and action flags
   */
  async classify(text: string): Promise<ClassificationResult> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      return {
        type: 'none',
        confidence: 0,
        reasoning: 'Classifier service not available',
        processingTimeMs: Date.now() - startTime,
        autoStore: false,
        suggest: false,
      };
    }

    if (text.length < 10) {
      return {
        type: 'none',
        confidence: 0,
        reasoning: 'Text too short',
        processingTimeMs: Date.now() - startTime,
        autoStore: false,
        suggest: false,
      };
    }

    const truncatedText = text.length > 500 ? text.slice(0, 500) + '...' : text;
    const prompt = CLASSIFICATION_PROMPT.replace('{TEXT}', truncatedText);

    try {
      const response = await this.client!.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from classifier');
      }

      const result = this.parseResponse(content);
      const processingTimeMs = Date.now() - startTime;

      const autoStore =
        result.type !== 'none' && result.confidence >= this.config.autoStoreThreshold;
      const suggest =
        result.type !== 'none' && !autoStore && result.confidence >= this.config.suggestThreshold;

      logger.debug(
        {
          type: result.type,
          confidence: result.confidence,
          processingTimeMs,
          autoStore,
          suggest,
        },
        'Classification complete'
      );

      return {
        ...result,
        processingTimeMs,
        autoStore,
        suggest,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          processingTimeMs,
        },
        'Classification failed'
      );

      return {
        type: 'none',
        confidence: 0,
        reasoning: `Classification error: ${error instanceof Error ? error.message : String(error)}`,
        processingTimeMs,
        autoStore: false,
        suggest: false,
      };
    }
  }

  /**
   * Parse LLM JSON response.
   */
  private parseResponse(content: string): {
    type: ClassificationType;
    confidence: number;
    reasoning?: string;
  } {
    try {
      let jsonStr = content.trim();

      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```(?:json)?\n?/g, '').trim();
      }

      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        type?: string;
        confidence?: string | number;
        reasoning?: string;
      };

      const validTypes: ClassificationType[] = ['guideline', 'knowledge', 'tool', 'none'];
      const parsedType = typeof parsed.type === 'string' ? parsed.type : '';
      const type: ClassificationType = validTypes.includes(parsedType as ClassificationType)
        ? (parsedType as ClassificationType)
        : 'none';

      const rawConfidence = parsed.confidence;
      let confidence =
        typeof rawConfidence === 'number'
          ? rawConfidence
          : parseFloat(String(rawConfidence ?? '0'));
      if (isNaN(confidence) || confidence < 0 || confidence > 1) {
        confidence = 0;
      }

      return {
        type,
        confidence,
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : undefined,
      };
    } catch (error) {
      logger.debug(
        { content, error: error instanceof Error ? error.message : String(error) },
        'Failed to parse classifier response'
      );
      return {
        type: 'none',
        confidence: 0,
        reasoning: 'Failed to parse response',
      };
    }
  }

  /**
   * Check if LM Studio is reachable.
   */
  async healthCheck(): Promise<{ available: boolean; latencyMs: number; error?: string }> {
    if (!this.client) {
      return { available: false, latencyMs: 0, error: 'Client not initialized' };
    }

    const startTime = Date.now();
    try {
      await this.client.models.list();
      return {
        available: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        available: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let defaultClassifier: ClassifierService | null = null;

/**
 * Create a new ClassifierService instance.
 */
export function createClassifierService(config?: Partial<ClassifierConfig>): ClassifierService {
  return new ClassifierService(config);
}

/**
 * Get or create the default classifier service.
 */
export function getDefaultClassifierService(): ClassifierService {
  if (!defaultClassifier) {
    defaultClassifier = new ClassifierService(getDefaultClassifierConfig());
  }
  return defaultClassifier;
}

/**
 * Reset the default classifier (for testing).
 */
export function resetDefaultClassifierService(): void {
  defaultClassifier = null;
}
