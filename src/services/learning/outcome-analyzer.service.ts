/**
 * Outcome Analyzer Service
 *
 * LLM-based pattern detection for both success and error patterns.
 * Analyzes tool outcomes within sessions and across sessions to identify
 * best practices, recovery patterns, tool sequences, and efficiency gains.
 *
 * Renamed from ErrorAnalyzerService to reflect broader scope.
 * Maintains backward compatibility via symbol aliases.
 */

import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { createComponentLogger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import type { ToolOutcome } from '../../db/schema/tool-outcomes.js';

export type { ToolOutcome } from '../../db/schema/tool-outcomes.js';

const logger = createComponentLogger('learning:outcome-analyzer');

// ============ NEW TYPES FOR SUCCESS PATTERN ANALYSIS ============

export type PatternType = 'best_practice' | 'recovery' | 'sequence' | 'efficiency';

export interface DetectedPattern {
  patternType: PatternType;
  description: string;
  tools: string[];
  frequency: number;
  suggestedKnowledge: {
    type: 'knowledge' | 'guideline';
    title: string;
    content: string;
  };
  confidence: number;
}

export interface OutcomeAnalysisResult {
  patterns: DetectedPattern[];
  totalOutcomes: number;
  successRate: number;
  analysisTimeMs?: number;
}

export interface ComprehensiveAnalysis {
  bestPractices: DetectedPattern[];
  recoveryPatterns: DetectedPattern[];
  toolSequences: DetectedPattern[];
  efficiencyPatterns: DetectedPattern[];
  totalOutcomes: number;
  successRate: number;
  analysisTimeMs?: number;
}

// ============ LEGACY TYPES (backward compat) ============

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

export interface OutcomeAnalysisConfig {
  enabled?: boolean;
  minUniqueErrorTypes?: number;
  analysisTimeoutMs?: number;
  confidenceThreshold?: number;
  maxErrorsToAnalyze?: number;
  minOutcomesForAnalysis?: number;
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

// Legacy aliases for backward compatibility
/** @deprecated Use OutcomeAnalysisConfig */
export type ErrorAnalysisConfig = OutcomeAnalysisConfig;

type LLMProvider = 'openai' | 'anthropic' | 'ollama' | 'disabled';

// ============ LLM PROMPTS ============

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

const SUCCESS_PATTERN_PROMPT = `You are analyzing tool execution patterns from an AI coding assistant session.

Analyze these outcomes and identify:
1. Best practices: What approaches consistently succeed?
2. Recovery patterns: What workarounds succeed after failures?
3. Tool sequences: What tool combinations work well together?
4. Efficiency patterns: What approaches are faster/simpler?

Output JSON with this exact structure:
{
  "patterns": [{
    "patternType": "best_practice" | "recovery" | "sequence" | "efficiency",
    "description": "What the pattern is",
    "tools": ["tool1", "tool2"],
    "frequency": number,
    "suggestedKnowledge": {
      "type": "knowledge" | "guideline",
      "title": "Short title",
      "content": "What to remember"
    },
    "confidence": 0.0-1.0
  }],
  "noPatternDetected": boolean
}`;

// ============ INTERNAL TYPES ============

interface ErrorLogEntry {
  toolName: string;
  errorType?: string;
  errorMessage?: string;
  timestamp: string;
}

interface OutcomeLogEntry {
  toolName: string;
  outcome: string;
  outcomeType?: string;
  message?: string;
  timestamp: string;
  precedingTool?: string;
  durationMs?: number;
}

// ============ MAIN SERVICE ============

export class OutcomeAnalyzerService {
  private config: Required<OutcomeAnalysisConfig>;
  private provider: LLMProvider;
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;

  constructor(configOverrides?: OutcomeAnalysisConfig) {
    this.config = {
      enabled: configOverrides?.enabled ?? true,
      minUniqueErrorTypes: configOverrides?.minUniqueErrorTypes ?? 2,
      analysisTimeoutMs: configOverrides?.analysisTimeoutMs ?? 30000,
      confidenceThreshold: configOverrides?.confidenceThreshold ?? 0.7,
      maxErrorsToAnalyze: configOverrides?.maxErrorsToAnalyze ?? 50,
      minOutcomesForAnalysis: configOverrides?.minOutcomesForAnalysis ?? 5,
    };

    this.provider = this.selectProvider();
    this.initializeClients();

    logger.info(
      { provider: this.provider, config: this.config },
      'Outcome analyzer service initialized'
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
      logger.info('Initialized OpenAI client for outcome analysis');
    }

    if (this.provider === 'anthropic' && config.extraction.anthropicApiKey) {
      this.anthropicClient = new Anthropic({
        apiKey: config.extraction.anthropicApiKey,
        timeout: this.config.analysisTimeoutMs,
        maxRetries: 0,
      });
      logger.info('Initialized Anthropic client for outcome analysis');
    }

    if (this.provider === 'ollama') {
      logger.info(
        { baseUrl: config.extraction.ollamaBaseUrl },
        'Using Ollama for outcome analysis'
      );
    }
  }

  // ============ NEW METHODS (preferred - "pass data in" pattern) ============

  /**
   * Analyze outcomes for all pattern types
   * @param outcomes - Pre-fetched tool outcomes to analyze
   */
  async analyzeOutcomes(outcomes: ToolOutcome[]): Promise<OutcomeAnalysisResult> {
    const startTime = Date.now();

    if (this.provider === 'disabled') {
      logger.debug('Outcome analysis disabled');
      return {
        patterns: [],
        totalOutcomes: outcomes.length,
        successRate: this.calculateSuccessRate(outcomes),
      };
    }

    if (outcomes.length < this.config.minOutcomesForAnalysis) {
      logger.debug(
        { outcomeCount: outcomes.length, min: this.config.minOutcomesForAnalysis },
        'Insufficient outcomes for pattern detection'
      );
      return {
        patterns: [],
        totalOutcomes: outcomes.length,
        successRate: this.calculateSuccessRate(outcomes),
      };
    }

    try {
      const outcomeEntries = this.convertToOutcomeEntries(outcomes);
      const patterns = await this.analyzeWithSuccessLLM(outcomeEntries);

      const result: OutcomeAnalysisResult = {
        patterns: patterns.filter((p) => p.confidence >= this.config.confidenceThreshold),
        totalOutcomes: outcomes.length,
        successRate: this.calculateSuccessRate(outcomes),
        analysisTimeMs: Date.now() - startTime,
      };

      logger.info(
        { patternsFound: result.patterns.length, analysisTimeMs: result.analysisTimeMs },
        'Outcome analysis complete'
      );

      return result;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Outcome analysis failed (non-fatal)'
      );
      return {
        patterns: [],
        totalOutcomes: outcomes.length,
        successRate: this.calculateSuccessRate(outcomes),
      };
    }
  }

  /**
   * Comprehensive pattern analysis with categorization
   * @param outcomes - Pre-fetched tool outcomes to analyze
   */
  async analyzeOutcomesForPatterns(outcomes: ToolOutcome[]): Promise<ComprehensiveAnalysis> {
    const startTime = Date.now();

    if (this.provider === 'disabled' || outcomes.length < this.config.minOutcomesForAnalysis) {
      return {
        bestPractices: [],
        recoveryPatterns: [],
        toolSequences: [],
        efficiencyPatterns: [],
        totalOutcomes: outcomes.length,
        successRate: this.calculateSuccessRate(outcomes),
      };
    }

    try {
      const allPatterns = await this.analyzeOutcomes(outcomes);

      const result: ComprehensiveAnalysis = {
        bestPractices: allPatterns.patterns.filter((p) => p.patternType === 'best_practice'),
        recoveryPatterns: allPatterns.patterns.filter((p) => p.patternType === 'recovery'),
        toolSequences: allPatterns.patterns.filter((p) => p.patternType === 'sequence'),
        efficiencyPatterns: allPatterns.patterns.filter((p) => p.patternType === 'efficiency'),
        totalOutcomes: outcomes.length,
        successRate: this.calculateSuccessRate(outcomes),
        analysisTimeMs: Date.now() - startTime,
      };

      logger.info(
        {
          bestPractices: result.bestPractices.length,
          recoveryPatterns: result.recoveryPatterns.length,
          toolSequences: result.toolSequences.length,
          efficiencyPatterns: result.efficiencyPatterns.length,
        },
        'Comprehensive pattern analysis complete'
      );

      return result;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Comprehensive analysis failed (non-fatal)'
      );
      return {
        bestPractices: [],
        recoveryPatterns: [],
        toolSequences: [],
        efficiencyPatterns: [],
        totalOutcomes: outcomes.length,
        successRate: this.calculateSuccessRate(outcomes),
      };
    }
  }

  /**
   * Detect best practice patterns - consistently successful approaches
   */
  async detectBestPractices(outcomes: ToolOutcome[]): Promise<DetectedPattern[]> {
    const analysis = await this.analyzeOutcomes(outcomes);
    return analysis.patterns.filter((p) => p.patternType === 'best_practice');
  }

  /**
   * Detect recovery patterns - successful workarounds after failures
   */
  async detectRecoveryPatterns(outcomes: ToolOutcome[]): Promise<DetectedPattern[]> {
    const analysis = await this.analyzeOutcomes(outcomes);
    return analysis.patterns.filter((p) => p.patternType === 'recovery');
  }

  /**
   * Detect tool sequence patterns - effective tool combinations
   */
  async detectToolSequences(outcomes: ToolOutcome[]): Promise<DetectedPattern[]> {
    const analysis = await this.analyzeOutcomes(outcomes);
    return analysis.patterns.filter((p) => p.patternType === 'sequence');
  }

  /**
   * Detect efficiency patterns - faster/simpler approaches
   */
  async detectEfficiencyPatterns(outcomes: ToolOutcome[]): Promise<DetectedPattern[]> {
    const analysis = await this.analyzeOutcomes(outcomes);
    return analysis.patterns.filter((p) => p.patternType === 'efficiency');
  }

  /**
   * Analyze all pattern types in one call
   * @param outcomes - Pre-fetched tool outcomes
   */
  async analyzeAllPatterns(outcomes: ToolOutcome[]): Promise<ComprehensiveAnalysis> {
    return this.analyzeOutcomesForPatterns(outcomes);
  }

  // ============ LEGACY WRAPPERS (backward compat - still stubbed) ============

  /**
   * @deprecated Use analyzeOutcomes() with pre-fetched data
   * Legacy method - returns empty result (existing behavior)
   */
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
      const patterns = await this.analyzeWithErrorLLM(limitedErrors);

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

  /**
   * @deprecated Use analyzeOutcomesForPatterns() with pre-fetched data
   * Legacy method - returns empty result (existing behavior)
   */
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
      const patterns = await this.analyzeWithErrorLLM(limitedErrors);

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
        generatedBy: 'outcome-analyzer',
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

  // ============ PRIVATE METHODS ============

  private calculateSuccessRate(outcomes: ToolOutcome[]): number {
    if (outcomes.length === 0) return 0;
    const successCount = outcomes.filter((o) => o.outcome === 'success').length;
    return successCount / outcomes.length;
  }

  private convertToOutcomeEntries(outcomes: ToolOutcome[]): OutcomeLogEntry[] {
    return outcomes.map((outcome) => ({
      toolName: outcome.toolName,
      outcome: outcome.outcome,
      outcomeType: outcome.outcomeType || undefined,
      message: outcome.message || undefined,
      timestamp: outcome.createdAt,
      precedingTool: outcome.precedingToolId || undefined,
      durationMs: outcome.durationMs || undefined,
    }));
  }

  /**
   * Stubbed - returns empty array
   * @deprecated Callers should fetch data and use analyzeOutcomes()
   */
  private async fetchSessionErrors(_sessionId: string): Promise<ErrorLogEntry[]> {
    return [];
  }

  /**
   * Stubbed - returns empty array
   * @deprecated Callers should fetch data and use analyzeOutcomesForPatterns()
   */
  private async fetchProjectErrors(
    _projectId: string,
    _lookbackDays: number
  ): Promise<ErrorLogEntry[]> {
    return [];
  }

  private async analyzeWithSuccessLLM(outcomes: OutcomeLogEntry[]): Promise<DetectedPattern[]> {
    const outcomesFormatted = this.formatOutcomesForPrompt(outcomes);
    const fullPrompt = `${SUCCESS_PATTERN_PROMPT}\n\nTool outcomes from this session:\n---\n${outcomesFormatted}\n---`;

    try {
      const patterns = await this.callSuccessLLM(fullPrompt);
      return patterns;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'LLM pattern analysis failed'
      );
      return [];
    }
  }

  private async analyzeWithErrorLLM(errors: ErrorLogEntry[]): Promise<ErrorPattern[]> {
    const errorsFormatted = this.formatErrorsForPrompt(errors);
    const fullPrompt = `${ERROR_ANALYSIS_PROMPT}\n\nErrors from this session:\n---\n${errorsFormatted}\n---`;

    try {
      const patterns = await this.callErrorLLM(fullPrompt);
      return patterns;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'LLM error analysis failed'
      );
      return [];
    }
  }

  private async callSuccessLLM(prompt: string): Promise<DetectedPattern[]> {
    const timeoutPromise = new Promise<DetectedPattern[]>((resolve) => {
      setTimeout(() => {
        logger.warn({ timeoutMs: this.config.analysisTimeoutMs }, 'LLM call timed out');
        resolve([]);
      }, this.config.analysisTimeoutMs);
    });

    const analysisPromise = this.performSuccessLLMCall(prompt);
    return Promise.race([analysisPromise, timeoutPromise]);
  }

  private async callErrorLLM(prompt: string): Promise<ErrorPattern[]> {
    const timeoutPromise = new Promise<ErrorPattern[]>((resolve) => {
      setTimeout(() => {
        logger.warn({ timeoutMs: this.config.analysisTimeoutMs }, 'LLM call timed out');
        resolve([]);
      }, this.config.analysisTimeoutMs);
    });

    const analysisPromise = this.performErrorLLMCall(prompt);
    return Promise.race([analysisPromise, timeoutPromise]);
  }

  private async performSuccessLLMCall(prompt: string): Promise<DetectedPattern[]> {
    if (this.provider === 'openai' && this.openaiClient) {
      return this.callOpenAIForSuccess(prompt);
    }

    if (this.provider === 'anthropic' && this.anthropicClient) {
      return this.callAnthropicForSuccess(prompt);
    }

    if (this.provider === 'ollama') {
      return this.callOllamaForSuccess(prompt);
    }

    return [];
  }

  private async performErrorLLMCall(prompt: string): Promise<ErrorPattern[]> {
    if (this.provider === 'openai' && this.openaiClient) {
      return this.callOpenAIForErrors(prompt);
    }

    if (this.provider === 'anthropic' && this.anthropicClient) {
      return this.callAnthropicForErrors(prompt);
    }

    if (this.provider === 'ollama') {
      return this.callOllamaForErrors(prompt);
    }

    return [];
  }

  private async callOpenAIForSuccess(prompt: string): Promise<DetectedPattern[]> {
    if (!this.openaiClient) {
      return [];
    }

    try {
      const response = await this.openaiClient.chat.completions.create({
        model: config.extraction.openaiModel,
        messages: [
          { role: 'system', content: SUCCESS_PATTERN_PROMPT },
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

      return this.parseSuccessPatternResponse(content);
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'OpenAI call failed'
      );
      return [];
    }
  }

  private async callOpenAIForErrors(prompt: string): Promise<ErrorPattern[]> {
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

      return this.parseErrorAnalysisResponse(content);
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'OpenAI call failed'
      );
      return [];
    }
  }

  private async callAnthropicForSuccess(prompt: string): Promise<DetectedPattern[]> {
    if (!this.anthropicClient) {
      return [];
    }

    try {
      const response = await this.anthropicClient.messages.create({
        model: config.extraction.anthropicModel,
        max_tokens: 2000,
        system: SUCCESS_PATTERN_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        return [];
      }

      return this.parseSuccessPatternResponse(textBlock.text);
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Anthropic call failed'
      );
      return [];
    }
  }

  private async callAnthropicForErrors(prompt: string): Promise<ErrorPattern[]> {
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

      return this.parseErrorAnalysisResponse(textBlock.text);
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Anthropic call failed'
      );
      return [];
    }
  }

  private async callOllamaForSuccess(prompt: string): Promise<DetectedPattern[]> {
    const url = `${config.extraction.ollamaBaseUrl}/api/generate`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.extraction.ollamaModel,
          prompt: `${SUCCESS_PATTERN_PROMPT}\n\n${prompt}`,
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

      return this.parseSuccessPatternResponse(content);
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Ollama call failed'
      );
      return [];
    }
  }

  private async callOllamaForErrors(prompt: string): Promise<ErrorPattern[]> {
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

      return this.parseErrorAnalysisResponse(content);
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Ollama call failed'
      );
      return [];
    }
  }

  private parseSuccessPatternResponse(content: string): DetectedPattern[] {
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
      return parsed.patterns.filter((p: any) => this.isValidSuccessPattern(p));
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to parse success pattern response'
      );
      return [];
    }
  }

  private parseErrorAnalysisResponse(content: string): ErrorPattern[] {
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
      return parsed.patterns.filter((p: any) => this.isValidErrorPattern(p));
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to parse error analysis response'
      );
      return [];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private isValidSuccessPattern(pattern: any): pattern is DetectedPattern {
    return (
      typeof pattern === 'object' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.patternType === 'string' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.description === 'string' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      Array.isArray(pattern.tools) &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.frequency === 'number' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.confidence === 'number' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.suggestedKnowledge === 'object' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.suggestedKnowledge.type === 'string' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.suggestedKnowledge.title === 'string' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof pattern.suggestedKnowledge.content === 'string'
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private isValidErrorPattern(pattern: any): pattern is ErrorPattern {
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

  private formatOutcomesForPrompt(outcomes: OutcomeLogEntry[]): string {
    return outcomes
      .map((outcome, idx) => {
        const parts = [`${idx + 1}. Tool: ${outcome.toolName}`, `Outcome: ${outcome.outcome}`];

        if (outcome.outcomeType) {
          parts.push(`Type: ${outcome.outcomeType}`);
        }

        if (outcome.message) {
          const normalized = this.normalizeMessage(outcome.message);
          parts.push(`Message: ${normalized}`);
        }

        if (outcome.precedingTool) {
          parts.push(`After: ${outcome.precedingTool}`);
        }

        if (outcome.durationMs) {
          parts.push(`Duration: ${outcome.durationMs}ms`);
        }

        return parts.join(', ');
      })
      .join('\n');
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
      normalized.errorMessage = this.normalizeMessage(normalized.errorMessage);
    }

    return normalized;
  }

  private normalizeMessage(message: string): string {
    return message
      .replace(/\/Users\/[^/]+\/[^\s]+/g, '<project-path>')
      .replace(/\/[^\s]+/g, '<path>')
      .replace(/:\d+:\d+/g, '')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '<timestamp>')
      .replace(/\d{13,}/g, '<timestamp>')
      .replace(/pid \d+/g, 'pid <redacted>');
  }
}

// ============ SINGLETON PATTERN ============

let serviceInstance: OutcomeAnalyzerService | null = null;

export function getOutcomeAnalyzerService(config?: OutcomeAnalysisConfig): OutcomeAnalyzerService {
  if (!serviceInstance) {
    serviceInstance = new OutcomeAnalyzerService(config);
  }
  return serviceInstance;
}

export function resetOutcomeAnalyzerService(): void {
  serviceInstance = null;
}

// ============ BACKWARD COMPATIBILITY ALIASES (symbol-level) ============

/** @deprecated Use OutcomeAnalyzerService */
export const ErrorAnalyzerService = OutcomeAnalyzerService;

/** @deprecated Use getOutcomeAnalyzerService */
export const getErrorAnalyzerService = getOutcomeAnalyzerService;

/** @deprecated Use resetOutcomeAnalyzerService */
export const resetErrorAnalyzerService = resetOutcomeAnalyzerService;
