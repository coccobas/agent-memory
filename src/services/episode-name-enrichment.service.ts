/**
 * Episode Name Enrichment Service
 *
 * Uses a small local LLM (via LM Studio) to improve episode names after completion.
 * Takes the original name, outcome, and context to generate a more descriptive name.
 *
 * Default: LM Studio with qwen2.5-1.5b-instruct model
 */

import { OpenAI } from 'openai';
import { createComponentLogger } from '../utils/logger.js';
import { config } from '../config/index.js';

const logger = createComponentLogger('episode-name-enrichment');

export type EpisodeEnrichmentProvider = 'lmstudio' | 'openai' | 'ollama' | 'disabled';

export interface EpisodeEnrichmentConfig {
  /** Provider for name enrichment (default: lmstudio) */
  provider: EpisodeEnrichmentProvider;
  /** LM Studio base URL (default: http://localhost:1234/v1) */
  lmStudioBaseUrl?: string;
  /** Model to use (default: qwen2.5-1.5b-instruct) */
  model?: string;
  /** OpenAI API key (if using openai provider) */
  openaiApiKey?: string;
  /** Ollama base URL (if using ollama provider) */
  ollamaBaseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Max tokens for response (default: 100) */
  maxTokens?: number;
  /** Temperature (default: 0.3) */
  temperature?: number;
}

export interface EnrichmentInput {
  /** Original episode name */
  originalName: string;
  /** Episode outcome description */
  outcome?: string | null;
  /** Episode outcome type (success/failure/partial/abandoned) */
  outcomeType?: string | null;
  /** Episode description */
  description?: string | null;
  /** Duration in milliseconds */
  durationMs?: number | null;
  /** Number of events in the episode */
  eventCount?: number;
}

export interface EnrichmentResult {
  /** The enriched/improved name */
  enrichedName: string;
  /** Whether enrichment was performed */
  wasEnriched: boolean;
  /** Provider used */
  provider: EpisodeEnrichmentProvider;
  /** Model used */
  model: string;
  /** Original name (for reference) */
  originalName: string;
}

/**
 * Episode Name Enrichment Service
 *
 * Improves episode names using a small local LLM to make them more descriptive
 * and meaningful based on the episode's outcome and context.
 */
export class EpisodeNameEnrichmentService {
  private provider: EpisodeEnrichmentProvider;
  private lmStudioClient: OpenAI | null = null;
  private openaiClient: OpenAI | null = null;
  private model: string;
  private ollamaBaseUrl: string;
  private timeoutMs: number;
  private maxTokens: number;
  private temperature: number;

  constructor(serviceConfig?: Partial<EpisodeEnrichmentConfig>) {
    const effectiveConfig: EpisodeEnrichmentConfig = {
      provider:
        serviceConfig?.provider ??
        (config.episodeEnrichment?.provider as EpisodeEnrichmentProvider) ??
        'lmstudio',
      lmStudioBaseUrl:
        serviceConfig?.lmStudioBaseUrl ??
        config.episodeEnrichment?.lmStudioBaseUrl ??
        'http://localhost:1234/v1',
      model: serviceConfig?.model ?? config.episodeEnrichment?.model ?? 'qwen/qwen3-1.7b',
      openaiApiKey: serviceConfig?.openaiApiKey ?? config.episodeEnrichment?.openaiApiKey,
      ollamaBaseUrl:
        serviceConfig?.ollamaBaseUrl ??
        config.episodeEnrichment?.ollamaBaseUrl ??
        'http://localhost:11434',
      timeoutMs: serviceConfig?.timeoutMs ?? config.episodeEnrichment?.timeoutMs ?? 30000,
      maxTokens: serviceConfig?.maxTokens ?? config.episodeEnrichment?.maxTokens ?? 100,
      temperature: serviceConfig?.temperature ?? config.episodeEnrichment?.temperature ?? 0.3,
    };

    this.provider = effectiveConfig.provider;
    this.model = effectiveConfig.model!;
    this.ollamaBaseUrl = effectiveConfig.ollamaBaseUrl!;
    this.timeoutMs = effectiveConfig.timeoutMs!;
    this.maxTokens = effectiveConfig.maxTokens!;
    this.temperature = effectiveConfig.temperature!;

    if (this.provider === 'lmstudio') {
      this.lmStudioClient = new OpenAI({
        apiKey: 'lm-studio',
        baseURL: effectiveConfig.lmStudioBaseUrl,
        timeout: this.timeoutMs,
        maxRetries: 0,
      });
      logger.debug(
        { baseUrl: effectiveConfig.lmStudioBaseUrl, model: this.model },
        'LM Studio client initialized for episode enrichment'
      );
    } else if (this.provider === 'openai' && effectiveConfig.openaiApiKey) {
      this.openaiClient = new OpenAI({
        apiKey: effectiveConfig.openaiApiKey,
        timeout: this.timeoutMs,
        maxRetries: 0,
      });
    }
  }

  /**
   * Check if the service is enabled and ready
   */
  isEnabled(): boolean {
    if (this.provider === 'disabled') return false;
    if (this.provider === 'lmstudio') return this.lmStudioClient !== null;
    if (this.provider === 'openai') return this.openaiClient !== null;
    if (this.provider === 'ollama') return true;
    return false;
  }

  /**
   * Get the current provider
   */
  getProvider(): EpisodeEnrichmentProvider {
    return this.provider;
  }

  /**
   * Enrich an episode name based on its outcome and context
   */
  async enrichName(input: EnrichmentInput): Promise<EnrichmentResult> {
    const defaultResult: EnrichmentResult = {
      enrichedName: input.originalName,
      wasEnriched: false,
      provider: this.provider,
      model: this.model,
      originalName: input.originalName,
    };

    if (!this.isEnabled()) {
      logger.debug('Episode name enrichment LLM is disabled, trying template fallback');
      return this.templateEnrich(input);
    }

    if (input.originalName.length > 50) {
      logger.debug(
        { originalName: input.originalName },
        'Original name already descriptive, skipping enrichment'
      );
      return defaultResult;
    }

    if (!input.outcome && !input.description) {
      logger.debug('No outcome or description to enrich from');
      return defaultResult;
    }

    try {
      const prompt = this.buildPrompt(input);
      const enrichedName = await this.callLLM(prompt);

      if (enrichedName && enrichedName !== input.originalName) {
        logger.info(
          { original: input.originalName, enriched: enrichedName, provider: this.provider },
          'Episode name enriched'
        );
        return {
          enrichedName,
          wasEnriched: true,
          provider: this.provider,
          model: this.model,
          originalName: input.originalName,
        };
      }

      return defaultResult;
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          originalName: input.originalName,
        },
        'Failed to enrich episode name via LLM, trying template fallback'
      );
      return this.templateEnrich(input);
    }
  }

  /**
   * Build the prompt for the LLM
   */
  private buildPrompt(input: EnrichmentInput): string {
    const parts: string[] = [
      'Improve this episode name to be more descriptive and specific.',
      'Keep it concise (under 60 characters).',
      'Use past tense verbs (e.g., "Fixed", "Implemented", "Refactored").',
      'Be specific about what was accomplished.',
      '',
      `Original name: "${input.originalName}"`,
    ];

    if (input.outcome) {
      parts.push(`Outcome: ${input.outcome}`);
    }

    if (input.outcomeType) {
      parts.push(`Result: ${input.outcomeType}`);
    }

    if (input.description) {
      parts.push(`Description: ${input.description}`);
    }

    if (input.durationMs) {
      const minutes = Math.round(input.durationMs / 60000);
      if (minutes > 0) {
        parts.push(`Duration: ${minutes} minute${minutes === 1 ? '' : 's'}`);
      }
    }

    parts.push('');
    parts.push('Respond with ONLY the improved name, nothing else.');

    return parts.join('\n');
  }

  /**
   * Call the LLM based on configured provider
   */
  private async callLLM(prompt: string): Promise<string | null> {
    switch (this.provider) {
      case 'lmstudio':
        return this.callLMStudio(prompt);
      case 'openai':
        return this.callOpenAI(prompt);
      case 'ollama':
        return this.callOllama(prompt);
      default:
        return null;
    }
  }

  /**
   * Call LM Studio (OpenAI-compatible API)
   */
  private async callLMStudio(prompt: string): Promise<string | null> {
    if (!this.lmStudioClient) return null;

    const response = await this.lmStudioClient.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a concise technical writer. Respond with only the improved text, no explanations.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    });

    const content = response.choices[0]?.message?.content?.trim();
    return this.cleanResponse(content);
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(prompt: string): Promise<string | null> {
    if (!this.openaiClient) return null;

    const response = await this.openaiClient.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a concise technical writer. Respond with only the improved text, no explanations.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    });

    const content = response.choices[0]?.message?.content?.trim();
    return this.cleanResponse(content);
  }

  /**
   * Call Ollama API
   */
  private async callOllama(prompt: string): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: `You are a concise technical writer. Respond with only the improved text, no explanations.\n\n${prompt}`,
          stream: false,
          options: {
            temperature: this.temperature,
            num_predict: this.maxTokens,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = (await response.json()) as { response?: string };
      return this.cleanResponse(data.response);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Clean and validate the LLM response
   */
  private cleanResponse(content: string | undefined | null): string | null {
    if (!content) return null;

    let cleaned = content.trim();

    const thinkPattern = /<think>[\s\S]*?<\/think>/g;
    cleaned = cleaned.replace(thinkPattern, '').trim();

    const openThinkIdx = cleaned.indexOf('<think>');
    if (openThinkIdx >= 0) {
      cleaned = cleaned.substring(0, openThinkIdx).trim();
    }

    if (cleaned.length === 0) return null;

    const isQuoted =
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"));
    if (isQuoted) {
      cleaned = cleaned.slice(1, -1);
    }

    const newlineIdx = cleaned.indexOf('\n');
    if (newlineIdx > 0) {
      cleaned = cleaned.substring(0, newlineIdx).trim();
    }

    const isValidLength = cleaned.length >= 3 && cleaned.length <= 100;
    return isValidLength ? cleaned : null;
  }

  private templateEnrich(input: EnrichmentInput): EnrichmentResult {
    const { originalName, outcome, outcomeType } = input;

    if (!outcome || outcome === originalName) {
      return {
        enrichedName: originalName,
        wasEnriched: false,
        provider: 'disabled',
        model: 'template',
        originalName,
      };
    }

    const verbPrefixes = [
      'Fixed',
      'Implemented',
      'Added',
      'Updated',
      'Refactored',
      'Removed',
      'Created',
      'Configured',
      'Resolved',
      'Debugged',
      'Tested',
      'Deployed',
      'Migrated',
      'Optimized',
    ];

    const outcomeStart = outcome.split(' ')[0] ?? '';
    const startsWithVerb = verbPrefixes.some((v) => outcomeStart.toLowerCase() === v.toLowerCase());

    let enrichedName: string;
    if (startsWithVerb) {
      enrichedName = outcome.slice(0, 60);
    } else if (outcomeType === 'success') {
      enrichedName = `Completed: ${outcome.slice(0, 50)}`;
    } else if (outcomeType === 'failure') {
      enrichedName = `Failed: ${outcome.slice(0, 52)}`;
    } else if (outcomeType === 'partial') {
      enrichedName = `Partial: ${outcome.slice(0, 51)}`;
    } else {
      enrichedName = outcome.slice(0, 60);
    }

    logger.debug(
      { original: originalName, enriched: enrichedName, method: 'template' },
      'Episode name enriched via template'
    );

    return {
      enrichedName,
      wasEnriched: enrichedName !== originalName,
      provider: 'disabled',
      model: 'template',
      originalName,
    };
  }
}

let defaultService: EpisodeNameEnrichmentService | null = null;

/**
 * Get the default episode name enrichment service instance
 */
export function getEpisodeNameEnrichmentService(): EpisodeNameEnrichmentService {
  if (!defaultService) {
    defaultService = new EpisodeNameEnrichmentService();
  }
  return defaultService;
}

/**
 * Reset the default service (for testing)
 */
export function resetEpisodeNameEnrichmentService(): void {
  defaultService = null;
}
