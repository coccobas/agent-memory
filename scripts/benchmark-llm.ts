#!/usr/bin/env npx tsx

import { OpenAI } from 'openai';
import * as fs from 'node:fs';
import * as readline from 'node:readline';

// ============================================================================
// TYPES
// ============================================================================

interface BenchmarkOutput {
  timestamp: string; // ISO 8601
  config: {
    models: string[];
    testCaseCount: number;
    timeoutMs: number;
    temperature: number;
  };
  summaries: ModelSummary[];
  details: BenchmarkResult[];
}

interface ModelSummary {
  model: string;
  totalTests: number;
  passed: number;
  failed: number;
  avgLatencyMs: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  successRate: number; // 0-100
  byCategory: Record<
    string,
    {
      passed: number;
      total: number;
      avgLatencyMs: number;
    }
  >;
  byDifficulty: Record<
    string,
    {
      passed: number;
      total: number;
    }
  >;
}

interface BenchmarkResult {
  model: string;
  testCase: string;
  category: 'extraction' | 'classification' | 'query_rewrite' | 'cross_encoder';
  difficulty: 'easy' | 'medium' | 'hard';
  success: boolean;
  latencyMs: number;
  tokensInput?: number;
  tokensOutput?: number;
  expectedType?: string;
  actualType?: string;
  error?: string;
  rawOutput?: string; // First 500 chars for debugging
}

interface TestCase {
  id: string;
  category: 'extraction' | 'classification' | 'query_rewrite' | 'cross_encoder';
  difficulty: 'easy' | 'medium' | 'hard';
  input: string;
  expectedType?: string | null; // For extraction/classification
  expectedKeywords?: string[]; // For query_rewrite
  expectedTopId?: string; // For cross_encoder
  documents?: Array<{ id: string; text: string }>; // For cross_encoder
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LM_STUDIO_BASE_URL = 'http://localhost:1234/v1';
const TIMEOUT_MS = 120000; // 2 minutes
const TEMPERATURE = 0; // For reproducibility

const DEFAULT_MODELS = [
  'gpt-oss-120b',
  'zai-org/glm-4.7-flash',
  'glm-4.7-reap-50',
  'openai/gpt-oss-20b',
  'qwen3-32b',
  'qwen/qwen3-30b-a3b-2507',
  'qwen/qwen3-1.7b',
  'mistralai/ministral-3-14b-reasoning',
];

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

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

const CLASSIFICATION_PROMPT = `Classify the following text into exactly one category:
- guideline: Rules, standards, best practices (always/never/must statements)
- knowledge: Facts, decisions, architecture details
- tool: Commands, scripts, CLI instructions

Return ONLY a JSON object: {"type": "guideline" | "knowledge" | "tool", "confidence": 0.0-1.0}

Text: `;

const QUERY_REWRITE_PROMPT = `You are a search query optimizer. Generate a hypothetical document (2-3 paragraphs)
that would perfectly answer this search query. Include relevant technical terms,
specific details, and context that would make this document a perfect match.

Query: `;

function buildCrossEncoderPrompt(
  query: string,
  documents: Array<{ id: string; text: string }>
): string {
  const docList = documents
    .map((d, i) => `[DOC${i + 1}] ID: ${d.id}\n${d.text}`)
    .join('\n\n---\n\n');

  return `You are a relevance scoring system with STRICT ENTITY VERIFICATION.

QUERY: ${query}

DOCUMENTS:
${docList}

SCORING RULES:
1. First, identify the KEY ENTITIES in the query (people names, specific events, places, objects)
2. For each document, check if it's about THE SAME entities as the query
3. CRITICAL: If the query asks about Person A but the document is about Person B, score it 0-2 (entity mismatch)
4. Only give high scores (7-10) if BOTH the topic AND entities match

ENTITY MISMATCH EXAMPLES:
- Query: "What did Caroline do at the race?" + Doc about Melanie's race → Score 0-2
- Query: "What is Oscar's favorite toy?" + Doc about a different pet → Score 0-2
- Query: "When did John visit Paris?" + Doc about John visiting London → Score 0-2

SCORING SCALE:
- 10: Perfect match - same entities, directly answers the query
- 7-9: Same entities, highly relevant information
- 4-6: Same entities, partially relevant
- 1-3: Related topic but DIFFERENT entities or tangentially related
- 0: Entity mismatch OR completely irrelevant

Output format (JSON array):
[{"id": "doc_id", "score": N}, ...]

Only output the JSON array, no explanation.`;
}

// ============================================================================
// TEST CASES
// ============================================================================

const TEST_CASES: TestCase[] = [
  // ============================================================================
  // EXTRACTION TEST CASES (10 total)
  // ============================================================================
  {
    id: 'ext-1',
    category: 'extraction',
    difficulty: 'easy',
    input: 'User: We should always use TypeScript strict mode.\nAssistant: Got it.',
    expectedType: 'guideline',
  },
  {
    id: 'ext-2',
    category: 'extraction',
    difficulty: 'easy',
    input: 'User: We decided to use PostgreSQL because of JSONB.\nAssistant: Good choice.',
    expectedType: 'knowledge',
  },
  {
    id: 'ext-3',
    category: 'extraction',
    difficulty: 'easy',
    input: 'User: Run tests with `npm run test:unit`.\nAssistant: Noted.',
    expectedType: 'tool',
  },
  {
    id: 'ext-4',
    category: 'extraction',
    difficulty: 'medium',
    input: 'User: Our API uses JWT with RS256. Tokens expire after 24h.\nAssistant: Noted.',
    expectedType: 'knowledge',
  },
  {
    id: 'ext-5',
    category: 'extraction',
    difficulty: 'medium',
    input: 'User: Going forward, all components need 80% test coverage.\nAssistant: Will do.',
    expectedType: 'guideline',
  },
  {
    id: 'ext-6',
    category: 'extraction',
    difficulty: 'medium',
    input: 'User: Deploy with `./deploy.sh --env prod`. Run tests first.\nAssistant: Got it.',
    expectedType: 'tool',
  },
  {
    id: 'ext-7',
    category: 'extraction',
    difficulty: 'hard',
    input:
      "User: Let me explain our architecture. We have a Next.js frontend that talks to a Node.js API. The API uses Express with TypeORM for database access. We chose PostgreSQL after evaluating MongoDB. All API endpoints should validate input using Zod schemas. Never trust client input. For deployments, we use GitHub Actions with the workflow in .github/workflows/deploy.yml.\nAssistant: That's a comprehensive setup. I'll keep all of this in mind.",
    expectedType: null,
  },
  {
    id: 'ext-8',
    category: 'extraction',
    difficulty: 'hard',
    input:
      'User: After debugging, found `any` types caused issues. Never use `any`.\nAssistant: Lesson learned.',
    expectedType: 'guideline',
  },
  {
    id: 'ext-9',
    category: 'extraction',
    difficulty: 'easy',
    input: 'User: Remember staging uses different DB URL.\nAssistant: Noted.',
    expectedType: 'knowledge',
  },
  {
    id: 'ext-10',
    category: 'extraction',
    difficulty: 'medium',
    input:
      'User: Always log errors with stack traces in dev, sanitize in prod.\nAssistant: Got it.',
    expectedType: 'guideline',
  },

  // ============================================================================
  // CLASSIFICATION TEST CASES (20 total)
  // ============================================================================
  {
    id: 'cls-1',
    category: 'classification',
    difficulty: 'easy',
    input: 'Rule: always use async/await for promises',
    expectedType: 'guideline',
  },
  {
    id: 'cls-2',
    category: 'classification',
    difficulty: 'easy',
    input: 'Never commit API keys to the repository',
    expectedType: 'guideline',
  },
  {
    id: 'cls-3',
    category: 'classification',
    difficulty: 'easy',
    input: 'We always write tests before implementing features',
    expectedType: 'guideline',
  },
  {
    id: 'cls-4',
    category: 'classification',
    difficulty: 'medium',
    input: 'Prefer composition over inheritance',
    expectedType: 'guideline',
  },
  {
    id: 'cls-5',
    category: 'classification',
    difficulty: 'medium',
    input: 'From now on all PRs require at least one approval',
    expectedType: 'guideline',
  },
  {
    id: 'cls-6',
    category: 'classification',
    difficulty: 'easy',
    input: 'Decision: we chose React over Vue for the frontend',
    expectedType: 'knowledge',
  },
  {
    id: 'cls-7',
    category: 'classification',
    difficulty: 'easy',
    input: 'Our API rate limit is 1000 requests per minute',
    expectedType: 'knowledge',
  },
  {
    id: 'cls-8',
    category: 'classification',
    difficulty: 'medium',
    input: 'The database schema uses UUIDs for primary keys',
    expectedType: 'knowledge',
  },
  {
    id: 'cls-9',
    category: 'classification',
    difficulty: 'medium',
    input: 'We use Redis for caching user sessions',
    expectedType: 'knowledge',
  },
  {
    id: 'cls-10',
    category: 'classification',
    difficulty: 'medium',
    input: 'The authentication system supports OAuth2 and SAML',
    expectedType: 'knowledge',
  },
  {
    id: 'cls-11',
    category: 'classification',
    difficulty: 'easy',
    input: 'Command: npm run build',
    expectedType: 'tool',
  },
  {
    id: 'cls-12',
    category: 'classification',
    difficulty: 'easy',
    input: 'Run `docker-compose up -d` to start services',
    expectedType: 'tool',
  },
  {
    id: 'cls-13',
    category: 'classification',
    difficulty: 'easy',
    input: 'git checkout -b feature/new-branch',
    expectedType: 'tool',
  },
  {
    id: 'cls-14',
    category: 'classification',
    difficulty: 'medium',
    input: 'Use pytest -xvs for running tests with output',
    expectedType: 'tool',
  },
  {
    id: 'cls-15',
    category: 'classification',
    difficulty: 'medium',
    input: 'The linting command is npm run lint:fix',
    expectedType: 'tool',
  },
  {
    id: 'cls-16',
    category: 'classification',
    difficulty: 'hard',
    input: 'We decided to always validate user input',
    expectedType: 'guideline',
  },
  {
    id: 'cls-17',
    category: 'classification',
    difficulty: 'hard',
    input: 'The system uses WebSockets for real-time updates',
    expectedType: 'knowledge',
  },
  {
    id: 'cls-18',
    category: 'classification',
    difficulty: 'hard',
    input: 'Make sure to run the migration script before deploying',
    expectedType: 'tool',
  },
  {
    id: 'cls-19',
    category: 'classification',
    difficulty: 'hard',
    input: 'Make it easier to navigate the settings',
    expectedType: 'knowledge',
  },
  {
    id: 'cls-20',
    category: 'classification',
    difficulty: 'hard',
    input: 'UX feedback: the button is too small',
    expectedType: 'knowledge',
  },

  // ============================================================================
  // QUERY REWRITE TEST CASES (8 total)
  // ============================================================================
  {
    id: 'qr-1',
    category: 'query_rewrite',
    difficulty: 'easy',
    input: 'how do we handle auth?',
    expectedKeywords: ['authentication', 'JWT', 'OAuth', 'login', 'session'],
  },
  {
    id: 'qr-2',
    category: 'query_rewrite',
    difficulty: 'easy',
    input: 'database setup',
    expectedKeywords: ['PostgreSQL', 'MySQL', 'migration', 'schema', 'connection'],
  },
  {
    id: 'qr-3',
    category: 'query_rewrite',
    difficulty: 'medium',
    input: 'testing strategy',
    expectedKeywords: ['unit', 'integration', 'e2e', 'coverage', 'test'],
  },
  {
    id: 'qr-4',
    category: 'query_rewrite',
    difficulty: 'medium',
    input: 'deploy to prod',
    expectedKeywords: ['deployment', 'production', 'CI/CD', 'pipeline', 'release'],
  },
  {
    id: 'qr-5',
    category: 'query_rewrite',
    difficulty: 'medium',
    input: 'api rate limiting',
    expectedKeywords: ['throttle', 'requests', 'limit', 'quota', 'rate'],
  },
  {
    id: 'qr-6',
    category: 'query_rewrite',
    difficulty: 'hard',
    input: 'error handling best practices',
    expectedKeywords: ['exception', 'try-catch', 'logging', 'recovery', 'error'],
  },
  {
    id: 'qr-7',
    category: 'query_rewrite',
    difficulty: 'medium',
    input: 'caching strategy',
    expectedKeywords: ['Redis', 'cache', 'TTL', 'invalidation', 'memory'],
  },
  {
    id: 'qr-8',
    category: 'query_rewrite',
    difficulty: 'hard',
    input: 'security guidelines',
    expectedKeywords: ['OWASP', 'XSS', 'CSRF', 'injection', 'sanitize', 'validate'],
  },

  // ============================================================================
  // CROSS-ENCODER TEST CASES (4 total)
  // ============================================================================
  {
    id: 'ce-1',
    category: 'cross_encoder',
    difficulty: 'easy',
    input: 'how to authenticate users',
    expectedTopId: '1',
    documents: [
      {
        id: '1',
        text: 'JWT authentication: We use JSON Web Tokens with RS256 algorithm for user authentication. Tokens expire after 24 hours.',
      },
      {
        id: '2',
        text: 'PostgreSQL JSONB: Our database uses JSONB columns for storing flexible metadata.',
      },
      {
        id: '3',
        text: 'Input validation: All user input must be validated using Zod schemas before processing.',
      },
    ],
  },
  {
    id: 'ce-2',
    category: 'cross_encoder',
    difficulty: 'medium',
    input: 'testing commands',
    expectedTopId: '1',
    documents: [
      {
        id: '1',
        text: 'Run unit tests with: npm run test:unit. This executes Jest with coverage reporting.',
      },
      {
        id: '2',
        text: 'Jest testing framework: We use Jest for all JavaScript testing with React Testing Library for components.',
      },
      {
        id: '3',
        text: 'TDD practice: We follow test-driven development, writing tests before implementation.',
      },
    ],
  },
  {
    id: 'ce-3',
    category: 'cross_encoder',
    difficulty: 'medium',
    input: 'database connection settings',
    expectedTopId: '3',
    documents: [
      {
        id: '1',
        text: 'TypeScript strict mode: Always enable strict mode in tsconfig.json for better type safety.',
      },
      {
        id: '2',
        text: 'Staging environment: The staging server uses a different database URL than production.',
      },
      {
        id: '3',
        text: 'PostgreSQL pool size: Configure the connection pool with min=2, max=10 connections for optimal performance.',
      },
    ],
  },
  {
    id: 'ce-4',
    category: 'cross_encoder',
    difficulty: 'hard',
    input: 'deployment process',
    expectedTopId: '2',
    documents: [
      {
        id: '1',
        text: 'npm build: Run npm run build to create production bundles with optimizations.',
      },
      {
        id: '2',
        text: 'GitHub Actions CI/CD: Our deployment pipeline uses GitHub Actions. The workflow is defined in .github/workflows/deploy.yml and triggers on push to main.',
      },
      {
        id: '3',
        text: 'Production approval: All production deployments require approval from at least one team lead.',
      },
      {
        id: '4',
        text: 'Express.js server: The API is built with Express.js and uses TypeORM for database access.',
      },
    ],
  },
];

function getQuickTestCases(): TestCase[] {
  // Quick mode: 13 test cases (3 extraction, 5 classification, 3 query_rewrite, 2 cross_encoder)
  return TEST_CASES.filter((tc) => {
    if (tc.category === 'extraction') {
      return ['ext-1', 'ext-4', 'ext-7'].includes(tc.id);
    }
    if (tc.category === 'classification') {
      return ['cls-1', 'cls-2', 'cls-6', 'cls-8', 'cls-16'].includes(tc.id);
    }
    if (tc.category === 'query_rewrite') {
      return ['qr-1', 'qr-3', 'qr-6'].includes(tc.id);
    }
    if (tc.category === 'cross_encoder') {
      return ['ce-1', 'ce-2'].includes(tc.id);
    }
    return false;
  });
}

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

function parseArgs(): { quick: boolean; models: string[] } {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const modelsArg = args.find((a) => a.startsWith('--models='));
  const models = modelsArg ? modelsArg.replace('--models=', '').split(',') : DEFAULT_MODELS;
  return { quick, models };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getFirstLoadedModel(): Promise<string> {
  const response = await fetch(`${LM_STUDIO_BASE_URL}/models`);
  const data = (await response.json()) as { data?: Array<{ id: string }> };
  if (!data.data || data.data.length === 0) {
    throw new Error('No models loaded in LM Studio');
  }
  // Filter out embedding models - they can't do chat completions
  const chatModels = data.data.filter((m) => !m.id.toLowerCase().includes('embedding'));
  if (chatModels.length === 0) {
    throw new Error('No chat models loaded in LM Studio (only embedding models found)');
  }
  return chatModels[0].id;
}

async function waitForEnter(message: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

// ============================================================================
// EVALUATION FUNCTIONS
// ============================================================================

function evaluateExtraction(
  testCase: TestCase,
  output: string
): { success: boolean; actualType?: string; error?: string } {
  try {
    // Try to extract JSON from output (may have markdown code blocks)
    const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, output];
    const jsonStr = jsonMatch[1] || output;
    const parsed = JSON.parse(jsonStr.trim());

    // Check required keys exist
    if (!parsed.guidelines || !parsed.knowledge || !parsed.tools) {
      return { success: false, error: 'Missing required keys (guidelines, knowledge, tools)' };
    }

    // For multi-type test (expectedType === null)
    if (testCase.expectedType === null) {
      const hasGuideline = parsed.guidelines.length > 0;
      const hasKnowledge = parsed.knowledge.length > 0;
      const hasTool = parsed.tools.length > 0;
      if (hasGuideline && hasKnowledge && hasTool) {
        return { success: true, actualType: 'multi' };
      }
      return {
        success: false,
        actualType: 'multi',
        error: `Multi-type test: guideline=${hasGuideline}, knowledge=${hasKnowledge}, tool=${hasTool}`,
      };
    }

    // For single-type test
    const typeMap: Record<string, any[]> = {
      guideline: parsed.guidelines,
      knowledge: parsed.knowledge,
      tool: parsed.tools,
    };
    const entries = typeMap[testCase.expectedType!] || [];
    const hasEntry = entries.some((e: any) => (e.confidence ?? 1) > 0.5);

    if (hasEntry) {
      return { success: true, actualType: testCase.expectedType! };
    }

    // Determine what was actually extracted
    const actualTypes: string[] = [];
    if (parsed.guidelines.length > 0) actualTypes.push('guideline');
    if (parsed.knowledge.length > 0) actualTypes.push('knowledge');
    if (parsed.tools.length > 0) actualTypes.push('tool');

    return {
      success: false,
      actualType: actualTypes.join(',') || 'none',
      error: `Expected ${testCase.expectedType}, got ${actualTypes.join(',') || 'none'}`,
    };
  } catch (err) {
    return {
      success: false,
      error: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function evaluateClassification(
  testCase: TestCase,
  output: string
): { success: boolean; actualType?: string; error?: string } {
  try {
    // Try to extract JSON from output
    const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, output];
    const jsonStr = jsonMatch[1] || output;
    const parsed = JSON.parse(jsonStr.trim());

    const actualType = (parsed.type || '').toLowerCase();
    const expectedType = (testCase.expectedType || '').toLowerCase();

    if (actualType === expectedType) {
      return { success: true, actualType };
    }
    return { success: false, actualType, error: `Expected ${expectedType}, got ${actualType}` };
  } catch (err) {
    return {
      success: false,
      error: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function evaluateQueryRewrite(
  testCase: TestCase,
  output: string
): { success: boolean; error?: string } {
  // Check output is non-empty (> 50 characters)
  if (output.length < 50) {
    return { success: false, error: `Output too short: ${output.length} chars` };
  }

  // Check keyword match (need 50%+)
  const keywords = testCase.expectedKeywords || [];
  const outputLower = output.toLowerCase();
  const matchedKeywords = keywords.filter((kw) => outputLower.includes(kw.toLowerCase()));
  const matchRate = matchedKeywords.length / keywords.length;

  if (matchRate >= 0.5) {
    return { success: true };
  }
  return {
    success: false,
    error: `Keyword match ${Math.round(matchRate * 100)}% < 50% (matched: ${matchedKeywords.join(', ')})`,
  };
}

function evaluateCrossEncoder(
  testCase: TestCase,
  output: string
): { success: boolean; actualType?: string; error?: string } {
  try {
    // Try to extract JSON array from output
    const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, output];
    const jsonStr = jsonMatch[1] || output;
    const parsed = JSON.parse(jsonStr.trim());

    if (!Array.isArray(parsed)) {
      return { success: false, error: 'Expected JSON array' };
    }

    // Sort by score descending and get top document
    const sorted = [...parsed].sort((a, b) => (b.score || 0) - (a.score || 0));
    const topId = String(sorted[0]?.id || '');

    if (topId === testCase.expectedTopId) {
      return { success: true, actualType: topId };
    }
    return {
      success: false,
      actualType: topId,
      error: `Expected top=${testCase.expectedTopId}, got top=${topId}`,
    };
  } catch (err) {
    return {
      success: false,
      error: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function evaluateSuccess(
  testCase: TestCase,
  output: string
): { success: boolean; actualType?: string; error?: string } {
  if (testCase.category === 'extraction') {
    return evaluateExtraction(testCase, output);
  } else if (testCase.category === 'classification') {
    return evaluateClassification(testCase, output);
  } else if (testCase.category === 'query_rewrite') {
    return evaluateQueryRewrite(testCase, output);
  } else if (testCase.category === 'cross_encoder') {
    return evaluateCrossEncoder(testCase, output);
  }
  return { success: false, error: 'Unknown category' };
}

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

async function runSingleTest(
  client: OpenAI,
  model: string,
  testCase: TestCase
): Promise<BenchmarkResult> {
  const startTime = Date.now();

  try {
    let messages: Array<{ role: 'system' | 'user'; content: string }>;

    // Build messages based on category
    if (testCase.category === 'extraction') {
      messages = [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Context to analyze:\n"""\n${testCase.input}\n"""\n\nReturn a JSON object with arrays for "guidelines", "knowledge", "tools", "entities", and "relationships".\nIf no entries of a particular type are found, return an empty array for that type.`,
        },
      ];
    } else if (testCase.category === 'classification') {
      messages = [{ role: 'user', content: CLASSIFICATION_PROMPT + testCase.input }];
    } else if (testCase.category === 'query_rewrite') {
      messages = [
        {
          role: 'user',
          content: QUERY_REWRITE_PROMPT + testCase.input + '\n\nWrite the hypothetical document:',
        },
      ];
    } else if (testCase.category === 'cross_encoder') {
      const prompt = buildCrossEncoderPrompt(testCase.input, testCase.documents!);
      messages = [{ role: 'user', content: prompt }];
    } else {
      throw new Error(`Unknown category: ${testCase.category}`);
    }

    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: TEMPERATURE,
    });

    const latencyMs = Date.now() - startTime;
    const output = response.choices[0]?.message?.content || '';
    const tokensInput = response.usage?.prompt_tokens;
    const tokensOutput = response.usage?.completion_tokens;

    // Evaluate success based on category
    const { success, actualType, error } = evaluateSuccess(testCase, output);

    return {
      model,
      testCase: testCase.id,
      category: testCase.category,
      difficulty: testCase.difficulty,
      success,
      latencyMs,
      tokensInput,
      tokensOutput,
      expectedType: testCase.expectedType ?? undefined,
      actualType,
      error,
      rawOutput: output.slice(0, 500),
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    return {
      model,
      testCase: testCase.id,
      category: testCase.category,
      difficulty: testCase.difficulty,
      success: false,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function benchmarkModel(model: string, testCases: TestCase[]): Promise<BenchmarkResult[]> {
  const client = new OpenAI({
    baseURL: LM_STUDIO_BASE_URL,
    apiKey: 'not-needed',
    timeout: TIMEOUT_MS,
    maxRetries: 0,
  });

  const results: BenchmarkResult[] = [];
  const total = testCases.length;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`[${i + 1}/${total}] Testing: ${testCase.id}`);

    const result = await runSingleTest(client, model, testCase);
    results.push(result);

    // Show result inline
    const status = result.success ? '✓' : '✗';
    const latency = `${result.latencyMs}ms`;
    const errorInfo = result.error ? ` (${result.error.slice(0, 50)})` : '';
    console.log(`       ${status} ${latency}${errorInfo}`);
  }

  return results;
}

// ============================================================================
// RESULTS FORMATTING
// ============================================================================

function calculateSummary(model: string, results: BenchmarkResult[]): ModelSummary {
  const modelResults = results.filter((r) => r.model === model);
  const passed = modelResults.filter((r) => r.success).length;
  const failed = modelResults.length - passed;

  // Calculate latency stats
  const latencies = modelResults.map((r) => r.latencyMs).sort((a, b) => a - b);
  const avgLatencyMs = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const medianLatencyMs = latencies[Math.floor(latencies.length / 2)];
  const p95Index = Math.floor(latencies.length * 0.95);
  const p95LatencyMs = latencies[p95Index] || latencies[latencies.length - 1];

  // Calculate by category
  const byCategory: Record<string, { passed: number; total: number; avgLatencyMs: number }> = {};
  const categories = ['extraction', 'classification', 'query_rewrite', 'cross_encoder'];
  for (const cat of categories) {
    const catResults = modelResults.filter((r) => r.category === cat);
    if (catResults.length > 0) {
      const catPassed = catResults.filter((r) => r.success).length;
      const catLatencies = catResults.map((r) => r.latencyMs);
      byCategory[cat] = {
        passed: catPassed,
        total: catResults.length,
        avgLatencyMs: Math.round(catLatencies.reduce((a, b) => a + b, 0) / catLatencies.length),
      };
    }
  }

  // Calculate by difficulty
  const byDifficulty: Record<string, { passed: number; total: number }> = {};
  const difficulties = ['easy', 'medium', 'hard'];
  for (const diff of difficulties) {
    const diffResults = modelResults.filter((r) => r.difficulty === diff);
    if (diffResults.length > 0) {
      byDifficulty[diff] = {
        passed: diffResults.filter((r) => r.success).length,
        total: diffResults.length,
      };
    }
  }

  return {
    model,
    totalTests: modelResults.length,
    passed,
    failed,
    avgLatencyMs,
    medianLatencyMs,
    p95LatencyMs,
    successRate: Math.round((passed / modelResults.length) * 100),
    byCategory,
    byDifficulty,
  };
}

function formatRankingTable(summaries: ModelSummary[]): string {
  const header =
    '| Rank | Model                              | Success | Avg Latency | Median | P95     |';
  const divider =
    '|------|------------------------------------|---------| ------------|--------|---------|';

  const rows = summaries.map((s, i) => {
    const rank = String(i + 1).padStart(4);
    const model = s.model.length > 34 ? s.model.slice(0, 31) + '...' : s.model.padEnd(34);
    const success = `${s.successRate}%`.padStart(6);
    const avg = `${s.avgLatencyMs}ms`.padStart(8);
    const median = `${s.medianLatencyMs}ms`.padStart(5);
    const p95 = `${s.p95LatencyMs}ms`.padStart(6);
    return `| ${rank} | ${model} | ${success} | ${avg} | ${median} | ${p95} |`;
  });

  return [header, divider, ...rows].join('\n');
}

function printResults(summaries: ModelSummary[], results: BenchmarkResult[]): void {
  console.log('');
  console.log('='.repeat(80));
  console.log('LLM BENCHMARK RESULTS FOR AGENT-MEMORY');
  console.log('='.repeat(80));
  console.log('');

  // Sort by success rate (descending), then by avg latency (ascending)
  const sorted = [...summaries].sort((a, b) => {
    if (b.successRate !== a.successRate) return b.successRate - a.successRate;
    return a.avgLatencyMs - b.avgLatencyMs;
  });

  // Overall ranking
  console.log('📊 OVERALL RANKING');
  console.log('');
  console.log(formatRankingTable(sorted));
  console.log('');

  // By category
  console.log('📁 BY CATEGORY');
  console.log('');
  const categories = ['extraction', 'classification', 'query_rewrite', 'cross_encoder'];
  for (const cat of categories) {
    console.log(`### ${cat.toUpperCase()}`);
    console.log('| Model | Passed | Total | Rate | Avg Latency |');
    console.log('|-------|--------|-------|------|-------------|');
    for (const s of sorted) {
      const catStats = s.byCategory[cat];
      if (catStats) {
        const model = s.model.length > 30 ? s.model.slice(0, 27) + '...' : s.model;
        const rate = Math.round((catStats.passed / catStats.total) * 100);
        console.log(
          `| ${model} | ${catStats.passed} | ${catStats.total} | ${rate}% | ${catStats.avgLatencyMs}ms |`
        );
      }
    }
    console.log('');
  }

  // By difficulty
  console.log('📈 BY DIFFICULTY');
  console.log('');
  const difficulties = ['easy', 'medium', 'hard'];
  for (const diff of difficulties) {
    console.log(`### ${diff.toUpperCase()}`);
    console.log('| Model | Passed | Total | Rate |');
    console.log('|-------|--------|-------|------|');
    for (const s of sorted) {
      const diffStats = s.byDifficulty[diff];
      if (diffStats) {
        const model = s.model.length > 30 ? s.model.slice(0, 27) + '...' : s.model;
        const rate = Math.round((diffStats.passed / diffStats.total) * 100);
        console.log(`| ${model} | ${diffStats.passed} | ${diffStats.total} | ${rate}% |`);
      }
    }
    console.log('');
  }

  // Sample failures
  const failures = results.filter((r) => !r.success).slice(0, 5);
  if (failures.length > 0) {
    console.log('❌ SAMPLE FAILURES (first 5)');
    console.log('');
    for (const f of failures) {
      console.log(`- [${f.model}] ${f.testCase}: ${f.error || 'Unknown error'}`);
    }
    console.log('');
  }

  // Recommendation
  const best = sorted[0];
  if (best) {
    console.log('🏆 RECOMMENDATION');
    console.log('');
    console.log(
      `Best Overall: ${best.model} (${best.successRate}% success, ${best.avgLatencyMs}ms avg)`
    );
    console.log('');
    console.log('To use this model for ALL agent-memory LLM tasks, update .env:');
    console.log(`  AGENT_MEMORY_EXTRACTION_OPENAI_MODEL=${best.model}`);
    console.log(`  AGENT_MEMORY_QUERY_REWRITE_MODEL=${best.model}`);
    console.log(`  AGENT_MEMORY_CROSS_ENCODER_MODEL=${best.model}`);
    console.log('');

    // Check if different models excel at different tasks
    const bestByCategory: Record<string, { model: string; rate: number }> = {};
    for (const cat of categories) {
      let bestModel = '';
      let bestRate = -1;
      for (const s of summaries) {
        const catStats = s.byCategory[cat];
        if (catStats) {
          const rate = catStats.passed / catStats.total;
          if (rate > bestRate) {
            bestRate = rate;
            bestModel = s.model;
          }
        }
      }
      if (bestModel) {
        bestByCategory[cat] = { model: bestModel, rate: Math.round(bestRate * 100) };
      }
    }

    // Check if there are different winners
    const uniqueWinners = new Set(Object.values(bestByCategory).map((b) => b.model));
    if (uniqueWinners.size > 1) {
      console.log('Or, if different models excel at different tasks:');
      console.log(
        `  Extraction best: ${bestByCategory['extraction']?.model} (${bestByCategory['extraction']?.rate}%)`
      );
      console.log('  Classification best: (uses extraction model)');
      console.log(
        `  Query Rewrite best: ${bestByCategory['query_rewrite']?.model} (${bestByCategory['query_rewrite']?.rate}%)`
      );
      console.log(
        `  Cross-Encoder best: ${bestByCategory['cross_encoder']?.model} (${bestByCategory['cross_encoder']?.rate}%)`
      );
      console.log('');
    }
  }
}

function saveResults(
  summaries: ModelSummary[],
  results: BenchmarkResult[],
  testCaseCount: number
): void {
  const output: BenchmarkOutput = {
    timestamp: new Date().toISOString(),
    config: {
      models: [...new Set(results.map((r) => r.model))],
      testCaseCount,
      timeoutMs: TIMEOUT_MS,
      temperature: TEMPERATURE,
    },
    summaries,
    details: results,
  };

  fs.writeFileSync('benchmark-results.json', JSON.stringify(output, null, 2));
  console.log('Results saved to benchmark-results.json');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const { quick, models } = parseArgs();
  const testCases = quick ? getQuickTestCases() : TEST_CASES;

  console.log('LLM Benchmark for Agent Memory');
  console.log('================================');
  console.log(`Mode: ${quick ? 'Quick' : 'Full'}`);
  console.log(`Test cases: ${testCases.length}`);
  console.log(`Models: ${models.length}`);
  console.log('');

  const allResults: BenchmarkResult[] = [];

  // If quick mode with no --models flag, auto-detect first loaded model
  let modelsToTest = models;
  if (quick && !process.argv.find((a) => a.startsWith('--models='))) {
    try {
      const firstModel = await getFirstLoadedModel();
      console.log(`Auto-detected model: ${firstModel}`);
      modelsToTest = [firstModel];
    } catch (err) {
      console.error('Failed to auto-detect model. Make sure LM Studio is running.');
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  for (let i = 0; i < modelsToTest.length; i++) {
    const model = modelsToTest[i];

    if (i > 0 || modelsToTest.length > 1) {
      console.log('');
      console.log('='.repeat(60));
      await waitForEnter(`Load model "${model}" in LM Studio, then press Enter...`);
    }

    console.log('');
    console.log(`Benchmarking: ${model}`);
    console.log('-'.repeat(40));

    const results = await benchmarkModel(model, testCases);
    allResults.push(...results);

    // Show quick summary for this model
    const passed = results.filter((r) => r.success).length;
    const total = results.length;
    const rate = Math.round((passed / total) * 100);
    console.log('');
    console.log(`Model summary: ${passed}/${total} passed (${rate}%)`);
  }

  // Calculate summaries for all models
  const testedModels = [...new Set(allResults.map((r) => r.model))];
  const summaries = testedModels.map((model) => calculateSummary(model, allResults));

  // Print formatted results
  printResults(summaries, allResults);

  // Save to JSON
  saveResults(summaries, allResults, testCases.length);
}

main().catch(console.error);
