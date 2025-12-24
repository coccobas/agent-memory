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

// Security: Maximum context size to prevent DoS and API quota exhaustion
const MAX_CONTEXT_LENGTH = 100000; // 100KB limit

// Security: Allowed OpenAI-compatible hosts (add your approved hosts here)
// localhost only allowed in development mode, not production
const ALLOWED_OPENAI_HOSTS = ['api.openai.com', 'api.anthropic.com'];

/**
 * Detect integer IP format to prevent SSRF bypass
 * Examples: 2130706433 (decimal for 127.0.0.1), 0x7f000001 (hex)
 *
 * Security: Prevents SSRF bypass via integer IP representation
 */
function isIntegerIpFormat(hostname: string): boolean {
  return /^\d+$/.test(hostname) || /^0x[0-9a-fA-F]+$/i.test(hostname);
}

/**
 * Validate URL for SSRF protection.
 * Rejects private IP ranges and ensures only approved protocols.
 *
 * Security: Prevents Server-Side Request Forgery attacks.
 */
function validateExternalUrl(urlString: string, allowPrivate: boolean = false): void {
  const url = new URL(urlString);

  // Check protocol
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Invalid URL scheme: ${url.protocol}. Only http/https allowed.`);
  }

  if (!allowPrivate) {
    // Check for private/internal IP ranges
    const hostname = url.hostname.toLowerCase();

    // Security: Block integer IP format before pattern checks
    if (isIntegerIpFormat(hostname)) {
      throw new Error(
        `SSRF protection: Integer IP format not allowed: ${hostname}. Use standard dotted notation.`
      );
    }

    // IPv4 private patterns
    const privatePatterns = [
      /^127\./, // 127.0.0.0/8 (loopback)
      /^10\./, // 10.0.0.0/8 (private)
      /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12 (private)
      /^192\.168\./, // 192.168.0.0/16 (private)
      /^169\.254\./, // 169.254.0.0/16 (link-local, AWS metadata)
      /^0\.0\.0\.0$/, // 0.0.0.0
      /^localhost$/i, // localhost
    ];

    // IPv6 private patterns
    const ipv6PrivatePatterns = [
      /^\[?::1\]?$/i, // IPv6 loopback
      /^\[?fe80:/i, // link-local
      /^\[?fc[0-9a-f]{2}:/i, // unique local (fc00::/7)
      /^\[?fd[0-9a-f]{2}:/i, // unique local (fd00::/8)
      /^\[?ff[0-9a-f]{2}:/i, // multicast (ff00::/8)
    ];

    for (const pattern of privatePatterns) {
      if (pattern.test(hostname)) {
        throw new Error(`SSRF protection: Private/internal addresses not allowed: ${hostname}`);
      }
    }

    for (const pattern of ipv6PrivatePatterns) {
      if (pattern.test(hostname)) {
        throw new Error(`SSRF protection: Private/internal IPv6 addresses not allowed: ${hostname}`);
      }
    }
  }
}

/**
 * Validate model name to prevent injection attacks.
 * Model names should only contain safe characters.
 *
 * Security: Prevents injection via malicious model names.
 */
function isValidModelName(modelName: string): boolean {
  // Allow alphanumeric, hyphens, underscores, colons (for tags like llama:7b), and dots
  // Examples: llama2, llama:7b, gpt-4-turbo, mistral-7b-instruct-v0.2
  const validPattern = /^[a-zA-Z0-9._:-]+$/;
  return validPattern.test(modelName) && modelName.length <= 100;
}

/**
 * Read response body with size limit to prevent memory exhaustion.
 * Streams the response and aborts if it exceeds the maximum size.
 *
 * Security: Prevents memory exhaustion from malicious or oversized responses.
 */
async function readResponseWithLimit(
  response: Response,
  maxSizeBytes: number,
  abortController: AbortController
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;

      // Security: Abort if response exceeds size limit
      if (totalBytes > maxSizeBytes) {
        abortController.abort();
        throw new Error(
          `Response exceeds maximum size of ${maxSizeBytes} bytes (received ${totalBytes} bytes)`
        );
      }

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
 * Validate OpenAI-compatible base URL against allowlist.
 * When using custom base URLs, credentials may be sent to that server.
 *
 * Security: Prevents credential exposure to untrusted servers.
 * Set AGENT_MEMORY_EXTRACTION_STRICT_ALLOWLIST=true to enforce blocking.
 */
function validateOpenAIBaseUrl(baseUrl: string | undefined): void {
  if (!baseUrl) return; // Default API URL is fine

  const url = new URL(baseUrl);
  const hostname = url.hostname.toLowerCase();

  // Security: Only allow localhost in development mode (NODE_ENV !== 'production')
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      throw new Error(
        `SSRF protection: localhost/127.0.0.1 not allowed in production. ` +
          `Use a public hostname or deploy with NODE_ENV !== 'production' for development.`
      );
    }
    logger.debug({ baseUrl }, 'Using local OpenAI-compatible endpoint (development mode)');
    return;
  }

  // Check against allowlist
  if (!ALLOWED_OPENAI_HOSTS.includes(hostname)) {
    // Strict mode: block non-allowlisted hosts (recommended for production)
    if (config.extraction.strictBaseUrlAllowlist) {
      throw new Error(
        `OpenAI base URL not allowed: ${hostname}. ` +
          `Allowed hosts: ${ALLOWED_OPENAI_HOSTS.join(', ')}. ` +
          `Set AGENT_MEMORY_EXTRACTION_STRICT_ALLOWLIST=false to allow custom hosts.`
      );
    }

    // Permissive mode: warn but allow (for backward compatibility)
    logger.warn(
      { hostname },
      'OpenAI base URL not in allowlist. Set AGENT_MEMORY_EXTRACTION_STRICT_ALLOWLIST=true to enforce blocking.'
    );
  }
}

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

export type EntityType = 'person' | 'technology' | 'component' | 'concept' | 'organization';

export interface ExtractedEntity {
  name: string;
  entityType: EntityType;
  description?: string;
  confidence: number; // 0-1
}

export type ExtractedRelationType = 'depends_on' | 'related_to' | 'applies_to' | 'conflicts_with';

export interface ExtractedRelationship {
  sourceRef: string; // Name reference to extracted entry/entity
  sourceType: 'guideline' | 'knowledge' | 'tool' | 'entity';
  targetRef: string;
  targetType: 'guideline' | 'knowledge' | 'tool' | 'entity';
  relationType: ExtractedRelationType;
  confidence: number; // 0-1
}

export interface ExtractionResult {
  entries: ExtractedEntry[];
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
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

const EXTRACTION_SYSTEM_PROMPT = `You are an AI memory extraction assistant. Your job is to analyze conversation or code context and extract structured memory entries, entities, and relationships.

Extract the following types:

1. **Guidelines** - Rules, standards, or patterns that should be followed (e.g., "always use TypeScript strict mode", "never commit secrets")

2. **Knowledge** - Facts, decisions, or context worth remembering (e.g., "We chose PostgreSQL because...", "The API uses REST not GraphQL")

3. **Tools** - Commands, scripts, or tool patterns that could be reused (e.g., "npm run build", "docker compose up")

4. **Entities** - Named things referenced in the context:
   - **technology**: libraries, frameworks, databases, APIs, languages (e.g., PostgreSQL, React, REST)
   - **component**: services, modules, classes, functions (e.g., UserService, AuthMiddleware)
   - **person**: team members, authors if relevant to the project
   - **organization**: companies, teams, departments
   - **concept**: patterns, architectures, methodologies (e.g., microservices, event-driven)

5. **Relationships** - How extracted items relate to each other:
   - **depends_on**: X requires/uses Y (e.g., "UserService depends_on PostgreSQL")
   - **related_to**: X is associated with Y
   - **applies_to**: guideline/rule X applies to entity/tool Y
   - **conflicts_with**: X contradicts Y

For each extraction:
- Assign a confidence score (0-1) based on how clearly the information was stated
- Use kebab-case for names/identifiers
- Be specific and actionable
- Include rationale when the "why" is mentioned

Only extract genuinely useful information. Skip:
- Temporary debugging steps
- One-off commands that won't be reused
- Information already commonly known
- Vague or ambiguous statements
- Generic entities (e.g., "the database" without a specific name)

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
  ],
  "entities": [
    {
      "name": "string (the entity name, e.g., PostgreSQL, UserService)",
      "entityType": "string (one of: person, technology, component, concept, organization)",
      "description": "string (brief description of what this entity is)",
      "confidence": "number (0-1)"
    }
  ],
  "relationships": [
    {
      "sourceRef": "string (name of source entry/entity)",
      "sourceType": "string (one of: guideline, knowledge, tool, entity)",
      "targetRef": "string (name of target entry/entity)",
      "targetType": "string (one of: guideline, knowledge, tool, entity)",
      "relationType": "string (one of: depends_on, related_to, applies_to, conflicts_with)",
      "confidence": "number (0-1)"
    }
  ]
}`;

function buildUserPrompt(input: ExtractionInput): string {
  const parts: string[] = [];

  parts.push(
    `Analyze the following ${input.contextType || 'mixed'} context and extract memory entries.`
  );
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
  parts.push(
    'Return a JSON object with arrays for "guidelines", "knowledge", "tools", "entities", and "relationships".'
  );
  parts.push('If no entries of a particular type are found, return an empty array for that type.');

  return parts.join('\n');
}

// =============================================================================
// EXTRACTION SERVICE
// =============================================================================

/**
 * Configuration for ExtractionService
 * Allows explicit dependency injection instead of relying on global config
 */
export interface ExtractionServiceConfig {
  provider: ExtractionProvider;
  openaiApiKey?: string;
  openaiModel: string;
  openaiBaseUrl?: string;
  anthropicApiKey?: string;
  anthropicModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
}

// Track if we've already warned about missing API keys (avoid spam in tests)
let hasWarnedAboutProvider = false;

export class ExtractionService {
  private provider: ExtractionProvider;
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;
  private openaiModel: string;
  private anthropicModel: string;
  private ollamaBaseUrl: string;
  private ollamaModel: string;

  /**
   * Create an ExtractionService instance
   * @param serviceConfig - Optional explicit configuration. If not provided, uses global config.
   */
  constructor(serviceConfig?: ExtractionServiceConfig) {
    // Use explicit config if provided, otherwise fall back to global config
    const effectiveConfig: ExtractionServiceConfig = serviceConfig ?? {
      provider: config.extraction.provider,
      openaiApiKey: config.extraction.openaiApiKey,
      openaiModel: config.extraction.openaiModel,
      openaiBaseUrl: config.extraction.openaiBaseUrl,
      anthropicApiKey: config.extraction.anthropicApiKey,
      anthropicModel: config.extraction.anthropicModel,
      ollamaBaseUrl: config.extraction.ollamaBaseUrl,
      ollamaModel: config.extraction.ollamaModel,
    };

    this.provider = effectiveConfig.provider;

    // Warn once if disabled
    if (this.provider === 'disabled' && !hasWarnedAboutProvider) {
      logger.warn(
        'Extraction provider is disabled. Set AGENT_MEMORY_EXTRACTION_PROVIDER to enable.'
      );
      hasWarnedAboutProvider = true;
    }

    this.openaiModel = effectiveConfig.openaiModel;
    this.anthropicModel = effectiveConfig.anthropicModel;
    this.ollamaBaseUrl = effectiveConfig.ollamaBaseUrl;

    // Security: Validate Ollama model name to prevent injection
    const rawOllamaModel = effectiveConfig.ollamaModel;
    if (!isValidModelName(rawOllamaModel)) {
      throw new Error(
        `Invalid Ollama model name: "${rawOllamaModel}". ` +
          'Model names must only contain alphanumeric characters, hyphens, underscores, colons, and dots.'
      );
    }
    this.ollamaModel = rawOllamaModel;

    // Initialize OpenAI client if using OpenAI (or OpenAI-compatible like LM Studio)
    if (this.provider === 'openai' && effectiveConfig.openaiApiKey) {
      // Security: Validate custom base URL to prevent credential exposure
      validateOpenAIBaseUrl(effectiveConfig.openaiBaseUrl);

      this.openaiClient = new OpenAI({
        apiKey: effectiveConfig.openaiApiKey,
        baseURL: effectiveConfig.openaiBaseUrl || undefined,
        timeout: 120000, // 120 second timeout for LLM calls (can be longer than embeddings)
        maxRetries: 0, // Disable SDK retry - we handle retries with withRetry
      });
    }

    // Initialize Anthropic client if using Anthropic
    if (this.provider === 'anthropic' && effectiveConfig.anthropicApiKey) {
      this.anthropicClient = new Anthropic({
        apiKey: effectiveConfig.anthropicApiKey,
        timeout: 120000, // 120 second timeout
        maxRetries: 0, // Disable SDK retry
      });
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
        entities: [],
        relationships: [],
        model: 'disabled',
        provider: 'disabled',
        processingTimeMs: 0,
      };
    }

    // Validate input
    if (!input.context || input.context.trim().length === 0) {
      throw new Error('Cannot extract from empty context');
    }

    // Security: Prevent DoS and API quota exhaustion with large context
    if (input.context.length > MAX_CONTEXT_LENGTH) {
      throw new Error(
        `Context exceeds maximum length of ${MAX_CONTEXT_LENGTH} characters (got ${input.context.length}). ` +
          `Truncate or summarize the context before extraction.`
      );
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
          throw new Error(`Unknown extraction provider: ${String(this.provider)}`);
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
    const client = this.openaiClient;
    if (!client) {
      throw new Error('OpenAI client not initialized. Check AGENT_MEMORY_OPENAI_API_KEY.');
    }

    return withRetry(
      async () => {
        const response = await client.chat.completions.create({
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
          entries: parsed.entries,
          entities: parsed.entities,
          relationships: parsed.relationships,
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
    const client = this.anthropicClient;
    if (!client) {
      throw new Error('Anthropic client not initialized. Check AGENT_MEMORY_ANTHROPIC_API_KEY.');
    }

    return withRetry(
      async () => {
        const response = await client.messages.create({
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
          entries: parsed.entries,
          entities: parsed.entities,
          relationships: parsed.relationships,
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
        // Security: Validate URL scheme (allow private IPs since Ollama is typically local)
        validateExternalUrl(url, true /* allowPrivate - Ollama is typically localhost */);

        const timeoutMsRaw = process.env.AGENT_MEMORY_OLLAMA_TIMEOUT_MS;
        const timeoutMs =
          timeoutMsRaw && !Number.isNaN(Number(timeoutMsRaw))
            ? Math.max(1000, Number(timeoutMsRaw))
            : 30000;

        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortController.signal,
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

          // Security: Stream response with size limit to prevent memory exhaustion
          const maxResponseSize = 10 * 1024 * 1024; // 10MB max response
          const responseText = await readResponseWithLimit(
            response,
            maxResponseSize,
            abortController
          );

          const data = JSON.parse(responseText) as { response: string };
          if (!data.response) {
            throw new Error('No response from Ollama');
          }

          const parsed = this.parseExtractionResponse(data.response);

          return {
            entries: parsed.entries,
            entities: parsed.entities,
            relationships: parsed.relationships,
            model: this.ollamaModel,
            provider: 'ollama' as const,
            processingTimeMs: 0, // Will be set by caller
          };
        } finally {
          clearTimeout(timeoutId);
        }
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
  private parseExtractionResponse(content: string): {
    entries: ExtractedEntry[];
    entities: ExtractedEntity[];
    relationships: ExtractedRelationship[];
  } {
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
      entities?: Array<{
        name?: string;
        entityType?: string;
        description?: string;
        confidence?: number;
      }>;
      relationships?: Array<{
        sourceRef?: string;
        sourceType?: string;
        targetRef?: string;
        targetType?: string;
        relationType?: string;
        confidence?: number;
      }>;
    };

    try {
      parsed = JSON.parse(jsonContent) as typeof parsed;
    } catch (error) {
      logger.warn(
        { content: jsonContent.slice(0, 200) },
        'Failed to parse extraction response as JSON'
      );
      return { entries: [], entities: [], relationships: [] };
    }

    const entries: ExtractedEntry[] = [];
    const entities: ExtractedEntity[] = [];
    const relationships: ExtractedRelationship[] = [];

    // Normalize guidelines
    if (Array.isArray(parsed.guidelines)) {
      for (const g of parsed.guidelines) {
        if (g.name && g.content) {
          entries.push({
            type: 'guideline',
            name: this.toKebabCase(g.name),
            content: g.content,
            category: g.category,
            priority:
              typeof g.priority === 'number' ? Math.min(100, Math.max(0, g.priority)) : undefined,
            confidence:
              typeof g.confidence === 'number' ? Math.min(1, Math.max(0, g.confidence)) : 0.5,
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
            confidence:
              typeof k.confidence === 'number' ? Math.min(1, Math.max(0, k.confidence)) : 0.5,
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
            confidence:
              typeof t.confidence === 'number' ? Math.min(1, Math.max(0, t.confidence)) : 0.5,
            suggestedTags: t.suggestedTags,
          });
        }
      }
    }

    // Normalize entities
    if (Array.isArray(parsed.entities)) {
      const validEntityTypes: EntityType[] = [
        'person',
        'technology',
        'component',
        'concept',
        'organization',
      ];
      for (const e of parsed.entities) {
        if (e.name && e.entityType && validEntityTypes.includes(e.entityType as EntityType)) {
          entities.push({
            name: e.name,
            entityType: e.entityType as EntityType,
            description: e.description,
            confidence:
              typeof e.confidence === 'number' ? Math.min(1, Math.max(0, e.confidence)) : 0.5,
          });
        }
      }
    }

    // Normalize relationships
    if (Array.isArray(parsed.relationships)) {
      const validRelationTypes: ExtractedRelationType[] = [
        'depends_on',
        'related_to',
        'applies_to',
        'conflicts_with',
      ];
      const validSourceTypes = ['guideline', 'knowledge', 'tool', 'entity'];
      for (const r of parsed.relationships) {
        if (
          r.sourceRef &&
          r.sourceType &&
          r.targetRef &&
          r.targetType &&
          r.relationType &&
          validSourceTypes.includes(r.sourceType) &&
          validSourceTypes.includes(r.targetType) &&
          validRelationTypes.includes(r.relationType as ExtractedRelationType)
        ) {
          relationships.push({
            sourceRef: r.sourceRef,
            sourceType: r.sourceType as 'guideline' | 'knowledge' | 'tool' | 'entity',
            targetRef: r.targetRef,
            targetType: r.targetType as 'guideline' | 'knowledge' | 'tool' | 'entity',
            relationType: r.relationType as ExtractedRelationType,
            confidence:
              typeof r.confidence === 'number' ? Math.min(1, Math.max(0, r.confidence)) : 0.5,
          });
        }
      }
    }

    return { entries, entities, relationships };
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

/**
 * Reset module-level state for testing purposes.
 * Note: In production code, services should be instantiated via DI and cleaned up directly.
 */
export function resetExtractionServiceState(): void {
  hasWarnedAboutProvider = false;
}
