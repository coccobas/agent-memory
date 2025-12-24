/**
 * Experience Capture Module
 *
 * Handles extraction and recording of experiences from conversation transcripts.
 * Features:
 * - LLM extraction from transcript
 * - Trajectory extraction from steps
 * - Explicit case recording
 */

import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { createComponentLogger } from '../../utils/logger.js';
import { withRetry, isRetryableNetworkError } from '../../utils/retry.js';
import { config } from '../../config/index.js';
import type {
  TurnData,
  TurnMetrics,
  ExperienceCaptureResult,
  CaptureOptions,
  CaptureConfig,
  CaptureModule,
  RecordCaseParams,
  TrajectoryStep,
} from './types.js';
import type { IExperienceRepository, CreateExperienceInput } from '../../core/interfaces/repositories.js';
import type { Experience } from '../../db/schema.js';
import { getCaptureStateManager } from './state.js';

const logger = createComponentLogger('capture:experience');

// =============================================================================
// EXTRACTION PROMPTS
// =============================================================================

const EXPERIENCE_EXTRACTION_PROMPT = `You are an AI experience extraction assistant. Your job is to analyze conversation transcripts and identify valuable experiences worth remembering for future reference.

Extract experiences that represent:
1. **Problem-solving patterns** - How a problem was approached and solved
2. **Decision points** - Key decisions made and their rationale
3. **Successful workflows** - Effective sequences of actions
4. **Lessons learned** - Insights from failures or suboptimal approaches
5. **Tool usage patterns** - Effective use of specific tools or commands

For each experience:
- **title**: A concise, descriptive title
- **scenario**: What situation or problem was encountered
- **outcome**: What happened as a result (success, failure, partial)
- **content**: Detailed description of the experience
- **pattern**: (optional) The generalizable pattern that can be reused
- **applicability**: (optional) When this experience applies
- **trajectory**: (optional) Array of steps taken

Only extract genuinely useful experiences. Skip:
- Trivial operations without learning value
- One-off fixes unlikely to recur
- Generic debugging without specific insights
- Information that's already commonly known

Return your response as a JSON object:
{
  "experiences": [
    {
      "title": "string",
      "scenario": "string (what problem/situation was faced)",
      "outcome": "string (what happened)",
      "content": "string (detailed description)",
      "pattern": "string (optional - generalizable pattern)",
      "applicability": "string (optional - when to apply)",
      "confidence": "number (0-1, how clearly this was an experience)",
      "trajectory": [
        {
          "action": "string (what was done)",
          "observation": "string (what was observed)",
          "reasoning": "string (why this action was taken)",
          "toolUsed": "string (optional - tool/command used)",
          "success": "boolean"
        }
      ]
    }
  ]
}`;

// =============================================================================
// TYPES
// =============================================================================

interface ExtractedExperience {
  title: string;
  scenario: string;
  outcome: string;
  content: string;
  pattern?: string;
  applicability?: string;
  confidence: number;
  trajectory?: TrajectoryStep[];
}

interface ExtractionResponse {
  experiences: ExtractedExperience[];
}

export type ExperienceExtractionProvider = 'openai' | 'anthropic' | 'ollama' | 'disabled';

// =============================================================================
// EXPERIENCE CAPTURE MODULE
// =============================================================================

export class ExperienceCaptureModule implements CaptureModule<ExperienceCaptureResult> {
  private provider: ExperienceExtractionProvider;
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;
  private experienceRepo: IExperienceRepository;
  private stateManager = getCaptureStateManager();

  constructor(
    experienceRepo: IExperienceRepository,
    providerOverride?: ExperienceExtractionProvider
  ) {
    this.experienceRepo = experienceRepo;
    this.provider = providerOverride ?? (config.extraction.provider as ExperienceExtractionProvider);

    // Initialize clients based on provider
    if (this.provider === 'openai' && config.extraction.openaiApiKey) {
      this.openaiClient = new OpenAI({
        apiKey: config.extraction.openaiApiKey,
        baseURL: config.extraction.openaiBaseUrl || undefined,
        timeout: 120000,
        maxRetries: 0,
      });
    }

    if (this.provider === 'anthropic' && config.extraction.anthropicApiKey) {
      this.anthropicClient = new Anthropic({
        apiKey: config.extraction.anthropicApiKey,
        timeout: 120000,
        maxRetries: 0,
      });
    }
  }

  /**
   * Check if experience capture should be triggered
   */
  shouldCapture(metrics: TurnMetrics, captureConfig: CaptureConfig): boolean {
    if (!captureConfig.sessionEnd.enabled) {
      return false;
    }

    if (!captureConfig.sessionEnd.extractExperiences) {
      return false;
    }

    // Check minimum thresholds
    if (metrics.turnCount < captureConfig.sessionEnd.minTurns) {
      return false;
    }

    if (metrics.totalTokens < captureConfig.sessionEnd.minTokens) {
      return false;
    }

    return true;
  }

  /**
   * Capture experiences from transcript
   */
  async capture(
    transcript: TurnData[],
    metrics: TurnMetrics,
    options: CaptureOptions
  ): Promise<ExperienceCaptureResult> {
    const startTime = Date.now();
    const result: ExperienceCaptureResult = {
      experiences: [],
      skippedDuplicates: 0,
      processingTimeMs: 0,
    };

    if (this.provider === 'disabled') {
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }

    try {
      // Extract experiences from transcript using LLM
      const extracted = await this.extractExperiences(transcript, metrics);

      // Process each extracted experience
      for (const exp of extracted) {
        // Check confidence threshold
        const confidenceThreshold = options.confidenceThreshold ?? 0.7;
        if (exp.confidence < confidenceThreshold) {
          logger.debug({ title: exp.title, confidence: exp.confidence }, 'Experience below confidence threshold');
          continue;
        }

        // Check for duplicates
        if (options.skipDuplicates !== false && options.sessionId) {
          const contentHash = this.stateManager.generateContentHash(
            `${exp.title}|${exp.scenario}|${exp.outcome}`
          );

          if (this.stateManager.isDuplicateInSession(options.sessionId, contentHash)) {
            result.skippedDuplicates++;
            continue;
          }

          // Register hash before storing
          if (options.autoStore !== false) {
            this.stateManager.registerHash(
              contentHash,
              'experience',
              '', // Will be updated after creation
              options.sessionId
            );
          }
        }

        // Store experience if autoStore is enabled
        if (options.autoStore !== false) {
          try {
            const created = await this.createExperience(exp, options);
            result.experiences.push({
              experience: created,
              confidence: exp.confidence,
              source: 'observation',
            });
          } catch (error) {
            logger.error(
              { error: error instanceof Error ? error.message : String(error), title: exp.title },
              'Failed to create experience'
            );
          }
        } else {
          // Return extracted but don't store (preview mode)
          const previewExperience: Experience = {
            id: '',
            scopeType: options.scopeType,
            scopeId: options.scopeId ?? null,
            title: exp.title,
            level: 'case',
            category: null,
            currentVersionId: null,
            isActive: true,
            promotedToToolId: null,
            promotedFromId: null,
            useCount: 0,
            successCount: 0,
            lastUsedAt: null,
            createdBy: options.agentId ?? null,
            createdAt: new Date().toISOString(),
          };
          result.experiences.push({
            experience: previewExperience,
            confidence: exp.confidence,
            source: 'observation',
          });
        }
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Experience capture failed'
      );
    }

    result.processingTimeMs = Date.now() - startTime;
    return result;
  }

  /**
   * Record an explicit case experience
   */
  async recordCase(params: RecordCaseParams): Promise<ExperienceCaptureResult> {
    const startTime = Date.now();
    const result: ExperienceCaptureResult = {
      experiences: [],
      skippedDuplicates: 0,
      processingTimeMs: 0,
    };

    try {
      // Check for duplicates
      if (params.sessionId) {
        const contentHash = this.stateManager.generateContentHash(
          `${params.title}|${params.scenario}|${params.outcome}`
        );

        if (this.stateManager.isDuplicateInSession(params.sessionId, contentHash)) {
          result.skippedDuplicates = 1;
          result.processingTimeMs = Date.now() - startTime;
          return result;
        }

        this.stateManager.registerHash(contentHash, 'experience', '', params.sessionId);
      }

      // Create experience input
      const input: CreateExperienceInput = {
        scopeType: params.projectId ? 'project' : 'global',
        scopeId: params.projectId,
        title: params.title,
        level: 'case',
        category: params.category,
        content: params.content ?? `${params.scenario}\n\n${params.outcome}`,
        scenario: params.scenario,
        outcome: params.outcome,
        confidence: params.confidence ?? 0.7,
        source: params.source ?? 'user',
        createdBy: params.agentId,
        steps: params.trajectory,
      };

      const created = await this.experienceRepo.create(input);

      result.experiences.push({
        experience: created,
        confidence: params.confidence ?? 0.7,
        source: params.source === 'user' ? 'reflection' : 'observation',
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to record case'
      );
    }

    result.processingTimeMs = Date.now() - startTime;
    return result;
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * Extract experiences from transcript using LLM
   */
  private async extractExperiences(
    transcript: TurnData[],
    metrics: TurnMetrics
  ): Promise<ExtractedExperience[]> {
    const transcriptText = this.formatTranscript(transcript);

    // Add metrics context
    const context = [
      transcriptText,
      '',
      '---',
      'Session Metrics:',
      `- Total turns: ${metrics.turnCount}`,
      `- User turns: ${metrics.userTurnCount}`,
      `- Tool calls: ${metrics.toolCallCount}`,
      `- Unique tools: ${Array.from(metrics.uniqueToolsUsed).join(', ') || 'none'}`,
      `- Errors: ${metrics.errorCount}`,
    ].join('\n');

    switch (this.provider) {
      case 'openai':
        return await this.extractWithOpenAI(context);
      case 'anthropic':
        return await this.extractWithAnthropic(context);
      case 'ollama':
        return await this.extractWithOllama(context);
      default:
        return [];
    }
  }

  /**
   * Format transcript for LLM consumption
   */
  private formatTranscript(transcript: TurnData[]): string {
    return transcript.map(turn => {
      const lines: string[] = [];
      lines.push(`[${turn.role.toUpperCase()}]:`);
      lines.push(turn.content);

      if (turn.toolCalls && turn.toolCalls.length > 0) {
        lines.push('Tool calls:');
        for (const call of turn.toolCalls) {
          lines.push(`  - ${call.name}: ${call.success ? 'success' : 'failed'}`);
        }
      }

      return lines.join('\n');
    }).join('\n\n');
  }

  /**
   * Extract using OpenAI
   */
  private async extractWithOpenAI(context: string): Promise<ExtractedExperience[]> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    return withRetry(
      async () => {
        const response = await this.openaiClient!.chat.completions.create({
          model: config.extraction.openaiModel,
          messages: [
            { role: 'system', content: EXPERIENCE_EXTRACTION_PROMPT },
            { role: 'user', content: `Analyze this conversation and extract experiences:\n\n${context}` },
          ],
          response_format: { type: 'json_object' },
          temperature: config.extraction.temperature,
          max_tokens: config.extraction.maxTokens,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          return [];
        }

        return this.parseExtractionResponse(content);
      },
      {
        retryableErrors: isRetryableNetworkError,
        onRetry: (error, attempt) => {
          logger.warn({ error: error.message, attempt }, 'Retrying OpenAI experience extraction');
        },
      }
    );
  }

  /**
   * Extract using Anthropic
   */
  private async extractWithAnthropic(context: string): Promise<ExtractedExperience[]> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized');
    }

    return withRetry(
      async () => {
        const response = await this.anthropicClient!.messages.create({
          model: config.extraction.anthropicModel,
          max_tokens: config.extraction.maxTokens,
          system: EXPERIENCE_EXTRACTION_PROMPT,
          messages: [
            { role: 'user', content: `Analyze this conversation and extract experiences:\n\n${context}` },
          ],
        });

        const textBlock = response.content.find((block) => block.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          return [];
        }

        return this.parseExtractionResponse(textBlock.text);
      },
      {
        retryableErrors: isRetryableNetworkError,
        onRetry: (error, attempt) => {
          logger.warn({ error: error.message, attempt }, 'Retrying Anthropic experience extraction');
        },
      }
    );
  }

  /**
   * Extract using Ollama
   */
  private async extractWithOllama(context: string): Promise<ExtractedExperience[]> {
    const url = `${config.extraction.ollamaBaseUrl}/api/generate`;

    return withRetry(
      async () => {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: config.extraction.ollamaModel,
            prompt: `${EXPERIENCE_EXTRACTION_PROMPT}\n\nAnalyze this conversation and extract experiences:\n\n${context}`,
            format: 'json',
            stream: false,
            options: {
              temperature: config.extraction.temperature,
              num_predict: config.extraction.maxTokens,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Ollama request failed: ${response.status}`);
        }

        const data = await response.json() as { response: string };
        if (!data.response) {
          return [];
        }

        return this.parseExtractionResponse(data.response);
      },
      {
        retryableErrors: (error: Error) => {
          return (
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('fetch failed')
          );
        },
        onRetry: (error, attempt) => {
          logger.warn({ error: error.message, attempt }, 'Retrying Ollama experience extraction');
        },
      }
    );
  }

  /**
   * Parse LLM extraction response
   */
  private parseExtractionResponse(content: string): ExtractedExperience[] {
    try {
      // Handle markdown code blocks
      let jsonContent = content.trim();
      const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        jsonContent = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonContent) as ExtractionResponse;

      if (!Array.isArray(parsed.experiences)) {
        return [];
      }

      return parsed.experiences.filter(exp =>
        exp.title && exp.scenario && exp.outcome
      ).map(exp => ({
        title: exp.title,
        scenario: exp.scenario,
        outcome: exp.outcome,
        content: exp.content || `${exp.scenario}\n\n${exp.outcome}`,
        pattern: exp.pattern,
        applicability: exp.applicability,
        confidence: typeof exp.confidence === 'number'
          ? Math.min(1, Math.max(0, exp.confidence))
          : 0.5,
        trajectory: exp.trajectory,
      }));
    } catch (error) {
      logger.warn(
        { content: content.slice(0, 200) },
        'Failed to parse experience extraction response'
      );
      return [];
    }
  }

  /**
   * Create experience from extracted data
   */
  private async createExperience(
    exp: ExtractedExperience,
    options: CaptureOptions
  ): Promise<Experience> {
    const input: CreateExperienceInput = {
      scopeType: options.scopeType,
      scopeId: options.scopeId,
      title: exp.title,
      level: 'case',
      content: exp.content,
      scenario: exp.scenario,
      outcome: exp.outcome,
      pattern: exp.pattern,
      applicability: exp.applicability,
      confidence: exp.confidence,
      source: 'observation',
      createdBy: options.agentId,
      steps: exp.trajectory,
    };

    const created = await this.experienceRepo.create(input);
    // Return the experience part (without version details)
    return created;
  }
}

/**
 * Create an experience capture module instance
 */
export function createExperienceCaptureModule(
  experienceRepo: IExperienceRepository,
  providerOverride?: ExperienceExtractionProvider
): ExperienceCaptureModule {
  return new ExperienceCaptureModule(experienceRepo, providerOverride);
}
