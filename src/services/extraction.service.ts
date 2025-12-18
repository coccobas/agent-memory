/**
 * Extraction service for LLM-based memory extraction
 *
 * Supports:
 * - OpenAI API (GPT-4o-mini, GPT-4o, etc.)
 * - Anthropic API (Claude 3.5 Sonnet, etc.)
 * - Local LLM via Ollama
 * - Disabled mode (returns empty extractions)
 */

import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { createComponentLogger } from '../utils/logger.js';
import { withRetry, isRetryableNetworkError } from '../utils/retry.js';
import { config } from '../config/index.js';

const logger = createComponentLogger('extraction');

export type ExtractionProvider = 'openai' | 'anthropic' | 'ollama' | 'disabled';

export interface ExtractedEntry {
  type: 'guideline' | 'knowledge' | 'tool';
  name?: string; // For tools/guidelines
  title?: string; // For knowledge
  content: string;
  category?: string;
  priority?: number; // For guidelines (0-100)
  confidence: number; // 0-1
  rationale?: string; // Why this was extracted
  suggestedTags?: string[];
}

export interface ExtractionResult {
  entries: ExtractedEntry[];
  model: string;
  provider: ExtractionProvider;
  tokensUsed?: number;
  processingTimeMs: number;
}

export interface ExtractionInput {
  context: string; // Raw conversation/code context
  contextType?: 'conversation' | 'code' | 'mixed';
  focusAreas?: ('decisions' | 'facts' | 'rules' | 'tools')[];
  existingSummary?: string; // Previous context for continuity
  scopeHint?: {
    // Scope context for better extraction
    projectName?: string;
    language?: string;
    domain?: string;
  };
}

// =============================================================================
// EXTRACTION PROMPTS
// =============================================================================

const EXTRACTION_SYSTEM_PROMPT = `You are an AI memory extraction assistant. Your job is to analyze conversation or code context and extract structured memory entries.

Extract the following types of entries:
1. **Guidelines** - Rules, standards, or patterns that should be followed (e.g., "always use TypeScript strict mode", "never commit secrets")
2. **Knowledge** - Facts, decisions, or context worth remembering (e.g., "We chose PostgreSQL because...", "The API uses REST not GraphQL")
3. **Tools** - Commands, scripts, or tool patterns that could be reused (e.g., "npm run build", "docker compose up")

For each extraction:
- Assign a confidence score (0-1) based on how clearly the information was stated
- Use kebab-case for names/identifiers
- Be specific and actionable
- Include rationale when the "why" is mentioned
- Suggest 2-3 relevant tags

Only extract genuinely useful information. Skip:
- Temporary debugging steps
- One-off commands that won't be reused
- Information already commonly known
- Vague or ambiguous statements

Return your response as a JSON object with this exact structure:
{
  "guidelines": [
    {
      "name": "string (kebab-case identifier)",
      "content": "string (the guideline rule text)",
      "category": "string (one of: code_style, security, architecture, workflow, testing)",
      "priority": "number (0-100, where 100 is critical)",
      "rationale": "string (why this guideline exists, if mentioned)",
      "confidence": "number (0-1)",
      "suggestedTags": ["string"]
    }
  ],
  "knowledge": [
    {
      "title": "string (descriptive title)",
      "content": "string (the knowledge content)",
      "category": "string (one of: decision, fact, context, reference)",
      "confidence": "number (0-1)",
      "source": "string (where this knowledge came from)",
      "suggestedTags": ["string"]
    }
  ],
  "tools": [
    {
      "name": "string (tool/command name)",
      "description": "string (what the tool does)",
      "category": "string (one of: cli, function, api, mcp)",
      "confidence": "number (0-1)",
      "suggestedTags": ["string"]
    }
  ]
}`;

function buildUserPrompt(input: ExtractionInput): string {
  const parts: string[] = [];

  parts.push(`Analyze the following ${input.contextType || 'mixed'} context and extract memory entries.`);
  parts.push('');

  if (input.scopeHint?.projectName) {
    parts.push(`Project: ${input.scopeHint.projectName}`);
  }
  if (input.scopeHint?.language) {
    parts.push(`Language: ${input.scopeHint.language}`);
  }
  if (input.scopeHint?.domain) {
    parts.push(`Domain: ${input.scopeHint.domain}`);
  }
  if (input.focusAreas?.length) {
    parts.push(`Focus on extracting: ${input.focusAreas.join(', ')}`);
  }
  if (input.existingSummary) {
    parts.push('');
    parts.push('Previous context summary:');
    parts.push(input.existingSummary);
  }

  parts.push('');
  parts.push('Context to analyze:');
  parts.push('"""');
  parts.push(input.context);
  parts.push('"""');
  parts.push('');
  parts.push('Return a JSON object with arrays for "guidelines", "knowledge", and "tools".');
  parts.push('If no entries of a particular type are found, return an empty array for that type.');

  return parts.join('\n');
}

// =============================================================================
// EXTRACTION SERVICE
// =============================================================================

// Track if we've already warned about missing API keys (avoid spam in tests)
let hasWarnedAboutProvider = false;

class ExtractionService {
  private provider: ExtractionProvider;
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;
  private openaiModel: string;
  private anthropicModel: string;
  private ollamaBaseUrl: string;
  private ollamaModel: string;

  constructor() {
    // Get provider from centralized config
    this.provider = config.extraction.provider;

    // Warn once if disabled
    if (this.provider === 'disabled' && !hasWarnedAboutProvider) {
      logger.warn('Extraction provider is disabled. Set AGENT_MEMORY_EXTRACTION_PROVIDER to enable.');
      hasWarnedAboutProvider = true;
    }

    this.openaiModel = config.extraction.openaiModel;
    this.anthropicModel = config.extraction.anthropicModel;
    this.ollamaBaseUrl = config.extraction.ollamaBaseUrl;
    this.ollamaModel = config.extraction.ollamaModel;

    // Initialize OpenAI client if using OpenAI (or OpenAI-compatible like LM Studio)
    if (this.provider === 'openai' && config.extraction.openaiApiKey) {
      const openaiOptions: { apiKey: string; baseURL?: string } = {
        apiKey: config.extraction.openaiApiKey,
      };
      // Allow custom base URL for LM Studio, LocalAI, or other OpenAI-compatible APIs
      if (config.extraction.openaiBaseUrl) {
        openaiOptions.baseURL = config.extraction.openaiBaseUrl;
      }
      this.openaiClient = new OpenAI(openaiOptions);
    }

    // Initialize Anthropic client if using Anthropic
    if (this.provider === 'anthropic' && config.extraction.anthropicApiKey) {
      this.anthropicClient = new Anthropic({ apiKey: config.extraction.anthropicApiKey });
    }
  }

  /**
   * Get the current extraction provider
   */
  getProvider(): ExtractionProvider {
    return this.provider;
  }

  /**
   * Check if extraction is available
   */
  isAvailable(): boolean {
    return this.provider !== 'disabled';
  }

  /**
   * Extract memory entries from context
   */
  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    if (this.provider === 'disabled') {
      return {
        entries: [],
        model: 'disabled',
        provider: 'disabled',
        processingTimeMs: 0,
      };
    }

    // Validate input
    if (!input.context || input.context.trim().length === 0) {
      throw new Error('Cannot extract from empty context');
    }

    const startTime = Date.now();

    try {
      let result: ExtractionResult;

      switch (this.provider) {
        case 'openai':
          result = await this.extractOpenAI(input);
          break;
        case 'anthropic':
          result = await this.extractAnthropic(input);
          break;
        case 'ollama':
          result = await this.extractOllama(input);
          break;
        default:
          throw new Error(`Unknown extraction provider: ${this.provider}`);
      }

      result.processingTimeMs = Date.now() - startTime;

      logger.debug(
        {
          provider: result.provider,
          model: result.model,
          entriesExtracted: result.entries.length,
          processingTimeMs: result.processingTimeMs,
        },
        'Extraction completed'
      );

      return result;
    } catch (error) {
      logger.error(
        {
          provider: this.provider,
          error: error instanceof Error ? error.message : String(error),
        },
        'Extraction failed'
      );
      throw error;
    }
  }

  /**
   * Extract using OpenAI API
   */
  private async extractOpenAI(input: ExtractionInput): Promise<ExtractionResult> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized. Check AGENT_MEMORY_OPENAI_API_KEY.');
    }

    return withRetry(
      async () => {
        const response = await this.openaiClient!.chat.completions.create({
          model: this.openaiModel,
          messages: [
            { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(input) },
          ],
          response_format: { type: 'json_object' },
          temperature: config.extraction.temperature,
          max_tokens: config.extraction.maxTokens,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No content returned from OpenAI');
        }

        const parsed = this.parseExtractionResponse(content);

        return {
          entries: parsed,
          model: this.openaiModel,
          provider: 'openai' as const,
          tokensUsed: response.usage?.total_tokens,
          processingTimeMs: 0, // Will be set by caller
        };
      },
      {
        retryableErrors: isRetryableNetworkError,
        onRetry: (error, attempt) => {
          logger.warn({ error: error.message, attempt }, 'Retrying OpenAI extraction');
        },
      }
    );
  }

  /**
   * Extract using Anthropic API
   */
  private async extractAnthropic(input: ExtractionInput): Promise<ExtractionResult> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized. Check AGENT_MEMORY_ANTHROPIC_API_KEY.');
    }

    return withRetry(
      async () => {
        const response = await this.anthropicClient!.messages.create({
          model: this.anthropicModel,
          max_tokens: config.extraction.maxTokens,
          system: EXTRACTION_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildUserPrompt(input) }],
        });

        // Extract text content from response
        const textBlock = response.content.find((block) => block.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          throw new Error('No text content returned from Anthropic');
        }

        const parsed = this.parseExtractionResponse(textBlock.text);

        return {
          entries: parsed,
          model: this.anthropicModel,
          provider: 'anthropic' as const,
          tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
          processingTimeMs: 0, // Will be set by caller
        };
      },
      {
        retryableErrors: isRetryableNetworkError,
        onRetry: (error, attempt) => {
          logger.warn({ error: error.message, attempt }, 'Retrying Anthropic extraction');
        },
      }
    );
  }

  /**
   * Extract using Ollama (local LLM)
   */
  private async extractOllama(input: ExtractionInput): Promise<ExtractionResult> {
    const url = `${this.ollamaBaseUrl}/api/generate`;

    return withRetry(
      async () => {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.ollamaModel,
            prompt: `${EXTRACTION_SYSTEM_PROMPT}\n\n${buildUserPrompt(input)}`,
            format: 'json',
            stream: false,
            options: {
              temperature: config.extraction.temperature,
              num_predict: config.extraction.maxTokens,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as { response: string };
        if (!data.response) {
          throw new Error('No response from Ollama');
        }

        const parsed = this.parseExtractionResponse(data.response);

        return {
          entries: parsed,
          model: this.ollamaModel,
          provider: 'ollama' as const,
          processingTimeMs: 0, // Will be set by caller
        };
      },
      {
        retryableErrors: (error: Error) => {
          // Retry on connection errors to Ollama
          return (
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('fetch failed') ||
            error.message.includes('network')
          );
        },
        onRetry: (error, attempt) => {
          logger.warn({ error: error.message, attempt }, 'Retrying Ollama extraction');
        },
      }
    );
  }

  /**
   * Parse and normalize extraction response from LLM
   */
  private parseExtractionResponse(content: string): ExtractedEntry[] {
    // Try to extract JSON from the response (handle markdown code blocks)
    let jsonContent = content.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonContent = jsonMatch[1].trim();
    }

    // Parse JSON
    let parsed: {
      guidelines?: Array<{
        name?: string;
        content?: string;
        category?: string;
        priority?: number;
        rationale?: string;
        confidence?: number;
        suggestedTags?: string[];
      }>;
      knowledge?: Array<{
        title?: string;
        content?: string;
        category?: string;
        confidence?: number;
        source?: string;
        suggestedTags?: string[];
      }>;
      tools?: Array<{
        name?: string;
        description?: string;
        category?: string;
        confidence?: number;
        suggestedTags?: string[];
      }>;
    };

    try {
      parsed = JSON.parse(jsonContent) as typeof parsed;
    } catch (error) {
      logger.warn({ content: jsonContent.slice(0, 200) }, 'Failed to parse extraction response as JSON');
      return [];
    }

    const entries: ExtractedEntry[] = [];

    // Normalize guidelines
    if (Array.isArray(parsed.guidelines)) {
      for (const g of parsed.guidelines) {
        if (g.name && g.content) {
          entries.push({
            type: 'guideline',
            name: this.toKebabCase(g.name),
            content: g.content,
            category: g.category,
            priority: typeof g.priority === 'number' ? Math.min(100, Math.max(0, g.priority)) : undefined,
            confidence: typeof g.confidence === 'number' ? Math.min(1, Math.max(0, g.confidence)) : 0.5,
            rationale: g.rationale,
            suggestedTags: g.suggestedTags,
          });
        }
      }
    }

    // Normalize knowledge
    if (Array.isArray(parsed.knowledge)) {
      for (const k of parsed.knowledge) {
        if (k.title && k.content) {
          entries.push({
            type: 'knowledge',
            title: k.title,
            content: k.content,
            category: k.category,
            confidence: typeof k.confidence === 'number' ? Math.min(1, Math.max(0, k.confidence)) : 0.5,
            rationale: k.source, // Map source to rationale for consistency
            suggestedTags: k.suggestedTags,
          });
        }
      }
    }

    // Normalize tools
    if (Array.isArray(parsed.tools)) {
      for (const t of parsed.tools) {
        if (t.name && t.description) {
          entries.push({
            type: 'tool',
            name: this.toKebabCase(t.name),
            content: t.description,
            category: t.category,
            confidence: typeof t.confidence === 'number' ? Math.min(1, Math.max(0, t.confidence)) : 0.5,
            suggestedTags: t.suggestedTags,
          });
        }
      }
    }

    return entries;
  }

  /**
   * Convert string to kebab-case
   */
  private toKebabCase(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let extractionService: ExtractionService | null = null;

/**
 * Get the singleton extraction service instance
 */
export function getExtractionService(): ExtractionService {
  if (!extractionService) {
    extractionService = new ExtractionService();
  }
  return extractionService;
}

/**
 * Reset the extraction service (useful for testing)
 */
export function resetExtractionService(): void {
  extractionService = null;
  hasWarnedAboutProvider = false;
}
