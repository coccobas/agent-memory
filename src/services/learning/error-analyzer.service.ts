/**
 * Error Analyzer Service
 *
 * LLM-based error pattern detection and corrective entry generation.
 * Analyzes tool errors within sessions and across sessions to identify
 * recurring mistakes and suggest corrective guidelines/knowledge.
 */

import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { createComponentLogger } from '../../utils/logger.js';
import { config } from '../../config/index.js';

const logger = createComponentLogger('learning:error-analyzer');

export interface GuidelineEntry {
  type: 'guideline';
  name: string;
  content: string;
  category: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

export interface KnowledgeEntry {
  type: 'knowledge';
  title: string;
  content: string;
  category: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

export interface ErrorAnalysisConfig {
  enabled?: boolean;
  minUniqueErrorTypes?: number;
  analysisTimeoutMs?: number;
  confidenceThreshold?: number;
  maxErrorsToAnalyze?: number;
}

export interface ErrorPattern {
  patternType: 'wrong_path' | 'missing_dependency' | 'config_error' | 'permission' | 'other';
  description: string;
  frequency: number;
  suggestedCorrection: {
    type: 'knowledge' | 'guideline';
    title: string;
    content: string;
  };
  confidence: number;
}

export interface AnalysisResult {
  sessionId: string;
  patterns: ErrorPattern[];
  analysisTimeMs?: number;
}

export interface CrossSessionAnalysisResult {
  projectId: string;
  lookbackDays: number;
  patterns: ErrorPattern[];
  analysisTimeMs?: number;
}

type LLMProvider = 'openai' | 'anthropic' | 'ollama' | 'disabled';

const ERROR_ANALYSIS_PROMPT = `You are analyzing tool errors from an AI coding assistant session.

Analyze these errors and identify:
1. Are there repeated mistakes (same conceptual error)?
2. What is the agent doing wrong?
3. What corrective knowledge would prevent this?

Output JSON with this exact structure:
{
  "patterns": [{
    "patternType": "wrong_path" | "missing_dependency" | "config_error" | "permission" | "other",
    "description": "What the agent keeps getting wrong",
    "frequency": number,
    "suggestedCorrection": {
      "type": "knowledge" | "guideline",
      "title": "Short title",
      "content": "Corrective content"
    },
    "confidence": 0.0-1.0
  }],
  "noPatternDetected": boolean
}`;

interface ErrorLogEntry {
  toolName: string;
  errorType?: string;
  errorMessage?: string;
  timestamp: string;
}

export class ErrorAnalyzerService {
  private config: Required<ErrorAnalysisConfig>;
  private provider: LLMProvider;
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;

  constructor(configOverrides?: ErrorAnalysisConfig) {
    this.config = {
      enabled: configOverrides?.enabled ?? true,
      minUniqueErrorTypes: configOverrides?.minUniqueErrorTypes ?? 2,
      analysisTimeoutMs: configOverrides?.analysisTimeoutMs ?? 30000,
      confidenceThreshold: configOverrides?.confidenceThreshold ?? 0.7,
      maxErrorsToAnalyze: configOverrides?.maxErrorsToAnalyze ?? 50,
    };

    this.provider = this.selectProvider();
    this.initializeClients();

    logger.info(
      { provider: this.provider, config: this.config },
      'Error analyzer service initialized'
    );
  }

  private selectProvider(): LLMProvider {
    if (!this.config.enabled) {
      return 'disabled';
    }

    if (config.extraction.openaiApiKey) {
      return 'openai';
    }

    if (config.extraction.anthropicApiKey) {
      return 'anthropic';
    }

    return 'ollama';
  }

  private initializeClients(): void {
    if (this.provider === 'openai' && config.extraction.openaiApiKey) {
      this.openaiClient = new OpenAI({
        apiKey: config.extraction.openaiApiKey,
        baseURL: config.extraction.openaiBaseUrl || undefined,
        timeout: this.config.analysisTimeoutMs,
        maxRetries: 0,
      });
      logger.info('Initialized OpenAI client for error analysis');
    }

    if (this.provider === 'anthropic' && config.extraction.anthropicApiKey) {
      this.anthropicClient = new Anthropic({
        apiKey: config.extraction.anthropicApiKey,
        timeout: this.config.analysisTimeoutMs,
        maxRetries: 0,
      });
      logger.info('Initialized Anthropic client for error analysis');
    }

    if (this.provider === 'ollama') {
      logger.info({ baseUrl: config.extraction.ollamaBaseUrl }, 'Using Ollama for error analysis');
    }
  }

  async analyzeSessionErrors(sessionId: string): Promise<AnalysisResult> {
    const startTime = Date.now();
    const result: AnalysisResult = {
      sessionId,
      patterns: [],
    };

    if (this.provider === 'disabled') {
      logger.debug({ sessionId }, 'Error analysis disabled');
      return result;
    }

    try {
      const errors = await this.fetchSessionErrors(sessionId);

      if (errors.length < this.config.minUniqueErrorTypes) {
        logger.debug(
          { sessionId, errorCount: errors.length, min: this.config.minUniqueErrorTypes },
          'Insufficient errors for pattern detection'
        );
        return result;
      }

      const limitedErrors = errors.slice(0, this.config.maxErrorsToAnalyze);
      const patterns = await this.analyzeWithLLM(limitedErrors);

      result.patterns = patterns.filter((p) => p.confidence >= this.config.confidenceThreshold);
      result.analysisTimeMs = Date.now() - startTime;

      logger.info(
        { sessionId, patternsFound: result.patterns.length, analysisTimeMs: result.analysisTimeMs },
        'Session error analysis complete'
      );
    } catch (error) {
      logger.warn(
        {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Error analysis failed (non-fatal)'
      );
    }

    return result;
  }

  async analyzeCrossSessionPatterns(
    projectId: string,
    lookbackDays: number
  ): Promise<CrossSessionAnalysisResult> {
    const startTime = Date.now();
    const result: CrossSessionAnalysisResult = {
      projectId,
      lookbackDays,
      patterns: [],
    };

    if (this.provider === 'disabled') {
      logger.debug({ projectId }, 'Error analysis disabled');
      return result;
    }

    try {
      const errors = await this.fetchProjectErrors(projectId, lookbackDays);

      if (errors.length < this.config.minUniqueErrorTypes) {
        logger.debug(
          { projectId, lookbackDays, errorCount: errors.length },
          'Insufficient errors for cross-session pattern detection'
        );
        return result;
      }

      const limitedErrors = errors.slice(0, this.config.maxErrorsToAnalyze);
      const patterns = await this.analyzeWithLLM(limitedErrors);

      result.patterns = patterns.filter((p) => p.confidence >= this.config.confidenceThreshold);
      result.analysisTimeMs = Date.now() - startTime;

      logger.info(
        {
          projectId,
          lookbackDays,
          patternsFound: result.patterns.length,
          analysisTimeMs: result.analysisTimeMs,
        },
        'Cross-session error analysis complete'
      );
    } catch (error) {
      logger.warn(
        {
          projectId,
          lookbackDays,
          error: error instanceof Error ? error.message : String(error),
        },
        'Cross-session error analysis failed (non-fatal)'
      );
    }

    return result;
  }

  async generateCorrectiveEntry(pattern: ErrorPattern): Promise<KnowledgeEntry | GuidelineEntry> {
    const baseEntry = {
      category: 'error-correction',
      metadata: {
        errorPatternType: pattern.patternType,
        frequency: pattern.frequency,
        confidence: pattern.confidence,
        generatedBy: 'error-analyzer',
      },
    };

    if (pattern.suggestedCorrection.type === 'guideline') {
      return {
        type: 'guideline',
        name: pattern.suggestedCorrection.title,
        content: pattern.suggestedCorrection.content,
        ...baseEntry,
      } as GuidelineEntry;
    }

    return {
      type: 'knowledge',
      title: pattern.suggestedCorrection.title,
      content: pattern.suggestedCorrection.content,
      ...baseEntry,
    } as KnowledgeEntry;
  }

  private async fetchSessionErrors(_sessionId: string): Promise<ErrorLogEntry[]> {
    return [];
  }

  private async fetchProjectErrors(
    _projectId: string,
    _lookbackDays: number
  ): Promise<ErrorLogEntry[]> {
    return [];
  }

  private async analyzeWithLLM(errors: ErrorLogEntry[]): Promise<ErrorPattern[]> {
    const errorsFormatted = this.formatErrorsForPrompt(errors);
    const fullPrompt = `${ERROR_ANALYSIS_PROMPT}\n\nErrors from this session:\n---\n${errorsFormatted}\n---`;

    try {
      const patterns = await this.callLLM(fullPrompt);
      return patterns;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'LLM analysis failed'
      );
      return [];
    }
  }

  private async callLLM(prompt: string): Promise<ErrorPattern[]> {
    const timeoutPromise = new Promise<ErrorPattern[]>((resolve) => {
      setTimeout(() => {
        logger.warn({ timeoutMs: this.config.analysisTimeoutMs }, 'LLM call timed out');
        resolve([]);
      }, this.config.analysisTimeoutMs);
    });

    const analysisPromise = this.performLLMCall(prompt);

    return Promise.race([analysisPromise, timeoutPromise]);
  }

  private async performLLMCall(prompt: string): Promise<ErrorPattern[]> {
    if (this.provider === 'openai' && this.openaiClient) {
      return this.callOpenAI(prompt);
    }

    if (this.provider === 'anthropic' && this.anthropicClient) {
      return this.callAnthropic(prompt);
    }

    if (this.provider === 'ollama') {
      return this.callOllama(prompt);
    }

    return [];
  }

  private async callOpenAI(prompt: string): Promise<ErrorPattern[]> {
    if (!this.openaiClient) {
      return [];
    }

    try {
      const response = await this.openaiClient.chat.completions.create({
        model: config.extraction.openaiModel,
        messages: [
          { role: 'system', content: ERROR_ANALYSIS_PROMPT },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return [];
      }

      return this.parseAnalysisResponse(content);
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'OpenAI call failed'
      );
      return [];
    }
  }

  private async callAnthropic(prompt: string): Promise<ErrorPattern[]> {
    if (!this.anthropicClient) {
      return [];
    }

    try {
      const response = await this.anthropicClient.messages.create({
        model: config.extraction.anthropicModel,
        max_tokens: 2000,
        system: ERROR_ANALYSIS_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        return [];
      }

      return this.parseAnalysisResponse(textBlock.text);
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Anthropic call failed'
      );
      return [];
    }
  }

  private async callOllama(prompt: string): Promise<ErrorPattern[]> {
    const url = `${config.extraction.ollamaBaseUrl}/api/generate`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.extraction.ollamaModel,
          prompt: `${ERROR_ANALYSIS_PROMPT}\n\n${prompt}`,
          stream: false,
          format: 'json',
          options: {
            temperature: 0.3,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = (await response.json()) as { response?: string };
      const content = data.response;

      if (!content) {
        return [];
      }

      return this.parseAnalysisResponse(content);
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Ollama call failed'
      );
      return [];
    }
  }

  private parseAnalysisResponse(content: string): ErrorPattern[] {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(content);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (parsed.noPatternDetected === true) {
        return [];
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!Array.isArray(parsed.patterns)) {
        return [];
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
      return parsed.patterns.filter((p: any) => this.isValidPattern(p));
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to parse LLM response'
      );
      return [];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private isValidPattern(pattern: any): pattern is ErrorPattern {
    return (
      typeof pattern === 'object' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.patternType === 'string' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.description === 'string' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.frequency === 'number' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.confidence === 'number' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.suggestedCorrection === 'object' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.suggestedCorrection.type === 'string' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.suggestedCorrection.title === 'string' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.suggestedCorrection.content === 'string'
    );
  }

  private formatErrorsForPrompt(errors: ErrorLogEntry[]): string {
    return errors
      .map((err, idx) => {
        const normalized = this.normalizeError(err);
        return `${idx + 1}. Tool: ${normalized.toolName}, Type: ${normalized.errorType}, Message: ${normalized.errorMessage}`;
      })
      .join('\n');
  }

  private normalizeError(error: ErrorLogEntry): ErrorLogEntry {
    const normalized = { ...error };

    if (normalized.errorMessage) {
      normalized.errorMessage = normalized.errorMessage
        .replace(/\/Users\/[^/]+\/[^\s]+/g, '<project-path>')
        .replace(/\/[^\s]+/g, '<path>')
        .replace(/:\d+:\d+/g, '')
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '<timestamp>')
        .replace(/\d{13,}/g, '<timestamp>')
        .replace(/pid \d+/g, 'pid <redacted>');
    }

    return normalized;
  }
}

let serviceInstance: ErrorAnalyzerService | null = null;

export function getErrorAnalyzerService(config?: ErrorAnalysisConfig): ErrorAnalyzerService {
  if (!serviceInstance) {
    serviceInstance = new ErrorAnalyzerService(config);
  }
  return serviceInstance;
}

export function resetErrorAnalyzerService(): void {
  serviceInstance = null;
}
