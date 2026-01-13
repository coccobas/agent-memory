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
import {
  createValidationError,
  createExtractionError,
  createSizeLimitError,
  createServiceUnavailableError,
} from '../core/errors.js';
import { ensureAtomicity, createAtomicityConfig } from './extraction/atomicity.js';

const logger = createComponentLogger('extraction');

// Valid contextType values for runtime validation
const VALID_CONTEXT_TYPES = ['conversation', 'code', 'mixed'] as const;
type ContextType = (typeof VALID_CONTEXT_TYPES)[number];

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
    throw createValidationError('url', `invalid scheme: ${url.protocol}. Only http/https allowed`);
  }

  if (!allowPrivate) {
    // Check for private/internal IP ranges
    let hostname = url.hostname.toLowerCase();

    // Security: Strip IPv6 zone IDs (e.g., fe80::1%eth0) as they can bypass SSRF protections
    // Zone IDs are URL-encoded as %25 in URLs
    if (hostname.includes('%25') || hostname.includes('%')) {
      // Strip zone ID and log a warning
      const originalHostname = hostname;
      hostname = hostname.split('%25')[0]!.split('%')[0]!;
      logger.warn(
        { original: originalHostname, stripped: hostname },
        'SSRF protection: Stripped IPv6 zone ID from hostname'
      );
    }

    // Security: Block integer IP format before pattern checks
    if (isIntegerIpFormat(hostname)) {
      throw createValidationError(
        'hostname',
        `SSRF protection: Integer IP format not allowed: ${hostname}. Use standard dotted notation`
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
        throw createValidationError('hostname', `SSRF protection: Private/internal addresses not allowed: ${hostname}`);
      }
    }

    for (const pattern of ipv6PrivatePatterns) {
      if (pattern.test(hostname)) {
        throw createValidationError('hostname', `SSRF protection: Private IPv6 addresses not allowed: ${hostname}`);
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
    throw createExtractionError('response', 'body is not readable');
  }

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

  // Bug #24 fix: Per-read timeout to prevent hung requests
  // If reading takes longer than 30 seconds for a single chunk, abort
  const READ_TIMEOUT_MS = 30000;

  try {
    while (true) {
      // Bug #24 fix: Check if abort was requested before each read
      if (abortController.signal.aborted) {
        throw createExtractionError('response', 'request aborted');
      }

      // Bug #24 fix: Add timeout to each read operation
      const readPromise = reader.read();
      const timeoutPromise = new Promise<never>((_, reject) => {
        const id = setTimeout(() => {
          reject(createExtractionError('response', 'stream read timeout - server not responding'));
        }, READ_TIMEOUT_MS);
        // Clean up timeout if read completes first
        readPromise.finally(() => clearTimeout(id));
      });

      const { done, value } = await Promise.race([readPromise, timeoutPromise]);
      if (done) break;

      totalBytes += value.byteLength;

      // Security: Abort if response exceeds size limit
      if (totalBytes > maxSizeBytes) {
        abortController.abort();
        throw createSizeLimitError('response', maxSizeBytes, totalBytes, 'bytes');
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
      throw createValidationError(
        'baseUrl',
        'SSRF protection: localhost/127.0.0.1 not allowed in production. Use a public hostname or deploy with NODE_ENV !== production for development'
      );
    }
    logger.debug({ baseUrl }, 'Using local OpenAI-compatible endpoint (development mode)');
    return;
  }

  // Check against allowlist
  if (!ALLOWED_OPENAI_HOSTS.includes(hostname)) {
    // Strict mode: block non-allowlisted hosts (recommended for production)
    if (config.extraction.strictBaseUrlAllowlist) {
      throw createValidationError(
        'baseUrl',
        `not in allowlist: ${hostname}. Allowed hosts: ${ALLOWED_OPENAI_HOSTS.join(', ')}. Set AGENT_MEMORY_EXTRACTION_STRICT_ALLOWLIST=false to allow custom hosts`
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
  /** Task 47: Indicates if result is partial due to error during extraction */
  partial?: boolean;
  /** Task 47: Error message if partial result */
  partialError?: string;
}

export interface ExtractionInput {
  context: string; // Raw conversation/code context
  contextType?: 'conversation' | 'code' | 'mixed';
  /** Task 47: Enable partial retry with reduced context on failure */
  enablePartialRetry?: boolean;
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

1. **Guidelines** - Rules, standards, or patterns that should be followed. These can be:
   - **Explicit**: Direct commands using "always", "never", "must", "should" (e.g., "always use TypeScript strict mode", "never commit secrets")
   - **Implicit**: Standards implied by descriptions of how things work:
     - "We follow [methodology/pattern]" → Extract as guideline to follow that methodology
     - "Our [code/API/service] follows [standard/convention]" → Extract as guideline to conform to that standard
     - "The codebase is organized as [pattern]" → Extract as guideline to maintain that organization
     - "We use [approach] for [purpose]" → Extract as guideline to continue using that approach
     - "[Team] decided to [approach]" → Extract as guideline if it establishes ongoing practice

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

## CRITICAL: Noise Resistance

Do NOT extract the following types of content:

1. **Status Updates & Progress Reports** - "I'm working on X", "Just finished Y", "Almost done with Z"
   These are transient status indicators, not permanent knowledge worth storing.

2. **Personal Preferences Without Team Mandate** - "I prefer X", "I like using Y"
   Only extract preferences that are explicitly stated as team standards or project requirements.

3. **Dismissed or Rejected Technologies** - "We don't use X", "We tried Y but it didn't work"
   Negative decisions about what NOT to use are generally not actionable guidelines unless they include specific rationale worth preserving.

4. **Transient Code Review Feedback** - "Can you move this here?", "Please rename this variable"
   One-off review comments that apply only to a specific change are not reusable knowledge.

5. **Questions and Requests** - "Can you help me with X?", "What do you think about Y?"
   Questions themselves are not extractable knowledge - only answers and decisions are.

6. **Casual Conversation & Off-Topic Content** - Greetings, thanks, unrelated discussions
   Social content has no long-term knowledge value.

## CRITICAL: Atomicity Requirement

Each extracted entry MUST be atomic - containing exactly ONE concept, rule, decision, or fact.

### What is Atomic?
- ONE guideline = ONE rule or constraint
- ONE knowledge = ONE fact or ONE decision
- ONE tool = ONE command or function

### Examples of NON-ATOMIC (BAD):
- Guideline: "Always use TypeScript strict mode and never use any type" (TWO rules)
- Knowledge: "We chose PostgreSQL for persistence and Redis for caching" (TWO decisions)
- Tool: "Use prettier for formatting; use eslint for linting" (TWO tools)

### Examples of ATOMIC (GOOD):
- Guideline: "Always use TypeScript strict mode" (ONE rule)
- Guideline: "Never use the any type in TypeScript" (ONE rule)
- Knowledge: "We chose PostgreSQL for database persistence" (ONE decision)
- Knowledge: "We use Redis for caching" (ONE decision)
- Tool: "Use prettier for code formatting" (ONE tool)

### Splitting Guidance:
If you identify compound information, extract it as MULTIPLE SEPARATE entries:
- Each entry gets its own name/title
- Each entry maintains appropriate confidence
- Related entries can share tags

DO NOT combine multiple rules, facts, or tools into single entries. When in doubt, split.

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

// =============================================================================
// PERSONAL MEMORY EXTRACTION PROMPT
// =============================================================================

/**
 * Extraction prompt optimized for personal/conversational memory.
 * Use for: chat assistants, personal memory apps, LoCoMo-style benchmarks.
 *
 * Key differences from technical prompt:
 * - Categories for personal info, events, relationships
 * - No noise filtering for casual conversation
 * - Entity types for people, places, dates
 * - Focus on factual information extraction
 */
const PERSONAL_EXTRACTION_SYSTEM_PROMPT = `You are a personal memory extraction assistant. Extract facts, events, and information about people from conversations.

## What to Extract

1. **Knowledge** - Facts worth remembering:
   - **person_info**: Names, identities, professions, characteristics (e.g., "Sarah is a teacher", "John is transgender")
   - **event**: Activities, occurrences with dates/times (e.g., "Sarah went to the gym on May 5th")
   - **preference**: Likes, dislikes, favorites (e.g., "John loves hiking")
   - **relationship**: Connections between people (e.g., "Sarah and John are siblings")
   - **plan**: Future intentions (e.g., "Sarah is planning to visit Paris next month")
   - **location**: Where people live/work/visited (e.g., "John lives in Boston")

2. **Entities** - Named things mentioned:
   - **person**: People mentioned by name
   - **location**: Places, cities, venues
   - **organization**: Companies, schools, groups
   - **date**: Specific dates or time periods
   - **activity**: Hobbies, sports, events

3. **Relationships** - Connections between entities:
   - **knows**: Person knows another person
   - **lives_in**: Person lives in location
   - **works_at**: Person works at organization
   - **participated_in**: Person participated in activity/event
   - **related_to**: General relationship

## Extraction Rules

- Extract ALL factual information, even from casual conversation
- Include specific dates, times, and numbers when mentioned
- Preserve exact names and proper nouns
- Assign confidence based on how directly something was stated:
  - 0.9+: Explicitly stated fact
  - 0.7-0.9: Clearly implied
  - 0.5-0.7: Inferred from context
- Each entry should be atomic (ONE fact per entry)

## What NOT to Extract

- Greetings and pleasantries without information content
- Questions that aren't answered
- Hypotheticals that didn't happen
- Generic statements without specifics

Return a JSON object:
{
  "guidelines": [],
  "knowledge": [
    {
      "title": "string (short descriptive title)",
      "content": "string (the specific fact, 1-2 sentences)",
      "category": "string (person_info | event | preference | relationship | plan | location)",
      "confidence": "number (0-1)",
      "source": "string (who this is about, e.g., 'Sarah', 'the user')",
      "suggestedTags": ["string"]
    }
  ],
  "tools": [],
  "entities": [
    {
      "name": "string (proper name)",
      "entityType": "string (person | location | organization | date | activity)",
      "description": "string (brief description)",
      "confidence": "number (0-1)"
    }
  ],
  "relationships": [
    {
      "sourceRef": "string (entity name)",
      "sourceType": "string (entity)",
      "targetRef": "string (entity name)",
      "targetType": "string (entity)",
      "relationType": "string (knows | lives_in | works_at | participated_in | related_to)",
      "confidence": "number (0-1)"
    }
  ]
}

## Example

Input: "Caroline went to an LGBTQ support group on May 7th 2023. She's a transgender woman who's thinking about adoption."

Output:
{
  "guidelines": [],
  "knowledge": [
    {
      "title": "Caroline attended LGBTQ support group",
      "content": "Caroline went to an LGBTQ support group on May 7th 2023.",
      "category": "event",
      "confidence": 0.95,
      "source": "Caroline",
      "suggestedTags": ["caroline", "lgbtq", "support-group"]
    },
    {
      "title": "Caroline is transgender",
      "content": "Caroline is a transgender woman.",
      "category": "person_info",
      "confidence": 0.95,
      "source": "Caroline",
      "suggestedTags": ["caroline", "identity"]
    },
    {
      "title": "Caroline considering adoption",
      "content": "Caroline is thinking about adoption.",
      "category": "plan",
      "confidence": 0.85,
      "source": "Caroline",
      "suggestedTags": ["caroline", "adoption"]
    }
  ],
  "tools": [],
  "entities": [
    {"name": "Caroline", "entityType": "person", "description": "Transgender woman considering adoption", "confidence": 0.95},
    {"name": "May 7th 2023", "entityType": "date", "description": "Date of LGBTQ support group visit", "confidence": 0.95},
    {"name": "LGBTQ support group", "entityType": "organization", "description": "Support group Caroline attended", "confidence": 0.9}
  ],
  "relationships": [
    {"sourceRef": "Caroline", "sourceType": "entity", "targetRef": "LGBTQ support group", "targetType": "entity", "relationType": "participated_in", "confidence": 0.95}
  ]
}`;

/**
 * Get the appropriate extraction prompt based on mode
 */
function getExtractionPrompt(mode: 'technical' | 'personal' | 'auto', context?: string): string {
  if (mode === 'personal') {
    return PERSONAL_EXTRACTION_SYSTEM_PROMPT;
  }
  if (mode === 'technical') {
    return EXTRACTION_SYSTEM_PROMPT;
  }
  // Auto mode: detect from content
  if (context) {
    // Simple heuristics for auto-detection
    const technicalIndicators = [
      /\bfunction\b/i, /\bclass\b/i, /\bimport\b/i, /\bexport\b/i,
      /\bconst\b/i, /\blet\b/i, /\bvar\b/i, /\breturn\b/i,
      /\bapi\b/i, /\bdatabase\b/i, /\bserver\b/i, /\bdeployment\b/i,
      /\bgit\b/i, /\bnpm\b/i, /\bdocker\b/i, /\bkubernetes\b/i,
    ];
    const personalIndicators = [
      /\b(went|visited|attended|met)\b/i,
      /\b(birthday|wedding|vacation|trip)\b/i,
      /\b(family|friend|brother|sister|mother|father)\b/i,
      /\b(love|hate|favorite|prefer)\b/i,
      /\b(feel|feeling|happy|sad|excited)\b/i,
    ];

    const technicalScore = technicalIndicators.filter(r => r.test(context)).length;
    const personalScore = personalIndicators.filter(r => r.test(context)).length;

    if (personalScore > technicalScore) {
      return PERSONAL_EXTRACTION_SYSTEM_PROMPT;
    }
  }
  return EXTRACTION_SYSTEM_PROMPT;
}

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

// Static warning tracking - allows reset for test isolation
// Use ExtractionService.resetWarningState() in tests
const warningState = {
  hasWarnedDisabled: false,
};

export class ExtractionService {
  private provider: ExtractionProvider;
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;
  private openaiModel: string;
  private anthropicModel: string;
  private ollamaBaseUrl: string;
  private ollamaModel: string;

  /**
   * Reset warning state for test isolation.
   * Call this in test setup/teardown to ensure clean state between tests.
   */
  static resetWarningState(): void {
    warningState.hasWarnedDisabled = false;
  }

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

    // Warn once globally if disabled (use static state for de-duplication across instances)
    if (this.provider === 'disabled' && !warningState.hasWarnedDisabled) {
      logger.warn(
        'Extraction provider is disabled. Set AGENT_MEMORY_EXTRACTION_PROVIDER to enable.'
      );
      warningState.hasWarnedDisabled = true;
    }

    this.openaiModel = effectiveConfig.openaiModel;
    this.anthropicModel = effectiveConfig.anthropicModel;
    this.ollamaBaseUrl = effectiveConfig.ollamaBaseUrl;

    // Security: Validate Ollama model name to prevent injection
    const rawOllamaModel = effectiveConfig.ollamaModel;
    if (!isValidModelName(rawOllamaModel)) {
      throw createValidationError(
        'ollamaModel',
        `invalid model name: "${rawOllamaModel}". Must only contain alphanumeric characters, hyphens, underscores, colons, and dots`
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
   * Run a promise with a timeout
   *
   * @param promise - Promise to wrap with timeout
   * @param timeoutMs - Timeout in milliseconds
   * @param operation - Operation name for error message
   * @returns Promise result or throws timeout error
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(createExtractionError(operation, `timed out after ${timeoutMs}ms`, { timeoutMs }));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
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
      throw createValidationError('context', 'cannot be empty');
    }

    // Security: Prevent DoS and API quota exhaustion with large context
    const maxContextLength = config.extraction.maxContextLength;
    if (input.context.length > maxContextLength) {
      throw createSizeLimitError('context', maxContextLength, input.context.length, 'characters');
    }

    // Validate contextType if provided
    if (input.contextType && !VALID_CONTEXT_TYPES.includes(input.contextType as ContextType)) {
      logger.warn(
        { provided: input.contextType, valid: VALID_CONTEXT_TYPES },
        'Invalid contextType provided, defaulting to mixed'
      );
      input.contextType = 'mixed';
    }

    const startTime = Date.now();

    try {
      let result: ExtractionResult;

      // Wrap provider calls with timeout to prevent hanging requests
      switch (this.provider) {
        case 'openai':
          result = await this.withTimeout(
            this.extractOpenAI(input),
            config.extraction.timeoutMs,
            'OpenAI extraction'
          );
          break;
        case 'anthropic':
          result = await this.withTimeout(
            this.extractAnthropic(input),
            config.extraction.timeoutMs,
            'Anthropic extraction'
          );
          break;
        case 'ollama':
          result = await this.withTimeout(
            this.extractOllama(input),
            config.extraction.timeoutMs,
            'Ollama extraction'
          );
          break;
        default:
          throw createValidationError('provider', `unknown extraction provider: ${String(this.provider)}`);
      }

      result.processingTimeMs = Date.now() - startTime;

      // Apply atomicity validation and splitting if enabled
      if (config.extraction.atomicityEnabled) {
        const atomicityConfig = createAtomicityConfig(config.extraction);
        const originalCount = result.entries.length;
        result.entries = ensureAtomicity(result.entries, atomicityConfig);

        if (result.entries.length !== originalCount) {
          logger.debug(
            {
              originalCount,
              atomicCount: result.entries.length,
              splitMode: config.extraction.atomicitySplitMode,
            },
            'Atomicity processing applied'
          );
        }
      }

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
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Task 47: Try partial retry if enabled
      if (input.enablePartialRetry) {
        logger.warn(
          {
            provider: this.provider,
            error: errorMessage,
          },
          'Extraction failed, attempting partial retry with simplified context'
        );

        try {
          // Retry with reduced context (first 50%)
          const reducedContext = input.context.slice(0, Math.floor(input.context.length * 0.5));
          const partialResult = await this.extract({
            ...input,
            context: reducedContext,
            enablePartialRetry: false, // Don't recurse
          });

          partialResult.partial = true;
          partialResult.partialError = `Original extraction failed: ${errorMessage}. Recovered with reduced context (50%).`;
          partialResult.processingTimeMs = Date.now() - startTime;

          logger.info(
            {
              entriesRecovered: partialResult.entries.length,
              contextReduction: '50%',
            },
            'Partial extraction recovery successful'
          );

          return partialResult;
        } catch (retryError) {
          const retryErrorMessage = retryError instanceof Error ? retryError.message : String(retryError);
          // Bug #245 fix: Log at error level when both extraction and retry fail
          // This ensures visibility into data loss scenarios
          logger.error(
            {
              provider: this.provider,
              originalError: errorMessage,
              retryError: retryErrorMessage,
              contextLength: input.context.length,
            },
            'Both extraction and partial retry failed - DATA LOSS: returning empty result'
          );

          // Return empty partial result instead of throwing
          // Bug #245 fix: Include both error messages for debugging
          return {
            entries: [],
            entities: [],
            relationships: [],
            model: this.provider === 'openai' ? this.openaiModel :
                   this.provider === 'anthropic' ? this.anthropicModel :
                   this.ollamaModel,
            provider: this.provider,
            processingTimeMs: Date.now() - startTime,
            partial: true,
            partialError: `Extraction failed: ${errorMessage}. Partial retry also failed: ${retryErrorMessage}`,
          };
        }
      }

      logger.error(
        {
          provider: this.provider,
          error: errorMessage,
        },
        'Extraction failed'
      );
      throw error;
    }
  }

  /**
   * Task 45: Batch extraction - process multiple inputs with controlled concurrency.
   * Useful for processing large documents split into chunks.
   *
   * @param inputs - Array of extraction inputs
   * @param options - Batch processing options
   * @returns Array of results (same order as inputs)
   */
  async extractBatch(
    inputs: ExtractionInput[],
    options?: {
      /** Max concurrent extractions (default: 3) */
      concurrency?: number;
      /** Continue on individual errors (default: true) */
      continueOnError?: boolean;
    }
  ): Promise<Array<ExtractionResult | { error: string; index: number }>> {
    const concurrency = options?.concurrency ?? 3;
    const continueOnError = options?.continueOnError ?? true;

    if (inputs.length === 0) {
      return [];
    }

    if (this.provider === 'disabled') {
      return inputs.map(() => ({
        entries: [],
        entities: [],
        relationships: [],
        model: 'disabled',
        provider: 'disabled',
        processingTimeMs: 0,
      }));
    }

    const startTime = Date.now();
    logger.info(
      { inputCount: inputs.length, concurrency },
      'Starting batch extraction'
    );

    const results: Array<ExtractionResult | { error: string; index: number }> = new Array(inputs.length);
    let processedCount = 0;
    let errorCount = 0;

    // Process in batches of 'concurrency' size
    for (let i = 0; i < inputs.length; i += concurrency) {
      const batch = inputs.slice(i, i + concurrency);
      const batchPromises = batch.map(async (input, batchIndex) => {
        const index = i + batchIndex;
        try {
          const result = await this.extract(input);
          results[index] = result;
          processedCount++;
        } catch (error) {
          errorCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (continueOnError) {
            results[index] = { error: errorMessage, index };
            logger.warn(
              { index, error: errorMessage },
              'Batch extraction item failed, continuing'
            );
          } else {
            throw error;
          }
        }
      });

      await Promise.all(batchPromises);
    }

    const totalTimeMs = Date.now() - startTime;
    logger.info(
      {
        totalCount: inputs.length,
        processedCount,
        errorCount,
        totalTimeMs,
        avgTimeMs: Math.round(totalTimeMs / inputs.length),
      },
      'Batch extraction completed'
    );

    return results;
  }

  /**
   * Extract using OpenAI API
   */
  private async extractOpenAI(input: ExtractionInput): Promise<ExtractionResult> {
    const client = this.openaiClient;
    if (!client) {
      throw createServiceUnavailableError('OpenAI', 'client not initialized. Check AGENT_MEMORY_OPENAI_API_KEY');
    }

    return withRetry(
      async () => {
        const response = await client.chat.completions.create({
          model: this.openaiModel,
          messages: [
            { role: 'system', content: getExtractionPrompt(config.extraction.mode, input.context) },
            { role: 'user', content: buildUserPrompt(input) },
          ],
          // response_format disabled for LM Studio compatibility when openaiJsonMode=false
          ...(config.extraction.openaiJsonMode ? { response_format: { type: 'json_object' as const } } : {}),
          temperature: config.extraction.temperature,
          max_tokens: config.extraction.maxTokens,
          // reasoning_effort for o1/o3 models or LM Studio with extended thinking
          ...(config.extraction.openaiReasoningEffort ? { reasoning_effort: config.extraction.openaiReasoningEffort } : {}),
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw createExtractionError('openai', 'no content returned in response');
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
          logger.warn(
            {
              error: error.message,
              errorName: error.name,
              stack: error.stack,
              attempt,
              provider: 'openai',
              model: this.openaiModel,
            },
            'Retrying OpenAI extraction after error'
          );
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
      throw createServiceUnavailableError('Anthropic', 'client not initialized. Check AGENT_MEMORY_ANTHROPIC_API_KEY');
    }

    return withRetry(
      async () => {
        const response = await client.messages.create({
          model: this.anthropicModel,
          max_tokens: config.extraction.maxTokens,
          system: getExtractionPrompt(config.extraction.mode, input.context),
          messages: [{ role: 'user', content: buildUserPrompt(input) }],
        });

        // Extract text content from response
        const textBlock = response.content.find((block) => block.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          throw createExtractionError('anthropic', 'no text content returned in response');
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
          logger.warn(
            {
              error: error.message,
              errorName: error.name,
              stack: error.stack,
              attempt,
              provider: 'anthropic',
              model: this.anthropicModel,
            },
            'Retrying Anthropic extraction after error'
          );
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
        // Bug #313 fix: Initialize timeoutId to null, set it inside try block
        // This ensures the timeout is always cleared in finally, and avoids
        // race conditions where setTimeout is called before try block
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        try {
          // Bug #313 fix: Set timeout inside try block so it's guaranteed to be cleared
          timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortController.signal,
            body: JSON.stringify({
              model: this.ollamaModel,
              prompt: `${getExtractionPrompt(config.extraction.mode, input.context)}\n\n${buildUserPrompt(input)}`,
              format: 'json',
              stream: false,
              options: {
                temperature: config.extraction.temperature,
                num_predict: config.extraction.maxTokens,
              },
            }),
          });

          if (!response.ok) {
            throw createExtractionError('ollama', `request failed: ${response.status} ${response.statusText}`);
          }

          // Security: Stream response with size limit to prevent memory exhaustion
          const maxResponseSize = 10 * 1024 * 1024; // 10MB max response
          const responseText = await readResponseWithLimit(
            response,
            maxResponseSize,
            abortController
          );

          // Validate Ollama response structure
          let data: { response?: unknown; error?: string };
          try {
            data = JSON.parse(responseText) as typeof data;
          } catch (parseError) {
            logger.warn(
              { responseText: responseText.slice(0, 200) },
              'Failed to parse Ollama response as JSON'
            );
            throw createExtractionError('ollama', 'invalid JSON response');
          }

          // Check for Ollama-specific error response
          if (data.error) {
            throw createExtractionError('ollama', `API error: ${data.error}`);
          }

          // Validate response field exists and is string
          if (typeof data.response !== 'string' || data.response.length === 0) {
            logger.warn(
              { responseType: typeof data.response, hasResponse: 'response' in data },
              'Ollama response missing or invalid response field'
            );
            throw createExtractionError('ollama', 'no valid response in data');
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
          // Bug #313 fix: Only clear timeout if it was set
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
          }
        }
      },
      {
        retryableErrors: (error: Error) => {
          // Bug #316 fix: Retry on connection errors AND server errors to Ollama
          const msg = error.message.toLowerCase();
          return (
            // Connection errors
            msg.includes('econnrefused') ||
            msg.includes('fetch failed') ||
            msg.includes('network') ||
            msg.includes('timeout') ||
            msg.includes('socket') ||
            // Server errors (5xx)
            msg.includes('500') ||
            msg.includes('502') ||
            msg.includes('503') ||
            msg.includes('504') ||
            msg.includes('internal server error') ||
            msg.includes('bad gateway') ||
            msg.includes('service unavailable') ||
            msg.includes('gateway timeout')
          );
        },
        onRetry: (error, attempt) => {
          logger.warn(
            {
              error: error.message,
              errorName: error.name,
              stack: error.stack,
              attempt,
              provider: 'ollama',
              model: this.ollamaModel,
              baseUrl: this.ollamaBaseUrl,
            },
            'Retrying Ollama extraction after error'
          );
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
      // Task 58: Make parsing fallback visible with detailed error context
      const parseError = error instanceof Error ? error : new Error(String(error));
      logger.warn(
        {
          parseError: parseError.message,
          parseErrorName: parseError.name,
          contentLength: jsonContent.length,
          contentPreview: jsonContent.slice(0, 200),
          hadMarkdownBlock: content.includes('```'),
          reason: 'JSON_PARSE_FAILURE',
        },
        'Extraction response parse failure - returning empty results'
      );
      return { entries: [], entities: [], relationships: [] };
    }

    // Validate parsed structure has expected shape
    if (typeof parsed !== 'object' || parsed === null) {
      logger.warn(
        { parsedType: typeof parsed, reason: 'INVALID_RESPONSE_STRUCTURE' },
        'Extraction response is not an object - returning empty results'
      );
      return { entries: [], entities: [], relationships: [] };
    }

    const entries: ExtractedEntry[] = [];
    const entities: ExtractedEntity[] = [];
    const relationships: ExtractedRelationship[] = [];

    // Helper to normalize confidence with warning on invalid values
    const normalizeConfidence = (value: unknown, context: string): number => {
      if (typeof value !== 'number') return 0.5;
      if (value < 0 || value > 1) {
        logger.warn(
          { value, context, normalized: Math.min(1, Math.max(0, value)) },
          'Confidence score out of valid range [0,1], normalizing'
        );
      }
      return Math.min(1, Math.max(0, value));
    };

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
            confidence: normalizeConfidence(g.confidence, `guideline:${g.name}`),
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
            confidence: normalizeConfidence(k.confidence, `knowledge:${k.title}`),
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
            confidence: normalizeConfidence(t.confidence, `tool:${t.name}`),
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
            confidence: normalizeConfidence(e.confidence, `entity:${e.name}`),
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
            confidence: normalizeConfidence(r.confidence, `relationship:${r.sourceRef}->${r.targetRef}`),
          });
        }
      }
    }

    // Task 50: Deduplicate within single extraction to prevent identical entries
    const deduplicatedEntries = this.deduplicateEntries(entries);
    const deduplicatedEntities = this.deduplicateEntities(entities);
    const deduplicatedRelationships = this.deduplicateRelationships(relationships);

    // Log if duplicates were found
    const entriesRemoved = entries.length - deduplicatedEntries.length;
    const entitiesRemoved = entities.length - deduplicatedEntities.length;
    const relationsRemoved = relationships.length - deduplicatedRelationships.length;
    if (entriesRemoved > 0 || entitiesRemoved > 0 || relationsRemoved > 0) {
      logger.debug(
        {
          entriesRemoved,
          entitiesRemoved,
          relationsRemoved,
          originalCounts: {
            entries: entries.length,
            entities: entities.length,
            relationships: relationships.length,
          },
        },
        'Removed duplicate items from extraction'
      );
    }

    return {
      entries: deduplicatedEntries,
      entities: deduplicatedEntities,
      relationships: deduplicatedRelationships,
    };
  }

  /**
   * Deduplicate extracted entries by type + name/title key.
   * Keeps the entry with higher confidence when duplicates exist.
   */
  private deduplicateEntries(entries: ExtractedEntry[]): ExtractedEntry[] {
    const seen = new Map<string, ExtractedEntry>();
    for (const entry of entries) {
      const key =
        entry.type === 'knowledge'
          ? `knowledge:${entry.title?.toLowerCase()}`
          : `${entry.type}:${entry.name?.toLowerCase()}`;
      const existing = seen.get(key);
      if (!existing || (entry.confidence ?? 0) > (existing.confidence ?? 0)) {
        seen.set(key, entry);
      }
    }
    return Array.from(seen.values());
  }

  /**
   * Deduplicate extracted entities by name + entityType.
   * Keeps the entity with higher confidence when duplicates exist.
   */
  private deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const seen = new Map<string, ExtractedEntity>();
    for (const entity of entities) {
      const key = `${entity.entityType}:${entity.name.toLowerCase()}`;
      const existing = seen.get(key);
      if (!existing || (entity.confidence ?? 0) > (existing.confidence ?? 0)) {
        seen.set(key, entity);
      }
    }
    return Array.from(seen.values());
  }

  /**
   * Deduplicate extracted relationships by source + target + relationType.
   * Keeps the relationship with higher confidence when duplicates exist.
   */
  private deduplicateRelationships(
    relationships: ExtractedRelationship[]
  ): ExtractedRelationship[] {
    const seen = new Map<string, ExtractedRelationship>();
    for (const rel of relationships) {
      const key = `${rel.sourceRef}:${rel.sourceType}->${rel.targetRef}:${rel.targetType}:${rel.relationType}`;
      const existing = seen.get(key);
      if (!existing || (rel.confidence ?? 0) > (existing.confidence ?? 0)) {
        seen.set(key, rel);
      }
    }
    return Array.from(seen.values());
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
 * @deprecated Use ExtractionService.resetWarningState() instead for better encapsulation.
 */
export function resetExtractionServiceState(): void {
  ExtractionService.resetWarningState();
}
